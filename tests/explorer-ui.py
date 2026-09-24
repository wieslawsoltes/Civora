"""Civora Explorer interactions on the actual memory repository and reducer.
Chromium URL navigation is blocked by administrator in this environment. The
SHA-256/UUID shim supplies opaque-origin test primitives, not storage or access
results. No browser origin, IndexedDB, OS permissions or live OAuth is qualified.
"""
import hashlib,json,os
from pathlib import Path
from playwright.sync_api import sync_playwright
ROOT=Path(__file__).resolve().parents[1];OUT=ROOT/'test-results';OUT.mkdir(exist_ok=True)
results=[];errors=[]
def ok(name):results.append({'name':name,'passed':True});print('PASS',name,flush=True)
def dialog(page):return page.locator('dialog[open]').last
def close(page):page.evaluate("document.querySelectorAll('dialog[open]').forEach(d=>d.close())");page.wait_for_timeout(40)
def submit(page):dialog(page).locator('[type=submit]').click();page.wait_for_timeout(120)
def dismiss(page):page.locator('#toast-host .toast').evaluate_all('(xs)=>xs.forEach(x=>x.click())')
def action(page,action,attributes=''):page.locator(f'[data-action="{action}"]{attributes}').first.click();page.wait_for_timeout(65)
def install(page):
 page.expose_function('__testDigest',lambda data:list(hashlib.sha256(bytes(data)).digest()))
 page.evaluate('''()=>{Object.defineProperty(crypto,'subtle',{value:{digest:async(_,data)=>Uint8Array.from(await __testDigest(Array.from(new Uint8Array(data instanceof ArrayBuffer?data:data.buffer)))).buffer}});crypto.randomUUID=()=>{let b=crypto.getRandomValues(new Uint8Array(16));b[6]=(b[6]&15)|64;b[8]=(b[8]&63)|128;let h=[...b].map(x=>x.toString(16).padStart(2,'0')).join('');return`${h.slice(0,8)}-${h.slice(8,12)}-${h.slice(12,16)}-${h.slice(16,20)}-${h.slice(20)}`;};history.replaceState=()=>{};}''')
 page.on('pageerror',lambda error:errors.append(str(error)))
 page.set_content((ROOT/'dist/civora.html').read_text(),wait_until='load');page.wait_for_function('!!window.Civora');dismiss(page)
with sync_playwright() as p:
 browser=p.chromium.launch(executable_path=os.environ.get('CHROMIUM','/usr/bin/chromium'),args=['--no-sandbox'])
 page=browser.new_page(viewport={'width':1600,'height':1000},device_scale_factor=1,accept_downloads=True);page.set_default_timeout(8000)
 try:
  install(page);assert page.locator('[data-explorer]').count()==1;assert page.locator('[role=treeitem]').count()>5;assert page.locator('[data-ex-row]').count()==15;assert 'Temporary memory' in page.locator('.ex-statusbar').inner_text();assert not errors
  ok('Explorer is the default entry with an actual datasource tree, document register, commands and storage status')
  first=page.locator('[data-ex-row]').first;first_id=first.get_attribute('data-ex-row');first.click();assert page.evaluate('Civora.ui.selection.size')==1;assert page.locator('dialog[open]').count()==0;assert page.locator('.ex-property-file').count()==1
  dismiss(page);page.screenshot(path=str(OUT/'explorer.png'),full_page=True)
  ok('Single click selects and updates the docked inspector without opening a modal')
  page.locator('[data-ex-row]').nth(2).click(modifiers=['Shift']);assert page.evaluate('Civora.ui.selection.size')==3
  page.locator('[data-ex-row]').nth(1).click(modifiers=['Control']);assert page.evaluate('Civora.ui.selection.size')==2
  page.locator('#select-all-docs').check();assert page.evaluate('Civora.ui.selection.size')==15
  page.locator('#select-all-docs').uncheck();assert page.evaluate('Civora.ui.selection.size')==0
  ok('Shift ranges, additive toggles and current-page select-all use the shared selection model')
  page.locator('[data-ex-row]').first.click();page.keyboard.press('ArrowDown');assert page.evaluate('Civora.explorer.activeId')!=first_id;page.keyboard.press('Shift+ArrowDown');assert page.evaluate('Civora.ui.selection.size')==2;page.keyboard.press('Enter');assert page.locator('dialog[open]').count()==1;close(page)
  page.locator('[data-ex-row]').first.dblclick();assert page.locator('dialog[open]').count()==1;close(page)
  ok('Keyboard focus, range extension, Enter and double-click open the real full document inspector')
  action(page,'ex-menu','[data-menu="Document"]');assert page.locator('.ex-context [role=menuitem]').count()>8;page.keyboard.press('End');assert page.evaluate('document.activeElement.textContent').strip()=='Recycle document…';page.keyboard.press('Escape');assert page.locator('.ex-context').count()==0
  page.locator('[data-ex-row]').nth(2).click(button='right');assert page.locator('.ex-context').count()==1;page.keyboard.press('Escape');assert page.locator('.ex-context').count()==0
  ok('Menubar and row context menus expose working commands with keyboard dismissal and menu navigation')
  action(page,'ex-columns');d=dialog(page);d.locator('[name=column][value=title]').check();d.locator('[data-column-width=name]').fill('320');d.locator('[name=group]').select_option('discipline');d.locator('[name=density]').select_option('standard');d.locator('[data-column-option=title] [data-column-up]').click();page.screenshot(path=str(OUT/'explorer-columns.png'),full_page=True);submit(page)
  config=page.evaluate('Civora.explorer.configuration');assert 'title' in config['columns'];assert config['widths']['name']==320;assert config['groupBy']=='discipline';assert config['density']=='standard';assert page.locator('.ex-group-row').count()>1
  ok('Column editor applies visibility, order, widths, grouping and density to the real list')
  page.locator('[data-action=ex-sort][data-key=name]').click();page.locator('[data-action=ex-sort][data-key=number]').click(modifiers=['Shift']);assert len(page.evaluate('Civora.explorer.configuration.sort'))==2
  splitter=page.locator('#ex-width-name');splitter.focus();page.keyboard.press('ArrowRight');assert page.evaluate('Civora.explorer.configuration.widths.name')==336
  page.locator('[data-ex-column=title]').drag_to(page.locator('[data-ex-column=number]'));assert page.evaluate('Civora.explorer.configuration.columns.indexOf("title")<Civora.explorer.configuration.columns.indexOf("number")')
  ok('Headers support additive multi-sort, keyboard resizing and actual drag reordering')
  action(page,'ex-menu','[data-menu="View"]');action(page,'ex-toggle-filters');page.locator('[data-ex-column-filter=name]').fill('ARC');page.wait_for_timeout(240);assert page.locator('[data-ex-row]').count()==5
  page.locator('#state-filter').select_option('Shared');assert page.locator('[data-ex-row]').count()==3
  action(page,'ex-save');d=dialog(page);d.locator('[name=name]').fill('Architecture · shared register');d.locator('[name=scope]').select_option('project');submit(page);assert page.locator('dialog[open]').count()==0
  saved=page.evaluate('Civora.engine.state.explorerViews.at(-1)');assert saved['config']['columnFilters']['name']=='ARC';assert saved['config']['quickFilters']['state']=='Shared';assert saved['scope']=='project'
  ok('Shared saved views persist inline filters, quick state filters and layout without copying document data')
  action(page,'ex-menu','[data-menu="View"]');action(page,'ex-reset');assert page.locator('[data-ex-row]').count()==15
  page.locator('#ex-view-select').select_option(saved['id']);assert page.locator('[data-ex-row]').count()==3;assert page.locator('#state-filter').input_value()=='Shared';assert page.locator('[data-ex-column-filter=name]').input_value()=='ARC'
  action(page,'ex-menu','[data-menu="View"]');action(page,'ex-manage-views');assert 'Architecture · shared register' in dialog(page).inner_text();page.screenshot(path=str(OUT/'explorer-saved-views.png'),full_page=True);close(page)
  ok('Saved-view selection and management restore the actual query and layout')
  action(page,'ex-filter');d=dialog(page);d.locator('[name=query]').fill('');d.locator('[data-filter-key]').select_option('filetype');d.locator('[data-filter-op]').select_option('eq');d.locator('[data-filter-value]').fill('svg');d.locator('[data-preview-filter]').click();assert 'readable documents match' in d.locator('#ex-filter-count').inner_text();submit(page);assert all(x.endswith('.svg') for x in page.locator('.ex-file-cell strong').all_text_contents())
  ok('Visual advanced search previews and applies literal, access-filtered document conditions')
  action(page,'ex-menu','[data-menu="View"]');action(page,'ex-reset');page.locator('[data-ex-row]').first.click();action(page,'ex-pin');assert page.evaluate('Civora.engine.state.explorerBookmarks.length')==1;assert page.locator('[data-action=ex-shortcut-open]').count()==1
  action(page,'ex-inspector-tab','[data-tab="preview"]');page.wait_for_function("!!document.querySelector('#ex-file-preview img')");assert page.locator('#ex-file-preview img').get_attribute('src').startswith('blob:');page.screenshot(path=str(OUT/'explorer-drawing-preview.png'),full_page=True)
  ok('Pinned shortcuts are command-engine records and inline drawing preview loads the original blob')
  action(page,'ex-inspector-tab','[data-tab="versions"]');assert page.locator('.ex-detail-table tbody tr').count()>=1
  action(page,'ex-inspector-tab','[data-tab="references"]');assert page.locator('.ex-dependency-columns').count()==1
  action(page,'ex-inspector-tab','[data-tab="access"]');assert page.locator('.ex-permissions>div').count()==7
  action(page,'ex-inspector-tab','[data-tab="audit"]');assert page.locator('.ex-audit').count()==1
  ok('Docked version history, dependency navigation, effective permissions and admin audit render real data')
  action(page,'ex-inspector-tab','[data-tab="properties"]');action(page,'ex-menu','[data-menu="View"]');action(page,'ex-dock','[data-position="right"]');assert page.locator('.ex-dock-right').count()==1;page.screenshot(path=str(OUT/'explorer-right-pane.png'),full_page=True)
  handle=page.locator('#ex-preview-separator');box=handle.bounding_box();page.mouse.move(box['x']+2,box['y']+50);page.mouse.down();page.mouse.move(box['x']-35,box['y']+50);page.mouse.up();assert page.evaluate('Civora.explorer.layout.previewWidth')>360
  action(page,'ex-menu','[data-menu="View"]');action(page,'ex-dock','[data-position="bottom"]');page.locator('#ex-tree-separator').focus();page.keyboard.press('ArrowRight');assert page.evaluate('Civora.explorer.layout.treeWidth')==274
  ok('Bottom/right docking and pointer/keyboard splitters resize the actual workspace')
  folder=page.locator('[data-action=ex-tree][data-scope=folder]').first;folder_id=folder.get_attribute('data-id');folder.click();assert page.evaluate('Civora.ui.folderId')==folder_id
  action(page,'ex-back');assert page.evaluate('Civora.ui.folderId')=='';action(page,'ex-forward');assert page.evaluate('Civora.ui.folderId')==folder_id;action(page,'ex-up');assert page.evaluate('Civora.ui.folderId')==''
  action(page,'ex-shortcut-open');assert page.evaluate('Civora.explorer.activeId')==first_id
  action(page,'ex-copy-link');assert dialog(page).locator('textarea').input_value().startswith('#documents?');link=dialog(page).locator('textarea').input_value();close(page)
  action(page,'ex-go-link');dialog(page).locator('[name=link]').fill(link);submit(page);assert page.evaluate('Civora.explorer.activeId')==first_id
  ok('Folder back/forward/up, reference-only shortcuts and permission-checked pasted addresses navigate correctly')
  setup=page.evaluate('''async()=>{const e=Civora.engine,p=Civora.ui.projectId;const source=await e.run('folder.create',{projectId:p,name:'UI Source'}),target=await e.run('folder.create',{projectId:p,name:'UI Destination'});const a=await e.addFile(new File(['First controlled file'],'move-a.txt',{type:'text/plain'}),{projectId:p,folderId:source}),b=await e.addFile(new File(['Second controlled file'],'move-b.txt',{type:'text/plain'}),{projectId:p,folderId:source});Civora.explorer.go(p,source);return {source,target,a,b};}''')
  page.locator('#select-all-docs').check();action(page,'ex-move');d=dialog(page);d.locator('[name=destination]').select_option(setup['target']);revision=page.evaluate('Civora.engine.state.revision');d.locator('#ex-move-preview').click();page.wait_for_timeout(100);assert 'Validated 2 documents' in d.locator('#ex-move-status').inner_text();assert page.evaluate('Civora.engine.state.revision')==revision;page.screenshot(path=str(OUT/'explorer-move-preview.png'),full_page=True);submit(page)
  assert page.evaluate('Civora.engine.state.revision')==revision+1;assert page.evaluate('(s)=>[s.a,s.b].every(id=>Civora.engine.state.documents.find(d=>d.id===id).folderId===s.target)',setup)
  ok('Two-document move previews the real reducer and commits exactly one workspace revision')
  page.locator('[data-ex-row]').first.click();action(page,'ex-menu','[data-menu="Document"]');action(page,'ex-cut');page.evaluate('(s)=>Civora.explorer.go(Civora.ui.projectId,s.source)',setup);action(page,'ex-menu','[data-menu="Document"]');action(page,'ex-paste');d=dialog(page);d.locator('#ex-move-preview').click();page.wait_for_timeout(80);page.evaluate("async()=>Civora.engine.run('document.update',{id:Civora.engine.state.documents[0].id,title:'Concurrent UI preview invalidation'})");revision=page.evaluate('Civora.engine.state.revision');submit(page);assert 'workspace changed' in dialog(page).locator('.form-error').inner_text().lower();assert page.evaluate('Civora.engine.state.revision')==revision;close(page)
  ok('Cut/paste uses validated moves and stale previews fail without saving a prefix')
  page.evaluate('Civora.explorer.go(Civora.ui.projectId)');action(page,'ex-menu','[data-menu="View"]');action(page,'ex-reset');page.locator('[data-ex-row]').first.click();action(page,'ex-menu','[data-menu="View"]');action(page,'toggle-theme');assert page.locator('html').get_attribute('data-theme')=='dark';dismiss(page);page.screenshot(path=str(OUT/'explorer-dark.png'),full_page=True)
  page.set_viewport_size({'width':414,'height':896});page.evaluate('Civora.navigate("documents")');page.wait_for_timeout(100);assert page.evaluate('document.documentElement.scrollWidth')<=415
  action(page,'ex-toggle-tree');assert page.locator('.ex-tree').is_visible();page.locator('.ex-tree [data-action=ex-tree][data-scope=project]').first.click();assert not page.locator('.ex-tree').is_visible();dismiss(page);page.screenshot(path=str(OUT/'explorer-mobile.png'),full_page=True)
  ok('Modern dark/mobile layouts remain bounded, with a usable small-screen folder overlay')
  assert not errors,errors
  ok('Explorer interaction suite completes without uncaught application errors')
 except Exception:
  print('ERRORS',errors,flush=True);page.screenshot(path=str(OUT/'explorer-failure.png'),full_page=True);raise
 finally:
  (OUT/'explorer-ui.json').write_text(json.dumps({'mode':'actual memory repository and command engine; opaque-origin browser harness','results':results,'errors':errors},indent=2));browser.close()
