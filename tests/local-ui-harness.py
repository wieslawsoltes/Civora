"""Isolated local-system component test, not real-origin browser qualification.
Uses the real application, BrowserDirectoryFS and DirectoryRepository with an
in-memory File System Access handle fixture and a cooperative Web Locks fixture.
Actual disk, HTTP auth and process launching are tested in local-http.test.mjs.
No browser navigation restrictions are disabled or bypassed.
"""
import hashlib,json,os
from pathlib import Path
from playwright.sync_api import sync_playwright
ROOT=Path(__file__).resolve().parents[1]
OUT=ROOT/'test-results';OUT.mkdir(exist_ok=True)
results=[];errors=[]
def record(name):
 results.append({'name':name,'passed':True});print('PASS',name,flush=True)
def close(page):
 page.evaluate("document.querySelectorAll('dialog').forEach(d=>d.close())");page.wait_for_timeout(50)
def dismiss(page):
 page.locator('#toast-host .toast').evaluate_all('(items)=>items.forEach(i=>i.click())')
def tab(page,name):
 close(page);page.locator(f'[data-action=local-tab][data-tab={name}]').click();page.wait_for_timeout(100)
def submit(page):
 dialog=page.locator('dialog[open]').last
 for field in dialog.locator('input[required]').all():
  if not field.input_value():field.fill('TEST')
 dialog.locator('[type=submit]').click();page.wait_for_timeout(200)
def main():
 with sync_playwright() as p:
  browser=p.chromium.launch(executable_path=os.environ.get('CHROMIUM','/usr/bin/chromium'),args=['--no-sandbox'])
  page=browser.new_page(viewport={'width':1540,'height':1060},device_scale_factor=1)
  page.expose_function('__testDigest',lambda values:list(hashlib.sha256(bytes(values)).digest()))
  page.evaluate(r'''() => {Object.defineProperty(crypto,'subtle',{value:{digest:async(algorithm,data)=>{if(algorithm!=='SHA-256')throw Error('Only SHA-256');const a=data instanceof ArrayBuffer?new Uint8Array(data):new Uint8Array(data.buffer,data.byteOffset,data.byteLength);return Uint8Array.from(await __testDigest(Array.from(a))).buffer;}}});crypto.randomUUID=()=>{const b=crypto.getRandomValues(new Uint8Array(16));b[6]=(b[6]&15)|64;b[8]=(b[8]&63)|128;const h=[...b].map(n=>n.toString(16).padStart(2,'0')).join('');return h.slice(0,8)+'-'+h.slice(8,12)+'-'+h.slice(12,16)+'-'+h.slice(16,20)+'-'+h.slice(20);};history.replaceState=()=>{};let q=Promise.resolve();Object.defineProperty(navigator,'locks',{value:{request:(key,options,fn)=>{const task=q.then(fn,fn);q=task.catch(()=>{});return task;}}});}''')
  page.on('pageerror',lambda err:errors.append(str(err)))
  page.set_content((ROOT/'dist/civora.html').read_text(),wait_until='load');page.wait_for_function('!!window.Civora',timeout=15000)
  page.add_script_tag(content=(ROOT/'tests/fsa-fixture.mjs').read_text().replace('export function fakeDirectory','function fakeDirectory')+'\nwindow.makeFixtureDirectory=fakeDirectory;')
  try:
   page.evaluate(r'''async()=>{window.localFixture=makeFixtureDirectory('Harbor Exchange — Working');await localFixture.put('01 Incoming/Survey brief.txt','SURVEY BRIEF\r\nHarbor Exchange / North quay\r\nVerify level references before the next issue.\r\n');await localFixture.put('01 Incoming/Levels.csv','Point,Elevation\nBM-01,12.450\nBM-02,12.610\n');await localFixture.put('02 Drawings/Readme.txt','Native working files live here.\n');await localFixture.put('03 Coordination/Review notes.md','# Coordination review\n\nRecord issues against a controlled revision.\n');await localFixture.put('04 Issued/Delivery checklist.txt','Confirm pinned revisions and recipient authorization.\n');await localFixture.put('Workspace notes.txt','Local system UI test fixture — not a connected real disk.\n');await Civora.local.attachHandle(localFixture.handle,{id:'harbor-local',remember:false});}''')
   page.wait_for_selector('.local-volume.active');page.wait_for_timeout(100)
   assert page.locator('h1').inner_text()=='Local system'
   assert page.locator('.local-file-table tbody tr').count()==5
   assert page.evaluate('Civora.engine.repository.kind')=='memory'
   record('Local explorer mounts a capability fixture through the real BrowserDirectoryFS adapter')
   dismiss(page);page.screenshot(path=str(OUT/'local-system.png'),full_page=True)
   page.locator('[data-action=local-mkdir]').click();page.locator('dialog[open] [name=name]').fill('05 Site records');submit(page)
   assert page.evaluate("localFixture.entries.has('05 Site records')")
   page.locator('[data-action=local-new-file]').click();page.locator('dialog[open] [name=name]').fill('Field notes.txt');page.locator('dialog[open] [name=contents]').fill('Original field notes');submit(page)
   assert page.evaluate("localFixture.get('Field notes.txt').then(f=>f.text())")=='Original field notes'
   record('New folder and text-file forms write real adapter contents, not placeholder rows')
   page.locator('[data-action=local-file][data-path="Field notes.txt"]').first.click();page.wait_for_timeout(80)
   assert 'SHA-256' in page.locator('dialog[open]').inner_text()
   page.locator('dialog[open] [data-action=local-edit-text]').click();page.locator('dialog[open]').last.locator('[name=text]').fill('Updated local notes\nΩ');submit(page);close(page)
   assert page.evaluate("localFixture.get('Field notes.txt').then(f=>f.text())")=='Updated local notes\nΩ'
   assert page.evaluate('Civora.local.active.trashList().then(items=>items.length)')==1
   record('Text editing preserves local bytes and creates recoverable pre-edit content')
   page.locator('[data-action=local-file][data-path="Field notes.txt"]').first.click();page.locator('dialog[open] [data-action=local-move]').click();page.locator('dialog[open]').last.locator('[name=destination]').fill('05 Site records/Field notes.txt');submit(page);close(page)
   assert page.evaluate("localFixture.get('05 Site records/Field notes.txt').then(f=>f.text())")=='Updated local notes\nΩ'
   page.locator('[data-action=local-folder][data-path="05 Site records"]').click();page.wait_for_timeout(80)
   page.locator('[data-action=local-file]').first.click();page.locator('dialog[open] [data-action=local-trash]').click();submit(page);close(page)
   tab(page,'trash');assert page.locator('[data-action=local-restore-trash]').count()==2
   page.locator('[data-action=local-restore-trash]').first.click();page.locator('dialog[open] [name=destination]').fill('05 Site records/Restored notes.txt');submit(page)
   assert page.evaluate("localFixture.get('05 Site records/Restored notes.txt').then(f=>f.text())")=='Updated local notes\nΩ'
   record('File rename, recoverable trash and explicit restore work through the interface')
   doc=page.evaluate("""async()=>{const projectId=Civora.ui.projectId;return Civora.engine.addFile(new File(['Controlled structural notes'],'Structural notes.txt'),{name:'Structural notes.txt',projectId,revision:'P01'});} """)
   tab(page,'working');page.locator('[data-action=local-checkout]').click();dialog=page.locator('dialog[open]').last;dialog.locator('[name=documentId]').select_option(doc);dialog.locator('[name=path]').fill('02 Drawings/Structural notes.txt');dialog.locator('[name=mode]').select_option('checkout');submit(page)
   assert page.evaluate('(id)=>Civora.engine.state.documents.find(d=>d.id===id).checkedOutBy',doc)=='u-admin'
   await_text=page.evaluate("localFixture.get('02 Drawings/Structural notes.txt').then(f=>f.text())")
   assert await_text=='Controlled structural notes'
   record('Checkout dialog writes the verified controlled original and acquires an engine lock')
   page.evaluate("localFixture.put('02 Drawings/Structural notes.txt','Native edit: coordinated steel levels Ω')");page.locator('[data-action=local-refresh]').last.click();page.wait_for_timeout(150)
   assert 'modified' in page.locator('.local-working-table').inner_text()
   page.locator('[data-action=local-checkin]').click();page.locator('dialog[open] [name=revision]').fill('P02');page.locator('dialog[open] [name=comment]').fill('Local coordination update');submit(page)
   assert page.evaluate('(id)=>Civora.engine.state.documents.find(d=>d.id===id).versions.length',doc)==2
   assert page.evaluate('(id)=>Civora.engine.state.documents.find(d=>d.id===id).checkedOutBy',doc) is None
   assert page.evaluate('Civora.local.rows[0].status')=='unchanged'
   record('Change scan and check-in UI commit exact modified bytes as a new controlled revision')
   page.evaluate("""async()=>{const p=Civora.ui.projectId;const a=await Civora.engine.addFile(new File(['Original civil levels'],'Civil levels.txt'),{name:'Civil levels.txt',projectId:p,revision:'P01'});const b=await Civora.engine.addFile(new File(['Original MEP note'],'Services coordination.txt'),{name:'Services coordination.txt',projectId:p,revision:'P01'});await Civora.local.manager.materialize(a,{path:'02 Drawings/Civil levels.txt'});await Civora.local.manager.materialize(b,{path:'03 Coordination/Services coordination.txt'});await localFixture.put('02 Drawings/Civil levels.txt','Local survey update');await localFixture.put('03 Coordination/Services coordination.txt','Local services update');await Civora.engine.checkin(new Blob(['Remote issued update']),{id:b,revision:'P02'});await Civora.local.refresh();}""")
   assert sorted(page.evaluate('Civora.local.rows.map(r=>r.status)'))==['conflict','modified','unchanged']
   dismiss(page);page.screenshot(path=str(OUT/'local-working-copies.png'),full_page=True)
   record('Working-copy status shows computed clean, modified and conflicting versions')
   page.locator('[data-action=local-watch]').click();assert 'Checking disk changes' in page.locator('.local-watch-bar').inner_text();page.locator('[data-action=local-watch]').click()
   record('Disk reconciliation can be started and paused from the working-copy panel')
   tab(page,'transfer');page.locator('[data-action=local-export-project]').click();page.wait_for_function('Civora.local.lastReport?.created.length>0',timeout=15000);page.wait_for_timeout(150)
   report=page.evaluate('Civora.local.lastReport');assert not report['failed'];assert len(report['created'])>=4
   sample=report['created'][0]['path'];assert page.evaluate('(p)=>localFixture.get(p).then(f=>f.size)',sample)>=0
   record('Project export writes pinned originals and reports completed files')
   page.evaluate("""async()=>{const a=await localFixture.get('01 Incoming/Survey brief.txt'),b=await localFixture.get('01 Incoming/Levels.csv');Civora.local.importDialog([{path:'Imported survey/Survey brief.txt',file:a},{path:'Imported survey/Levels.csv',file:b}]);}""");submit(page)
   assert page.evaluate("Civora.engine.state.folders.some(f=>f.name==='Imported survey')")
   assert page.evaluate('Civora.local.lastReport.created.length')==2
   record('Folder-import form preserves relative paths and creates controlled documents')
   page.evaluate("localFixture.permission='denied';Civora.local.refresh()");page.wait_for_timeout(100)
   assert 'permission' in page.locator('[role=alert]').inner_text().lower() or 'access' in page.locator('[role=alert]').inner_text().lower()
   page.evaluate("localFixture.permission='granted';Civora.local.refresh()");page.wait_for_timeout(100)
   record('Revoked folder permission surfaces a real error without resetting the workspace')
   tab(page,'workspace');page.locator('[data-action=local-copy-workspace]').click();submit(page);page.wait_for_function("Civora.engine.repository.kind==='directory'",timeout=15000)
   assert page.evaluate("localFixture.get('.civora/HEAD.json').then(f=>f.text()).then(s=>!!JSON.parse(s).commit)")
   assert page.evaluate('Civora.engine.state.documents.length')>=26
   record('Copy-to-folder flow activates the real immutable-checkpoint DirectoryRepository')
   page.locator('[data-action=local-verify]').click();page.wait_for_selector('dialog[open]');assert 'verified against SHA-256' in page.locator('dialog[open]').inner_text();close(page)
   page.locator('[data-action=local-history]').click();assert 'Verified' in page.locator('dialog[open]').inner_text();close(page)
   record('Disk integrity and checkpoint recovery views inspect actual adapter state')
   dismiss(page);page.screenshot(path=str(OUT/'local-folder-workspace.png'),full_page=True)
   page.set_viewport_size({'width':420,'height':900});tab(page,'files');dismiss(page);page.wait_for_timeout(120)
   assert page.evaluate('document.documentElement.scrollWidth<=innerWidth+1'),page.evaluate('({width:innerWidth,scroll:document.documentElement.scrollWidth})')
   page.evaluate('window.scrollTo(0,0)');page.wait_for_timeout(80);page.screenshot(path=str(OUT/'local-mobile.png'),full_page=True)
   record('Local-system layout avoids page overflow at 420px')
   page.set_viewport_size({'width':1540,'height':1060});page.evaluate("Civora.navigate('settings')");page.locator('[data-action=settings-tab][data-tab=appearance]').click();page.locator('[data-action=toggle-theme]').click();assert page.evaluate("document.documentElement.dataset.theme")=='dark';page.evaluate("Civora.navigate('local')");tab(page,'working');dismiss(page);page.evaluate('window.scrollTo(0,0)');page.wait_for_timeout(100);assert page.evaluate("document.documentElement.dataset.theme")=='dark';assert page.locator('.local-main').evaluate("el=>getComputedStyle(el).backgroundColor")=='rgb(29, 43, 56)';assert page.locator('.local-panel-head h2').evaluate("el=>getComputedStyle(el).color")=='rgb(225, 232, 240)';assert page.locator('html').evaluate("el=>getComputedStyle(el).backgroundColor")=='rgb(23, 34, 45)';page.screenshot(path=str(OUT/'local-dark.png'),full_page=True)
   record('Local interface retains readable dark-mode component layout')
   assert not errors,errors
  finally:
   if errors:print('BROWSER ERRORS',errors,flush=True)
   (OUT/'local-ui-results.json').write_text(json.dumps({'mode':'isolated-component-fixture','realOrigin':False,'realBrowserPermissions':False,'realOSFilesystem':False,'tests':results,'errors':errors},indent=2))
   page.screenshot(path=str(OUT/'local-last-state.png'),full_page=True)
   browser.close()
if __name__=='__main__':main()
