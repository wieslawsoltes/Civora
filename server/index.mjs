let activeCopyVerifications=0;
import { navigationSearch } from '../packages/navigation/index.js';
import { verifyCopyContent } from '../packages/document-copy/index.js';
import { resolveDocumentSet } from '../packages/document-sets/index.js';
import { exportDocumentSetArchive } from '../packages/document-sets/archive.js';
import { queryExplorer } from '../packages/explorer/index.js';
import { createAutomationRunner } from './automation.mjs';
import { createLocalSystem } from './local-system.mjs';
import { createJobRunner } from './jobs.mjs';
import { createAccessContext, projectWorkspace, notificationVisible } from '../packages/access/index.js';
import { OperationsStore } from './operations.mjs';
import { createPortal } from './portal.mjs';
import { createServer } from 'node:http';
import { mkdir, readFile, writeFile, rename, chmod } from 'node:fs/promises';
import { resolve, join } from 'node:path';
import { randomBytes, scrypt as scryptCallback, timingSafeEqual, createHash } from 'node:crypto';
import { promisify } from 'node:util';
import { applyCommand, createEmptyWorkspace, DomainError, previewDocumentTransition, previewDocumentMove, previewDocumentCopy, previewDocumentRename } from '../packages/core/index.js';
import { fromBase64 } from '../packages/storage/index.js';
import { openDatabase } from './database.mjs';
import { createOIDC } from './oidc.mjs';
import { serveStatic } from '../scripts/static.mjs';
const scrypt=promisify(scryptCallback),host=process.env.HOST||'127.0.0.1',port=Number(process.env.PORT||8787),origin=process.env.CIVORA_PUBLIC_ORIGIN||`http://${host}:${port}`;
if(new URL(origin).origin!==origin)throw new Error('CIVORA_PUBLIC_ORIGIN must be an origin without a path or trailing slash.');
const dataDir=resolve(process.env.CIVORA_DATA_DIR||'data'),kind=process.env.CIVORA_DB||'sqlite';
await mkdir(dataDir,{recursive:true,mode:0o700});
const store=await openDatabase({kind,directory:dataDir,url:process.env.DATABASE_URL,database:process.env.CIVORA_MONGO_DATABASE||'civora'});
if(!await store.read()){
  let state=createEmptyWorkspace(),files=new Map();state.name=process.env.CIVORA_WORKSPACE_NAME||'Civora team workspace';
  if(process.env.CIVORA_SEED_DEMO==='1'){const{createDemo}=await import('../app/seed.js');const demo=await createDemo();state=demo.state;files=demo.files;}
  await store.initialize(state,files);
}
const accountPath=join(dataDir,'accounts.json');let accounts;
try{accounts=JSON.parse(await readFile(accountPath,'utf8'));}catch(err){if(err.code!=='ENOENT')throw err;accounts={};}
async function persistAccounts(){const tmp=accountPath+'.tmp';await writeFile(tmp,JSON.stringify(accounts),{mode:0o600});await rename(tmp,accountPath);await chmod(accountPath,0o600);}
async function passwordRecord(password){if(typeof password!=='string'||password.length<12||password.length>256)throw new DomainError('Passwords must contain 12 to 256 characters.');const salt=randomBytes(16),hash=await scrypt(password,salt,64);return{salt:salt.toString('hex'),hash:hash.toString('hex'),updatedAt:new Date().toISOString()};}
const initial=await store.read(),bootstrapAdmin=initial.users.find(u=>u.active&&u.role==='admin');
if(!accounts[bootstrapAdmin.id]){const generated=!process.env.CIVORA_ADMIN_PASSWORD,password=process.env.CIVORA_ADMIN_PASSWORD||randomBytes(24).toString('base64url');accounts[bootstrapAdmin.id]=await passwordRecord(password);await persistAccounts();console.log(`Bootstrap administrator: ${bootstrapAdmin.email}${generated?`\nOne-time initial password: ${password}\nStore it securely. It is not printed again.`:' (password supplied by environment)'}`);}
const ops=new OperationsStore(dataDir);
const jobs=await createJobRunner({ops,store,dataDir,configFile:process.env.CIVORA_CONVERTERS_FILE});
const dummy=await passwordRecord(randomBytes(24).toString('hex'));
async function verifyPassword(password,record){if(typeof password!=='string'||password.length>256)return false;record=record||dummy;const hash=await scrypt(password,Buffer.from(record.salt,'hex'),64);return timingSafeEqual(hash,Buffer.from(record.hash,'hex'));}
const sessions=new Map(),clients=new Set(),attempts=new Map();let accountQueue=Promise.resolve(),bodyBytes=0,setExports=0;const BODY_BUDGET=160*1024*1024;
const oidc=await createOIDC({issuer:process.env.OIDC_ISSUER,clientId:process.env.OIDC_CLIENT_ID,clientSecret:process.env.OIDC_CLIENT_SECRET,origin});
const automation=createAutomationRunner({store,enabled:process.env.CIVORA_AUTOMATION!=='0',intervalMs:Number(process.env.CIVORA_AUTOMATION_INTERVAL_MS||30000),onCommit:output=>{notifyClients(output.state);ops.event('automation.tick','system:scheduler',{revision:output.state.revision,events:output.result.length});},onError:error=>console.error('Automation reconciliation failed:',error.message)});
const cookieName='civora_session',secure=origin.startsWith('https:')?'; Secure':'';
function sessionToken(req){return(req.headers.cookie||'').split(';').map(s=>s.trim()).find(s=>s.startsWith(cookieName+'='))?.slice(cookieName.length+1);}
function sessionCookie(token,maxAge=28800){return`${cookieName}=${token}; HttpOnly; SameSite=Strict; Path=/; Max-Age=${maxAge}${secure}`;}
function issueSession(userId,req){const old=sessionToken(req);if(old)sessions.delete(old);const token=randomBytes(32).toString('base64url');sessions.set(token,{userId,expires:Date.now()+8*3600000});return token;}
function json(res,status,value,headers={}){res.writeHead(status,{'Content-Type':'application/json;charset=utf-8','Cache-Control':'no-store','X-Content-Type-Options':'nosniff',...headers});res.end(JSON.stringify(value));}
function fault(message,code){throw new DomainError(message,String(code));}
function originGuard(req){if(req.headers.origin!==origin)fault('Request origin is not allowed.',403);if(req.headers['sec-fetch-site']==='cross-site')fault('Cross-site requests are not allowed.',403);}
async function readJSON(req,max=72*1024*1024){
 if(!(req.headers['content-type']||'').startsWith('application/json'))fault('Send application/json.',415);
 const declared=Number(req.headers['content-length']||0);if(!Number.isSafeInteger(declared)||declared<0||declared>max)fault('Request is too large or has an invalid length.',413);
 const reserved=declared||max;if(bodyBytes+reserved>BODY_BUDGET)fault('Request capacity is temporarily full. Retry later.',503);bodyBytes+=reserved;
 try{let size=0;const chunks=[];for await(const chunk of req){size+=chunk.length;if(size>max||size>reserved)fault('Request is too large.',413);chunks.push(chunk);}let value;try{value=JSON.parse(Buffer.concat(chunks).toString('utf8'));}catch{fault('Invalid JSON object.',400);}if(!value||typeof value!=='object'||Array.isArray(value))fault('Expected a JSON object.',400);return value;}finally{bodyBytes-=reserved;}
}

async function identity(req){const token=sessionToken(req),session=sessions.get(token);if(!session||session.expires<Date.now()){sessions.delete(token);return null;}const state=await store.read(),user=state.users.find(u=>u.id===session.userId&&u.active);if(!user){sessions.delete(token);return null;}return{token,session,state,user};}
function publicUser(user){return{id:user.id,name:user.name,email:user.email,role:user.role};}
function loginRate(req){const key=req.socket.remoteAddress||'unknown',now=Date.now(),record=attempts.get(key);if(!record||record.since+15*60000<now){attempts.set(key,{since:now,count:1});return;}record.count++;if(record.count>30)fault('Too many sign-in attempts. Try again later.',429);}
const portal=createPortal({ops,store,origin,passwordRecord,verifyPassword,json,readJSON,fault,rate:loginRate});
const localSystem=await createLocalSystem({enabled:process.env.CIVORA_LOCAL_SYSTEM==='1',dataDir,origin,adminId:bootstrapAdmin.id,readJSON,json,ops,configFile:process.env.CIVORA_LOCAL_ROOTS_FILE,applicationsFile:process.env.CIVORA_LOCAL_APPLICATIONS_FILE,recoverLocks:process.env.CIVORA_LOCAL_RECOVER_LOCKS==='1'});
if(localSystem.enabled&&!['127.0.0.1','localhost','::1'].includes(host))throw new Error('Local system mode requires a loopback bind address.');
async function handle(req,res){
  if(localSystem.enabled&&!localSystem.safeRequest(req))return json(res,403,{error:'Local system mode accepts only its exact loopback origin.',code:'FORBIDDEN'});
  let url;try{url=new URL(req.url,origin);}catch{return json(res,400,{error:'Invalid request URL.'});}
  res.setHeader('Referrer-Policy','no-referrer');res.setHeader('X-Frame-Options','DENY');
  if(url.pathname.startsWith('/auth/')){
    if(!oidc)fault('Organization sign-in is not configured.',404);
    if(req.method==='GET'&&url.pathname==='/auth/oidc/start')return oidc.start(req,res);
    if(req.method==='GET'&&url.pathname==='/auth/oidc/callback'){const email=await oidc.finish(req,url),state=await store.read(),user=state.users.find(u=>u.active&&u.email.toLowerCase()===email);if(!user)fault('No active workspace membership matches this verified identity.',403);res.writeHead(302,{'Location':'/#server','Set-Cookie':[sessionCookie(issueSession(user.id,req)),`civora_oidc=; HttpOnly; SameSite=Lax; Path=/auth/oidc; Max-Age=0${secure}`],'Cache-Control':'no-store'}).end();return;}
    fault('Unknown authentication endpoint.',404);
  }
  if(!url.pathname.startsWith('/api/'))return serveStatic(req,res);
  if(req.method==='OPTIONS')return json(res,405,{error:'Cross-origin API access is disabled. Serve the app and API on the same origin.'});
  if(['POST','PUT','PATCH','DELETE'].includes(req.method))originGuard(req);
  if(req.method==='GET'&&url.pathname==='/api/health')return json(res,200,{ok:true,product:'Civora',version:'0.7.0'});
  if(await portal.handle(req,res,url))return;
  if(req.method==='GET'&&url.pathname==='/api/session'){const who=await identity(req);return json(res,200,{user:who?publicUser(who.user):null,oidc:!!oidc});}
  if(req.method==='POST'&&url.pathname==='/api/login'){
    loginRate(req);const body=await readJSON(req,8192),state=await store.read(),user=state.users.find(u=>u.email.toLowerCase()===String(body.email||'').trim().toLowerCase()),record=user?accounts[user.id]:null;
    const verified=await verifyPassword(body.password,record);if(!verified||!record||!user?.active){ops.event('auth.failed','anonymous',{});fault('Invalid email or password.',401);}ops.event('auth.signed-in',user.id,{});return json(res,200,{user:publicUser(user)},{'Set-Cookie':sessionCookie(issueSession(user.id,req))});
  }
  if(req.method==='POST'&&url.pathname==='/api/logout'){const token=sessionToken(req);const userId=sessions.get(token)?.userId;if(userId)ops.event('auth.signed-out',userId,{});sessions.delete(token);for(const item of clients)if(item.token===token)item.res.end();return json(res,200,{ok:true},{'Set-Cookie':sessionCookie('',0)});}
  const who=await identity(req);if(!who)fault('Sign in to the team workspace.',401);
  if(await portal.member(req,res,url,who))return;
  if(await localSystem.handle(req,res,url,who))return;
  if(req.method==='GET'&&url.pathname==='/api/notifications'){
    const limit=Number(url.searchParams.get('limit')||50),offset=Number(url.searchParams.get('offset')||0),revision=url.searchParams.get('revision');
    if(!Number.isInteger(limit)||limit<1||limit>200||!Number.isSafeInteger(offset)||offset<0)fault('Invalid notification pagination.',400);
    if(revision!==null&&Number(revision)!==who.state.revision)fault('The inbox changed. Restart pagination.',409);
    const now=new Date().toISOString(),filter=url.searchParams.get('filter')||'all';if(!['all','unread','snoozed'].includes(filter))fault('Invalid notification filter.',400);
    const visible=(who.state.notifications||[]).filter(n=>notificationVisible(who.state,n,who.user.id)),items=visible.filter(n=>filter==='snoozed'?n.snoozedUntil>now:!(n.snoozedUntil>now)&&(filter!=='unread'||!n.readAt)).reverse();
    return json(res,200,{revision:who.state.revision,total:items.length,unread:visible.filter(n=>!n.readAt&&!(n.snoozedUntil>now)).length,items:items.slice(offset,offset+limit),nextOffset:offset+limit<items.length?offset+limit:null});
  }
  if(req.method==='POST'&&url.pathname==='/api/sets/resolve'){
    const body=await readJSON(req,4096);
    if(body.expectedRevision!==who.state.revision)fault('The workspace changed. Refresh the set.',409);
    return json(res,200,resolveDocumentSet(who.state,who.user.id,body.id,{expectedVersion:body.expectedVersion,permission:body.permission||'read',allowRecycled:body.permission!=='download'}));
  }
  if(req.method==='POST'&&url.pathname==='/api/sets/export'){
    const body=await readJSON(req,4096);if(body.expectedRevision!==who.state.revision)fault('The workspace changed. Refresh the set.',409);
    if(!Number.isSafeInteger(body.expectedVersion))fault('Set version is required.',400);
    if(setExports>=2)fault('Package capacity is full. Retry later.',503);
    setExports++;const controller=new AbortController();const cancelled=()=>controller.abort();res.once('close',cancelled);
    try{
      let live=who.state;const initial=resolveDocumentSet(live,who.user.id,body.id,{expectedVersion:body.expectedVersion,permission:'download'});
      const fingerprint=r=>JSON.stringify(r.records.map(d=>[d.documentId,d.versionId,d.name,d.path,d.number]));
      const output=await exportDocumentSetArchive(()=>live,who.user.id,body.id,{async blob(id){const active=await identity(req);if(!active)fault('Sign in again before exporting.',401);live=active.state;return store.blob(id);}},{expectedVersion:body.expectedVersion,signal:controller.signal});
      const active=await identity(req);if(!active)fault('Sign in again before exporting.',401);live=active.state;
      const final=resolveDocumentSet(live,who.user.id,body.id,{expectedVersion:body.expectedVersion,permission:'download'});
      if(fingerprint(initial)!==fingerprint(final))fault('A live set member changed during export. Try again.',409);
      controller.signal.throwIfAborted();const bytes=Buffer.from(await output.zip.arrayBuffer());
      // Recheck after materializing bytes; no network or API data enters a shell command.
      const verified=await identity(req);if(!verified)fault('Sign in again before exporting.',401);
      if(fingerprint(initial)!==fingerprint(resolveDocumentSet(verified.state,who.user.id,body.id,{expectedVersion:body.expectedVersion,permission:'download'})))fault('Set changed during export.',409);
      controller.signal.throwIfAborted();ops.event('set.export',who.user.id,{setId:body.id,setVersion:body.expectedVersion,documents:final.records.length});
      res.writeHead(200,{'Content-Type':'application/zip','Content-Length':bytes.length,'Content-Disposition':'attachment; filename="civora-document-set.zip"','Cache-Control':'no-store','X-Content-Type-Options':'nosniff'});res.end(bytes);return;
    }finally{setExports--;res.off('close',cancelled);}
  }
  if(req.method==='POST'&&url.pathname==='/api/explorer/quick-search'){
    const body=await readJSON(req,8192);
    if(body.expectedRevision!==who.state.revision)fault('The workspace changed. Refresh search.',409);
    const {expectedRevision,query,projectId,scope,kind,limit,recents}=body;
    return json(res,200,{revision:who.state.revision,...navigationSearch(who.state,who.user.id,{query,projectId,scope,kind,limit,recents})});
  }
  if(req.method==='POST'&&url.pathname==='/api/explorer/query'){
    const body=await readJSON(req,32768);
    if(body.expectedRevision!==who.state.revision)fault('The workspace changed. Restart Explorer pagination.',409);
    const projection=projectWorkspace(who.state,who.user.id),out=queryExplorer(projection,who.user.id,body.view,body.options);
    return json(res,200,{revision:who.state.revision,total:out.total,items:out.items,groups:out.groups,offset:out.offset,limit:out.limit,nextOffset:out.offset+out.limit<out.total?out.offset+out.limit:null});
  }
  if(req.method==='POST'&&url.pathname==='/api/explorer/rename-preview'){
    const body=await readJSON(req,131072);
    if(body.expectedRevision!==who.state.revision)fault('The workspace changed. Refresh the rename preview.',409);
    try{return json(res,200,previewDocumentRename(who.state,who.user.id,body));}
    catch(error){if(!['FORBIDDEN','VALIDATION','CONFLICT','LOCKED','NOT_FOUND'].includes(error.code))throw error;return json(res,200,{allowed:false,code:error.code,error:error.message,sourceRevision:who.state.revision});}
  }
  if(req.method==='POST'&&url.pathname==='/api/explorer/copy-preview'){
    const body=await readJSON(req,262144);
    if(body.expectedRevision!==who.state.revision)fault('The workspace changed. Refresh the copy preview.',409);
    try{return json(res,200,previewDocumentCopy(who.state,who.user.id,body));}
    catch(error){if(!['FORBIDDEN','VALIDATION','CONFLICT','LOCKED','NOT_FOUND'].includes(error.code))throw error;return json(res,200,{allowed:false,code:error.code,error:error.message,sourceRevision:who.state.revision});}
  }
  if(req.method==='POST'&&url.pathname==='/api/explorer/move-preview'){
    const body=await readJSON(req,32768);
    if(body.expectedRevision!==who.state.revision)fault('The workspace changed. Refresh the preview.',409);
    try{return json(res,200,previewDocumentMove(who.state,who.user.id,body));}
    catch(error){if(!['FORBIDDEN','VALIDATION','CONFLICT','LOCKED','NOT_FOUND'].includes(error.code))throw error;return json(res,200,{allowed:false,code:error.code,error:error.message,sourceRevision:who.state.revision});}
  }
  if(req.method==='POST'&&url.pathname==='/api/workflow/preview'){
    const body=await readJSON(req,16384);if(!Number.isSafeInteger(body.expectedRevision)||body.expectedRevision!==who.state.revision)fault('The workspace changed. Refresh the preview.',409);
    try{return json(res,200,previewDocumentTransition(who.state,who.user.id,{id:body.id,to:body.to,reason:body.reason||''}));}
    catch(error){if(!['FORBIDDEN','VALIDATION','CONFLICT','LOCKED','NOT_FOUND'].includes(error.code))throw error;return json(res,200,{allowed:false,code:error.code,error:error.message,sourceRevision:who.state.revision});}
  }
  if(req.method==='GET'&&url.pathname==='/api/admin/automation'){
    if(who.user.role!=='admin')fault('Administrator role is required.',403);return json(res,200,{...automation.status(),policies:(who.state.automationPolicies||[]).length,ledger:(who.state.automationLedger||[]).length});
  }
  if(req.method==='GET'&&url.pathname==='/api/capabilities')return json(res,200,{renditions:jobs.capabilities(),acl:true,portal:true,automation:automation.status(),version:'0.7.0'});
  if(req.method==='GET'&&url.pathname==='/api/jobs')return json(res,200,{jobs:ops.jobs(1000).filter(j=>jobs.allowed(j,who.state,who.user.id)).slice(0,100)});
  if(req.method==='POST'&&url.pathname==='/api/jobs'){
    const p=await readJSON(req,8192),d=who.state.documents.find(d=>d.id===p.documentId),a=createAccessContext(who.state,who.user.id);
    if(!d||!a.can('write','document',d.id)||!a.can('download','document',d.id))fault('Document is not available for rendition.',403);
    const v=p.versionId?d.versions.find(v=>v.id===p.versionId):d.versions.at(-1);if(!v)fault('Revision not found.',404);return json(res,202,{job:jobs.enqueue(d,v,p.format||'pdf',who.user.id)});
  }
  const jm=url.pathname.match(/^\/api\/jobs\/([a-f0-9]{64})(?:\/(content|cancel))?$/);
  if(jm){const j=ops.job(jm[1]);if(!jobs.allowed(j,who.state,who.user.id))fault('Job not found.',404);
    if(jm[2]==='cancel'&&req.method==='POST'){if(!createAccessContext(who.state,who.user.id).can('write','document',j.input.documentId))fault('Access is not permitted.',403);return json(res,200,{cancelled:ops.cancel(j.id)});}
    if(req.method==='GET'&&jm[2]==='content'){if(j.status!=='completed')fault('Rendition is not complete.',409);const bytes=await jobs.output(j.id);res.writeHead(200,{'Content-Type':j.output.mime,'Content-Length':bytes.length,'Content-Disposition':`attachment; filename="rendition.${j.output.extension}"`,'Cache-Control':'no-store','X-Content-Type-Options':'nosniff','Content-Security-Policy':"default-src 'none'; sandbox"});res.end(bytes);return;}
    if(req.method==='GET')return json(res,200,{job:j});
  }
  if(req.method==='GET'&&url.pathname==='/api/admin/operations'){if(who.user.role!=='admin')fault('Administrator role is required.',403);return json(res,200,{...ops.counts(),automation:automation.status(),memory:process.memoryUsage(),uptime:process.uptime(),sessions:sessions.size,liveClients:clients.size,capabilities:jobs.capabilities(),deployment:'single-node snapshot store + durable operations; not horizontally scaled'});}
  if(req.method==='GET'&&url.pathname==='/api/admin/security-events'){if(who.user.role!=='admin')fault('Administrator role is required.',403);const after=Number(url.searchParams.get('after')||0);if(!Number.isSafeInteger(after)||after<0)fault('Invalid audit cursor.',400);return json(res,200,{events:ops.events(after,100),verification:ops.verifyAudit()});}
  if(req.method==='GET'&&url.pathname==='/api/documents'){
    const limit=Math.min(200,Math.max(1,Number(url.searchParams.get('limit')||50))),offset=Number(url.searchParams.get('offset')||0),rev=url.searchParams.get('revision');if(!Number.isInteger(limit)||!Number.isSafeInteger(offset)||offset<0)fault('Invalid pagination.',400);if(rev!==null&&Number(rev)!==who.state.revision)fault('Result set changed; restart pagination.',409);
    const a=createAccessContext(who.state,who.user.id),q=(url.searchParams.get('q')||'').toLowerCase(),projectId=url.searchParams.get('projectId'),items=who.state.documents.filter(d=>!d.deletedAt&&(!projectId||d.projectId===projectId)&&a.can('read','document',d.id)&&(!q||[d.name,d.title,d.number,...d.tags].join(' ').toLowerCase().includes(q))).sort((a,b)=>a.id.localeCompare(b.id));
    return json(res,200,{revision:who.state.revision,total:items.length,items:items.slice(offset,offset+limit).map(d=>({id:d.id,name:d.name,title:d.title,number:d.number,state:d.state,projectId:d.projectId,folderId:d.folderId,currentVersion:d.versions.at(-1)})),nextOffset:offset+limit<items.length?offset+limit:null});
  }
  if(req.method==='GET'&&url.pathname==='/api/workspace')return json(res,200,{state:projectWorkspace(who.state,who.user.id)});
  if(req.method==='GET'&&url.pathname==='/api/events'){
    if(clients.size>=200||[...clients].filter(c=>sessions.get(c.token)?.userId===who.user.id).length>=10)fault('Live connection limit reached.',429);res.writeHead(200,{'Content-Type':'text/event-stream','Cache-Control':'no-store','Connection':'keep-alive','X-Accel-Buffering':'no'});res.write(`data: ${JSON.stringify({revision:who.state.revision})}\n\n`);const item={res,token:who.token,last:who.state.revision,fingerprint:visibleFingerprint(who.state,who.user.id)};clients.add(item);res.on('close',()=>clients.delete(item));return;
  }
  if(req.method==='GET'&&url.pathname.startsWith('/api/blobs/')){
    const id=url.pathname.slice('/api/blobs/'.length),access=createAccessContext(who.state,who.user.id);if(!/^[a-f0-9]{64}$/.test(id)||!who.state.documents.some(d=>access.can('download','document',d.id)&&d.versions.some(v=>v.blobId===id)))fault('File not found.',404);const blob=await store.blob(id);if(!blob)fault('Stored file content is missing.',404);res.writeHead(200,{'Content-Type':blob.type||'application/octet-stream','Content-Length':blob.size,'Content-Disposition':'attachment','Cache-Control':'no-store','X-Content-Type-Options':'nosniff','Content-Security-Policy':"default-src 'none'; sandbox"});res.end(Buffer.from(await blob.arrayBuffer()));return;
  }
  if(req.method==='POST'&&url.pathname==='/api/commands'){
    const input=await readJSON(req);if(!Number.isSafeInteger(input.expectedRevision)||input.expectedRevision<0)fault('A valid expectedRevision is required.',400);if(input.expectedRevision!==who.state.revision)throw new DomainError('The workspace changed. Refresh and retry.','CONFLICT');
    const command=input.command;if(!command||typeof command.type!=='string'||!command.payload||typeof command.payload!=='object'||Array.isArray(command.payload))fault('Invalid command.',400);if(command.id!==undefined&&(typeof command.id!=='string'||command.id.length>120))fault('Invalid command identifier.',400);
    const files=new Map();if(['document.create','document.checkin'].includes(command.type)){
      if(!input.file)fault('Verified file content must accompany this command.',400);let bytes;try{bytes=fromBase64(input.file.data);}catch{fault('Invalid file encoding.',400);}if(bytes.length>50*1024*1024)fault('File exceeds 50 MiB.',413);const hash=createHash('sha256').update(bytes).digest('hex'),declared=command.payload.file;
      if(declared?.hash!==hash||declared?.blobId!==hash||declared?.size!==bytes.length)fault('File content does not match its SHA-256 descriptor.',400);
      const mime=String(input.file.mime||'application/octet-stream').replace(/[\r\n]/g,'').slice(0,100);command.payload.file={hash,blobId:hash,size:bytes.length,mime};files.set(hash,new Blob([bytes],{type:mime}));
    }else if(input.file)fault('This command does not accept file content.',400);
    // The client-supplied actor ID, if any, is deliberately ignored.
    if(command.type==='document.bulkCopy'){if(activeCopyVerifications>=2)fault('Two copy batches are being verified. Retry shortly.',429);activeCopyVerifications++;try{await verifyCopyContent(who.state,who.user.id,command.payload,id=>store.blob(id));const current=await identity(req);if(!current||current.user.id!==who.user.id)fault('Sign in again before copying.',401);if(current.state.revision!==who.state.revision)throw new DomainError('The workspace changed during copy verification. Validate again.','CONFLICT');}finally{activeCopyVerifications--;}}
    const result=applyCommand(who.state,command,who.user.id);await store.save(result.state,input.expectedRevision,files);
    notifyClients(result.state);
    if(process.env.CIVORA_AUTO_RENDITIONS!=='0'&&['document.create','document.checkin'].includes(command.type)){const d=result.state.documents.find(d=>d.id===(command.type==='document.create'?result.result:command.payload.id));if(d){try{jobs.automatic(d,who.user.id);}catch(error){console.error('Automatic rendition enqueue failed:',error.message);ops.event('rendition.enqueue-failed',who.user.id,{documentId:d.id});}}}
    if(process.env.CIVORA_AUTO_RENDITIONS!=='0'&&command.type==='document.bulkCopy')for(const item of result.result.copied){try{jobs.automatic(result.state.documents.find(d=>d.id===item.id),who.user.id);}catch(error){console.error('Copy rendition enqueue failed:',error.message);ops.event('rendition.enqueue-failed',who.user.id,{documentId:item.id});}}
    ops.event('workspace.command',who.user.id,{type:command.type,revision:result.state.revision});
    return json(res,200,{...result,state:projectWorkspace(result.state,who.user.id)});
  }
  if(req.method==='POST'&&url.pathname==='/api/admin/password'){
    if(who.user.role!=='admin')fault('Administrator role is required.',403);const body=await readJSON(req,8192);if(!who.state.users.some(u=>u.id===body.userId&&u.active))fault('Active member not found.',404);const record=await passwordRecord(body.password);
    const persist=async()=>{accounts[body.userId]=record;await persistAccounts();};const pending=accountQueue.then(persist,persist);accountQueue=pending.catch(()=>{});await pending;
    ops.event('auth.password-changed',who.user.id,{userId:body.userId});for(const[token,session]of sessions)if(session.userId===body.userId&&token!==who.token)sessions.delete(token);notifyClients(await store.read());return json(res,200,{ok:true});
  }
  fault('Unknown API endpoint.',404);
}
const server=createServer((req,res)=>handle(req,res).catch(error=>{if(res.headersSent){res.end();return;}const codes={CONFLICT:409,FORBIDDEN:403,NOT_FOUND:404,LOCKED:409,INTEGRITY:409,VALIDATION:400},status=codes[error.code]||(/^\d{3}$/.test(error.code)?Number(error.code):500);if(status===500)console.error('Request failed:',error.name,error.message);json(res,status,{error:status===500?'Internal server error. See the server log.':error.message,code:error.code||'INTERNAL'});}));
server.requestTimeout=120000;server.headersTimeout=15000;server.maxConnections=256;server.maxHeadersCount=100;server.keepAliveTimeout=5000;
function visibleFingerprint(state,userId){const view=projectWorkspace(state,userId);delete view.revision;return createHash('sha256').update(JSON.stringify(view)).digest('hex');}
function notifyClients(state,heartbeat=false){for(const item of clients){const session=sessions.get(item.token);if(item.res.destroyed||!session||session.expires<Date.now()||!state.users.some(u=>u.id===session.userId&&u.active)){item.res.end();clients.delete(item);continue;}if(item.last!==state.revision){const fingerprint=visibleFingerprint(state,session.userId);item.last=state.revision;if(fingerprint!==item.fingerprint){item.fingerprint=fingerprint;if(!item.res.write(`data: ${JSON.stringify({revision:state.revision})}\n\n`)){item.res.end();clients.delete(item);}}}else if(heartbeat)item.res.write(': heartbeat\n\n');}}
let polling=false;const interval=setInterval(async()=>{if(polling)return;polling=true;try{const now=Date.now();for(const[token,s]of sessions)if(s.expires<now)sessions.delete(token);for(const[ip,r]of attempts)if(r.since+900000<now)attempts.delete(ip);if(clients.size)notifyClients(await store.read(),true);}catch(error){console.error('Live revision check failed:',error.message);}finally{polling=false;}},5000);interval.unref();
server.listen(port,host,()=>console.log(`Civora team workspace: ${origin}\nDatabase: ${kind}. Data directory: ${dataDir}\nServer sessions are in-memory; restarting requires sign-in again.\nSingle workspace, hierarchical ACLs. New members have no project access until explicitly granted.`));
async function close(){clearInterval(interval);await automation.close();for(const item of clients)item.res.end();server.close(async()=>{await localSystem.close();await jobs.close();ops.close();await store.close();process.exit(0);});}
process.on('SIGINT',close);process.on('SIGTERM',close);
