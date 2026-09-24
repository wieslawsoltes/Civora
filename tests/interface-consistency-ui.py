"""Actual UI, opaque-origin MemoryRepository, explicitly injected preference map.
Does not qualify browser-origin storage, HTTP cache, or service-worker lifecycle.
"""
import hashlib,json,os
from pathlib import Path
from playwright.sync_api import sync_playwright
ROOT=Path(__file__).resolve().parents[1];OUT=ROOT/'test-results'/'0.10.0';OUT.mkdir(exist_ok=True)
results=[];errors=[]
def ok(name):results.append({'name':name,'passed':True});print('PASS',name,flush=True)
def close(page):page.evaluate("document.querySelectorAll('dialog[open]').forEach(x=>x.close())");page.wait_for_timeout(50)
def action(page,name):page.locator(f'[data-action="{name}"]:visible').first.click();page.wait_for_timeout(80)
def nav(page,route):page.evaluate('(r)=>Civora.navigate(r)',route);page.wait_for_timeout(55)
def install(page,legacy=True,saved=None):
 page.expose_function('__testDigest',lambda data:list(hashlib.sha256(bytes(data)).digest()))
 page.evaluate('''(args)=>{Object.defineProperty(crypto,'subtle',{value:{digest:async(_,data)=>Uint8Array.from(await __testDigest(Array.from(data instanceof ArrayBuffer?new Uint8Array(data):new Uint8Array(data.buffer,data.byteOffset,data.byteLength)))).buffer}});crypto.randomUUID=()=>{let b=crypto.getRandomValues(new Uint8Array(16));b[6]=(b[6]&15)|64;b[8]=(b[8]&63)|128;let h=[...b].map(x=>x.toString(16).padStart(2,'0')).join('');return`${h.slice(0,8)}-${h.slice(8,12)}-${h.slice(12,16)}-${h.slice(16,20)}-${h.slice(20)}`;};history.replaceState=()=>{};window.__preferences=new Map();Object.defineProperty(window,'localStorage',{value:{getItem:k=>__preferences.get(k)||(k.startsWith('civora-explorer-ui:')&&args.saved?JSON.stringify(args.saved):k.startsWith('civora-explorer-v6:')&&args.legacy?JSON.stringify({layout:{commandStyle:'ribbon',navigationRail:true,fileDescriptions:true,rowLines:false,treeWidth:310,previewWidth:450,previewPosition:'right'},recents:[],expanded:[]}):null),setItem:(k,v)=>__preferences.set(k,v)}});}''',{'legacy':legacy,'saved':saved})
 page.on('pageerror',lambda e:errors.append(str(e)));page.set_content((ROOT/'dist/civora.html').read_text(),wait_until='load');page.wait_for_function('!!window.Civora');page.wait_for_timeout(120);page.locator('#toast-host .toast').evaluate_all('(xs)=>xs.forEach(x=>x.click())')
routes=['documents','overview','reviews','issues','transmittals','sets','schedule','insights','activity','connections','members','settings','projects','recycle','models','renditions','delivery','sync','operations','local','control','baselines','inbox','automation','notifications']
with sync_playwright() as p:
 browser=p.chromium.launch(executable_path=os.environ.get('CHROMIUM','/usr/bin/chromium'),args=['--no-sandbox']);page=browser.new_page(viewport={'width':1540,'height':960});page.set_default_timeout(8000)
 try:
  install(page);assert page.evaluate('Civora.version')=='0.10.0';assert page.locator('#app-version-status').inner_text()=='v0.10.0';assert page.locator('.ex-standard-toolbar').is_visible();assert not page.locator('#sidebar').is_visible();assert page.evaluate('Civora.explorer.layout.treeWidth')==310;assert page.evaluate('Civora.explorer.layout.previewWidth')==450;ok('Legacy Ribbon/rail preferences migrate to Explorer while retaining pane dimensions')
  revision=page.evaluate('Civora.engine.state.revision');identity=page.evaluate('Civora.engine.state.id')
  geometry=[]
  for route in routes:
   nav(page,route);assert page.evaluate('document.body.classList.contains("explorer-mode")'),route;assert not page.locator('#sidebar').is_visible(),route;assert page.locator('.ex-app-brand').is_visible(),route;assert page.locator('#app-version-status').is_visible(),route;assert page.locator('h1').count()>0,route
   height=page.locator('.topbar').bounding_box()['height'];assert height<=44,(route,height);geometry.append({'route':route,'topbarHeight':height})
   if route!='documents':assert page.locator('.workspace-tool-chrome').is_visible(),route;assert page.locator('[data-action=mobile-more]:visible').count()>0
  assert page.evaluate('Civora.engine.state.revision')==revision;ok('All 25 routes share compact Explorer chrome without resurrecting the dashboard sidebar or modifying data')
  nav(page,'automation');page.screenshot(path=str(OUT/'automation.png'),full_page=True)
  nav(page,'overview');page.screenshot(path=str(OUT/'overview.png'),full_page=True)
  nav(page,'documents');page.locator('[data-ex-row]').first.click();page.screenshot(path=str(OUT/'explorer.png'),full_page=True)
  for route in ['reviews','local','connections','sets','documents']*3:nav(page,route)
  assert page.locator('.ex-standard-toolbar').is_visible();assert not page.locator('#sidebar').is_visible();ok('Repeated tool-to-document round trips preserve Explorer appearance')
  nav(page,'local');action(page,'ex-appearance');dialog=page.locator('dialog[open]').last;dialog.locator('[data-appearance-preset=ribbon]').click();dialog.locator('[type=submit]').click();page.wait_for_timeout(100);assert page.locator('#sidebar').is_visible();nav(page,'documents');assert page.locator('.ex-ribbon').is_visible();ok('An explicitly selected Ribbon preference applies consistently across tools and documents')
  saved=page.evaluate('JSON.parse([...__preferences].find(([k])=>k.startsWith("civora-explorer-ui:"))[1])')
  cold=browser.new_page(viewport={'width':1540,'height':960});install(cold,False,saved);assert cold.locator('.ex-ribbon').is_visible();assert cold.locator('#sidebar').is_visible();cold.close();ok('Cold application bootstrap restores post-migration preferences using the explicit storage fixture')
  action(page,'ex-appearance');dialog=page.locator('dialog[open]').last;dialog.locator('[data-appearance-preset=explorer]').click();dialog.locator('[type=submit]').click();page.wait_for_timeout(90)
  actor=page.evaluate('Civora.engine.state.users.find(u=>u.active&&u.id!=="u-admin").id');action(page,'profile');dialog=page.locator('dialog[open]').last;dialog.locator('[name=actor]').select_option(actor);dialog.locator('[type=submit]').click();page.wait_for_timeout(100);assert not page.locator('#sidebar').is_visible();nav(page,'inbox');assert page.locator('.workspace-tool-chrome').is_visible();action(page,'profile');dialog=page.locator('dialog[open]').last;dialog.locator('[name=actor]').select_option('u-admin');dialog.locator('[type=submit]').click();page.wait_for_timeout(100);assert not page.locator('#sidebar').is_visible();ok('Account changes cannot reinstate an unmigrated legacy shell')
  action(page,'app-updates');dialog=page.locator('dialog[open]').last;assert 'Civora 0.10.0' in dialog.inner_text();assert dialog.locator('[data-update-reload]').is_disabled();dialog.locator('[data-update-check]').click();page.wait_for_timeout(80);assert 'self-contained file' in dialog.locator('[data-update-status]').inner_text();page.screenshot(path=str(OUT/'version-dialog.png'),full_page=True);close(page);ok('Visible build diagnostics identify the running file and prevent destructive reload of memory-only data')
  page.set_viewport_size({'width':390,'height':844});page.wait_for_timeout(120)
  widths=[]
  for route in routes:
   nav(page,route);assert page.locator('.mobile-bottom-nav').is_visible(),route;assert not page.locator('#sidebar').is_visible(),route;assert page.locator('.ex-app-brand').is_visible(),route
   width=page.evaluate('document.documentElement.scrollWidth');assert width<=390,(route,width);widths.append({'route':route,'width':width})
  ok('All 25 phone routes retain the new header and touch navigation without page-width overflow')
  page.locator('#toast-host .toast').evaluate_all('(xs)=>xs.forEach(x=>x.click())');nav(page,'documents');page.screenshot(path=str(OUT/'mobile.png'),full_page=True);nav(page,'automation');page.screenshot(path=str(OUT/'mobile-automation.png'),full_page=True)
  action(page,'mobile-more');dialog=page.locator('dialog[open]').last;assert dialog.locator('[data-mobile-tool]').count()==25;dialog.locator('[data-mobile-tool=local]').click();page.wait_for_timeout(100);assert page.locator('.workspace-tool-chrome').is_visible();ok('Phone workspace menu navigates into the same Explorer shell')
  page.set_viewport_size({'width':1540,'height':960});page.wait_for_timeout(100);page.evaluate('Civora.navigate("documents")');action(page,'ex-appearance');close(page);assert page.locator('.ex-standard-toolbar').is_visible();ok('Resizing back to desktop does not restore a previous ribbon or dashboard layout')
  assert page.evaluate('Civora.engine.state.id')==identity;assert page.evaluate('Civora.engine.state.revision')==revision;assert not errors,errors;ok('UI migration, navigation, resize and diagnostics leave documents and revision history unchanged')
 except Exception:
  print('ERRORS',errors,flush=True);page.screenshot(path=str(OUT/'consistency-failure.png'),full_page=True);raise
 finally:
  (OUT/'interface-consistency-ui.json').write_text(json.dumps({'version':'0.10.0','mode':'actual memory engine and UI; explicit preference fixture; no browser-origin qualification','results':results,'errors':errors},indent=2));browser.close()
