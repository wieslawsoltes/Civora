"""Actual application/reducer at phone, tablet and desktop sizes.
Uses an isolated document because Chromium blocks URL navigation. SHA256 is
provided only for opaque-origin test primitives. Touchscreen taps/CDP touch and
PointerEvents exercise the real event handlers; not a physical-device test.
"""
import hashlib,json,os,base64
from pathlib import Path
from playwright.sync_api import sync_playwright
ROOT=Path(__file__).resolve().parents[1];OUT=ROOT/'test-results';OUT.mkdir(exist_ok=True)
results=[];errors=[]
def ok(name):results.append({'name':name,'passed':True});print('PASS',name,flush=True)
def d(page):return page.locator('dialog[open]').last
def close(page):page.evaluate("document.querySelectorAll('dialog[open]').forEach(d=>d.close())");page.wait_for_timeout(65)
def dismiss(page):page.locator('#toast-host .toast').evaluate_all('(xs)=>xs.forEach(x=>x.click())')
def action(page,a,extra=''):page.locator(f'[data-action="{a}"]{extra}:visible').first.tap();page.wait_for_timeout(90)
def submit(page):d(page).locator('[type=submit]').tap();page.wait_for_timeout(180)
def nav(page,route):page.evaluate('(r)=>Civora.navigate(r)',route);page.wait_for_timeout(100)
def install(page):
 page.expose_function('__testDigest',lambda data:list(hashlib.sha256(bytes(data)).digest()))
 page.evaluate('''()=>{Object.defineProperty(crypto,'subtle',{value:{digest:async(_,data)=>Uint8Array.from(await __testDigest(Array.from(data instanceof ArrayBuffer?new Uint8Array(data):new Uint8Array(data.buffer,data.byteOffset,data.byteLength)))).buffer}});crypto.randomUUID=()=>{let b=crypto.getRandomValues(new Uint8Array(16));b[6]=(b[6]&15)|64;b[8]=(b[8]&63)|128;let h=[...b].map(x=>x.toString(16).padStart(2,'0')).join('');return`${h.slice(0,8)}-${h.slice(8,12)}-${h.slice(12,16)}-${h.slice(16,20)}-${h.slice(20)}`;};history.replaceState=()=>{};}''')
 page.on('pageerror',lambda e:errors.append(str(e)));page.set_content((ROOT/'dist/civora.html').read_text(),wait_until='load');page.wait_for_function('!!window.Civora');page.wait_for_timeout(100);dismiss(page)
def pointer(page,selector,events):
 page.locator(selector).evaluate('''(el,events)=>{for(const [type,id,x,y]of events)el.dispatchEvent(new PointerEvent(type,{pointerId:id,pointerType:'touch',button:0,buttons:type==='pointerup'?0:1,clientX:x,clientY:y,bubbles:true,cancelable:true}));}''',events)
with sync_playwright() as p:
 browser=p.chromium.launch(executable_path=os.environ.get('CHROMIUM','/usr/bin/chromium'),args=['--no-sandbox'])
 context=browser.new_context(viewport={'width':390,'height':844},has_touch=True,is_mobile=True,device_scale_factor=1,accept_downloads=True)
 page=context.new_page();page.set_default_timeout(10000)
 try:
  install(page);assert page.locator('html').get_attribute('data-input-mode')=='touch';assert page.locator('.mobile-file-card').count()==15;assert page.locator('.mobile-bottom-nav button').count()==5
  assert page.evaluate('document.querySelector("#content").scrollWidth<=innerWidth+1');page.screenshot(path=str(OUT/'touch-files.png'),full_page=True)
  ok('Phone boots into actual touch cards with persistent five-action navigation and bounded content')
  action(page,'mobile-route','[data-route=inbox]');assert page.evaluate('Civora.ui.route')=='inbox';action(page,'mobile-route','[data-route=notifications]');assert page.evaluate('Civora.ui.route')=='notifications'
  action(page,'mobile-more');assert d(page).locator('[data-mobile-tool]').count()==25;d(page).locator('[data-mobile-tools-search]').fill('local');assert d(page).locator('[data-mobile-tool]:visible').count()==1;d(page).locator('[data-mobile-tool=local]').tap();page.wait_for_timeout(130);assert page.evaluate('Civora.ui.route')=='local';close(page);action(page,'mobile-route','[data-route=documents]')
  ok('Bottom navigation and searchable workspace sheet reach all twenty-five tools without a sidebar hover')
  action(page,'ex-menu','[data-menu=File]');assert 'Upload documents' in d(page).inner_text();close(page);action(page,'ex-menu','[data-menu=Document]');assert 'Download original' in d(page).inner_text();close(page);action(page,'ex-menu','[data-menu=View]');assert d(page).locator('[data-action=mobile-preferences]').count()==1;close(page)
  ok('Phone command categories open actionable native dialog sheets instead of inaccessible hidden commands')
  first_id=page.locator('.mobile-file-card').first.get_attribute('data-ex-row');action(page,'ex-touch-menu',f'[data-id="{first_id}"]');assert d(page).locator('[data-action=download-document]').count()==1;assert d(page).get_attribute('aria-labelledby');page.screenshot(path=str(OUT/'touch-actions.png'),full_page=True);d(page).locator('[data-action=open-document]').tap();page.wait_for_timeout(160);assert 'Properties' in d(page).inner_text();close(page)
  ok('Visible document action sheet resolves the real document and opens complete properties')
  action(page,'clear-selection');action(page,'ex-touch-select');page.locator('.mobile-file-card').nth(0).locator('[data-action=ex-touch-open]').tap();page.locator('.mobile-file-card').nth(1).locator('[data-action=ex-touch-open]').tap();assert page.evaluate('Civora.ui.selection.size')==2
  page.locator('#select-all-docs').check();assert page.evaluate('Civora.ui.selection.size')==15;page.locator('#select-all-docs').uncheck();assert page.evaluate('Civora.ui.selection.size')==0
  action(page,'ex-touch-sort');d(page).locator('[name=key]').select_option('name');d(page).locator('[name=direction]').select_option('desc');submit(page);assert page.evaluate('Civora.explorer.configuration.sort[0].direction')=='desc'
  ok('Tap selection, page selection and explicit sorting operate on the shared document model')
  # Controlled touch set, created via the visible Add workflow with selected documents.
  page.locator('.mobile-file-card').nth(0).locator('[data-select-doc]').check();page.locator('.mobile-file-card').nth(1).locator('[data-select-doc]').check();selected=page.evaluate('[...Civora.ui.selection]')
  action(page,'mobile-add');d(page).locator('[data-mobile-create=new-set]').tap();page.wait_for_timeout(100);assert d(page).locator('[data-set-edit-member]').count()==2;d(page).locator('[name=name]').fill('Station handover · Package A');d(page).locator('[name=description]').fill('Controlled issue for field coordination. Original files remain in their project folders.');d(page).locator('[data-member-down="0"]').tap();assert d(page).locator('[data-set-edit-member]').first.get_attribute('data-set-edit-member')==selected[1];d(page).locator('[data-set-pin-all]').tap();page.screenshot(path=str(OUT/'touch-set-editor.png'),full_page=True);submit(page)
  assert page.locator('dialog[open]').count()==0;assert page.evaluate('Civora.ui.route')=='sets';set_id=page.evaluate('Civora.engine.state.sets.at(-1).id');assert page.evaluate('(id)=>Civora.engine.state.sets.find(s=>s.id===id).members.every(m=>!!m.versionId)',set_id)
  ok('Touch set editor creates ordered fixed-version memberships using explicit move and pin controls')
  action(page,'set-lock',f'[data-id="{set_id}"]');d(page).locator('[name=reason]').fill('Issued for field coordination');submit(page);assert page.evaluate('(id)=>Civora.engine.state.sets.find(s=>s.id===id).locked',set_id)
  assert page.locator('[data-action=set-edit]').count()==0;assert page.locator('.set-members-table tbody tr').count()==2;dismiss(page);page.screenshot(path=str(OUT/'touch-document-set.png'),full_page=True)
  page.set_viewport_size({'width':1600,'height':1000});page.wait_for_timeout(170);page.screenshot(path=str(OUT/'document-sets.png'),full_page=True)
  ok('Manager lock is saved by the real reducer and shown in the responsive collection workspace')
  with page.expect_download() as pending:action(page,'set-export',f'[data-id="{set_id}"]')
  download=pending.value;download.save_as(str(OUT/'controlled-set.zip'));page.wait_for_timeout(100);assert not page.locator('dialog[open]').count()
  import zipfile
  with zipfile.ZipFile(OUT/'controlled-set.zip') as z:
   manifest=json.loads(z.read('manifest.json'));assert manifest['locked'];assert len(manifest['documents'])==2
   for record in manifest['documents']:assert hashlib.sha256(z.read(record['archivePath'])).hexdigest()==record['hash']
  ok('Actual set download independently decodes with exact original checksums and fixed revision manifest')
  action(page,'set-deliver',f'[data-id="{set_id}"]');d(page).locator('[name=recipients]').fill('field-team@example.test');submit(page);assert page.evaluate('Civora.engine.state.transmittals.at(-1).sourceSetId')==set_id
  ok('Visible set delivery dialog creates a transmittal pinned to the same controlled definition')
  # Responsive preferences preserve the full register option.
  page.set_viewport_size({'width':390,'height':844});nav(page,'documents');action(page,'mobile-more');d(page).locator('[data-mobile-preferences]').tap();page.wait_for_timeout(80);d(page).locator('[name=mobileList]').select_option('table');submit(page);assert page.locator('.ex-document-table').count()==1;assert page.locator('.mobile-file-card').count()==0
  action(page,'mobile-more');d(page).locator('[data-mobile-preferences]').tap();d(page).locator('[name=mobileList]').select_option('cards');submit(page);assert page.locator('.mobile-file-card').count()==15
  ok('Phone layout preference switches between touch cards and the horizontally scrollable full register')
  # Browser file chooser emulates taking/choosing a photo. No real camera claim.
  action(page,'mobile-add');
  with page.expect_file_chooser() as pending:d(page).locator('[data-mobile-create=camera]').tap()
  chooser=pending.value;assert chooser.element.get_attribute('capture')=='environment';assert chooser.element.get_attribute('accept')=='image/*'
  image=base64.b64decode('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+jZp8AAAAASUVORK5CYII=')
  chooser.set_files({'name':'site-photo.png','mimeType':'image/png','buffer':image});page.wait_for_timeout(100);assert 'site-photo.png' in d(page).inner_text();submit(page);assert page.evaluate('Civora.engine.state.documents.some(d=>d.name==="site-photo.png")');dismiss(page)
  ok('Photo capture hint uses the real file picker and standard checksum-preserving upload, not a camera mock API')
  # SVG image preview; original bytes decoded through Blob URL and actual browser image engine.
  doc_id=page.evaluate('Civora.engine.state.documents.find(d=>d.projectId===Civora.ui.projectId&&d.name.endsWith(".svg")).id')
  page.evaluate('(id)=>Civora.openViewer(id)',doc_id);page.wait_for_function('document.querySelector(".touch-viewport")?.dataset.zoom');assert page.locator('.image-sheet img').get_attribute('src').startswith('blob:')
  page.locator('[data-vp=in]').tap();assert float(page.locator('.touch-viewport').get_attribute('data-zoom'))>1;page.locator('[data-vp=fit]').tap();assert page.locator('.touch-viewport').get_attribute('data-zoom')=='1';page.screenshot(path=str(OUT/'touch-drawing.png'),full_page=True)
  ok('Phone drawing view loads actual original SVG with Fit and zoom/pan button alternatives')
  box=page.locator('.touch-viewport').bounding_box();cx=round(box['x']+box['width']/2);cy=round(box['y']+box['height']/2)
  session=context.new_cdp_session(page)
  session.send('Input.dispatchTouchEvent',{'type':'touchStart','touchPoints':[{'x':cx-35,'y':cy,'id':1},{'x':cx+35,'y':cy,'id':2}]})
  session.send('Input.dispatchTouchEvent',{'type':'touchMove','touchPoints':[{'x':cx-65,'y':cy+12,'id':1},{'x':cx+65,'y':cy+12,'id':2}]})
  session.send('Input.dispatchTouchEvent',{'type':'touchEnd','touchPoints':[]});page.wait_for_timeout(70);assert float(page.locator('.touch-viewport').get_attribute('data-zoom'))>1.2
  page.locator('[data-vp=fit]').tap();before=page.locator('.touch-sheet').evaluate('(e)=>e.style.transform');pointer(page,'.touch-viewport',[['pointerdown',40,cx,cy],['pointermove',40,cx+23,cy+10],['pointerup',40,cx+23,cy+10]]);assert page.locator('.touch-sheet').evaluate('(e)=>e.style.transform')!=before
  ok('Real Chromium multi-touch events pinch the drawing; tracked single-pointer input pans it')
  page.locator('[data-vp=fit]').tap();page.locator('[data-preview-mode=pin]').tap();count=page.evaluate('Civora.engine.state.markups.length')
  pointer(page,'.touch-viewport',[['pointerdown',41,cx,cy],['pointerdown',42,cx+30,cy],['pointermove',42,cx+50,cy],['pointerup',42,cx+50,cy],['pointerup',41,cx,cy]]);assert page.locator('dialog[open]').count()==1
  pointer(page,'.touch-viewport',[['pointerdown',43,cx,cy],['pointercancel',43,cx,cy],['pointerup',43,cx,cy]]);assert page.locator('dialog[open]').count()==1;assert page.evaluate('Civora.engine.state.markups.length')==count
  ok('Pinch completion and pointer cancellation never become accidental drawing annotations')
  page.locator('[data-vp=fit]').tap();page.locator('[data-preview-mode=rectangle-tap]').tap();sheet=page.locator('.touch-sheet').bounding_box();x1=round(sheet['x']+sheet['width']*.35);y1=round(sheet['y']+sheet['height']*.35);x2=round(sheet['x']+sheet['width']*.65);y2=round(sheet['y']+sheet['height']*.65)
  page.touchscreen.tap(x1,y1);page.touchscreen.tap(x2,y2);page.wait_for_timeout(100);assert page.locator('dialog[open]').count()==2;d(page).locator('[name=text]').fill('Field verification required before installation.');submit(page);assert page.evaluate('Civora.engine.state.markups.length')==count+1
  markup=page.evaluate('Civora.engine.state.markups.at(-1)');assert markup['tool']=='rectangle';assert abs(markup['w']-.3)<.02;assert abs(markup['h']-.3)<.02
  page.locator('[data-viewer-panel=notes]').tap();assert page.locator('.viewer-side').is_visible();assert 'Field verification required' in page.locator('.viewer-side').inner_text();page.screenshot(path=str(OUT/'touch-drawing-notes.png'),full_page=True);close(page);dismiss(page)
  ok('Two-tap rectangle alternative saves a normalized revision-linked markup and exposes it in phone Notes')
  # Direct long-press events exercise the application recognizer; no OS context behavior claimed.
  nav(page,'documents');card=page.locator('.mobile-file-card').first;bb=card.bounding_box();x=round(bb['x']+120);y=round(bb['y']+bb['height']-5)
  pointer(page,'.mobile-file-card:first-child',[['pointerdown',60,x,y]]);page.wait_for_timeout(690);assert d(page).locator('[data-action=open-document]').count()==1;pointer(page,'.mobile-file-card:first-child',[['pointerup',60,x,y]]);close(page)
  pointer(page,'.mobile-file-card:first-child',[['pointerdown',61,x,y],['pointermove',61,x,y-40]]);page.wait_for_timeout(680);assert page.locator('dialog[open]').count()==0;pointer(page,'.mobile-file-card:first-child',[['pointerup',61,x,y-40]])
  ok('Long press offers nondestructive actions and cancels on scrolling movement')
  # Real rendering bounded at common narrow widths and all screens; record each measurement.
  dimensions=[]
  for width,height in [(320,740),(390,844),(600,900),(740,390),(1024,768)]:
   page.set_viewport_size({'width':width,'height':height});nav(page,'documents');assert page.evaluate('document.querySelector("#content").scrollWidth<=innerWidth+1'),(width,height)
   dimensions.append({'width':width,'height':height,'contentWidth':page.locator('#content').evaluate('(e)=>e.scrollWidth')})
  page.set_viewport_size({'width':390,'height':844});action(page,'mobile-more');routes=d(page).locator('[data-mobile-tool]').evaluate_all('(xs)=>xs.map(x=>x.dataset.mobileTool)');close(page)
  overflows=[]
  for route in routes:
   nav(page,route);result=page.locator('#content').evaluate('(e)=>({client:e.clientWidth,scroll:e.scrollWidth})')
   if result['scroll']>result['client']+1:overflows.append({'route':route,**result})
  (OUT/'mobile-layout-audit.json').write_text(json.dumps({'sizes':dimensions,'screenCount':len(routes),'overflows':overflows},indent=2));assert not overflows,overflows
  ok('All twenty-five screens and five phone/tablet dimensions have bounded content containers')
  nav(page,'documents');action(page,'ex-menu','[data-menu=View]');d(page).locator('[data-action=toggle-theme]').tap();page.wait_for_timeout(100);assert page.locator('html').get_attribute('data-theme')=='dark';dismiss(page);page.screenshot(path=str(OUT/'touch-dark.png'),full_page=True)
  action(page,'mobile-more');d(page).locator('[data-mobile-preferences]').tap();d(page).locator('[name=inputMode]').select_option('touch');submit(page)
  page.set_viewport_size({'width':1024,'height':768});nav(page,'documents');assert page.locator('.ex-document-table').count()==1;assert page.locator('html').get_attribute('data-input-mode')=='touch',page.evaluate('({attr:document.documentElement.dataset.inputMode,coarse:matchMedia("(pointer: coarse)").matches,touch:navigator.maxTouchPoints})');page.screenshot(path=str(OUT/'touch-tablet.png'),full_page=True)
  ok('Dark phone and explicit touch-mode tablet keep touch sizing alongside the full Explorer workspace')
  assert not errors,errors;ok('Touch and collection UI completes without uncaught application errors')
 except Exception:
  print('ERRORS',errors,flush=True);page.screenshot(path=str(OUT/'touch-failure.png'),full_page=True);raise
 finally:
  (OUT/'mobile-touch-ui.json').write_text(json.dumps({'mode':'actual memory repository and command engine; isolated browser; emulated touchscreen and CDP touch events','results':results,'errors':errors},indent=2));browser.close()
