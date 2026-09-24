import test from 'node:test';
import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { createServer } from 'node:net';
import { createHash } from 'node:crypto';
const delay=ms=>new Promise(r=>setTimeout(r,ms));
async function port(){const s=createServer();await new Promise(r=>s.listen(0,'127.0.0.1',r));const p=s.address().port;await new Promise(r=>s.close(r));return p;}

test('workflow automation through real authenticated HTTP, SQLite and unattended restart',async t=>{
 const dir=await mkdtemp(join(tmpdir(),'civora-automation-')),origin=`http://127.0.0.1:${await port()}`,password='automation-test-not-a-production-secret';
 let child,logs='',admin='',reviewerCookie='',delegateCookie='',viewerCookie='',state,project,doc,hidden,reviewer,delegate,viewer,route,watch,notice,rule;
 const request=async(path,{method='GET',body,cookie=admin,requestOrigin=origin}={})=>{const response=await fetch(origin+path,{method,headers:{Cookie:cookie,...(method!=='GET'?{Origin:requestOrigin,'Content-Type':'application/json'}:{})},...(body!==undefined?{body:JSON.stringify(body)}:{})});return{status:response.status,headers:response.headers,data:(response.headers.get('content-type')||'').includes('application/json')?await response.json():await response.text()};};
 const refresh=async()=>{const out=await request('/api/workspace');assert.equal(out.status,200);state=out.data.state;return state;};
 const command=async(type,payload,{cookie=admin,expectedRevision=state.revision,file}={})=>request('/api/commands',{method:'POST',cookie,body:{expectedRevision,command:{type,payload},...(file?{file}:{})}});
 const run=async(type,payload,options)=>{const out=await command(type,payload,options);assert.equal(out.status,200,`${type}: ${JSON.stringify(out.data)}`);await refresh();return out.data.result;};
 async function add(name){const bytes=Buffer.from('Original '+name),hash=createHash('sha256').update(bytes).digest('hex');return run('document.create',{projectId:project,name,file:{hash,blobId:hash,size:bytes.length,mime:'text/plain'}},{file:{data:bytes.toString('base64'),mime:'text/plain'}});}
 async function start(enabled=false){child=spawn(process.execPath,['server/index.mjs'],{cwd:new URL('../',import.meta.url),env:{...process.env,PORT:new URL(origin).port,HOST:'127.0.0.1',CIVORA_PUBLIC_ORIGIN:origin,CIVORA_DATA_DIR:dir,CIVORA_ADMIN_PASSWORD:password,CIVORA_DB:'sqlite',CIVORA_AUTO_RENDITIONS:'0',CIVORA_SEED_DEMO:'0',CIVORA_AUTOMATION:enabled?'1':'0',CIVORA_AUTOMATION_INTERVAL_MS:'250'}});child.stdout.on('data',d=>logs+=d);child.stderr.on('data',d=>logs+=d);for(let i=0;i<150;i++){try{if((await request('/api/health')).status===200)return;}catch{}if(child.exitCode!==null)throw new Error(logs);await delay(40);}throw new Error(logs);}
 async function stop(){if(child?.exitCode===null){const done=new Promise(r=>child.once('exit',r));child.kill('SIGTERM');await done;}}
 async function login(email){const out=await request('/api/login',{method:'POST',cookie:'',body:{email,password}});assert.equal(out.status,200);return out.headers.get('set-cookie').split(';')[0];}
 try{await start();admin=await login('admin@civora.local');await refresh();
  await t.test('protected automation endpoints require a real authenticated session',async()=>{
   for(const path of ['/api/notifications','/api/admin/automation'])assert.equal((await request(path,{cookie:''})).status,401);
   project=await run('project.create',{name:'Automated document delivery',code:'AUTO'});doc=await add('controlled-source.txt');hidden=await add('confidential-source.txt');
   reviewer=await run('user.create',{name:'Assigned Reviewer',email:'reviewer@automation.test',role:'reviewer'});delegate=await run('user.create',{name:'Independent Delegate',email:'delegate@automation.test',role:'reviewer'});viewer=await run('user.create',{name:'Read-only Watcher',email:'viewer@automation.test',role:'viewer'});
   await run('access.set',{scope:'project',resourceId:project,inherit:true,entries:[... [reviewer,delegate].map(id=>({principal:'user:'+id,allow:['read','download','review'],deny:[]})),{principal:'user:'+viewer,allow:['read','download'],deny:[]}]});
   await run('access.set',{scope:'document',resourceId:hidden,inherit:true,entries:[{principal:'user:'+viewer,allow:[],deny:['read','download']}]});
   for(const userId of [reviewer,delegate,viewer])assert.equal((await request('/api/admin/password',{method:'POST',body:{userId,password}})).status,200);
   reviewerCookie=await login('reviewer@automation.test');delegateCookie=await login('delegate@automation.test');viewerCookie=await login('viewer@automation.test');
   assert.equal((await request('/api/admin/automation',{cookie:viewerCookie})).status,403);
  });
  await t.test('saved workflow guards block HTTP commands without any partial write',async()=>{
   rule=await run('workflowRule.save',{projectId:project,name:'Technical gate',to:'Shared',require:{field:'tags',op:'contains',value:'checked'},requireReason:true,metadata:{zone:'QA'}});
   const before=structuredClone(state);const denied=await command('document.transition',{id:doc,to:'Shared'});assert.equal(denied.status,400);await refresh();assert.deepEqual(state,before);
   assert.equal((await command('workflowRule.save',{projectId:project,name:'Unauthorized rule'},{cookie:viewerCookie})).status,403);
  });
  await t.test('server preview returns blocked reasons or validated output, never a commit',async()=>{
   const before=state.revision;let out=await request('/api/workflow/preview',{method:'POST',body:{id:doc,to:'Shared',expectedRevision:before}});assert.equal(out.status,200);assert.equal(out.data.allowed,false);assert.match(out.data.error,/Technical gate/);await refresh();assert.equal(state.revision,before);
   await run('document.update',{id:doc,tags:['checked']});const ready=state.revision;out=await request('/api/workflow/preview',{method:'POST',body:{id:doc,to:'Shared',reason:'Technical verification',expectedRevision:ready}});assert.equal(out.data.allowed,true);assert.equal(out.data.metadata.zone,'QA');await refresh();assert.equal(state.revision,ready);assert.equal(state.documents.find(d=>d.id===doc).state,'Work in progress');
   assert.equal((await request('/api/workflow/preview',{method:'POST',requestOrigin:'https://malicious.invalid',body:{id:doc,to:'Shared',expectedRevision:ready}})).status,403);
   await run('document.update',{id:hidden,title:'Unrelated concurrent change'});assert.equal((await request('/api/workflow/preview',{method:'POST',body:{id:doc,to:'Shared',reason:'Verified',expectedRevision:ready}})).status,409);
   assert.equal((await command('document.transition',{id:doc,to:'Shared',reason:'Verified',baseRevision:ready})).status,409);
  });
  await t.test('personal project watches produce one scoped notification and no protected filename',async()=>{
   watch=await run('subscription.save',{scope:'project',resourceId:project,events:['document.updated','document.state']},{cookie:viewerCookie});
   await run('subscription.save',{scope:'document',resourceId:doc,events:['document.updated','document.state']},{cookie:viewerCookie});
   await run('document.update',{id:doc,title:'New controlled title'});await run('document.update',{id:hidden,title:'Confidential new title'});
   const out=await request('/api/notifications',{cookie:viewerCookie});assert.equal(out.status,200);assert.equal(out.data.total,1);assert.equal(out.data.unread,1);notice=out.data.items[0].id;assert.equal(out.data.items[0].resourceId,doc);assert.equal(out.data.items[0].userId,viewer);assert.ok(!JSON.stringify(out.data).includes(hidden));assert.ok(!JSON.stringify(out.data).includes('Confidential'));
   const projection=(await request('/api/workspace',{cookie:viewerCookie})).data.state;assert.equal(projection.workflowRules.length,0);assert.equal(projection.notifications.length,1);assert.ok(projection.subscriptions.every(s=>s.userId===viewer));
  });
  await t.test('notification read, snooze and ownership are enforced in server transactions',async()=>{
   assert.equal((await command('notification.update',{ids:[notice],action:'read'})).status,404);
   await run('notification.update',{ids:[notice],action:'read'},{cookie:viewerCookie});assert.equal((await request('/api/notifications?filter=unread',{cookie:viewerCookie})).data.total,0);
   await run('notification.update',{ids:[notice],action:'unread'},{cookie:viewerCookie});await run('notification.update',{ids:[notice],action:'snooze',until:new Date(Date.now()+3600000).toISOString()},{cookie:viewerCookie});
   assert.equal((await request('/api/notifications',{cookie:viewerCookie})).data.total,0);assert.equal((await request('/api/notifications?filter=snoozed',{cookie:viewerCookie})).data.total,1);
   await run('notification.update',{ids:[notice],action:'unsnooze'},{cookie:viewerCookie});assert.equal((await request('/api/notifications?filter=unread',{cookie:viewerCookie})).data.unread,1);
  });
  await t.test('pagination is bounded and stale notification cursors fail closed',async()=>{
   await run('document.transition',{id:doc,to:'Shared',reason:'Technical verification complete',baseRevision:state.revision});const first=(await request('/api/notifications?limit=1',{cookie:viewerCookie})).data;assert.equal(first.items.length,1);assert.equal(first.nextOffset,1);
   const second=(await request(`/api/notifications?limit=1&offset=1&revision=${first.revision}`,{cookie:viewerCookie})).data;assert.notEqual(first.items[0].id,second.items[0].id);
   await run('document.update',{id:doc,title:'Notification cursor advanced'});assert.equal((await request(`/api/notifications?offset=1&revision=${first.revision}`,{cookie:viewerCookie})).status,409);
   for(const query of ['limit=201','limit=0','offset=-1','filter=private'])assert.equal((await request('/api/notifications?'+query,{cookie:viewerCookie})).status,400);
  });
  await t.test('read revocation hides old notices and prevents guessed notification updates',async()=>{
   await run('access.set',{scope:'document',resourceId:doc,inherit:true,entries:[{principal:'user:'+viewer,allow:[],deny:['read','download']}]});assert.equal((await request('/api/notifications',{cookie:viewerCookie})).data.total,0);assert.equal((await request('/api/workspace',{cookie:viewerCookie})).data.state.notifications.length,0);
   assert.equal((await command('notification.update',{ids:[notice],action:'read'},{cookie:viewerCookie})).status,404);
   await run('access.set',{scope:'document',resourceId:doc,inherit:true,entries:[]});
  });
  await t.test('a persisted overdue review stays untouched while the scheduler is disabled',async()=>{
   const dueDate='2020-01-01';route=await run('review.create',{projectId:project,title:'Unattended overdue review',documentIds:[doc],dueDate,separationOfDuties:true,stages:[{name:'Independent review',assignees:[reviewer],quorum:1,dueDate}]});
   await run('automation.configure',{projectId:project,enabled:true,reminderHours:24,escalationHours:0,escalationMode:'delegate',delegateId:delegate,notifyUserIds:['u-admin'],includeIssues:false});
   const revision=state.revision;await delay(350);await refresh();assert.equal(state.revision,revision);assert.equal(state.automationLedger.length,0);assert.equal((await request('/api/admin/automation')).data.enabled,false);
  });
  await t.test('server restart automatically reconciles deadlines without an open browser or run command',async()=>{
   await stop();await start(true);admin=await login('admin@civora.local');delegateCookie=await login('delegate@automation.test');
   for(let i=0;i<80;i++){await refresh();if(state.automationLedger.length===2)break;await delay(40);}
   assert.equal(state.automationLedger.length,2);const r=state.reviews.find(r=>r.id===route);assert.deepEqual(r.stages[0].assignees,[delegate]);assert.equal(r.stages[0].quorum,1);assert.equal(r.status,'In review');assert.equal(r.decisions.length,0);assert.equal(r.reassignments[0].by,'u-admin');assert.equal(r.reassignments[0].automatic,true);assert.ok(state.automationLedger.some(e=>e.status==='delegated'));
   assert.ok((await request('/api/notifications',{cookie:delegateCookie})).data.items.some(n=>n.event==='review.escalated'));const health=(await request('/api/admin/automation')).data;assert.equal(health.events,2);assert.equal(health.lastError,null);assert.equal(health.enabled,true);
  });
  await t.test('durable receipts prevent duplicate escalation and idle revision churn after another restart',async()=>{
   const frozen=structuredClone(state);await stop();await start(true);admin=await login('admin@civora.local');await delay(650);await refresh();assert.deepEqual(state,frozen);assert.equal((await request('/api/admin/automation')).data.events,0);
  });
  await t.test('delegated approval is still a real authorized human decision',async()=>{
   delegateCookie=await login('delegate@automation.test');reviewerCookie=await login('reviewer@automation.test');
   assert.equal((await command('review.decide',{id:route,stageId:'stage-1',decision:'Approved',comment:'Replaced voter cannot approve'},{cookie:reviewerCookie})).status,403);
   await run('review.decide',{id:route,stageId:'stage-1',decision:'Approved',comment:'Independently reviewed after delegation'},{cookie:delegateCookie});assert.equal(state.reviews.find(r=>r.id===route).status,'Approved');assert.equal(state.documents.find(d=>d.id===doc).state,'Shared');
  });
 }finally{await stop();await rm(dir,{recursive:true,force:true});}
});
