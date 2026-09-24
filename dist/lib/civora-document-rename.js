// Civora 0.10.0 — independently authored. MIT license.
const __modules = Object.create(null);

__modules["packages/access/index.js"] = (() => {
/** Hierarchical authorization. Pure ES module; the server is the security boundary. */
const PERMISSIONS = ['read','download','write','review','publish','share','manage'];
const ROLE_CAPS = {admin:PERMISSIONS,manager:PERMISSIONS,author:['read','download','write','review'],reviewer:['read','download','review'],viewer:['read','download']};
const fail = (message='Access is not permitted.',code='FORBIDDEN') => { const e=new Error(message);e.code=code;throw e; };
const cache=new WeakMap();
function invalidateAccessCache(state){cache.delete(state);}

function index(state){let entry=cache.get(state);if(entry?.revision===state.revision)return entry;entry={revision:state.revision,projects:new Map(state.projects.map(x=>[x.id,x])),folders:new Map(state.folders.map(x=>[x.id,x])),documents:new Map(state.documents.map(x=>[x.id,x])),policies:new Map((state.accessPolicies||[]).map(p=>[p.scope+':'+p.resourceId,p])),users:new Map(state.users.map(u=>[u.id,u]))};cache.set(state,entry);return entry;}
function scopeFor(state,kind,id){const i=index(state);if(kind==='workspace')return{scope:'workspace',resourceId:state.id};const row=i[kind+'s']?.get(id);if(!row)fail('Resource not found.','NOT_FOUND');return{scope:kind,resourceId:row.id};}
function createAccessContext(state,userOrId){
  const i=index(state),user=typeof userOrId==='string'?i.users.get(userOrId):userOrId,principals=new Set(['*',`user:${user?.id}`,`role:${user?.role}`]),memo=new Map();
  for(const group of state.groups||[])if(group.members.includes(user?.id))principals.add('group:'+group.id);
  function chain(scope,id){const result=[{scope:'workspace',resourceId:state.id}];if(scope==='workspace')return result;let projectId,folderId;
    if(scope==='project'){if(!i.projects.has(id))return null;projectId=id;}
    else if(scope==='folder'){const f=i.folders.get(id);if(!f)return null;projectId=f.projectId;folderId=id;}
    else if(scope==='document'){const d=i.documents.get(id);if(!d)return null;projectId=d.projectId;folderId=d.folderId;}
    else return null;
    result.push({scope:'project',resourceId:projectId});const parents=[],seen=new Set();while(folderId){if(seen.has(folderId))return null;seen.add(folderId);const folder=i.folders.get(folderId);if(!folder||folder.projectId!==projectId)return null;parents.unshift({scope:'folder',resourceId:folder.id});folderId=folder.parentId;}
    result.push(...parents);if(scope==='document')result.push({scope,resourceId:id});return result;
  }
  function effective(scope,id){const key=scope+':'+id;if(memo.has(key))return memo.get(key);const scopes=chain(scope,id);if(!user?.active||!scopes)return[];if(user.role==='admin')return[...PERMISSIONS];const allowed=new Set(),denied=new Set();
    for(const s of scopes){const policy=i.policies.get(s.scope+':'+s.resourceId);if(!policy)continue;if(policy.inherit===false){allowed.clear();denied.clear();}for(const entry of policy.entries)if(principals.has(entry.principal)){entry.allow.forEach(p=>allowed.add(p));entry.deny.forEach(p=>denied.add(p));}}
    let result=(Object.hasOwn(ROLE_CAPS,user.role)?ROLE_CAPS[user.role]:[]).filter(p=>allowed.has(p)&&!denied.has(p));if(!result.includes('read'))result=[];memo.set(key,result);return result;
  }
  function can(permission,scope='workspace',id=state.id){const perms=effective(scope,id);return perms.includes(permission)&&(permission==='read'||perms.includes('read'));}
  return{can,effective,chain,user};
}
function canAccess(state,user,permission,scope='workspace',id=state.id){return createAccessContext(state,user).can(permission,scope,id);}
function requireAccess(state,user,permission,scope,id){if(!canAccess(state,user,permission,scope,id))fail();}
function normalizePolicy(state,input){
  const scope=input?.scope,resourceId=input?.resourceId;if(!['workspace','project','folder','document'].includes(scope)||typeof resourceId!=='string')fail('Invalid access scope.','VALIDATION');scopeFor(state,scope,resourceId);if(scope==='workspace'&&resourceId!==state.id)fail('Invalid workspace scope.','VALIDATION');
  if(!Array.isArray(input.entries)||input.entries.length>300||typeof input.inherit!=='boolean')fail('A policy needs a boolean inheritance setting and at most 300 entries.','VALIDATION');
  const seen=new Set(),entries=input.entries.map(entry=>{if(!entry||typeof entry!=='object'||Array.isArray(entry))fail('Invalid policy entry.','VALIDATION');const principal=entry.principal;if(typeof principal!=='string'||seen.has(principal))fail('Duplicate or invalid principal.','VALIDATION');seen.add(principal);const colon=principal.indexOf(':'),kind=principal.slice(0,colon),id=principal.slice(colon+1);
    if(!(principal==='*'||kind==='role'&&Object.hasOwn(ROLE_CAPS,id)||kind==='user'&&state.users.some(u=>u.id===id)||kind==='group'&&(state.groups||[]).some(g=>g.id===id)))fail('Unknown permission principal.','VALIDATION');
    const list=key=>{if(!Array.isArray(entry[key])||entry[key].length>PERMISSIONS.length||entry[key].some(p=>!PERMISSIONS.includes(p)))fail('Invalid permission.','VALIDATION');return[...new Set(entry[key])];};return{principal,allow:list('allow'),deny:list('deny')};
  });return{id:`acl-${scope}-${resourceId}`,scope,resourceId,inherit:input.inherit,entries};
}
function validateAccessState(state){
  if(state.groups!==undefined){if(!Array.isArray(state.groups)||state.groups.length>2000)fail('Invalid groups.','VALIDATION');const seen=new Set();for(const g of state.groups){if(!g||typeof g.id!=='string'||g.id.length>120||seen.has(g.id)||typeof g.name!=='string'||!Array.isArray(g.members)||g.members.length>10000||g.members.some(id=>!state.users.some(u=>u.id===id)))fail('Invalid group.','VALIDATION');seen.add(g.id);}}
  if(state.accessPolicies!==undefined){if(!Array.isArray(state.accessPolicies)||state.accessPolicies.length>200000)fail('Invalid access policies.','VALIDATION');const seen=new Set();for(const p of state.accessPolicies){const normal=normalizePolicy(state,p),key=normal.scope+':'+normal.resourceId;if(seen.has(key))fail('Duplicate access policy.','VALIDATION');seen.add(key);}}
  return true;
}
/** Notifications are reference-only. Every read checks the live target and its complete
 * pinned context, not the permissions or metadata captured at delivery time. */
function notificationVisible(state,notice,userId){
  if(notice.userId!==userId)return false;
  const access=createAccessContext(state,userId);if(!access.user?.active)return false;
  const collection={document:'documents',review:'reviews',issue:'issues',transmittal:'transmittals'}[notice.resourceType];
  const resource=state[collection]?.find(r=>r.id===notice.resourceId);if(!resource||resource.projectId!==notice.projectId)return false;
  if(notice.resourceType!=='document'&&!access.can('read','project',notice.projectId))return false;
  const ids=new Set([...(notice.documentIds||[]),...(resource.documents||[]).flatMap(s=>[s.documentId,...(s.context?.references||[])])]);
  if(notice.resourceType==='document')ids.add(resource.id);if(resource.documentId)ids.add(resource.documentId);
  return [...ids].every(id=>access.can('read','document',id));
}
/** Central gate covers every command and every referenced resource, including move destinations. */
function authorizeCommand(state,command,userId){
  const user=state.users.find(u=>u.id===userId);if(!user?.active)fail();const {type,payload:p={}}=command,access=createAccessContext(state,user),need=(permission,scope,id)=>{if(!access.can(permission,scope,id))fail();};
  if(user.role==='admin')return;
  if(type.startsWith('user.')||type.startsWith('group.')||type.startsWith('workflow.')||type==='project.workflow')fail('Administrator role is required.');
  if(type==='access.set'||type==='access.remove'){if(p.scope==='workspace')fail('Only administrators can change workspace policy.');need('manage',p.scope,p.resourceId);return;}
  if(type==='project.create'){if(user.role!=='manager')fail();return;}
  if(type.startsWith('workflowRule.')){const row=(state.workflowRules||[]).find(r=>r.id===p.id);need('manage','project',row?.projectId||p.projectId);if(p.projectId)need('manage','project',p.projectId);if(!['manager','admin'].includes(user.role))fail();return;}
  if(type.startsWith('automation.')){need('manage','project',p.projectId);if(user.role!=='manager')fail();return;}
  if(type==='subscription.save'){need('read',p.scope,p.resourceId);return;}
  if(type==='subscription.delete'){if(!(state.subscriptions||[]).some(s=>s.id===p.id&&s.userId===userId))fail('Subscription not found.','NOT_FOUND');return;}
  if(type==='notification.update'){if(!Array.isArray(p.ids)||p.ids.some(id=>!(state.notifications||[]).some(n=>n.id===id&&notificationVisible(state,n,userId))))fail('Notification not found.','NOT_FOUND');return;}
  if(type==='document.bulkUpdate'){
    if(!Array.isArray(p.updates)||!p.updates.length||p.updates.length>100)fail('Invalid bulk update.','VALIDATION');
    for(const item of p.updates)need('write','document',item.id);return;
  }
  if(type==='baseline.create'){
    need('write','project',p.projectId);const lookup=new Map(state.documents.map(d=>[d.id,d])),seen=new Set(),stack=[...(p.documentIds||[])];
    while(stack.length){const id=stack.pop();if(seen.has(id))continue;seen.add(id);need('read','document',id);if(p.includeReferences)stack.push(...(lookup.get(id)?.references||[]));}return;
  }
  if(type.startsWith('reviewTemplate.')){
    const record=(state.reviewTemplates||[]).find(t=>t.id===p.id);
    need('manage','project',record?.projectId||p.projectId);if(p.projectId)need('manage','project',p.projectId);return;
  }
  if(type==='document.bulkRename'){
    if(!Array.isArray(p.items)||p.items.length<1||p.items.length>100)fail('Invalid rename batch.','VALIDATION');
    for(const item of p.items){if(!item||typeof item.id!=='string')fail('Invalid rename source.','VALIDATION');need('write','document',item.id);}return;
  }
  if(type==='document.bulkCopy'){
    if(!Array.isArray(p.items)||p.items.length<1||p.items.length>100)fail('Invalid controlled copy.','VALIDATION');
    need('write',p.folderId?'folder':'project',p.folderId||p.projectId);
    for(const item of p.items){if(!item||typeof item.id!=='string')fail('Invalid source.','VALIDATION');need('download','document',item.id);const source=state.documents.find(d=>d.id===item.id);if(source.projectId!==p.projectId)need('share','document',item.id);}
    return;
  }
  if(type==='document.bulkMove'){
    if(!Array.isArray(p.items)||p.items.length<1||p.items.length>100)fail('Invalid bulk move.','VALIDATION');
    need('write',p.folderId?'folder':'project',p.folderId||p.projectId);
    for(const item of p.items)need('write','document',item.id);return;
  }
  if(type.startsWith('explorerView.')){
    const v=(state.explorerViews||[]).find(v=>v.id===p.id);
    if(type==='explorerView.remove'&&v?.scope==='personal'&&v.userId===userId)return;
    const scope=v?.scope||p.scope, projectId=v?.projectId||p.config?.projectId;
    need(scope==='project'?'manage':'read','project',projectId);return;
  }
  if(type==='explorerBookmark.toggle'){
    if(!(state.explorerBookmarks||[]).some(b=>b.userId===userId&&b.scope===p.scope&&b.resourceId===p.resourceId))need('read',p.scope,p.resourceId);return;
  }
  if(type.startsWith('project.')){need('manage','project',p.id||p.projectId);return;}
  if(type.startsWith('folder.')){if(type==='folder.create')need('write',p.parentId?'folder':'project',p.parentId||p.projectId);else{need(type==='folder.delete'?'manage':'write','folder',p.id);if('parentId'in p){const folder=state.folders.find(f=>f.id===p.id);need('write',p.parentId?'folder':'project',p.parentId||folder?.projectId); // Moving a subtree cannot transport files the caller cannot edit.
      const descendants=new Set([p.id]);let changed=true;while(changed){changed=false;for(const f of state.folders)if(descendants.has(f.parentId)&&!descendants.has(f.id)){descendants.add(f.id);changed=true;}}for(const d of state.documents)if(descendants.has(d.folderId))need('write','document',d.id);
    }}return;}
  if(type==='document.create'){need('write',p.folderId?'folder':'project',p.folderId||p.projectId);return;}
  if(type.startsWith('document.')){const id=p.id||p.documentId,d=state.documents.find(d=>d.id===id),transition=state.workflows.find(w=>w.id===d?.workflowId)?.transitions.find(t=>t.from===d?.state&&t.to===p.to);need(type==='document.retention'?'manage':type==='document.transition'&&(['Published','Archived'].includes(p.to)||transition?.requireReview)?'publish':'write','document',id);if(type==='document.move'){const d=state.documents.find(d=>d.id===id);need('write',p.folderId?'folder':'project',p.folderId||d?.projectId);}if(type==='document.references')for(const ref of p.references||[])need('read','document',ref);return;}
  if(type.startsWith('comment.')||type.startsWith('markup.')){const collection=type.startsWith('comment.')?'comments':'markups';const id=type.endsWith('.add')?p.id||p.documentId:state[collection].find(x=>x.id===p.id)?.documentId;need('review','document',id);return;}
  if(type.startsWith('search.')){if(type==='search.save'&&p.projectId)need('read','project',p.projectId);return;}
  if(type.startsWith('set.')){if(p.documentIds!==undefined&&!Array.isArray(p.documentIds)||p.members!==undefined&&!Array.isArray(p.members)||Array.isArray(p.members)&&p.members.some(m=>!m||typeof m.documentId!=='string'))fail('Invalid set membership.','VALIDATION');const set=state.sets.find(s=>s.id===p.id);need(['set.lock','set.unlock'].includes(type)?'manage':'write','project',set?.projectId||p.projectId);for(const id of new Set([...(p.documentIds||[]),...(p.members||[]).map(m=>m.documentId),...(set?.documentIds||[])]))need('read','document',id);return;}
  const collection=type.startsWith('review.')?'reviews':type.startsWith('issue.')?'issues':type.startsWith('transmittal.')?'transmittals':type.startsWith('set.')?'sets':type.startsWith('milestone.')?'milestones':type.startsWith('model.')?'models':type.startsWith('clash.')?'clashRuns':null;
  if(!collection)fail('Command is not authorized.');
  const record=type.endsWith('.create')||type==='model.register'||type==='clash.record'?null:(state[collection]||[]).find(x=>x.id===p.id);
  const permission=type==='review.reassign'?'manage':collection==='transmittals'?'share':collection==='milestones'?'manage':['reviews','issues','clashRuns'].includes(collection)?'review':'write';need(permission,'project',p.projectId||record?.projectId);
  const ids=new Set([...(p.documentIds||[]),...(record?.documentIds||[]),...(record?.documents||[]).map(x=>x.documentId)]);if(p.setId){const set=state.sets.find(s=>s.id===p.setId);if(!set)fail('Document set is unavailable.','NOT_FOUND');need('read','project',set.projectId);for(const id of set.documentIds)ids.add(id);}if(p.baselineId){const baseline=(state.baselines||[]).find(b=>b.id===p.baselineId);if(!baseline)fail('Baseline not found.','NOT_FOUND');need('read','project',baseline.projectId);for(const record of baseline.documents)ids.add(record.documentId);}if(p.documentId)ids.add(p.documentId);if(record?.documentId)ids.add(record.documentId);for(const id of ids){need(collection==='transmittals'?'download':type==='review.decide'?'review':'read','document',id);if(collection==='transmittals')need('share','document',id);}
}
/** This is a read projection, never an importable/authoritative workspace. */
function projectWorkspace(state,userId){
  const access=createAccessContext(state,userId);if(access.user?.role==='admin')return structuredClone(state);
  const out=structuredClone(state),documents=state.documents.filter(d=>access.can('read','document',d.id)),docIds=new Set(documents.map(d=>d.id));
  const projectIds=new Set(state.projects.filter(p=>access.can('read','project',p.id)).map(p=>p.id));documents.forEach(d=>projectIds.add(d.projectId));
  out.projects=state.projects.filter(p=>projectIds.has(p.id)).map(p=>access.can('read','project',p.id)?structuredClone(p):{id:p.id,code:'SHARED',name:'Shared documents',workflowId:p.workflowId,fields:[],createdBy:'',status:'Active',phase:'',client:'',dueDate:''});
  const folderIds=new Set(state.folders.filter(f=>projectIds.has(f.projectId)&&access.can('read','folder',f.id)).map(f=>f.id)),lookup=new Map(state.folders.map(f=>[f.id,f]));for(const d of documents){let id=d.folderId;while(id&&!folderIds.has(id)){folderIds.add(id);id=lookup.get(id)?.parentId;}}
  // Include traversal shells, not confidential ancestor names or metadata.
  for(const id of [...folderIds]){let parent=lookup.get(id)?.parentId;while(parent&&!folderIds.has(parent)){folderIds.add(parent);parent=lookup.get(parent)?.parentId;}}
  out.folders=state.folders.filter(f=>folderIds.has(f.id)).map(f=>access.can('read','folder',f.id)?{...structuredClone(f),permissions:access.effective('folder',f.id)}:{id:f.id,projectId:f.projectId,parentId:f.parentId,name:'Restricted folder',permissions:[]});
  out.documents=documents.map(d=>({...structuredClone(d),references:d.references.filter(id=>docIds.has(id)),permissions:access.effective('document',d.id)}));
  for(const collection of ['comments','markups','models'])out[collection]=(state[collection]||[]).filter(x=>docIds.has(x.documentId));
  for(const collection of ['reviews','transmittals'])out[collection]=state[collection].filter(x=>access.can('read','project',x.projectId)&&x.documents.every(d=>docIds.has(d.documentId)));
  out.baselines=(state.baselines||[]).filter(b=>access.can('read','project',b.projectId)&&b.documents.every(s=>docIds.has(s.documentId)&&(s.context?.references||[]).every(id=>docIds.has(id))));
  out.reviewTemplates=(state.reviewTemplates||[]).filter(t=>access.can('read','project',t.projectId));
  // Routed reviews pin historical metadata and dependency identifiers. Do not leak a denied reference through that context.
  out.reviews=out.reviews.filter(r=>r.documents.every(s=>(s.context?.references||[]).every(id=>docIds.has(id))));
  out.transmittals=out.transmittals.filter(t=>t.documents.every(s=>(s.context?.references||[]).every(id=>docIds.has(id))));
  out.issues=state.issues.filter(x=>access.can('read','project',x.projectId)&&(!x.documentId||docIds.has(x.documentId)));
  out.sets=state.sets.filter(x=>access.can('read','project',x.projectId)&&x.documentIds.every(id=>docIds.has(id)));
  out.clashRuns=(state.clashRuns||[]).filter(x=>access.can('read','project',x.projectId)&&(x.documentIds||[]).every(id=>docIds.has(id)));
  out.milestones=state.milestones.filter(x=>access.can('read','project',x.projectId));out.savedSearches=state.savedSearches.filter(x=>x.userId===userId&&(!x.projectId||projectIds.has(x.projectId)));
  out.explorerViews=(state.explorerViews||[]).filter(v=>(v.scope==='project'||v.userId===userId)&&access.can('read','project',v.projectId)&&(!v.config.folderId||access.can('read','folder',v.config.folderId)));
  out.explorerBookmarks=(state.explorerBookmarks||[]).filter(b=>b.userId===userId&&access.can('read',b.scope,b.resourceId));
  out.workflowRules=(state.workflowRules||[]).filter(r=>access.can('manage','project',r.projectId));
  out.automationPolicies=(state.automationPolicies||[]).filter(r=>access.can('manage','project',r.projectId));
  out.automationLedger=(state.automationLedger||[]).filter(r=>access.can('manage','project',r.projectId)&&notificationVisible(state,{...r,userId,documentIds:[]},userId));
  out.subscriptions=(state.subscriptions||[]).filter(s=>s.userId===userId&&access.can('read',s.scope,s.resourceId));
  out.notifications=(state.notifications||[]).filter(n=>notificationVisible(state,n,userId));
  out.audit=[]; // Full audit can contain previous names and values; administrator-only by design.
  const usedUsers=new Set([userId]);const visit=value=>{if(Array.isArray(value)){value.forEach(visit);return;}if(value&&typeof value==='object'){for(const[k,v]of Object.entries(value)){if(['by','createdBy','modifiedBy','assignee','checkedOutBy','resolvedBy'].includes(k)&&typeof v==='string')usedUsers.add(v);else if(k==='assignees'&&Array.isArray(v))v.forEach(id=>usedUsers.add(id));else visit(v);}}};
  ['projects','documents','comments','markups','reviews','issues','transmittals','baselines','reviewTemplates','workflowRules','automationPolicies','automationLedger'].forEach(c=>visit(out[c]));
  // Active colleagues in visible projects are selectable; private email/organization are never returned.
  for(const user of state.users)if(user.active&&out.projects.some(p=>canAccess(state,user,'read','project',p.id)))usedUsers.add(user.id);
  out.users=state.users.filter(u=>usedUsers.has(u.id)).map(u=>u.id===userId?structuredClone(u):{id:u.id,name:u.name,role:u.role,active:u.active,email:'',organization:''});
  const flowIds=new Set([...out.projects.map(p=>p.workflowId),...documents.map(d=>d.workflowId)]);out.workflows=state.workflows.filter(w=>flowIds.has(w.id));
  out.accessPolicies=(state.accessPolicies||[]).filter(p=>p.scope!=='workspace'&&access.can('manage',p.scope,p.resourceId));out.groups=(state.groups||[]).filter(g=>g.members.includes(userId)).map(g=>({...g,members:[userId]}));
  out.projection={userId,filtered:true,canExportWorkspace:false,projectPermissions:Object.fromEntries(out.projects.map(p=>[p.id,access.effective('project',p.id)]))};return out;
}

return { PERMISSIONS, invalidateAccessCache, scopeFor, createAccessContext, canAccess, requireAccess, normalizePolicy, validateAccessState, notificationVisible, authorizeCommand, projectWorkspace };
})();

__modules["packages/document-rename/index.js"] = (() => {
/** Transaction planning for controlled filename changes. No original bytes are changed.
 * Plan against authoritative state; callers must commit with compare-and-swap.
 */
const { canAccess } = __modules["packages/access/index.js"];
const RENAME_LIMITS = Object.freeze({documents:100,filename:240,reason:500,pattern:300});
class RenameError extends Error {
  constructor(message,code='VALIDATION'){super(message);this.name='RenameError';this.code=code;}
}
const check=(v,m,c)=>{if(!v)throw new RenameError(m,c);};
const plain=v=>v&&typeof v==='object'&&!Array.isArray(v)&&[Object.prototype,null].includes(Object.getPrototypeOf(v));
const keys=(v,allowed,label)=>check(plain(v)&&Object.keys(v).every(k=>allowed.includes(k)),`${label} contains unsupported fields.`);
function renameFilename(value){
  check(typeof value==='string','Filename must be text.');const name=value.trim();
  check(name.length>0&&name.length<=RENAME_LIMITS.filename,'Filenames must contain 1–240 characters.');
  check(!/[\\/\x00-\x1f\x7f]/.test(name)&&!['.','..'].includes(name),'Filenames cannot contain path separators, control characters or dot paths.');return name;
}
function filenameParts(value){const name=renameFilename(value),at=name.lastIndexOf('.');return at>0?{stem:name.slice(0,at),extension:name.slice(at)}:{stem:name,extension:''};}
/** Literal transformation only: no regular expressions, code execution, or path access.
 * The original extension is appended and cannot be changed by this helper.
 */
function suggestRenames(documents,options={}){
  check(Array.isArray(documents)&&documents.length>0&&documents.length<=100,'Choose 1–100 documents.');
  keys(options,['pattern','find','replace','start','step'],'Rename options');
  const {pattern='{name}',find='',replace='',start=1,step=1}=options;
  check(typeof pattern==='string'&&pattern.trim().length>0&&pattern.length<=300,'Enter a filename pattern of at most 300 characters.');
  check(typeof find==='string'&&typeof replace==='string'&&find.length<=240&&replace.length<=240,'Find and replace must be bounded literal text.');
  check(Number.isSafeInteger(start)&&start>=0&&Number.isSafeInteger(step)&&step>=1&&start+(documents.length-1)*step<=999999999,'Sequence values must stay between 0 and 999999999.');
  check(!pattern.replace(/\{(?:name|number|seq(?::[1-9])?)\}/g,'').match(/[{}]/),'Use only {name}, {number}, {seq} or {seq:1} through {seq:9}.');
  return documents.map((d,i)=>{const {stem,extension}=filenameParts(d.name),changed=find?stem.split(find).join(replace):stem;
    const name=pattern.replace(/\{(name|number|seq(?::[1-9])?)\}/g,(_m,token)=>token==='name'?changed:token==='number'?String(d.number||''):String(start+i*step).padStart(Number(token.split(':')[1]||0),'0'))+extension;
    return {id:d.id,name:renameFilename(name)};
  });
}
/** Final-name collision analysis permits atomic swaps/cycles, not partial renames. */
function planDocumentRename(state,actorId,input){
  keys(input,['projectId','baseRevision','reason','items'],'Rename request');
  check(!state.projection?.filtered,'Rename planning requires the authoritative workspace.','FORBIDDEN');
  const user=state.users.find(u=>u.id===actorId);
  check(user?.active&&['admin','manager','author'].includes(user.role),'An active author or manager is required.','FORBIDDEN');
  check(input.baseRevision===state.revision,'The workspace changed. Validate these names again.','CONFLICT');
  check(typeof input.projectId==='string'&&state.projects.some(p=>p.id===input.projectId),'Choose an existing project.');
  check(typeof input.reason==='string'&&input.reason.trim().length>0&&input.reason.length<=500,'A rename reason of 1–500 characters is required.');
  check(Array.isArray(input.items)&&input.items.length>0&&input.items.length<=100,'Choose 1–100 documents to rename.');
  const seen=new Set();
  // All access gates run before returning source names or collision information.
  for(const item of input.items){keys(item,['id','versionId','folderId','expectedName','name'],'Rename item');check(typeof item.id==='string'&&!seen.has(item.id),'Choose each source document once.');seen.add(item.id);
    check(state.documents.some(d=>d.id===item.id&&!d.deletedAt)&&canAccess(state,actorId,'write','document',item.id),'Write access to every active source document is required.','FORBIDDEN');}
  const rows=input.items.map(item=>{
    const d=state.documents.find(d=>d.id===item.id);check(d.projectId===input.projectId,'Rename batches must belong to one project.');
    check(d.name===item.expectedName&&d.versions.at(-1).id===item.versionId&&(item.folderId||null)===(d.folderId||null),'A source filename, location or revision changed. Validate again.','CONFLICT');
    check(!d.legalHold,'A selected document is on legal hold.');check(d.state!=='Archived','Archived documents are read-only.');
    check(!d.checkedOutBy||d.checkedOutBy===actorId,'A selected document is checked out by another member.','LOCKED');
    const name=renameFilename(item.name);check(filenameParts(name).extension.toLowerCase()===filenameParts(d.name).extension.toLowerCase(),'Batch rename preserves each file extension. Use the document properties editor for deliberate format-name changes.');
    return {id:d.id,folderId:d.folderId,versionId:item.versionId,number:d.number,from:d.name,to:name,changed:d.name!==name};
  });
  const occupied=new Set(state.documents.filter(d=>!d.deletedAt&&d.projectId===input.projectId&&!seen.has(d.id)).map(d=>JSON.stringify([d.folderId||null,d.name.toLowerCase()])));
  for(const row of rows){const key=JSON.stringify([row.folderId||null,row.to.toLowerCase()]);check(!occupied.has(key),'A proposed filename conflicts with another document in its folder.');occupied.add(key);}
  check(rows.some(r=>r.changed),'No filenames would change.');
  return {projectId:input.projectId,reason:input.reason.trim(),rows};
}

return { RENAME_LIMITS, RenameError, renameFilename, filenameParts, suggestRenames, planDocumentRename };
})();

export const { RENAME_LIMITS, RenameError, renameFilename, filenameParts, suggestRenames, planDocumentRename } = __modules["packages/document-rename/index.js"];
