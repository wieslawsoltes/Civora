"""Explicit delayed-response fixture on the actual Explorer UI and memory engine.
This tests client response binding, not real browser cookies or network authority.
Authenticated HTTP/SQLite authorization is exercised by explorer-http.test.mjs.
"""
import hashlib,json,os
from pathlib import Path
from playwright.sync_api import sync_playwright
ROOT=Path(__file__).resolve().parents[1];OUT=ROOT/'test-results';results=[];errors=[]
def ok(name):results.append({'name':name,'passed':True});print('PASS',name,flush=True)
with sync_playwright() as p:
 browser=p.chromium.launch(executable_path=os.environ.get('CHROMIUM','/usr/bin/chromium'),args=['--no-sandbox']);page=browser.new_page();page.set_default_timeout(8000)
 try:
  page.expose_function('__testDigest',lambda data:list(hashlib.sha256(bytes(data)).digest()))
  page.evaluate('''()=>{Object.defineProperty(crypto,'subtle',{value:{digest:async(_,data)=>Uint8Array.from(await __testDigest(Array.from(new Uint8Array(data instanceof ArrayBuffer?data:data.buffer)))).buffer}});crypto.randomUUID=()=>{let b=crypto.getRandomValues(new Uint8Array(16));b[6]=(b[6]&15)|64;b[8]=(b[8]&63)|128;let h=[...b].map(x=>x.toString(16).padStart(2,'0')).join('');return`${h.slice(0,8)}-${h.slice(8,12)}-${h.slice(12,16)}-${h.slice(16,20)}-${h.slice(20)}`;};history.replaceState=()=>{};}''')
  page.on('pageerror',lambda e:errors.append(str(e)));page.set_content((ROOT/'dist/civora.html').read_text(),wait_until='load');page.wait_for_function('!!window.Civora');page.locator('#toast-host .toast').evaluate_all('(xs)=>xs.forEach(x=>x.click())')
  setup=page.evaluate('''async()=>{const e=Civora.engine,p=Civora.ui.projectId,target=await e.run('folder.create',{projectId:p,name:'Transport target'}),other=await e.run('folder.create',{projectId:p,name:'Other target'}),id=await e.addFile(new File(['Actual content'],'transport-source.txt'),{projectId:p});window.__transport={pending:[],calls:[]};const original=window.fetch;window.fetch=async(url,options)=>{if(String(url)==='/fixture-api/explorer/move-preview'){const body=JSON.parse(options.body);__transport.calls.push({url,body});return new Promise(resolve=>__transport.pending.push({body,resolve}));}return original(url,options);};window.__resolvePreview=(patch={})=>{const request=__transport.pending.shift(),b=request.body,items=b.documentIds.map(id=>{const d=e.state.documents.find(d=>d.id===id);return {id,versionId:d.versions.at(-1).id,folderId:d.folderId};});request.resolve(new Response(JSON.stringify({allowed:true,sourceRevision:b.expectedRevision,payload:{projectId:b.projectId,folderId:b.folderId,items,baseRevision:b.expectedRevision},...patch}),{headers:{'Content-Type':'application/json'}}));};e.repository.kind='server';e.repository.base='/fixture-api';Civora.explorer.go(p);return {id,target,other};}''')
  def open_move():
   page.evaluate('(s)=>Civora.explorer.moveDialog([s.id],s.target)',setup);return page.locator('dialog[open]').last
  def start(d):
   d.locator('#ex-move-preview').click();page.wait_for_function('__transport.pending.length===1')
  d=open_move();revision=page.evaluate('Civora.engine.state.revision');start(d)
  call=page.evaluate('__transport.calls.at(-1)');assert call['url']=='/fixture-api/explorer/move-preview';assert call['body']['expectedRevision']==revision;assert call['body']['documentIds']==[setup['id']]
  d.locator('[name=destination]').select_option(setup['other']);page.evaluate('__resolvePreview()');page.wait_for_timeout(80);assert 'Destination changed' in d.locator('#ex-move-status').inner_text();d.locator('[type=submit]').click();page.wait_for_timeout(80);assert 'Validate this destination' in d.locator('.form-error').inner_text();assert page.evaluate('Civora.engine.state.revision')==revision
  ok('Move transport uses repository base and exact source revision; late responses cannot validate changed destinations')
  start(d);page.evaluate("__resolvePreview({payload:{projectId:'wrong',folderId:null,items:[],baseRevision:0}})");page.wait_for_timeout(80);assert 'does not match' in d.locator('#ex-move-status').inner_text();assert page.evaluate('Civora.engine.state.revision')==revision
  ok('A response with mismatching project, source or destination cannot authorize the form')
  start(d);page.evaluate("async(s)=>Civora.engine.run('document.update',{id:s.id,title:'Changed while waiting'})",setup);page.evaluate('__resolvePreview()');page.wait_for_timeout(80);assert 'workspace changed while validating' in d.locator('#ex-move-status').inner_text().lower()
  ok('A genuine workspace change while a request is pending invalidates the returned preview')
  start(d);page.evaluate('__resolvePreview()');page.wait_for_timeout(80);assert 'Validated 1 document' in d.locator('#ex-move-status').inner_text();revision=page.evaluate('Civora.engine.state.revision');page.evaluate("document.querySelectorAll('dialog[open]').forEach(d=>d.close())")
  ok('Matching response validates the current inputs without mutating the command-engine workspace')
  d=open_move();start(d);page.evaluate("document.querySelectorAll('dialog[open]').forEach(d=>d.close());__resolvePreview()");page.wait_for_timeout(80);assert page.locator('dialog[open]').count()==0;assert page.evaluate('Civora.engine.state.revision')==revision;assert not errors,errors
  ok('Closing a pending dialog discards its response without reopening UI, saving data or throwing page errors')
  state=page.evaluate('Civora.engine.state')
  for wrong in [False,True]:
   gate=browser.new_page();gate.set_default_timeout(8000);gate.expose_function('__testDigest',lambda data:list(hashlib.sha256(bytes(data)).digest()));gate.on('pageerror',lambda e:errors.append(str(e)))
   gate.evaluate('''({state,id,wrong})=>{Object.defineProperty(crypto,'subtle',{value:{digest:async(_,data)=>Uint8Array.from(await __testDigest(Array.from(new Uint8Array(data instanceof ArrayBuffer?data:data.buffer)))).buffer}});crypto.randomUUID=()=>{const b=crypto.getRandomValues(new Uint8Array(16));b[6]=(b[6]&15)|64;b[8]=(b[8]&63)|128;const h=[...b].map(x=>x.toString(16).padStart(2,'0')).join('');return`${h.slice(0,8)}-${h.slice(8,12)}-${h.slice(12,16)}-${h.slice(16,20)}-${h.slice(20)}`;};const preferences=new Map([['civora-preferences',JSON.stringify({useServer:true,theme:'light'})]]);Object.defineProperty(window,'localStorage',{value:{getItem:key=>preferences.get(key)||null,setItem:(key,value)=>preferences.set(key,value)}});window.EventSource=class {close(){}};const user=state.users.find(u=>u.id==='u-admin');window.fetch=async(url,options)=>{if(url==='/api/login')return new Response(JSON.stringify({user}),{headers:{'Content-Type':'application/json'}});if(url==='/api/session')return new Response(JSON.stringify({user}),{headers:{'Content-Type':'application/json'}});if(url==='/api/workspace')return new Response(JSON.stringify({state}),{headers:{'Content-Type':'application/json'}});throw new Error('Unexpected login fixture URL '+url);};const d=state.documents.find(d=>d.id===id);location.hash='#documents?'+new URLSearchParams({workspace:wrong?'another-workspace':state.id,project:d.projectId,document:d.id});history.replaceState=()=>{};}''',{'state':state,'id':setup['id'],'wrong':wrong})
   gate.set_content((ROOT/'dist/civora.html').read_text(),wait_until='load');gate.wait_for_function('!!window.Civora');assert gate.locator('.login-gate').count()==1
   gate.locator('#team-login-form [name=email]').fill('admin@example.test');gate.locator('#team-login-form [name=password]').fill('fixture-only-not-a-real-credential');gate.locator('#team-login-form [type=submit]').click();gate.wait_for_function("Civora.engine.repository.kind==='server'&&!document.querySelector('.login-gate')")
   if wrong:
    assert gate.evaluate('Civora.explorer.activeId')=='';assert 'another workspace' in gate.locator('#toast-host').inner_text();ok('Login continuation rejects a workspace-mismatched address rather than selecting a local lookalike')
   else:
    assert gate.evaluate('Civora.explorer.activeId')==setup['id'];assert gate.evaluate('Civora.ui.selection.size')==1;ok('Login gate preserves the requested document and resolves its address after the explicit session fixture connects')
   gate.close()
  assert not errors,errors

 finally:
  OUT.mkdir(exist_ok=True);(OUT/'explorer-transport-ui.json').write_text(json.dumps({'mode':'explicit delayed fetch fixture on actual UI and memory repository; not browser-server authentication','results':results,'pageErrors':errors},indent=2));browser.close()
