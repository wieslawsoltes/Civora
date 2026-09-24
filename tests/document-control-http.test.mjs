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

test('document-control commands through authenticated HTTP and real SQLite',async t=>{
 const dir=await mkdtemp(join(tmpdir(),'civora-control-')),origin=`http://127.0.0.1:${await port()}`,password='control-test-not-a-production-secret';
 let child,logs='',admin='',reviewerCookie='',authorCookie='',state,project,a,b,reviewer,author,baseline,route,original;
 const request=async(path,{method='GET',body,cookie=admin}={})=>{const response=await fetch(origin+path,{method,headers:{Cookie:cookie,...(method!=='GET'?{Origin:origin,'Content-Type':'application/json'}:{})},...(body!==undefined?{body:JSON.stringify(body)}:{})});return{status:response.status,headers:response.headers,data:(response.headers.get('content-type')||'').includes('application/json')?await response.json():await response.text()};};
 const refresh=async()=>{state=(await request('/api/workspace')).data.state;return state;};
 const command=async(type,payload,{cookie=admin,expectedRevision=state.revision,file}={})=>request('/api/commands',{method:'POST',cookie,body:{expectedRevision,command:{type,payload},...(file?{file}:{})}});
 const run=async(type,payload,options)=>{const out=await command(type,payload,options);assert.equal(out.status,200,`${type}: ${JSON.stringify(out.data)}`);await refresh();return out.data.result;};
 function upload(name,text='original '+name){const bytes=Buffer.from(text),hash=createHash('sha256').update(bytes).digest('hex');return{payload:{projectId:project,name,file:{hash,blobId:hash,size:bytes.length,mime:'text/plain'}},file:{data:bytes.toString('base64'),mime:'text/plain'}};}
 async function add(name){const u=upload(name);return run('document.create',u.payload,{file:u.file});}
 async function start(){child=spawn(process.execPath,['server/index.mjs'],{cwd:new URL('../',import.meta.url),env:{...process.env,PORT:new URL(origin).port,HOST:'127.0.0.1',CIVORA_PUBLIC_ORIGIN:origin,CIVORA_DATA_DIR:dir,CIVORA_ADMIN_PASSWORD:password,CIVORA_DB:'sqlite',CIVORA_AUTO_RENDITIONS:'0',CIVORA_SEED_DEMO:'0'}});child.stdout.on('data',d=>logs+=d);child.stderr.on('data',d=>logs+=d);for(let i=0;i<100;i++){try{if((await request('/api/health')).status===200)return;}catch{}if(child.exitCode!==null)throw new Error(logs);await delay(40);}throw new Error(logs);}
 async function stop(){if(child?.exitCode===null){const done=new Promise(r=>child.once('exit',r));child.kill('SIGTERM');await done;}}
 async function login(email,pass=password){const out=await request('/api/login',{method:'POST',cookie:'',body:{email,password:pass}});assert.equal(out.status,200);return out.headers.get('set-cookie').split(';')[0];}
 try{await start();admin=await login('admin@civora.local');await refresh();
  await t.test('typed metadata and numbering persist in an authenticated project',async()=>{
   project=await run('project.create',{name:'Controlled information',code:'HTTP'});
   await run('project.fields',{id:project,fields:[{key:'zone',label:'Zone',type:'choice',required:true,options:['N','S'],defaultValue:'N'},{key:'level',label:'Level',type:'integer',min:-2,max:10,required:false}]});
   await run('project.numbering',{id:project,numbering:{pattern:'{project}-{meta:zone}-{seq:3}',nextSequence:20,allowManual:false}});
   a=await add('a.txt');b=await add('b.txt');assert.deepEqual(state.documents.map(d=>d.number),['HTTP-N-020','HTTP-N-021']);original=structuredClone(state.documents[0].versions[0]);
  });
  await t.test('two simultaneous clients cannot allocate duplicate numbers or lose a document',async()=>{
   const revision=state.revision,uploads=[upload('race-a.txt'),upload('race-b.txt')],out=await Promise.all(uploads.map(u=>command('document.create',u.payload,{expectedRevision:revision,file:u.file})));
   assert.deepEqual(out.map(x=>x.status).sort(),[200,409]);await refresh();const loser=uploads[out.findIndex(x=>x.status===409)];await run('document.create',loser.payload,{file:loser.file});assert.equal(new Set(state.documents.map(d=>d.number)).size,4);assert.equal(state.projects[0].numbering.nextSequence,24);
  });
  await t.test('bulk updates are one persisted revision and one audit entry',async()=>{
   const prior=structuredClone(state),updates=[a,b].map((id,i)=>({id,expectedVersionId:state.documents.find(d=>d.id===id).versions.at(-1).id,patch:{title:'Controlled '+i,metadata:{zone:'S',level:2}}}));
   await run('document.bulkUpdate',{projectId:project,baseRevision:state.revision,updates});assert.equal(state.revision,prior.revision+1);assert.equal(state.audit.length,prior.audit.length+1);assert.equal(state.documents.find(d=>d.id===b).metadata.zone,'S');
  });
  await t.test('invalid metadata rejects the whole HTTP batch with zero partial changes',async()=>{
   const prior=structuredClone(state),updates=[{id:a,expectedVersionId:state.documents[0].versions.at(-1).id,patch:{title:'Must not persist'}},{id:b,expectedVersionId:state.documents[1].versions.at(-1).id,patch:{metadata:{zone:'INVALID'}}}];
   assert.equal((await command('document.bulkUpdate',{projectId:project,baseRevision:state.revision,updates})).status,400);await refresh();assert.deepEqual(state,prior);
  });
  await t.test('stale metadata preview is rejected even with a fresh transport revision',async()=>{
   const old=state.revision;await run('document.update',{id:b,title:'External editor'});const out=await command('document.bulkUpdate',{projectId:project,baseRevision:old,updates:[{id:a,expectedVersionId:original.id,patch:{title:'Stale'}}]});assert.equal(out.status,409);assert.equal(out.data.code,'CONFLICT');
  });
  await t.test('baseline closure and snapshot context are persisted server-side',async()=>{
   await run('document.references',{id:a,references:[b]});baseline=await run('baseline.create',{projectId:project,name:'HTTP frozen release',documentIds:[a],includeReferences:true});assert.equal(state.baselines[0].documents.length,2);assert.equal(state.baselines[0].documents[0].versionId,original.id);
  });
  await t.test('new accounts and scoped grants use real sessions, not local profiles',async()=>{
   reviewer=await run('user.create',{name:'HTTP Reviewer',email:'reviewer@http.test',role:'reviewer'});author=await run('user.create',{name:'HTTP Author',email:'author@http.test',role:'author'});
   await run('access.set',{scope:'project',resourceId:project,inherit:true,entries:[{principal:'user:'+reviewer,allow:['read','download','review'],deny:[]},{principal:'user:'+author,allow:['read','download','write','review'],deny:[]}]});
   for(const id of [reviewer,author])assert.equal((await request('/api/admin/password',{method:'POST',body:{userId:id,password}})).status,200);
   reviewerCookie=await login('reviewer@http.test');authorCookie=await login('author@http.test');assert.equal((await request('/api/workspace',{cookie:reviewerCookie})).data.state.baselines.length,1);
  });
  await t.test('one denied document prevents an author from partially applying a batch',async()=>{
   await run('access.set',{scope:'document',resourceId:b,inherit:true,entries:[{principal:'user:'+author,allow:[],deny:['write']}]});const revision=state.revision;
   const out=await command('document.bulkUpdate',{projectId:project,baseRevision:revision,updates:[a,b].map(id=>({id,expectedVersionId:state.documents.find(d=>d.id===id).versions.at(-1).id,patch:{title:'Unauthorized'}}))},{cookie:authorCookie});assert.equal(out.status,403);await refresh();assert.equal(state.revision,revision);
  });
  await t.test('future-stage decisions are denied and quorum advances only the current stage',async()=>{
   route=await run('review.create',{projectId:project,title:'HTTP staged review',documentIds:[a],stages:[{name:'Check',quorum:1,assignees:['u-admin']},{name:'Approval',quorum:1,assignees:[reviewer]}]});
   assert.equal((await command('review.decide',{id:route,stageId:'stage-1',decision:'Approved',comment:'Cannot vote early'},{cookie:reviewerCookie})).status,403);
   await run('review.decide',{id:route,stageId:'stage-1',decision:'Approved',comment:'Technical check complete'});assert.equal(state.reviews[0].currentStage,1);
   await run('review.decide',{id:route,stageId:'stage-2',decision:'Approved',comment:'Approval complete'},{cookie:reviewerCookie});assert.equal(state.reviews[0].status,'Approved');assert.equal(state.reviews[0].decisions[1].by,reviewer);
  });
  await t.test('metadata change invalidates approved context at the publication gate',async()=>{
   await run('document.update',{id:a,title:'Unreviewed correction'});await run('document.transition',{id:a,to:'Shared'});assert.equal((await command('document.transition',{id:a,to:'Published'})).status,400);assert.equal(state.documents.find(d=>d.id===a).state,'Shared');
  });
  await t.test('baseline transmittal still downloads the original bytes after a new check-in',async()=>{
   await run('document.transition',{id:a,to:'Work in progress'});await run('document.checkout',{id:a});const u=upload('a.txt','changed after baseline');await run('document.checkin',{id:a,revision:'P02',file:u.payload.file},{file:u.file});
   const id=await run('transmittal.create',{projectId:project,baselineId:baseline,title:'Frozen package',recipients:['external@example.test']});const tr=state.transmittals.find(x=>x.id===id);assert.equal(tr.documents.find(d=>d.documentId===a).versionId,original.id);await run('transmittal.issue',{id});assert.equal((await request('/api/blobs/'+original.hash)).data,'original a.txt');
  });
  await t.test('read revocation removes the whole baseline from a recipient projection',async()=>{
   await run('access.set',{scope:'document',resourceId:b,inherit:true,entries:[{principal:'user:'+reviewer,allow:[],deny:['read','download']}]});const out=await request('/api/workspace',{cookie:reviewerCookie});assert.equal(out.data.state.baselines.length,0);assert.ok(!JSON.stringify(out.data.state).includes('HTTP frozen release'));assert.equal((await request('/api/blobs/'+state.documents.find(d=>d.id===b).versions[0].hash,{cookie:reviewerCookie})).status,404);
  });
  await t.test('numbering, metadata, routes, baselines and pinned bytes survive process restart',async()=>{
   const frozen=structuredClone(state);await stop();await start();assert.equal((await request('/api/workspace')).status,401);admin=await login('admin@civora.local');await refresh();assert.deepEqual(state,frozen);assert.equal((await request('/api/blobs/'+original.hash)).data,'original a.txt');
  });
 }finally{await stop();await rm(dir,{recursive:true,force:true});}
});
