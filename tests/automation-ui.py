"""Real Civora UI on an opaque origin, with actual MemoryRepository and command engine.
The environment blocks URL navigation. SHA-256 is supplied via a test binding.
No server/browser cookie, IndexedDB, OAuth, or unattended-browser qualification.
"""
import hashlib, json, os
from pathlib import Path
from playwright.sync_api import sync_playwright
ROOT=Path(__file__).resolve().parents[1];OUT=ROOT/'test-results';OUT.mkdir(exist_ok=True)
results=[];errors=[]
def ok(name):results.append({'name':name,'passed':True});print('PASS',name,flush=True)
def dialog(page):return page.locator('dialog[open]').last
def dismiss(page):page.locator('#toast-host .toast').evaluate_all('(items)=>items.forEach(i=>i.click())')
def close(page):page.evaluate("document.querySelectorAll('dialog[open]').forEach(d=>d.close())");page.wait_for_timeout(60)
def nav(page,route):close(page);page.evaluate('(r)=>Civora.navigate(r)',route);page.wait_for_timeout(100);dismiss(page)
def submit(page):dialog(page).locator('[type=submit]').click();page.wait_for_timeout(160)
def install(page):
 page.expose_function('__testDigest',lambda data:list(hashlib.sha256(bytes(data)).digest()))
 page.evaluate('''()=>{Object.defineProperty(crypto,'subtle',{value:{digest:async(_,data)=>Uint8Array.from(await __testDigest(Array.from(new Uint8Array(data instanceof ArrayBuffer?data:data.buffer)))).buffer}});crypto.randomUUID=()=>{let b=crypto.getRandomValues(new Uint8Array(16));b[6]=(b[6]&15)|64;b[8]=(b[8]&63)|128;let h=[...b].map(x=>x.toString(16).padStart(2,'0')).join('');return`${h.slice(0,8)}-${h.slice(8,12)}-${h.slice(12,16)}-${h.slice(16,20)}-${h.slice(20)}`;};history.replaceState=()=>{};}''')
 page.on('pageerror',lambda error:errors.append(str(error)))
 page.set_content((ROOT/'dist/civora.html').read_text(),wait_until='load');page.wait_for_function('!!window.Civora');dismiss(page)
with sync_playwright() as p:
 browser=p.chromium.launch(executable_path=os.environ.get('CHROMIUM','/usr/bin/chromium'),args=['--no-sandbox'])
 page=browser.new_page(viewport={'width':1540,'height':1080},device_scale_factor=1,accept_downloads=True);page.set_default_timeout(8000)
 try:
  install(page);nav(page,'automation');assert page.locator('h1').inner_text()=='Workflow automation';assert page.locator('[data-rule-id]').count()==3
  assert 'explicit reconciliation' in page.locator('.automation-banner').inner_text();page.screenshot(path=str(OUT/'workflow-automation.png'),full_page=True)
  ok('Workflow workbench displays actual rules and explicitly distinguishes local reconciliation')
  doc=page.evaluate('''async()=>await Civora.engine.addFile(new File(['Controlled UI source'],'workflow-ui.txt',{type:'text/plain'}),{projectId:Civora.engine.state.projects[0].id,title:'Interface architecture check',discipline:'Workflow QA',metadata:{zone:'Zone A',originator:'NLC',suitability:'S1',handover_ready:false}})''')
  page.locator('[data-action=auto-rule-new]').click();d=dialog(page);d.locator('[name=name]').fill('Architecture readiness gate');d.locator('[name=from]').select_option('Work in progress');d.locator('[name=to]').select_option('Shared');d.locator('[name=priority]').fill('80');d.locator('[name=message]').fill('Complete the handover readiness check first.');d.locator('[name=requireReason]').check()
  d.locator('[data-add-condition=when]').click();row=d.locator('[data-condition-group=when] [data-condition-row]');row.locator('[data-condition-field]').select_option('discipline');row.locator('[data-condition-op]').select_option('eq');row.locator('[data-condition-value]').fill('Workflow QA')
  d.locator('[data-add-condition=require]').click();row=d.locator('[data-condition-group=require] [data-condition-row]');row.locator('[data-condition-field]').select_option('metadata.handover_ready');row.locator('[data-condition-op]').select_option('eq');row.locator('[data-condition-value]').fill('true')
  d.locator('[data-add-assignment]').click();row=d.locator('[data-assignment-row]');row.locator('select').select_option('zone');row.locator('input').fill('Zone B');d.locator('[name=addTags]').fill('Checked, Coordination ready');page.screenshot(path=str(OUT/'workflow-rule-editor.png'),full_page=True);submit(page)
  rule=page.evaluate("Civora.engine.state.workflowRules.find(r=>r.name==='Architecture readiness gate')");assert rule['require']['all'][0]['value'] is True;assert rule['metadata']['zone']=='Zone B'
  ok('Visual rule editor saves typed boolean predicates, reason guards, priority and assignments')
  page.locator('[data-action=auto-preview]').click();d=dialog(page);d.locator('[name=documentId]').select_option(doc);d.locator('[name=to]').select_option('Shared');d.locator('[name=reason]').fill('Ready for coordination');revision=page.evaluate('Civora.engine.state.revision');d.locator('[data-run-preview]').click();page.wait_for_timeout(100)
  assert 'Transition blocked' in d.locator('[data-transition-preview]').inner_text();assert 'handover readiness' in d.locator('[data-transition-preview]').inner_text();assert d.locator('[type=submit]').is_disabled();assert page.evaluate('Civora.engine.state.revision')==revision
  ok('Failed transition preview explains the actual guard and never modifies the workspace')
  close(page);page.evaluate("async(id)=>Civora.engine.run('document.update',{id,metadata:{handover_ready:true}})",doc)
  page.locator('[data-action=auto-preview]').click();d=dialog(page);d.locator('[name=documentId]').select_option(doc);d.locator('[name=to]').select_option('Shared');d.locator('[name=reason]').fill('Handover readiness independently checked');d.locator('[data-run-preview]').click();page.wait_for_timeout(100)
  assert 'All transition gates passed' in d.locator('[data-transition-preview]').inner_text();assert 'Zone B' in d.locator('[data-transition-preview]').inner_text();assert not d.locator('[type=submit]').is_disabled();page.screenshot(path=str(OUT/'workflow-transition-preview.png'),full_page=True)
  d.locator('[name=reason]').fill('Revised recorded rationale');assert d.locator('[type=submit]').is_disabled();d.locator('[data-run-preview]').click();page.wait_for_timeout(70);revision=page.evaluate('Civora.engine.state.revision');submit(page)
  changed=page.evaluate('(id)=>Civora.engine.state.documents.find(d=>d.id===id)',doc);assert changed['state']=='Shared';assert changed['metadata']['zone']=='Zone B';assert 'Coordination ready' in changed['tags'];assert page.evaluate('Civora.engine.state.revision')==revision+1
  ok('Changing preview inputs invalidates it; accepted transition commits metadata, tags and state atomically')
  page.locator(f'[data-action=auto-rule-toggle][data-id="{rule["id"]}"]').click();page.wait_for_timeout(100);assert page.evaluate('(id)=>Civora.engine.state.workflowRules.find(r=>r.id===id).enabled',rule['id']) is False
  page.locator(f'[data-action=auto-rule-edit][data-id="{rule["id"]}"]').click();d=dialog(page);assert d.locator('[data-condition-group=require] [data-condition-value]').input_value()=='true';d.locator('[name=enabled]').check();d.locator('[name=priority]').fill('75');submit(page);assert page.evaluate('(id)=>Civora.engine.state.workflowRules.find(r=>r.id===id).priority',rule['id'])==75
  ok('Rule pause, edit and resume preserve typed predicates and metadata assignments')
  nested=page.evaluate('''async()=>Civora.engine.run('workflowRule.save',{projectId:Civora.engine.state.projects[0].id,name:'Nested preservation check',enabled:false,when:{any:[{all:[{field:'tags',op:'contains',value:'Checked'}]},{field:'referenceCount',op:'gte',value:2}]}})''')
  page.locator(f'[data-action=auto-rule-edit][data-id="{nested}"]').click();d=dialog(page);assert d.locator('[name=whenJSON]').count()==1;expression=json.loads(d.locator('[name=whenJSON]').input_value());submit(page);assert page.evaluate('(id)=>Civora.engine.state.workflowRules.find(r=>r.id===id).when',nested)==expression
  ok('Nested condition editor preserves its expression tree instead of flattening it')
  # Create an original overdue review through the same application command engine.
  review=page.evaluate('''async(id)=>{const s=Civora.engine.state,r=s.users.find(u=>u.role==='reviewer');return Civora.engine.run('review.create',{projectId:s.projects[0].id,title:'Outstanding architecture review',documentIds:[id],dueDate:'2020-01-01',stages:[{name:'Independent coordination check',assignees:[r.id],quorum:1,dueDate:'2020-01-01'}]});}''',doc)
  page.locator('[data-action=auto-policy]').click();d=dialog(page);d.locator('[name=enabled]').check();d.locator('[name=includeIssues]').uncheck();d.locator('[name=reminderHours]').fill('24');d.locator('[name=escalationHours]').fill('0');d.locator('[name=escalationMode]').select_option('delegate');d.locator('[name=delegateId]').select_option('u-admin');d.locator('[name=notifyUserIds][value="u-admin"]').check();submit(page)
  assert page.evaluate('Civora.engine.state.automationPolicies[0].enabled') is True;page.locator('[data-action=auto-tab][data-tab=queue]').click();assert 'Outstanding architecture review' in page.locator('.content').inner_text();page.screenshot(path=str(OUT/'automation-due-queue.png'),full_page=True)
  ok('Deadline editor saves explicit guarded delegation and the due queue calculates real overdue work')
  page.locator('[data-action=auto-run]').first.click();page.wait_for_timeout(130);assert page.evaluate('(id)=>Civora.engine.state.reviews.find(r=>r.id===id).stages[0].assignees',review)==['u-admin']
  page.locator('[data-action=auto-tab][data-tab=history]').click();assert 'delegated' in page.locator('.content').inner_text();page.screenshot(path=str(OUT/'automation-history.png'),full_page=True)
  before=page.evaluate('Civora.engine.state.automationLedger.length');page.locator('[data-action=auto-run]').click();page.wait_for_timeout(100);assert page.evaluate('Civora.engine.state.automationLedger.length')==before
  with page.expect_download() as download:page.locator('[data-action=auto-history-export]').click()
  exported=OUT/'automation-history.json';download.value.save_as(exported);assert len(json.loads(exported.read_text())['records'])==before
  ok('Explicit local reconciliation delegates without approving, records outcomes, deduplicates and exports history')
  page.locator('.topbar [data-action=notifications]').click();page.wait_for_timeout(100);assert page.locator('h1').inner_text()=='Notifications';assert page.locator('.notification-card').count()>0
  dismiss(page);page.screenshot(path=str(OUT/'notifications.png'),full_page=True)
  ok('The toolbar bell opens the personal notification center with real stored events')
  target=page.locator('.notification-card').first.get_attribute('data-notice-id');page.locator(f'[data-action=auto-snooze][data-id="{target}"]').click();page.wait_for_timeout(100);page.locator('[data-action=auto-inbox-filter][data-filter=snoozed]').click();assert page.locator(f'[data-notice-id="{target}"]').count()==1
  page.locator(f'[data-action=auto-unsnooze][data-id="{target}"]').click();page.locator('[data-action=auto-inbox-filter][data-filter=unread]').click();page.locator(f'[data-action=auto-read][data-id="{target}"]').click();page.wait_for_timeout(100);assert page.locator(f'[data-notice-id="{target}"]').count()==0
  page.locator('[data-action=auto-inbox-filter][data-filter=all]').click();page.locator(f'[data-action=auto-unread][data-id="{target}"]').click();page.wait_for_timeout(100);assert page.evaluate('(id)=>Civora.engine.state.notifications.find(n=>n.id===id).readAt',target) is None
  ok('Read, unread, snooze and unsnooze controls update durable personal notification records')
  page.locator('[data-action=auto-watch-project]').click();d=dialog(page);d.locator('[name=scope]').select_option('document');d.locator('[name=resourceId]').select_option(doc);d.locator('[name="event_document.updated"]').check();submit(page)
  page.evaluate("async(id)=>Civora.engine.run('document.update',{id,title:'Verified notification deep link'})",doc);page.wait_for_timeout(80)
  notice=page.evaluate('(id)=>Civora.engine.state.notifications.filter(n=>n.userId===Civora.engine.actorId&&n.resourceId===id&&n.event==="document.updated").at(-1).id',doc)
  page.locator(f'[data-action=auto-notice-open][data-id="{notice}"]').click();page.wait_for_timeout(160);assert 'Verified notification deep link' in dialog(page).inner_text();assert page.evaluate('(id)=>Civora.engine.state.notifications.find(n=>n.id===id).readAt',notice) is not None
  ok('A scoped watch delivers a real change; opening it marks read and opens the correct controlled document')
  nav(page,'notifications');page.locator('[data-action=auto-watches]').first.click();d=dialog(page);watch=page.evaluate('(id)=>Civora.engine.state.subscriptions.find(s=>s.scope==="document"&&s.resourceId===id).id',doc);d.locator(f'[data-action=auto-watch-remove][data-id="{watch}"]').click();page.wait_for_timeout(100);assert not page.evaluate('(id)=>Civora.engine.state.subscriptions.some(s=>s.id===id)',watch)
  ok('Subscription manager removes only the selected personal subscription')
  nav(page,'automation');page.locator('[data-action=auto-tab][data-tab=rules]').click();page.evaluate("document.documentElement.dataset.theme='dark'");page.wait_for_timeout(400);page.screenshot(path=str(OUT/'automation-dark.png'),full_page=True)
  assert page.locator('.automation-rule').count()==5;ok('Dark appearance retains readable rule cards, controls and deadline policy')
  page.evaluate("document.documentElement.dataset.theme='light'");page.wait_for_timeout(400);page.set_viewport_size({'width':390,'height':844});page.wait_for_timeout(400);assert page.locator('.sidebar').evaluate('(node)=>node.getBoundingClientRect().right<=0.5');assert page.evaluate('document.documentElement.scrollWidth<=innerWidth+1')
  page.screenshot(path=str(OUT/'automation-mobile.png'),full_page=True);nav(page,'notifications');assert page.evaluate('document.documentElement.scrollWidth<=innerWidth+1');page.screenshot(path=str(OUT/'notifications-mobile.png'),full_page=True)
  ok('Workflow and notification workspaces fit a 390-pixel viewport without horizontal page overflow')
  assert not errors,errors
 except Exception as error:
  page.screenshot(path=str(OUT/'automation-failure.png'),full_page=True);print('FAIL',repr(error),flush=True);print(page.locator('body').inner_text()[-4500:],flush=True);results.append({'name':'Failure','passed':False,'error':str(error)});raise
 finally:
  (OUT/'automation-ui.json').write_text(json.dumps({'mode':'opaque origin; actual MemoryRepository and command engine; Web Crypto test binding','results':results,'pageErrors':errors},indent=2));browser.close()
