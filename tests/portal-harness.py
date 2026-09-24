"""Recipient component tests. Opaque-origin DOM with an explicit in-memory HTTP fixture.
Not a live identity-provider test, browser-cookie security test, or server integration test.
The server protocol is exercised separately by security-integration.test.mjs.
"""
from pathlib import Path
import json,os
from playwright.sync_api import sync_playwright
ROOT=Path(__file__).resolve().parents[1];OUT=ROOT/'test-results';results=[];errors=[]
def record(name):
 results.append({'name':name,'passed':True});print('PASS',name,flush=True)
with sync_playwright() as p:
 browser=p.chromium.launch(executable_path=os.environ.get('CHROMIUM','/usr/bin/chromium'),args=['--no-sandbox'])
 page=browser.new_page(viewport={'width':1280,'height':940})
 page.on('pageerror',lambda e:errors.append(str(e)))
 page.evaluate('''()=>{
 let signedIn=false,receipt=null;
 const user={id:'recipient-fixture',email:'reviewer@example.test',name:'Delivery reviewer'};
 const delivery={id:'delivery-fixture',number:'TR-0001',title:'Stage 3 · Approved coordination information',purpose:'For information',message:'Please review the issued design brief and acknowledge receipt.',expiresAt:Date.now()+7*86400000,documents:[{documentId:'document-fixture',name:'NLC-Design-brief.txt',revision:'P01',size:27,hash:'a'.repeat(64)}]};
 window.fetch=async(url,options={})=>{let data={},status=200;const path=String(url).replace('/api/portal/','');
 if(path==='session')data={recipient:signedIn?user:null};
 else if(path==='login'){signedIn=true;data={ok:true};}
 else if(path==='logout'){signedIn=false;data={ok:true};}
 else if(path==='deliveries')data={recipient:user,deliveries:[{...delivery,receipt}]};
 else if(path.endsWith('/acknowledge')){receipt={email:user.email,at:new Date().toISOString(),note:JSON.parse(options.body).note};data={receipt};}
 else if(path.includes('/files/'))return new Response('Original pinned design brief',{headers:{'Content-Type':'text/plain'}});
 else {data={error:'Unknown fixture endpoint'};status=404;}
 return new Response(JSON.stringify(data),{status,headers:{'Content-Type':'application/json'}});
 };
}''')
 try:
  page.set_content((ROOT/'dist/portal.html').read_text(),wait_until='load')
  page.wait_for_selector('#portal-login-form')
  assert 'Recipient account' in page.locator('body').inner_text() or 'RECIPIENT ACCOUNT' in page.locator('body').inner_text()
  page.locator('[name=email]').fill('reviewer@example.test');page.locator('[name=password]').fill('fixture-password-123');page.locator('button[type=submit]').click()
  page.wait_for_selector('.portal-package');assert page.locator('.portal-package').count()==1
  record('Recipient sign-in form drives the separate delivery component')
  page.screenshot(path=str(OUT/'recipient-portal-component.png'),full_page=True)
  with page.expect_download() as download:page.locator('[data-download]').click()
  download.value.save_as(str(OUT/'portal-fixture-download.txt'))
  assert (OUT/'portal-fixture-download.txt').read_text()=='Original pinned design brief'
  record('Delivery download button saves the fixture original bytes')
  page.locator('[name=note]').fill('Received <script>not executable</script>')
  page.locator('[data-acknowledge] button').click();page.wait_for_selector('.package-receipt')
  assert '<script>not executable</script>' in page.locator('.package-receipt').inner_text()
  assert page.locator('.package-receipt script').count()==0
  record('Receipt is rendered with escaped text and replaces acknowledgment form')
  page.locator('#portal-logout').click();page.wait_for_selector('#portal-login-form');assert page.locator('.portal-package').count()==0
  record('Sign-out removes the delivery component and returns to recipient sign-in')
  assert not errors,errors
 finally:
  (OUT/'portal-harness.json').write_text(json.dumps({'mode':'Opaque-origin DOM with explicit in-memory HTTP fixture; not browser/server-origin qualification','results':results,'pageErrors':errors},indent=2));browser.close()
