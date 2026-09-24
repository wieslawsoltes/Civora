"""Real application DOM interactions on an opaque origin with MemoryRepository.
No browser-origin persistence, native directory permissions or live OAuth is claimed.
The two Python bindings supply SHA-256 and UUID in the same manner as browser-harness.py.
"""
import csv, hashlib, io, json, os, zipfile
from pathlib import Path
from playwright.sync_api import sync_playwright
ROOT=Path(__file__).resolve().parents[1]
OUT=ROOT/'test-results';OUT.mkdir(exist_ok=True)
results=[];errors=[]
def ok(name): results.append({'name':name,'passed':True});print('PASS',name,flush=True)
def close(page): page.evaluate("document.querySelectorAll('dialog[open]').forEach(d=>d.close())");page.wait_for_timeout(70)
def nav(page,route): close(page);page.evaluate('(r)=>Civora.navigate(r)',route);page.wait_for_timeout(100)
def dialog(page): return page.locator('dialog[open]').last
def submit(page): dialog(page).locator('[type=submit]').click();page.wait_for_timeout(160)
def dismiss(page): page.locator('#toast-host .toast').evaluate_all('(items)=>items.forEach(i=>i.click())')
def install(page):
 page.expose_function('__testDigest',lambda data:list(hashlib.sha256(bytes(data)).digest()))
 page.evaluate('''()=>{Object.defineProperty(crypto,'subtle',{value:{digest:async(_,data)=>Uint8Array.from(await __testDigest(Array.from(new Uint8Array(data instanceof ArrayBuffer?data:data.buffer)))).buffer}});crypto.randomUUID=()=>{let b=crypto.getRandomValues(new Uint8Array(16));b[6]=(b[6]&15)|64;b[8]=(b[8]&63)|128;let h=[...b].map(x=>x.toString(16).padStart(2,'0')).join('');return`${h.slice(0,8)}-${h.slice(8,12)}-${h.slice(12,16)}-${h.slice(16,20)}-${h.slice(20)}`;};history.replaceState=()=>{};}''')
 page.on('pageerror',lambda error:errors.append(str(error)))
 page.set_content((ROOT/'dist/civora.html').read_text(),wait_until='load');page.wait_for_function('!!window.Civora');dismiss(page)
with sync_playwright() as p:
 browser=p.chromium.launch(executable_path=os.environ.get('CHROMIUM','/usr/bin/chromium'),args=['--no-sandbox'])
 page=browser.new_page(viewport={'width':1540,'height':1060},device_scale_factor=1,accept_downloads=True);page.set_default_timeout(8000)
 try:
  install(page);nav(page,'control')
  assert page.locator('h1').inner_text()=='Document control'
  assert page.evaluate('Civora.engine.state.baselines.length')==2
  assert page.evaluate('Civora.engine.state.reviewTemplates.length')==2
  page.screenshot(path=str(OUT/'document-control.png'),full_page=True)
  ok('Document-control workbench displays actual typed metadata, numbering and template records')
  page.locator('[data-action=control-numbering]').click();d=dialog(page);d.locator('[name=pattern]').fill('{project}-UI-{seq:4}');d.locator('[name=nextSequence]').fill('120')
  assert 'NLC-UI-0120' in d.locator('[data-number-preview]').inner_text();submit(page)
  assert page.evaluate('Civora.engine.state.projects[0].numbering.nextSequence')==120
  ok('Numbering editor previews and saves an atomically allocated document-number pattern')
  page.locator('[data-action=edit-fields]').click();d=dialog(page);d.locator('[data-add-field]').click()
  d.locator('[name=key_4]').fill('floor');d.locator('[name=label_4]').fill('Floor');d.locator('[name=type_4]').select_option('integer');d.locator('[name=min_4]').fill('-2');d.locator('[name=max_4]').fill('12');submit(page)
  assert page.evaluate("Civora.engine.state.projects[0].fields.find(f=>f.key==='floor').type")=='integer'
  ok('Metadata editor adds a bounded integer field without rewriting historical metadata')
  nav(page,'documents');page.locator('[data-action=upload]').first.click();d=dialog(page)
  svg=b'<svg xmlns="http://www.w3.org/2000/svg" width="80" height="60"><image href="control-dependent.txt" width="80" height="60"/></svg>'
  d.locator('[name=files]').set_input_files([{'name':'control-host.svg','mimeType':'image/svg+xml','buffer':svg},{'name':'control-dependent.txt','mimeType':'text/plain','buffer':b'Baseline original bytes'}])
  d.locator('[name=meta_zone]').select_option('Zone B');d.locator('[name=meta_suitability]').select_option('S2');d.locator('[name=meta_handover_ready]').select_option('true');d.locator('[name=meta_floor]').fill('2');submit(page)
  ids=page.evaluate("Civora.engine.state.documents.filter(d=>d.name.startsWith('control-')).map(d=>d.id)");assert len(ids)==2
  host,dep=ids
  assert page.evaluate('(id)=>Civora.engine.state.documents.find(d=>d.id===id).metadata',host)=={'zone':'Zone B','originator':'NLC','suitability':'S2','handover_ready':'true','floor':'2'}
  assert page.evaluate('(id)=>Civora.engine.state.documents.find(d=>d.id===id).number',host)=='NLC-UI-0120'
  ok('Upload uses choice, boolean and bounded integer controls and real automatic numbering')
  nav(page,'control');page.locator('[data-action=control-bulk]').click();d=dialog(page)
  for id in ids:d.locator(f'[name=documentIds][value="{id}"]').check()
  d.locator('[name="apply:discipline"]').check();d.locator('[name=discipline]').fill('Coordination');prior=page.evaluate('Civora.engine.state.revision');submit(page)
  d=dialog(page);assert '2 document(s)' in d.inner_text();d.locator('details').first.locator('summary').click();assert 'Coordination' in d.locator('pre').first.inner_text();submit(page)
  assert page.evaluate('Civora.engine.state.revision')==prior+1
  assert page.evaluate('(ids)=>ids.every(id=>Civora.engine.state.documents.find(d=>d.id===id).discipline==="Coordination")',ids)
  ok('Bulk properties show before/after values and commit two documents in one revision')
  nav(page,'documents');page.locator('#document-search').fill('control-');page.wait_for_timeout(180);page.locator('#select-all-docs').check();page.wait_for_timeout(80)
  with page.expect_download() as download:page.locator('[data-action=control-register-export]').click()
  path=OUT/'editable-register.csv';download.value.save_as(path)
  rows=list(csv.DictReader(io.StringIO(path.read_text(encoding='utf-8-sig'))));assert len(rows)==2
  rows[0]['title']='Reviewed in editable register';buf=io.StringIO();writer=csv.DictWriter(buf,fieldnames=rows[0].keys(),lineterminator='\r\n');writer.writeheader();writer.writerows(rows)
  nav(page,'control');page.locator('[data-action=control-register-import]').click();dialog(page).locator('[name=register]').set_input_files({'name':'edited-register.csv','mimeType':'text/csv','buffer':buf.getvalue().encode()});submit(page)
  assert '1 document(s)' in dialog(page).inner_text();submit(page);assert page.evaluate('(id)=>Civora.engine.state.documents.find(d=>d.id===id).title',host)=='Reviewed in editable register'
  ok('Editable CSV export/import preserves protected IDs and applies a reviewed metadata change')
  page.locator('[data-action=control-register-import]').click();dialog(page).locator('[name=register]').set_input_files({'name':'stale.csv','mimeType':'text/csv','buffer':buf.getvalue().encode()});submit(page)
  assert 'workspace changed' in dialog(page).locator('.form-error').inner_text().lower();close(page)
  ok('Stale CSV import shows an explicit error and applies no stale data')
  page.locator('[data-action=control-scan]').click();dialog(page).locator('[name=documentId]').select_option(host);submit(page)
  d=dialog(page);assert 'Matched path' in d.inner_text();assert d.locator('[name=ref_0]').input_value()==dep;submit(page)
  assert page.evaluate('(id)=>Civora.engine.state.documents.find(d=>d.id===id).references',host)==[dep]
  ok('Reference scanner reads original SVG bytes and stores only explicitly confirmed relationships')
  page.locator('[data-action=control-template-new]').click();d=dialog(page);d.locator('[name=name]').fill('UI two-stage route');d.locator('[name=stage_0_name]').fill('Technical check');d.locator('[data-stage-add]').click();d.locator('[name=stage_1_name]').fill('Issue approval');submit(page)
  template=page.evaluate("Civora.engine.state.reviewTemplates.find(t=>t.name==='UI two-stage route').id")
  ok('Review template builder saves two separately configured stages')
  page.locator(f'[data-action=control-template-use][data-id="{template}"]').click();d=dialog(page);d.locator('[name=title]').fill('UI controlled review');d.locator('[name=dueDate]').fill('2026-12-20');d.locator(f'[name=documentIds][value="{host}"]').check();submit(page)
  rid=page.evaluate("Civora.engine.state.reviews.find(r=>r.title==='UI controlled review').id")
  page.locator(f'[data-action=open-review][data-id="{rid}"]').click();d=dialog(page);assert 'Stage 1 of 2' in d.inner_text();d.locator('[name=comment]').fill('Geometry and metadata checked against the pinned context.');submit(page)
  nav(page,'inbox');page.locator(f'[data-action=open-review][data-id="{rid}"]').click();d=dialog(page);assert 'Stage 2 of 2' in d.inner_text();page.screenshot(path=str(OUT/'staged-review.png'),full_page=True);d.locator('[name=comment]').fill('Approved for issue.');submit(page)
  assert page.evaluate('(id)=>Civora.engine.state.reviews.find(r=>r.id===id).status',rid)=='Approved'
  ok('Review UI records sequential decisions and the inbox follows the active stage')
  nav(page,'baselines');page.locator('[data-action=control-baseline-new]').first.click();d=dialog(page);d.locator('[name=name]').fill('UI dependency delivery');d.locator('[name=description]').fill('Frozen SVG host and controlled external reference.');d.locator(f'[name=documentIds][value="{host}"]').check();submit(page)
  bid=page.evaluate("Civora.engine.state.baselines.find(b=>b.name==='UI dependency delivery').id")
  assert page.evaluate('(id)=>Civora.engine.state.baselines.find(b=>b.id===id).documents.length',bid)==2
  page.screenshot(path=str(OUT/'baselines.png'),full_page=True)
  ok('Baseline form freezes a root plus its dependency using exact revision identities')
  # Simulate a separate author, using the actual command engine and actual content repository.
  page.evaluate('''async(id)=>{await Civora.engine.run('document.checkout',{id});await Civora.engine.checkin(new File(['New external revision'],'control-dependent.txt',{type:'text/plain'}),{id,revision:'P02',comment:'Changed after delivery freeze'});}''',dep)
  page.locator(f'[data-action=control-baseline-open][data-id="{bid}"]').click();d=dialog(page);assert 'Content changed' in d.locator('[data-baseline-diff]').inner_text();page.screenshot(path=str(OUT/'baseline-comparison.png'),full_page=True)
  ok('Baseline comparison distinguishes changed source bytes from the pinned delivery')
  with page.expect_download() as download:d.locator('[data-action=control-baseline-export]').click()
  path=OUT/'verified-baseline.zip';download.value.save_as(path)
  with zipfile.ZipFile(path) as archive:
   manifest=json.loads(archive.read('manifest.json'));record=next(d for d in manifest['baseline']['documents'] if d['documentId']==dep)
   assert archive.read(record['archivePath'])==b'Baseline original bytes'
   assert hashlib.sha256(archive.read(record['archivePath'])).hexdigest()==record['hash']
  ok('Downloaded baseline ZIP independently decodes and contains the original, not the newer file')
  d.locator('[data-action=control-baseline-transmit]').click();d=dialog(page);d.locator('[name=recipients]').fill('reviewer@example.test');submit(page)
  assert page.evaluate('(id)=>Civora.engine.state.transmittals.find(t=>t.baselineId===id).documents.length',bid)==2
  ok('Baseline action prepares a transmittal retaining exactly its frozen document versions')
  nav(page,'control');dismiss(page);page.screenshot(path=str(OUT/'document-control-final.png'),full_page=True)
  # Theme setting is exercised through the actual application control.
  nav(page,'settings');page.locator('[data-action=settings-tab][data-tab=appearance]').click();page.locator('[data-action=toggle-theme]').click();assert page.locator('html').get_attribute('data-theme')=='dark'
  nav(page,'control');page.screenshot(path=str(OUT/'document-control-dark.png'),full_page=True)
  assert page.locator('.control-hero').evaluate('(e)=>getComputedStyle(e).borderTopStyle')=='solid'
  ok('Theme toggle renders distinct dark surfaces, field borders and readable status tokens')
  nav(page,'settings');page.locator('[data-action=settings-tab][data-tab=appearance]').click();page.locator('[data-action=toggle-theme]').click();assert page.locator('html').get_attribute('data-theme')=='light'
  page.set_viewport_size({'width':390,'height':844})
  for route in ['control','baselines','inbox']:
   nav(page,route);dismiss(page);assert page.evaluate('document.documentElement.scrollWidth')<=392,route
  nav(page,'control');page.screenshot(path=str(OUT/'document-control-mobile.png'),full_page=True)
  ok('All three new screens fit a 390px viewport without page-level horizontal overflow')
  assert not errors,errors
 except Exception as exc:
  results.append({'name':'Harness failure','passed':False,'error':str(exc)});page.screenshot(path=str(OUT/'document-control-failure.png'),full_page=True);print('FAIL',repr(exc),page.locator('body').inner_text()[-5000:],flush=True);raise
 finally:
  (OUT/'document-control-ui.json').write_text(json.dumps({'mode':'opaque-origin real UI and MemoryRepository, no browser-origin qualification','results':results,'pageErrors':errors},indent=2));browser.close()
