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

__modules["packages/document-control/index.js"] = (() => {
/** Governed metadata, numbering, revision baselines and review routes.
 * Pure ES module: no DOM, file access, network requests, or mutable singleton state.
 * Command authorization is performed by the core/access packages.
 */
class ControlError extends Error {
  constructor(message, code = 'VALIDATION') { super(message); this.name = 'ControlError'; this.code = code; }
}
const check = (test, message, code) => { if (!test) throw new ControlError(message, code); };
const text = (value, label, max = 200, optional = false) => {
  check(typeof value === 'string', `${label} must be text.`);
  const out = value.trim();
  check((optional || out.length > 0) && out.length <= max, `${label} must contain ${optional ? '0' : '1'}–${max} characters.`);
  return out;
};
const own = (object, key) => Object.hasOwn(object, key);
const plain = value => value && typeof value === 'object' && !Array.isArray(value) && [Object.prototype, null].includes(Object.getPrototypeOf(value));
const keyPattern = /^[a-z][a-z0-9_]{0,49}$/;
const unsafe = new Set(['__proto__', 'constructor', 'prototype']);
const METADATA_TYPES = ['text', 'number', 'integer', 'date', 'choice', 'boolean'];
const METADATA_FORMATS = ['any', 'code', 'uppercase', 'email'];
const CONTROL_LIMITS = Object.freeze({ fields: 40, batch: 100, baselineDocuments: 2000, baselines: 2000, stages: 8, assignees: 50 });
function calendarDate(value, label = 'Date') {
  if (!value) return '';
  const result = text(value, label, 10), date = new Date(result + 'T00:00:00.000Z');
  check(/^\d{4}-\d{2}-\d{2}$/.test(result) && !Number.isNaN(+date) && date.toISOString().slice(0, 10) === result, `${label} is not a valid calendar date.`);
  return result;
}
function fieldValue(field, value, { defaults = true } = {}) {
  check(value == null || ['string', 'number', 'boolean'].includes(typeof value), `${field.label} must be a scalar value.`);
  let out = value == null ? '' : String(value).trim();
  if (!out && defaults && own(field, 'defaultValue')) out = field.defaultValue;
  check(!field.required || out !== '', `${field.label} is required.`);
  if (!out) return '';
  check(out.length <= (field.maxLength ?? 500), `${field.label} exceeds its ${field.maxLength ?? 500}-character limit.`);
  if (['number', 'integer'].includes(field.type)) {
    check(/^[+-]?(?:\d+(?:\.\d*)?|\.\d+)(?:[eE][+-]?\d+)?$/.test(out) && Number.isFinite(Number(out)), `${field.label} must be a finite number.`);
    const n = Number(out);
    if (field.type === 'integer') check(Number.isSafeInteger(n), `${field.label} must be a safe integer.`);
    if (own(field, 'min')) check(n >= field.min, `${field.label} must be at least ${field.min}.`);
    if (own(field, 'max')) check(n <= field.max, `${field.label} must be at most ${field.max}.`);
  }
  if (field.type === 'date') calendarDate(out, field.label);
  if (field.type === 'boolean') check(['true', 'false'].includes(out), `${field.label} must be true or false.`);
  if (field.type === 'choice') check(field.options.includes(out), `${field.label} must use an allowed option.`);
  if (field.format === 'code') check(/^[A-Za-z0-9][A-Za-z0-9_.-]*$/.test(out), `${field.label} must be a code without spaces.`);
  if (field.format === 'uppercase') check(out === out.toUpperCase(), `${field.label} must be uppercase.`);
  if (field.format === 'email') check(/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(out), `${field.label} must be an email address.`);
  return out;
}
function normalizeFields(fields) {
  check(Array.isArray(fields) && fields.length <= CONTROL_LIMITS.fields, 'Up to 40 metadata fields are supported.');
  const seen = new Set();
  return fields.map(input => {
    check(plain(input), 'Invalid metadata field.');
    const key = text(input.key, 'Field key', 50);
    check(keyPattern.test(key) && !unsafe.has(key) && !seen.has(key), 'Field keys must be unique, safe lowercase identifiers.'); seen.add(key);
    check(METADATA_TYPES.includes(input.type), 'Unknown metadata field type.');
    const field = { key, label: text(input.label, 'Field label', 100), type: input.type, required: !!input.required };
    if (input.type === 'choice') {
      check(Array.isArray(input.options) && input.options.length > 0 && input.options.length <= 100, 'Choice fields need 1–100 options.');
      field.options = input.options.map(v => text(v, 'Choice option', 100));
      check(new Set(field.options).size === field.options.length, 'Choice options must be unique.');
    }
    if (own(input, 'maxLength')) { check(Number.isInteger(input.maxLength) && input.maxLength >= 1 && input.maxLength <= 500, 'Field length must be 1–500.'); field.maxLength = input.maxLength; }
    for (const bound of ['min', 'max']) if (own(input, bound)) {
      check(['number', 'integer'].includes(input.type) && Number.isFinite(input[bound]), 'Numeric limits require a numeric field and finite bounds.'); field[bound] = input[bound];
    }
    check(!own(field, 'min') || !own(field, 'max') || field.min <= field.max, 'Minimum must not exceed maximum.');
    if (own(input, 'format')) { check(METADATA_FORMATS.includes(input.format), 'Unknown field format.'); field.format = input.format; }
    if (own(input, 'defaultValue') && String(input.defaultValue) !== '') field.defaultValue = fieldValue({ ...field, required: false }, input.defaultValue, { defaults: false });
    return field;
  });
}
function validateMetadata(project, input = {}, options = {}) {
  check(plain(input), 'Metadata must be a plain object.');
  const result = {};
  for (const field of project.fields || []) result[field.key] = fieldValue(field, input[field.key], options);
  return result;
}
function metadataIssues(project, input = {}) {
  const issues = [];
  for (const field of project.fields || []) {
    try { fieldValue(field, input?.[field.key], { defaults: false }); }
    catch (error) { issues.push({ key: field.key, label: field.label, message: error.message }); }
  }
  return issues;
}
function normalizeNumbering(project, input, previous = null) {
  check(plain(input), 'Numbering configuration is required.');
  const pattern = text(input.pattern, 'Numbering pattern', 120);
  check(!/[\\/\x00-\x1f\x7f]/.test(pattern), 'Numbering patterns cannot contain path separators or control characters.');
  const tokens = [...pattern.matchAll(/\{([^{}]+)\}/g)].map(m => m[1]);
  check(!/[{}]/.test(pattern.replace(/\{[^{}]+\}/g, '')), 'Unbalanced numbering placeholder.');
  check(tokens.filter(t => /^seq:[1-9]$/.test(t)).length === 1, 'Include exactly one sequence placeholder, e.g. {seq:5}.');
  for (const token of tokens) check(token === 'project' || token === 'discipline' || /^seq:[1-9]$/.test(token) || token.startsWith('meta:') && project.fields.some(f => f.key === token.slice(5)), `Unknown numbering placeholder: {${token}}.`);
  const nextSequence = input.nextSequence ?? previous?.nextSequence ?? 1;
  check(Number.isSafeInteger(nextSequence) && nextSequence >= 1 && nextSequence <= 1000000000, 'Sequence must be an integer from 1 to 1000000000 (exhausted).');
  check(nextSequence >= (previous?.nextSequence ?? 1), 'Numbering sequences cannot be moved backwards.');
  check(typeof input.allowManual === 'boolean', 'Choose whether manual document numbers are allowed.');
  return { pattern, nextSequence, allowManual: input.allowManual };
}
function formatDocumentNumber(project, { discipline = 'General', metadata = {} } = {}, sequence = project.numbering?.nextSequence ?? 1) {
  const pattern = project.numbering?.pattern ?? '{project}-{seq:5}';
  const result = pattern.replace(/\{([^{}]+)\}/g, (_, token) => {
    if (token.startsWith('seq:')) return String(sequence).padStart(Number(token.slice(4)), '0');
    const value = token === 'project' ? project.code : token === 'discipline' ? discipline : metadata[token.slice(5)];
    const part = String(value ?? '').trim();
    check(part && !/[{}\\/\x00-\x1f\x7f]/.test(part), `Numbering value for {${token}} is missing or unsafe.`); return part;
  });
  check(result.length > 0 && result.length <= 100, 'The generated document number must fit in 100 characters.');
  return result;
}
function allocateDocumentNumber(state, project, payload, metadata) {
  const manual = String(payload.number ?? '').trim(), occupied = new Set(state.documents.filter(d => d.projectId === project.id).map(d => d.number.toUpperCase()));
  if (manual) {
    check(!project.numbering || project.numbering.allowManual, 'This project requires automatically assigned document numbers.');
    check(manual.length <= 100 && !/[\x00-\x1f\x7f]/.test(manual), 'Invalid document number.');
    check(!occupied.has(manual.toUpperCase()), 'Document number already exists.'); return manual;
  }
  let next = project.numbering?.nextSequence ?? (project.nextDocumentSequence ?? 1);
  for (let attempt = 0; attempt <= 10000; attempt++, next++) {
    check(next <= 999999999, 'Document number sequence is exhausted.');
    const number = formatDocumentNumber(project, { discipline: payload.discipline || 'General', metadata }, next);
    if (!occupied.has(number.toUpperCase())) {
      if (project.numbering) project.numbering.nextSequence = next + 1; else project.nextDocumentSequence = next + 1;
      return number;
    }
  }
  throw new ControlError('Too many occupied numbers. Move the next sequence forward in Document control.');
}
function documentMap(state) { return new Map(state.documents.map(d => [d.id, d])); }
function dependencyClosure(state, rootIds, projectId, { max = CONTROL_LIMITS.baselineDocuments } = {}) {
  check(Array.isArray(rootIds) && rootIds.length > 0 && rootIds.length <= max, `Choose 1–${max} documents.`);
  const lookup = documentMap(state), result = [], seen = new Set(), stack = [...rootIds].reverse();
  while (stack.length) {
    const id = stack.pop(); if (seen.has(id)) continue;
    const doc = lookup.get(id); check(doc && !doc.deletedAt && doc.projectId === projectId, 'A dependency is missing, recycled, or outside this project.');
    seen.add(id); result.push(id); check(result.length <= max, `Dependency closure exceeds ${max} documents.`);
    stack.push(...[...doc.references].reverse());
  }
  return result;
}
function documentPath(state, doc) {
  const folders = new Map(state.folders.map(f => [f.id, f])), path = [], seen = new Set(); let id = doc.folderId;
  while (id) { check(!seen.has(id), 'Folder cycle detected.'); seen.add(id); const f = folders.get(id); check(f, 'Folder is unavailable.'); path.unshift(f.name); id = f.parentId; }
  return [...path, doc.name].join('/');
}
function reviewContext(doc) {
  return { name: doc.name, title: doc.title, number: doc.number, description: doc.description, discipline: doc.discipline, metadata: structuredClone(doc.metadata), tags: [...doc.tags], dueDate: doc.dueDate, references: [...doc.references].sort() };
}
function canonical(value) {
  if (Array.isArray(value)) return '[' + value.map(canonical).join(',') + ']';
  if (value && typeof value === 'object') return '{' + Object.keys(value).sort().map(k => JSON.stringify(k) + ':' + canonical(value[k])).join(',') + '}';
  return JSON.stringify(value);
}
function snapshotDocument(state, doc) {
  const version = doc.versions.at(-1);
  return { documentId: doc.id, versionId: version.id, name: doc.name, number: doc.number, revision: version.label, blobId: version.blobId, hash: version.hash, size: version.size, mime: version.mime, context: reviewContext(doc), state: doc.state, path: documentPath(state, doc) };
}
function captureBaseline(state, payload, actorId, now, makeId) {
  const project = state.projects.find(p => p.id === payload.projectId); check(project, 'Project not found.', 'NOT_FOUND');
  check((state.baselines || []).length < CONTROL_LIMITS.baselines, 'Baseline collection limit reached.');
  check(typeof payload.includeReferences === 'boolean', 'Choose whether to include dependencies.');
  const roots = payload.documentIds;
  check(Array.isArray(roots) && roots.length > 0 && roots.length <= CONTROL_LIMITS.baselineDocuments && new Set(roots).size === roots.length, 'Choose a unique nonempty list of documents.');
  const ids = payload.includeReferences ? dependencyClosure(state, roots, project.id) : [...roots], lookup = documentMap(state);
  const records = ids.map(id => {
    const doc = lookup.get(id); check(doc && doc.projectId === project.id && !doc.deletedAt, 'Choose active documents in this project.');
    check(!doc.checkedOutBy, 'Release checkouts before freezing a baseline.'); return snapshotDocument(state, doc);
  });
  return { id: makeId('baseline'), projectId: project.id, name: text(payload.name, 'Baseline name'), description: text(payload.description || '', 'Description', 2000, true), createdBy: actorId, createdAt: now, workspaceRevision: state.revision, rootDocumentIds: [...roots], includeReferences: payload.includeReferences, documents: records };
}
function liveBaseline(state, baseline) {
  const lookup = documentMap(state);
  const ids = baseline.includeReferences ? (() => {
    // Recycled roots and dependencies are represented as removals, not fatal errors.
    const found = [], seen = new Set(), stack = [...baseline.rootDocumentIds].reverse();
    while (stack.length) { const id = stack.pop(); if (seen.has(id)) continue; seen.add(id); const d = lookup.get(id); if (!d || d.deletedAt || d.projectId !== baseline.projectId) continue; found.push(id); check(found.length <= CONTROL_LIMITS.baselineDocuments, 'Live closure exceeds baseline limit.'); stack.push(...[...d.references].reverse()); }
    return found;
  })() : baseline.rootDocumentIds.filter(id => lookup.has(id) && !lookup.get(id).deletedAt);
  return { name: 'Current workspace', projectId: baseline.projectId, documents: ids.map(id => snapshotDocument(state, lookup.get(id))) };
}
function compareBaselines(before, after) {
  check(before.projectId === after.projectId, 'Compare baselines in the same project.');
  const a = new Map(before.documents.map(d => [d.documentId, d])), b = new Map(after.documents.map(d => [d.documentId, d]));
  return [...new Set([...a.keys(), ...b.keys()])].map(documentId => {
    const left = a.get(documentId), right = b.get(documentId);
    const changedFields = left && right ? [...new Set([...Object.keys(left.context || {}), ...Object.keys(right.context || {})])].filter(k => canonical(left.context?.[k]) !== canonical(right.context?.[k])) : [];
    if (left && right && left.path !== right.path) changedFields.push('path');
    if (left && right && left.state !== right.state) changedFields.push('state');
    const contentChanged = !!left && !!right && left.hash !== right.hash, revisionChanged = !!left && !!right && left.versionId !== right.versionId;
    return { documentId, before: left || null, after: right || null, contentChanged, revisionChanged, changedFields, status: !left ? 'Added' : !right ? 'Removed' : contentChanged ? 'Content changed' : revisionChanged ? 'Revision changed' : changedFields.length ? 'Metadata changed' : 'Unchanged' };
  }).sort((a, b) => (a.after || a.before).number.localeCompare((b.after || b.before).number, undefined, { numeric: true }));
}
function uniqueIds(value, label, max = CONTROL_LIMITS.assignees) {
  check(Array.isArray(value) && value.length > 0 && value.length <= max && value.every(v => typeof v === 'string') && new Set(value).size === value.length, `${label} needs 1–${max} unique identifiers.`); return [...value];
}
function normalizeReviewStages(input, state, { template = false } = {}) {
  check(Array.isArray(input) && input.length > 0 && input.length <= CONTROL_LIMITS.stages, 'A review route needs 1–8 stages.');
  return input.map((s, i) => {
    check(plain(s), 'Invalid review stage.');
    const assignees = uniqueIds(s.assignees, 'Review stage');
    for (const id of assignees) { const u = state.users.find(u => u.id === id); check(u?.active && ['admin', 'manager', 'reviewer'].includes(u.role), 'Assign active reviewers, managers, or administrators.'); }
    const quorum = s.quorum ?? assignees.length;
    check(Number.isInteger(quorum) && quorum > 0 && quorum <= assignees.length, 'Stage quorum must be between one and the number of assignees.');
    return { id: `stage-${i + 1}`, name: text(s.name, 'Stage name', 100), assignees, quorum, dueDate: template ? '' : calendarDate(s.dueDate || '', 'Stage deadline') };
  });
}
function currentReviewStage(review) { return review.stages?.[review.currentStage] || null; }
function pendingReviewers(review) {
  if (review.status !== 'In review') return [];
  const stage = currentReviewStage(review), assignees = stage?.assignees || review.assignees;
  return assignees.filter(id => !review.decisions.some(d => d.by === id && (!stage || d.stageId === stage.id)));
}
function reviewDocumentCurrent(state, review, documentId) {
  const snap = review.documents.find(s => s.documentId === documentId), doc = state.documents.find(d => d.id === documentId);
  return !!snap && !!doc && !doc.deletedAt && !doc.checkedOutBy && doc.versions.at(-1).id === snap.versionId && (!snap.context || canonical(snap.context) === canonical(reviewContext(doc)));
}
function reviewIsCurrent(state, review) { return review.documents.every(s => reviewDocumentCurrent(state, review, s.documentId)); }
function recordStageDecision(review, payload, user, now) {
  const stage = currentReviewStage(review);
  check(stage && review.status === 'In review', 'This routed review is not open.');
  check(payload.stageId === stage.id, 'The active review stage changed. Reopen the review before deciding.', 'CONFLICT');
  check(stage.assignees.includes(user.id), 'Only an assigned reviewer in the active stage can decide.', 'FORBIDDEN');
  check(!review.decisions.some(d => d.stageId === stage.id && d.by === user.id), 'You already decided in this stage.');
  check(['Approved', 'Changes requested'].includes(payload.decision), 'Invalid review decision.');
  review.decisions.push({ by: user.id, stageId: stage.id, decision: payload.decision, comment: text(payload.comment, 'Decision comment', 4000), at: now });
  if (payload.decision === 'Changes requested') { stage.status = 'Changes requested'; stage.closedAt = now; review.status = 'Changes requested'; review.closedAt = now; return; }
  const approvals = review.decisions.filter(d => d.stageId === stage.id && d.decision === 'Approved').length;
  if (approvals >= stage.quorum) {
    stage.status = 'Approved'; stage.closedAt = now;
    if (review.currentStage + 1 === review.stages.length) { review.status = 'Approved'; review.closedAt = now; }
    else { review.currentStage++; const next = currentReviewStage(review); next.status = 'In review'; next.activatedAt = now; }
  }
}
function validSnapshotContext(context, projectId, docs) {
  check(plain(context) && plain(context.metadata), 'Missing or invalid pinned metadata context.');
  for(const key of ['name','number','title','description','discipline','dueDate']) check(typeof context[key] === 'string', 'Invalid pinned metadata text.');
  check(Array.isArray(context.tags) && context.tags.length <= 30 && context.tags.every(t=>typeof t==='string'), 'Invalid pinned tags.');
  check(Object.values(context.metadata).every(v=>typeof v==='string'), 'Invalid pinned metadata values.');
  check(Array.isArray(context.references) && context.references.length <= 1000 && new Set(context.references).size===context.references.length && context.references.every(id=>docs.get(id)?.projectId===projectId), 'Invalid pinned references.');
  calendarDate(context.dueDate);
}
/** Validation runs on commands and authoritative backup imports. Legacy collections are optional. */
function validateControlState(state) {
  for (const project of state.projects) {
    normalizeFields(project.fields);
    if (project.numbering) normalizeNumbering(project, project.numbering);
    if (project.nextDocumentSequence !== undefined) check(Number.isSafeInteger(project.nextDocumentSequence) && project.nextDocumentSequence > 0, 'Invalid document sequence.');
  }
  const projects = new Set(state.projects.map(p => p.id)), users = new Set(state.users.map(u => u.id)), docs = documentMap(state);
  for (const collection of ['baselines', 'reviewTemplates']) {
    const items = state[collection] || []; check(Array.isArray(items) && items.length <= 2000, `Invalid ${collection} collection.`); const seen = new Set();
    for (const item of items) { check(item && typeof item.id === 'string' && item.id.length <= 120 && !seen.has(item.id) && projects.has(item.projectId) && users.has(item.createdBy), `Invalid ${collection} identity.`); seen.add(item.id); text(item.name, 'Name'); }
  }
  for (const baseline of state.baselines || []) {
    check(Number.isSafeInteger(baseline.workspaceRevision) && baseline.workspaceRevision >= 0 && baseline.workspaceRevision <= state.revision, 'Invalid baseline source revision.');
    uniqueIds(baseline.rootDocumentIds, 'Baseline roots', CONTROL_LIMITS.baselineDocuments);
    check(typeof baseline.includeReferences === 'boolean' && Array.isArray(baseline.documents) && baseline.documents.length > 0 && baseline.documents.length <= CONTROL_LIMITS.baselineDocuments, 'Invalid baseline contents.');
    const ids = new Set();
    for (const s of baseline.documents) {
      check(!ids.has(s.documentId), 'Duplicate baseline document.'); ids.add(s.documentId);
      validSnapshotContext(s.context,baseline.projectId,docs);
      const d = docs.get(s.documentId), v = d?.versions.find(v => v.id === s.versionId);
      check(d?.projectId === baseline.projectId && v && v.hash === s.hash && v.blobId === s.blobId && v.size === s.size && v.label === s.revision, 'Broken baseline revision.');
      check(typeof s.name === 'string' && typeof s.number === 'string' && typeof s.path === 'string' && plain(s.context) && plain(s.context.metadata) && Array.isArray(s.context.references) && s.context.references.every(id => docs.get(id)?.projectId === baseline.projectId), 'Invalid baseline metadata snapshot.');
    }
    check(baseline.rootDocumentIds.every(id => ids.has(id)), 'Missing baseline root.');
    if (baseline.includeReferences) check(baseline.documents.every(s => s.context.references.every(id => ids.has(id))), 'Baseline dependency closure is incomplete.');
  }
  for (const template of state.reviewTemplates || []) {
    check(Array.isArray(template.stages) && template.stages.length > 0 && template.stages.length <= CONTROL_LIMITS.stages && typeof template.separationOfDuties === 'boolean', 'Invalid review template.');
    for (const s of template.stages) { uniqueIds(s.assignees, 'Stage assignees'); check(s.assignees.every(id => users.has(id)) && Number.isInteger(s.quorum) && s.quorum > 0 && s.quorum <= s.assignees.length && typeof s.name === 'string', 'Invalid template stage.'); }
  }
  for (const r of state.reviews) if (r.stages) {
    check(Array.isArray(r.stages) && r.stages.length > 0 && r.stages.length <= CONTROL_LIMITS.stages && Number.isInteger(r.currentStage) && r.currentStage >= 0 && r.currentStage < r.stages.length && typeof r.separationOfDuties === 'boolean', 'Invalid review route.');
    for(const record of r.documents)validSnapshotContext(record.context,r.projectId,docs);
    check(Array.isArray(r.reassignments) && r.reassignments.every(a=>a&&users.has(a.by)&&users.has(a.from)&&users.has(a.to)&&r.stages.some(s=>s.id===a.stageId)&&typeof a.reason==='string'&&a.reason.trim().length>0&&typeof a.at==='string'),'Invalid review reassignment history.');
    const stageIds = new Set(), assigned = new Set(); let lastDecisionIndex = -1;
    for (let i = 0; i < r.stages.length; i++) {
      const stage = r.stages[i]; check(typeof stage.id === 'string' && !stageIds.has(stage.id), 'Duplicate review stage.'); stageIds.add(stage.id);
      uniqueIds(stage.assignees, 'Stage assignees'); stage.assignees.forEach(id => assigned.add(id));
      check(stage.assignees.every(id => users.has(id)) && Number.isInteger(stage.quorum) && stage.quorum >= 1 && stage.quorum <= stage.assignees.length && typeof stage.name === 'string', 'Invalid stage configuration.');
      calendarDate(stage.dueDate);
      const decisions = r.decisions.filter(d => d.stageId === stage.id), voted = new Set(); let approvals = 0, rejected = false;
      for (const d of decisions) { check(!voted.has(d.by) && stage.assignees.includes(d.by) && !rejected && approvals < stage.quorum, 'Invalid or duplicate stage decision.'); voted.add(d.by); if (d.decision === 'Approved') approvals++; else rejected = true; }
      const expected = rejected ? 'Changes requested' : approvals >= stage.quorum ? 'Approved' : i === r.currentStage ? 'In review' : 'Pending';
      check(stage.status === expected && (i >= r.currentStage || stage.status === 'Approved') && (i <= r.currentStage || decisions.length === 0), 'Inconsistent review stage progression.');
    }
    for (const d of r.decisions) { const i = r.stages.findIndex(s => s.id === d.stageId); check(i >= lastDecisionIndex && i >= 0, 'Out-of-order stage decision.'); lastDecisionIndex = i; }
    check(r.assignees.length === assigned.size && r.assignees.every(id => assigned.has(id)), 'Review assignees do not match its stages.');
    if (r.status === 'Approved') check(r.stages.every(s => s.status === 'Approved'), 'Unfinished stages cannot approve a review.');
    if (r.status === 'In review') check(currentReviewStage(r).status === 'In review', 'Invalid active review stage.');
    if (r.status === 'Changes requested') check(currentReviewStage(r).status === 'Changes requested', 'Missing rejected stage.');
  }
  return true;
}

return { ControlError, METADATA_TYPES, METADATA_FORMATS, CONTROL_LIMITS, calendarDate, normalizeFields, validateMetadata, metadataIssues, normalizeNumbering, formatDocumentNumber, allocateDocumentNumber, dependencyClosure, documentPath, reviewContext, canonical, snapshotDocument, captureBaseline, liveBaseline, compareBaselines, normalizeReviewStages, currentReviewStage, pendingReviewers, reviewDocumentCurrent, reviewIsCurrent, recordStageDecision, validateControlState };
})();

__modules["packages/document-copy/index.js"] = (() => {
/** Controlled copy planning, independent of persistence and UI.
 * Existing revisions are selected by ID; callers cannot supply a content hash.
 * New files inherit DESTINATION access. Cross-project copying requires share.
 */
const { canAccess } = __modules["packages/access/index.js"];
const { validateMetadata } = __modules["packages/document-control/index.js"];
const COPY_LIMITS = Object.freeze({ documents: 100, reason: 500, filename: 240, fileBytes: 50 * 1024 * 1024, batchBytes: 250 * 1024 * 1024 });
class DocumentCopyError extends Error {
  constructor(message, code = 'VALIDATION') { super(message); this.name = 'DocumentCopyError'; this.code = code; }
}
const check = (condition, message, code) => { if (!condition) throw new DocumentCopyError(message, code); };
const plain = v => v && typeof v === 'object' && !Array.isArray(v) && [Object.prototype, null].includes(Object.getPrototypeOf(v));
const allowedKeys = (value, keys, label) => {
  check(plain(value) && Object.keys(value).every(k => keys.includes(k)), `${label} contains unsupported fields.`);
};
function text(value, label, max, optional = false) {
  check(typeof value === 'string', `${label} must be text.`);
  const v = value.trim();
  check((optional || v.length > 0) && v.length <= max, `${label} must contain ${optional ? '0' : '1'}–${max} characters.`);
  return v;
}
function copyFilename(value) {
  const name = text(value, 'Destination filename', COPY_LIMITS.filename);
  check(!/[\\/\x00-\x1f]/.test(name) && !['.', '..'].includes(name), 'Invalid destination filename.');
  return name;
}
/** Non-destructive suggestions only: the real transaction rechecks every name. */
function suggestCopyNames(names, occupied = []) {
  check(Array.isArray(names) && names.length <= COPY_LIMITS.documents && Array.isArray(occupied), 'Invalid filename list.');
  const used = new Set(occupied.map(n => String(n).toLocaleLowerCase()));
  return names.map(input => {
    const name = copyFilename(input), at = name.lastIndexOf('.');
    const ext = at > 0 ? name.slice(at) : '', stem = at > 0 ? name.slice(0, at) : name;
    let candidate = name, count = 0;
    while (used.has(candidate.toLocaleLowerCase())) {
      count++; check(count <= 10000, 'Too many similarly named files. Choose an explicit name.');
      const suffix = count === 1 ? ' - copy' : ` - copy (${count})`;
      check(ext.length + suffix.length < COPY_LIMITS.filename, 'Filename extension is too long for a suggested copy.');
      candidate = stem.slice(0, COPY_LIMITS.filename - ext.length - suffix.length) + suffix + ext;
    }
    used.add(candidate.toLocaleLowerCase()); return candidate;
  });
}
/** Authoritative-state only. Never run a command against a read projection. */
function planDocumentCopy(state, actorId, input) {
  allowedKeys(input, ['projectId','folderId','baseRevision','reason','copyMetadata','copyTags','referenceMode','items'], 'Copy request');
  check(!state.projection?.filtered, 'Copy planning requires the authoritative workspace.', 'FORBIDDEN');
  const user = state.users.find(u => u.id === actorId);
  check(user?.active && ['admin','manager','author'].includes(user.role), 'An active author or manager is required.', 'FORBIDDEN');
  check(input.baseRevision === state.revision, 'The workspace changed. Validate this copy again.', 'CONFLICT');
  check(typeof input.projectId === 'string' && (input.folderId == null || typeof input.folderId === 'string'), 'Invalid copy destination.');
  const project = state.projects.find(p => p.id === input.projectId), folderId = input.folderId || null;
  check(project && canAccess(state,actorId,'write',folderId ? 'folder' : 'project',folderId || project.id), 'Write access to the destination is required.', 'FORBIDDEN');
  check(!folderId || state.folders.some(f => f.id === folderId && f.projectId === project.id), 'Destination folder belongs to another project.');
  const reason = text(input.reason, 'Copy reason', COPY_LIMITS.reason);
  check(typeof input.copyMetadata === 'boolean' && typeof input.copyTags === 'boolean', 'Choose metadata and tag copy settings.');
  check(['none','selected'].includes(input.referenceMode), 'Choose no references or remapped selected references.');
  check(Array.isArray(input.items) && input.items.length > 0 && input.items.length <= COPY_LIMITS.documents, 'Choose 1–100 documents to copy.');
  const seen = new Set(), items = [];
  // Validate access to every source before exposing any source details.
  for (const item of input.items) {
    allowedKeys(item, ['id','versionId','name','title','number','metadata'], 'Copy item');
    check(typeof item.id === 'string' && !seen.has(item.id), 'Choose each source document once.'); seen.add(item.id);
    const source = state.documents.find(d => d.id === item.id && !d.deletedAt);
    check(source && canAccess(state,actorId,'download','document',item.id), 'Download access to every active source is required.', 'FORBIDDEN');
    if (source.projectId !== project.id) check(canAccess(state,actorId,'share','document',item.id), 'Cross-project copying requires share permission on every source.', 'FORBIDDEN');
  }
  for (const item of input.items) {
    const source = state.documents.find(d => d.id === item.id), version = source.versions.find(v => v.id === item.versionId);
    check(version, 'An exact stored source revision is required.', 'CONFLICT');
    const metadata = {};
    if (input.copyMetadata) for (const field of project.fields) if (Object.hasOwn(source.metadata,field.key)) metadata[field.key] = source.metadata[field.key];
    if (item.metadata !== undefined) {
      check(plain(item.metadata) && Object.keys(item.metadata).every(key => project.fields.some(f => f.key === key)), 'Metadata overrides must use destination field keys.');
      Object.assign(metadata,item.metadata);
    }
    const normalizedMetadata = validateMetadata(project,metadata);
    const destination = { projectId:project.id, folderId, name:copyFilename(item.name),
      title:item.title === undefined ? source.title : text(item.title,'Description / title',1000,true),
      number:item.number === undefined ? '' : text(item.number,'Document number',100,true),
      description:source.description, discipline:source.discipline, metadata:normalizedMetadata,
      tags:input.copyTags ? [...source.tags] : [], dueDate:'', revision:'P01',
      comment:'New controlled copy. ' + reason,
      file:{hash:version.hash,blobId:version.blobId,size:version.size,mime:version.mime} };
    items.push({sourceId:source.id,sourceVersionId:version.id,sourceName:source.name,sourceRevision:version.label,
      sourceCheckedOut:!!source.checkedOutBy, historical:source.versions.at(-1).id !== version.id,
      omittedMetadata:input.copyMetadata ? Object.keys(source.metadata).filter(k => !project.fields.some(f => f.key === k)) : [],
      references:input.referenceMode === 'selected' ? source.references.filter(id => seen.has(id)) : [],
      omittedReferences:input.referenceMode === 'selected' ? source.references.filter(id => !seen.has(id)).length : source.references.length,
      destination});
  }
  const unique = new Map();
  for(const {destination:{file}} of items){
    check(/^[a-f0-9]{64}$/.test(file.hash) && file.blobId===file.hash && Number.isSafeInteger(file.size) && file.size>=0 && file.size<=COPY_LIMITS.fileBytes, 'Invalid or oversized source file descriptor.', 'INTEGRITY');
    check(!unique.has(file.hash)||unique.get(file.hash)===file.size,'Inconsistent source content descriptors.','INTEGRITY');unique.set(file.hash,file.size);
  }
  check([...unique.values()].reduce((n,v)=>n+v,0)<=COPY_LIMITS.batchBytes,'Choose at most 250 MiB of unique source content per copy batch.');
  return {projectId:project.id,folderId,reason,referenceMode:input.referenceMode,items};
}
/** Hash verification is sequential and bounded by 50 MiB per file / 250 MiB per batch.
 * The repository transaction still has to compare the preview/workspace revision.
 */
async function verifyCopyContent(state, actorId, input, getBlob) {
  const plan = planDocumentCopy(state,actorId,input), verified = new Map();
  for (const item of plan.items) {
    const file = item.destination.file;
    if (verified.has(file.hash)) { check(verified.get(file.hash) === file.size,'Inconsistent source content descriptors.','INTEGRITY'); continue; }
    let blob;try{blob=await getBlob(file.blobId);}catch{throw new DocumentCopyError('A source file could not be read. No copies were created.','INTEGRITY');}
    check(blob instanceof Blob && blob.size === file.size, 'A source file is missing or has an incorrect size. No copies were created.', 'INTEGRITY');
    const digest = new Uint8Array(await crypto.subtle.digest('SHA-256', await blob.arrayBuffer()));
    const hash = Array.from(digest,b => b.toString(16).padStart(2,'0')).join('');
    check(hash === file.hash, 'A source file failed its SHA-256 integrity check. No copies were created.', 'INTEGRITY');
    verified.set(hash,file.size);
  }
  return {files:verified.size,bytes:[...verified.values()].reduce((n,v) => n+v,0)};
}

return { COPY_LIMITS, DocumentCopyError, copyFilename, suggestCopyNames, planDocumentCopy, verifyCopyContent };
})();

__modules["packages/document-sets/index.js"] = (() => {
const { createAccessContext } = __modules["packages/access/index.js"];
/** Ordered, reference-only document sets. A fixed member pins a version, never a copy.
 * Legacy {documentIds} sets remain live. No Bentley SDK or native set format is used.
 */
const SET_LIMITS = Object.freeze({members:1000,setsPerProject:2000});
class SetError extends Error { constructor(message,code='VALIDATION'){super(message);this.name='SetError';this.code=code;} }
const check=(value,message,code)=>{if(!value)throw new SetError(message,code);};
const text=(value,label,max,empty=false)=>{check(typeof value==='string'&&value.length<=max,`${label} must be text of at most ${max} characters.`);value=value.trim();check(empty||!!value,`${label} is required.`);return value;};
const setVersion = set => set.version ?? 1;
function setMembers(set){return (set.members || set.documentIds.map(documentId=>({documentId,versionId:null}))).map(m=>({...m}));}
function permission(state,actor,perm,scope,id){
 if(state.projection?.filtered){check(state.projection.userId===undefined||state.projection.userId===actor,'This projection belongs to another account.','FORBIDDEN');if(scope==='project')return state.projection.projectPermissions?.[id]?.includes(perm)||false;return state.documents.find(d=>d.id===id)?.permissions?.includes(perm)||false;}
 return createAccessContext(state,actor).can(perm,scope,id);
}
function canReadSet(state,actor,set){return !!set&&permission(state,actor,'read','project',set.projectId)&&set.documentIds.every(id=>permission(state,actor,'read','document',id));}
function visibleDocumentSets(state,actor,projectId=''){return state.sets.filter(set=>(!projectId||set.projectId===projectId)&&canReadSet(state,actor,set));}
function normalizeMembers(state,projectId,value,{allowRecycled=false}={}){
 check(Array.isArray(value)&&value.length<=SET_LIMITS.members,`A set supports at most ${SET_LIMITS.members} members.`);const seen=new Set();
 return value.map(m=>{check(m&&typeof m==='object'&&!Array.isArray(m)&&typeof m.documentId==='string'&&!seen.has(m.documentId),'Set members must be distinct document identifiers.');seen.add(m.documentId);const d=state.documents.find(d=>d.id===m.documentId);check(d&&d.projectId===projectId&&(allowRecycled||!d.deletedAt),'Choose readable, active documents in this project.');check(m.versionId===null||typeof m.versionId==='string'&&d.versions.some(v=>v.id===m.versionId),'Choose Latest or an existing document revision.');return {documentId:d.id,versionId:m.versionId};});
}
function pathFor(state,d){const parts=[d.name],seen=new Set();for(let id=d.folderId;id;){check(!seen.has(id),'Invalid folder graph.');seen.add(id);const f=state.folders.find(f=>f.id===id);check(f,'Folder no longer exists.');parts.unshift(f.name);id=f.parentId;}return parts.join('/');}
/** Returns the authoritative member order with current rights. Never trusts caller snapshots. */
function resolveDocumentSet(state,actor,id,{permission:required='read',allowRecycled=false,expectedVersion}={}){
 const set=state.sets.find(s=>s.id===id);check(canReadSet(state,actor,set),'Document set is unavailable.','NOT_FOUND');
 if(expectedVersion!==undefined)check(expectedVersion===setVersion(set),'The document set changed. Reopen it before continuing.','CONFLICT');
 check(['read','download','review','share'].includes(required),'Unsupported set permission.');
 const members=setMembers(set),records=members.map((m,index)=>{
  check(permission(state,actor,required,'document',m.documentId),'Permission is required for every set member.','FORBIDDEN');const d=state.documents.find(d=>d.id===m.documentId);
  check(allowRecycled||!d.deletedAt,'The set contains a recycled document. Restore it or edit the set.');
  const latest=d.versions.at(-1),v=m.versionId?d.versions.find(v=>v.id===m.versionId):latest;check(v,'A pinned set revision is missing.','INTEGRITY');
  const frozen=set.locked?set.frozenDocuments?.[index]:null;if(set.locked)check(frozen&&frozen.documentId===d.id&&frozen.versionId===v.id,'Broken frozen set member.','INTEGRITY');
  return {...(frozen?structuredClone(frozen):{documentId:d.id,versionId:v.id,name:d.name,number:d.number,title:d.title,path:pathFor(state,d),revision:v.label,blobId:v.blobId,hash:v.hash,size:v.size}),binding:m.versionId?'fixed':'latest',latestVersionId:latest.id,latestRevision:latest.label,newerRevision:latest.id!==v.id,recycled:!!d.deletedAt};
 });
 return {set:structuredClone(set),version:setVersion(set),records,totalBytes:records.reduce((n,r)=>n+r.size,0),newerCount:records.filter(r=>r.newerRevision).length};
}
function snapshotDocumentSet(state,actor,payload,{currentOnly=false}={}){
 const resolved=resolveDocumentSet(state,actor,payload.setId,{expectedVersion:payload.expectedSetVersion});check(Number.isSafeInteger(payload.expectedSetVersion),'A set-version precondition is required.');check(resolved.set.projectId===payload.projectId,'The set belongs to another project.');check(resolved.records.length,'Choose a nonempty document set.');
 if(currentOnly)check(!resolved.records.some(r=>r.newerRevision),'Reviews require current revisions. This set pins an older revision; update its binding first.','CONFLICT');
 return resolved.records.map(({binding,latestVersionId,latestRevision,newerRevision,recycled,...r})=>r);
}
function applyDocumentSetCommand(state,command,user,now){
 const {type,payload:p={}}=command;if(!type.startsWith('set.'))return null;
 check(['admin','manager','author'].includes(user.role),'Your role cannot modify document sets.','FORBIDDEN');
 const set=type==='set.create'?null:state.sets.find(s=>s.id===p.id);if(type!=='set.create'){check(canReadSet(state,user.id,set),'Document set is unavailable.','NOT_FOUND');check(p.expectedVersion===setVersion(set),'The document set changed, or a version precondition is missing.','CONFLICT');}
 const projectId=set?.projectId||p.projectId;check(state.projects.some(pr=>pr.id===projectId),'Project is unavailable.');
 const adminAction=['set.lock','set.unlock'].includes(type);check(permission(state,user.id,adminAction?'manage':'write','project',projectId),'Project permission is required.','FORBIDDEN');
 if(adminAction)check(['admin','manager'].includes(user.role),'Only a project manager can lock or unlock sets.','FORBIDDEN');
 if(set?.locked&&!['set.unlock'].includes(type))throw new SetError('This set is locked. A manager must explicitly unlock it.','LOCKED');
 let targetId=set?.id,summary,result=null;
 if(type==='set.create'||type==='set.update'){
  const name=text(p.name??set?.name,'Set name',200),description=text(p.description??set?.description??'','Description',2000,true);
  const incoming=p.members??('documentIds'in p?p.documentIds?.map?.(documentId=>({documentId,versionId:null})):set?setMembers(set):[]);
  const members=normalizeMembers(state,projectId,incoming);for(const m of members)check(permission(state,user.id,'read','document',m.documentId),'Set members must be readable.','FORBIDDEN');
  check(!state.sets.some(s=>s.id!==set?.id&&s.projectId===projectId&&s.name.toLocaleLowerCase()===name.toLocaleLowerCase()),'A set with this name already exists in the project.');
  if(type==='set.create'){
   check(state.sets.filter(s=>s.projectId===projectId).length<SET_LIMITS.setsPerProject,'Project set limit reached.');
   const item={id:`set-${crypto.randomUUID()}`,projectId,name,description,members,documentIds:members.map(m=>m.documentId),version:1,locked:false,createdBy:user.id,createdAt:now,modifiedBy:user.id,modifiedAt:now};state.sets.push(item);targetId=result=item.id;summary=`Created document set ${name}`;
  }else{Object.assign(set,{name,description,members,documentIds:members.map(m=>m.documentId)});summary=`Updated document set ${name}`;}
 }else if(type==='set.lock'){
  const reason=text(p.reason,'Lock reason',1000),resolved=resolveDocumentSet(state,user.id,set.id);check(resolved.records.length,'An empty set cannot be locked.');
  for(const m of resolved.records)check(!state.documents.find(d=>d.id===m.documentId).checkedOutBy,'Check in or release every set member before locking.','LOCKED');
  set.members=resolved.records.map(r=>({documentId:r.documentId,versionId:r.versionId}));set.documentIds=set.members.map(m=>m.documentId);
  set.frozenDocuments=resolved.records.map(({binding,latestVersionId,latestRevision,newerRevision,recycled,...r})=>r);
  Object.assign(set,{locked:true,lockedAt:now,lockedBy:user.id,lockReason:reason});summary=`Locked document set ${set.name} · ${reason}`;
 }else if(type==='set.unlock'){
  check(set.locked,'This set is not locked.');const reason=text(p.reason,'Unlock reason',1000);set.locked=false;delete set.frozenDocuments;delete set.lockedAt;delete set.lockedBy;delete set.lockReason;summary=`Unlocked document set ${set.name} · ${reason}; fixed bindings retained`;
 }else if(type==='set.delete'){state.sets=state.sets.filter(s=>s.id!==set.id);summary=`Deleted document set ${set.name} (original documents retained)`;}
 else throw new SetError('Unsupported document set command.');
 if(set&&type!=='set.delete'){set.version=setVersion(set)+1;set.modifiedAt=now;set.modifiedBy=user.id;}
 return {targetId,summary,result};
}
function validateDocumentSets(state){
 for(const set of state.sets){
  check(state.projects.some(p=>p.id===set.projectId),'Invalid document set project.');text(set.name,'Set name',200);text(set.description??'','Description',2000,true);
  check(Array.isArray(set.documentIds)&&set.documentIds.length<=SET_LIMITS.members&&new Set(set.documentIds).size===set.documentIds.length,'Invalid set document identifiers.');
  const normalized=normalizeMembers(state,set.projectId,setMembers(set),{allowRecycled:true});
  if(set.members!==undefined){check(Array.isArray(set.members)&&set.members.length===normalized.length&&set.members.every((m,i)=>Object.keys(m).length===2&&m.documentId===normalized[i].documentId&&m.versionId===normalized[i].versionId),'Invalid set bindings.');check(JSON.stringify(set.documentIds)===JSON.stringify(normalized.map(m=>m.documentId)),'Set membership representations disagree.');}
  if(set.version!==undefined)check(Number.isSafeInteger(set.version)&&set.version>0,'Invalid set version.');if(set.locked!==undefined)check(typeof set.locked==='boolean','Invalid set lock.');
  if(set.locked){check(normalized.length&&normalized.every(m=>m.versionId)&&Array.isArray(set.frozenDocuments)&&set.frozenDocuments.length===normalized.length,'A locked set requires frozen members.');text(set.lockReason,'Lock reason',1000);check(state.users.some(u=>u.id===set.lockedBy)&&Number.isFinite(Date.parse(set.lockedAt)),'Invalid set lock evidence.');
   for(let i=0;i<normalized.length;i++){const m=normalized[i],r=set.frozenDocuments[i],d=state.documents.find(d=>d.id===m.documentId),v=d.versions.find(v=>v.id===m.versionId);check(r&&r.documentId===m.documentId&&r.versionId===v.id&&r.blobId===v.blobId&&r.hash===v.hash&&r.size===v.size&&r.revision===v.label,'Broken frozen set revision.');text(r.name,'Frozen filename',260);text(r.path,'Frozen path',10000);text(r.number,'Frozen number',200,true);}
  }else check(!set.frozenDocuments,'An unlocked set cannot hold frozen descriptors.');
 }
 return true;
}

return { SET_LIMITS, SetError, setVersion, setMembers, canReadSet, visibleDocumentSets, resolveDocumentSet, snapshotDocumentSet, applyDocumentSetCommand, validateDocumentSets };
})();

__modules["packages/explorer/index.js"] = (() => {
const { canAccess, createAccessContext, projectWorkspace } = __modules["packages/access/index.js"];
/** Framework-independent Explorer views, safe queries, selection and navigation.
 * Queries are declarative metadata queries, never code or regular expressions.
 * Stored views and shortcuts do not confer access to their results.
 */
const fail=(message,code='VALIDATION')=>{const e=new Error(message);e.code=code;throw e;};
const check=(ok,message,code)=>{if(!ok)fail(message,code);};
const text=(v,max,label='Text')=>{check(typeof v==='string'&&v.length<=max&&!/[\x00-\x08\x0b\x0c\x0e-\x1f]/.test(v),`${label} is invalid or too long.`);return v.trim();};
const clone=x=>structuredClone(x);
const isoDate=value=>{if(typeof value!=='string'||!/^\d{4}-\d{2}-\d{2}(?:T\d{2}:\d{2}:\d{2}(?:\.\d{3})?Z)?$/.test(value)||Number.isNaN(Date.parse(value)))return false;return new Date(value).toISOString().slice(0,10)===value.slice(0,10);};

const EXPLORER_LIMITS=Object.freeze({views:2000,viewsPerUser:100,bookmarks:10000,bookmarksPerUser:200,filters:20,columns:30,pageSize:500,batch:100});
const EXPLORER_COLUMNS=Object.freeze([
 {key:'name',label:'File name',width:250},{key:'number',label:'Document number',width:170},
 {key:'title',label:'Description',width:250},{key:'state',label:'Workflow state',width:160},
 {key:'revision',label:'Version',width:90},{key:'discipline',label:'Discipline',width:130},
 {key:'checkedOutBy',label:'Checked out by',width:150},{key:'modifiedAt',label:'Modified',width:150},
 {key:'modifiedBy',label:'Modified by',width:140},{key:'filetype',label:'Type',width:85},
 {key:'size',label:'Size (bytes)',width:110},{key:'folder',label:'Folder',width:220},
 {key:'dueDate',label:'Due date',width:130},{key:'tags',label:'Tags',width:160}
]);
const keys=new Set(EXPLORER_COLUMNS.map(c=>c.key));
const validKey=k=>typeof k==='string'&&(keys.has(k)||/^metadata\.[a-z][a-z0-9_]{0,59}$/.test(k)&&!['constructor','prototype','__proto__'].includes(k.slice(9)));
const FILTER_OPERATORS=Object.freeze(['contains','notContains','eq','ne','startsWith','empty','notEmpty','gt','gte','lt','lte']);
function explorerColumns(project){return [...EXPLORER_COLUMNS.map(clone),...(project?.fields||[]).map(f=>({key:`metadata.${f.key}`,label:f.label,width:150,type:f.type}))];}
function defaultExplorerView(projectId='',folderId=null){return {projectId,folderId,includeSubfolders:true,rootOnly:false,query:'',match:'all',filters:[],columns:['name','number','state','revision','discipline','modifiedAt'],widths:{},sort:[{key:'name',direction:'asc'}],groupBy:'',density:'compact',pageSize:100,columnFilters:{},quickFilters:{state:'',discipline:''}};}
function normalizeExplorerView(input={}){
 check(input&&typeof input==='object'&&!Array.isArray(input),'Invalid Explorer view.');
 const v={...defaultExplorerView(),...input};
 const projectId=text(v.projectId,120,'Project identifier'),folderId=v.folderId?text(v.folderId,120,'Folder identifier'):null;
 check(typeof v.includeSubfolders==='boolean'&&typeof v.rootOnly==='boolean','Choose a folder traversal mode.');
 check(['all','any'].includes(v.match),'Invalid filter match mode.');
 check(Array.isArray(v.filters)&&v.filters.length<=EXPLORER_LIMITS.filters,'A view supports at most 20 conditions.');
 const filters=v.filters.map(f=>{
  check(f&&validKey(f.key)&&FILTER_OPERATORS.includes(f.op),'Invalid Explorer condition.');
  if(['empty','notEmpty'].includes(f.op))return {key:f.key,op:f.op};
  check(['string','number','boolean'].includes(typeof f.value)&&!(typeof f.value==='number'&&!Number.isFinite(f.value)),'A condition needs a finite literal value.');
  if(typeof f.value==='string')text(f.value,500,'Condition value');
  if(['gt','gte','lt','lte'].includes(f.op))check(String(f.value).trim()!==''&&(Number.isFinite(Number(f.value))||isoDate(f.value)),'Range filters need a number or ISO date.');
  return {key:f.key,op:f.op,value:f.value};
 });
 check(Array.isArray(v.columns)&&v.columns.length>0&&v.columns.length<=EXPLORER_LIMITS.columns&&v.columns.every(validKey)&&new Set(v.columns).size===v.columns.length,'Choose 1–30 distinct columns.');
 check(v.columns.includes('name'),'The file-name column is required.');
 check(v.widths&&typeof v.widths==='object'&&!Array.isArray(v.widths)&&Object.keys(v.widths).length<=100,'Invalid column widths.');
 const widths={};for(const[k,width]of Object.entries(v.widths)){check(validKey(k)&&Number.isFinite(width)&&width>=64&&width<=900,'Column widths must be 64–900 pixels.');widths[k]=Math.round(width);}
 check(Array.isArray(v.sort)&&v.sort.length>0&&v.sort.length<=3&&v.sort.every(s=>validKey(s.key)&&['asc','desc'].includes(s.direction))&&new Set(v.sort.map(s=>s.key)).size===v.sort.length,'Choose 1–3 distinct sort columns.');
 check(!v.groupBy||validKey(v.groupBy),'Invalid grouping column.');
 check(['compact','standard','comfortable'].includes(v.density),'Invalid row density.');
 check([50,100,250,500].includes(v.pageSize),'Choose 50, 100, 250 or 500 rows per page.');
 check(v.columnFilters&&typeof v.columnFilters==='object'&&!Array.isArray(v.columnFilters)&&Object.keys(v.columnFilters).length<=30,'Invalid saved column filters.');const columnFilters={};for(const [key,value] of Object.entries(v.columnFilters)){check(validKey(key),'Invalid column filter.');columnFilters[key]=text(value,500,'Column filter');}
 check(v.quickFilters&&typeof v.quickFilters==='object'&&!Array.isArray(v.quickFilters)&&Object.keys(v.quickFilters).every(k=>['state','discipline'].includes(k)),'Invalid quick filters.');const quickFilters={state:text(v.quickFilters.state??'',100,'State filter'),discipline:text(v.quickFilters.discipline??'',100,'Discipline filter')};

 return {projectId,folderId,includeSubfolders:v.includeSubfolders,rootOnly:v.rootOnly,query:text(v.query,1000,'Query'),match:v.match,filters,columns:[...v.columns],widths,sort:v.sort.map(s=>({key:s.key,direction:s.direction})),groupBy:v.groupBy||'',density:v.density,pageSize:v.pageSize,columnFilters,quickFilters};
}
function folderPath(state,folderId){const map=new Map(state.folders.map(f=>[f.id,f])),out=[],seen=new Set();let id=folderId;while(id){check(!seen.has(id),'Folder cycle.');seen.add(id);const f=map.get(id);if(!f)break;out.unshift(f.name);id=f.parentId;}return out.join(' / ');}
function explorerValue(state,doc,key){
 const version=doc.versions.at(-1),name=id=>state.users.find(u=>u.id===id)?.name||'';
 if(key.startsWith('metadata.'))return Object.hasOwn(doc.metadata||{},key.slice(9))?doc.metadata[key.slice(9)]:'';
 switch(key){case'revision':return version.label;case'filetype':return doc.name.includes('.')?doc.name.split('.').pop().toUpperCase():'';case'size':return version.size;case'folder':return folderPath(state,doc.folderId)||'Project root';case'modifiedBy':return name(doc.modifiedBy);case'checkedOutBy':return name(doc.checkedOutBy);case'tags':return doc.tags.join(', ');default:return doc[key]??'';}
}
function matches(value,f){
 const raw=String(value??''),a=raw.toLocaleLowerCase('en'),b=String(f.value??'').toLocaleLowerCase('en');
 switch(f.op){case'empty':return raw==='';case'notEmpty':return raw!=='';case'contains':return a.includes(b);case'notContains':return !a.includes(b);case'eq':return a===b;case'ne':return a!==b;case'startsWith':return a.startsWith(b);default:{if(raw.trim()==='')return false;let x,y;if(Number.isFinite(Number(f.value))){x=Number(raw);y=Number(f.value);}else{x=Date.parse(raw);y=Date.parse(f.value);}if(!Number.isFinite(x)||!Number.isFinite(y))return false;return f.op==='gt'?x>y:f.op==='gte'?x>=y:f.op==='lt'?x<y:x<=y;}}
}
function explorerCan(state,userId,permission,scope,id){
 if(state.projection?.filtered){if(state.projection.userId!==userId)return false;if(scope==='document')return !!state.documents.find(d=>d.id===id)?.permissions?.includes(permission);if(scope==='project')return !!state.projection.projectPermissions?.[id]?.includes(permission);if(scope==='folder'){const f=state.folders.find(f=>f.id===id);return !!f?.permissions?.includes(permission);}return false;}
 return canAccess(state,userId,permission,scope,id);
}
/** Access filtering precedes filtering, facets, grouping, counts and pagination. */
function queryExplorer(state,userId,input={},options={}){
 check(options&&typeof options==='object'&&!Array.isArray(options),'Invalid query options.');
 const v=normalizeExplorerView(input),user=state.users.find(u=>u.id===userId);check(user?.active,'Your membership is disabled.','FORBIDDEN');if(!state.projection?.filtered&&user.role!=='admin')state=projectWorkspace(state,userId);
 check(state.projects.some(p=>p.id===v.projectId),'Project not available.','NOT_FOUND');
 if(v.folderId)check(state.folders.some(f=>f.id===v.folderId&&f.projectId===v.projectId),'Folder not available.','NOT_FOUND');
 const access=state.projection?.filtered?null:createAccessContext(state,userId),allowed=id=>access?access.can('read','document',id):explorerCan(state,userId,'read','document',id);
 const folderIds=new Set(v.folderId?[v.folderId]:[]);if(v.folderId&&v.includeSubfolders){const children=new Map();for(const f of state.folders){const a=children.get(f.parentId)||[];a.push(f.id);children.set(f.parentId,a);}const queue=[v.folderId];for(let i=0;i<queue.length;i++)for(const id of children.get(queue[i])||[])if(!folderIds.has(id)){folderIds.add(id);queue.push(id);}}
 const filters=options.columnFilters||v.columnFilters;check(filters&&typeof filters==='object'&&!Array.isArray(filters)&&Object.keys(filters).length<=30,'Invalid column filters.');for(const[k,val]of Object.entries(filters)){check(validKey(k),'Invalid column filter.');text(val,500,'Column filter');}
 const tokens=v.query.toLocaleLowerCase('en').split(/\s+/).filter(Boolean),values=new Map(),val=(d,k)=>{let m=values.get(d.id);if(!m){m=new Map();values.set(d.id,m);}if(!m.has(k))m.set(k,explorerValue(state,d,k));return m.get(k);};
 const items=state.documents.filter(d=>{
  if(d.deletedAt||d.projectId!==v.projectId||!allowed(d.id))return false;
  if(v.folderId&&!folderIds.has(d.folderId)||!v.folderId&&(v.rootOnly||!v.includeSubfolders)&&d.folderId)return false;
  if(v.quickFilters.state&&d.state!==v.quickFilters.state||v.quickFilters.discipline&&d.discipline!==v.quickFilters.discipline)return false;
  if(tokens.length){const content=[d.name,d.title,d.number,d.description,d.state,d.discipline,...d.tags,...Object.values(d.metadata||{})].join(' ').toLocaleLowerCase('en');if(!tokens.every(t=>content.includes(t)))return false;}
  if(v.filters.length&&!(v.match==='any'?v.filters.some(f=>matches(val(d,f.key),f)):v.filters.every(f=>matches(val(d,f.key),f))))return false;
  return Object.entries(filters).every(([k,value])=>String(val(d,k)).toLocaleLowerCase('en').includes(value.toLocaleLowerCase('en')));
 });
 const collator=new Intl.Collator('en',{numeric:true,sensitivity:'base'}),compare=(a,b,key,direction='asc')=>{const x=val(a,key),y=val(b,key);if(x===''||y==='')return x===y?0:x===''?1:-1;return (key==='size'||key.startsWith('metadata.')&&['number','integer'].includes(state.projects.find(p=>p.id===v.projectId)?.fields.find(f=>f.key===key.slice(9))?.type)?Number(x)-Number(y):collator.compare(String(x),String(y)))*(direction==='desc'?-1:1);};
 items.sort((a,b)=>{let c=v.groupBy?compare(a,b,v.groupBy):0;for(const s of v.sort){if(c)break;c=compare(a,b,s.key,s.direction);}return c||a.id.localeCompare(b.id);});
 const groups=[];if(v.groupBy){const map=new Map();for(const d of items){const key=String(val(d,v.groupBy));if(!map.has(key)){const g={key,count:0};groups.push(g);map.set(key,g);}map.get(key).count++;}}
 const offset=options.offset??0,limit=options.limit??v.pageSize;check(Number.isSafeInteger(offset)&&offset>=0&&Number.isSafeInteger(limit)&&limit>=1&&limit<=EXPLORER_LIMITS.pageSize,'Invalid Explorer page.');
 return {total:items.length,offset,limit,items:items.slice(offset,offset+limit),groups,ids:items.map(d=>d.id)};
}
function visibleExplorerViews(state,userId){return (state.explorerViews||[]).filter(v=>(v.scope==='project'||v.userId===userId)&&explorerCan(state,userId,'read','project',v.projectId)&&(!v.config.folderId||explorerCan(state,userId,'read','folder',v.config.folderId)));}
function visibleExplorerBookmarks(state,userId){return (state.explorerBookmarks||[]).filter(b=>b.userId===userId&&explorerCan(state,userId,'read',b.scope,b.resourceId)&&!(b.scope==='document'&&state.documents.find(d=>d.id===b.resourceId)?.deletedAt));}
function resource(state,scope,id){return state[{project:'projects',folder:'folders',document:'documents'}[scope]]?.find(x=>x.id===id);}
function applyExplorerCommand(state,command,user,now){
 const p=command.payload||{},type=command.type;
 if(type==='explorerView.save'){
  const existing=p.id?(state.explorerViews||[]).find(v=>v.id===p.id):null;
  if(p.id)check(existing,'Saved view not found.','NOT_FOUND');
  const config=normalizeExplorerView(p.config);check(state.projects.some(v=>v.id===config.projectId),'Project not found.','NOT_FOUND');
  check(['personal','project'].includes(p.scope),'Choose personal or project visibility.');
  if(existing){check(existing.projectId===config.projectId&&existing.scope===p.scope,'A saved view cannot change project or visibility.');check(p.expectedVersion===existing.version,'The saved view changed. Reload before saving.','CONFLICT');check(existing.scope!=='personal'||existing.userId===user.id,'This personal view belongs to another account.','FORBIDDEN');}
  check(explorerCan(state,user.id,p.scope==='project'?'manage':'read','project',config.projectId),'Access to this project is required.','FORBIDDEN');
  if(p.scope==='project')check(['admin','manager'].includes(user.role),'Only a project manager or administrator can publish a shared view.','FORBIDDEN');
  if(config.folderId)check(state.folders.some(f=>f.id===config.folderId&&f.projectId===config.projectId)&&explorerCan(state,user.id,'read','folder',config.folderId),'Folder access is required.','FORBIDDEN');
  const name=text(p.name,100,'View name');check(name,'A view name is required.');
  check(!(state.explorerViews||[]).some(v=>v.id!==existing?.id&&v.projectId===config.projectId&&v.scope===p.scope&&(v.scope==='project'||v.userId===user.id)&&v.name.toLowerCase()===name.toLowerCase()),'A view with this name already exists.');
  const item={id:existing?.id||'view-'+crypto.randomUUID(),userId:existing?.userId||user.id,projectId:config.projectId,scope:p.scope,name,config,version:(existing?.version||0)+1,createdAt:existing?.createdAt||now,modifiedAt:now};
  state.explorerViews=(state.explorerViews||[]).filter(v=>v.id!==item.id);state.explorerViews.push(item);
  return {result:item.id,targetId:item.id,summary:`${existing?'Updated':'Saved'} ${p.scope} Explorer view ${name}`};
 }
 if(type==='explorerView.remove'){
  const v=(state.explorerViews||[]).find(v=>v.id===p.id);check(v,'Saved view not found.','NOT_FOUND');
  check(p.expectedVersion===v.version,'The saved view changed. Reload before removing.','CONFLICT');
  check(v.scope==='personal'?v.userId===user.id: ['admin','manager'].includes(user.role)&&explorerCan(state,user.id,'manage','project',v.projectId),'You cannot remove this view.','FORBIDDEN');
  state.explorerViews=state.explorerViews.filter(x=>x.id!==v.id);return {result:v.id,targetId:v.id,summary:`Removed Explorer view ${v.name}`};
 }
 if(type==='explorerBookmark.toggle'){
  check(['project','folder','document'].includes(p.scope),'Invalid shortcut target.');
  const existing=(state.explorerBookmarks||[]).find(b=>b.userId===user.id&&b.scope===p.scope&&b.resourceId===p.resourceId);
  if(existing){state.explorerBookmarks=state.explorerBookmarks.filter(b=>b.id!==existing.id);return {result:false,targetId:existing.id,summary:'Unpinned an Explorer shortcut'};}
  const r=resource(state,p.scope,p.resourceId);check(r&&!r.deletedAt&&explorerCan(state,user.id,'read',p.scope,p.resourceId),'Shortcut target unavailable.','FORBIDDEN');
  state.explorerBookmarks||=[];const b={id:'bookmark-'+crypto.randomUUID(),userId:user.id,scope:p.scope,resourceId:p.resourceId,createdAt:now};state.explorerBookmarks.push(b);return {result:true,targetId:b.id,summary:'Pinned an Explorer shortcut'};
 }
 return null;
}
function validateExplorerState(state){
 const seen=new Set(),counts=new Map(),views=state.explorerViews||[],bookmarks=state.explorerBookmarks||[];
 check(state.explorerViews===undefined||Array.isArray(state.explorerViews),'Invalid Explorer views.');check(state.explorerBookmarks===undefined||Array.isArray(state.explorerBookmarks),'Invalid Explorer shortcuts.');
 check(views.length<=EXPLORER_LIMITS.views&&bookmarks.length<=EXPLORER_LIMITS.bookmarks,'Explorer collection limit exceeded.');
 const id=(v)=>{check(v&&typeof v.id==='string'&&v.id.length>0&&v.id.length<=120&&!seen.has(v.id),'Invalid or duplicate Explorer identifier.');seen.add(v.id);check(state.users.some(u=>u.id===v.userId),'Invalid Explorer owner.');};
 const count=(key,limit)=>{counts.set(key,(counts.get(key)||0)+1);check(counts.get(key)<=limit,'Personal Explorer collection limit exceeded.');};
 for(const v of views){id(v);check(['personal','project'].includes(v.scope),'Invalid view scope.');text(v.name,100,'View name');check(v.name.trim(),'A view needs a name.');const config=normalizeExplorerView(v.config);check(v.projectId===config.projectId&&state.projects.some(p=>p.id===v.projectId),'Invalid view project.');if(config.folderId)check(state.folders.some(f=>f.id===config.folderId&&f.projectId===v.projectId),'Invalid saved view folder.');check(Number.isSafeInteger(v.version)&&v.version>0&&Number.isFinite(Date.parse(v.createdAt))&&Number.isFinite(Date.parse(v.modifiedAt)),'Invalid saved view revision.');count('v:'+v.userId,EXPLORER_LIMITS.viewsPerUser);}
 const names=new Set();for(const v of views){const key=JSON.stringify([v.projectId,v.scope,v.scope==='personal'?v.userId:'',v.name.toLowerCase()]);check(!names.has(key),'Duplicate saved view name.');names.add(key);}
 const targets=new Set();for(const b of bookmarks){id(b);check(['project','folder','document'].includes(b.scope)&&!!resource(state,b.scope,b.resourceId),'Invalid shortcut target.');check(Number.isFinite(Date.parse(b.createdAt)),'Invalid shortcut date.');const key=b.userId+':'+b.scope+':'+b.resourceId;check(!targets.has(key),'Duplicate Explorer shortcut.');targets.add(key);count('b:'+b.userId,EXPLORER_LIMITS.bookmarksPerUser);}
 return true;
}
/** Side-effect-free selection model used by mouse and keyboard paths. */
function explorerSelection(ids,selection,id,{toggle=false,range=false,anchor=null}={}){
 check(Array.isArray(ids)&&ids.includes(id),'Selection target is not in this result.');const next=new Set(selection);
 if(range&&ids.includes(anchor)){if(!toggle)next.clear();const a=ids.indexOf(anchor),b=ids.indexOf(id);ids.slice(Math.min(a,b),Math.max(a,b)+1).forEach(x=>next.add(x));return {selection:next,anchor};}
 if(toggle){next.has(id)?next.delete(id):next.add(id);}else{next.clear();next.add(id);}return {selection:next,anchor:id};
}
class ExplorerHistory{
 constructor(limit=80){check(Number.isInteger(limit)&&limit>=2&&limit<=500,'Invalid navigation-history limit.');this.limit=limit;this.items=[];this.index=-1;}
 visit(location){const item=clone(location);if(JSON.stringify(this.current)===JSON.stringify(item))return this.current;this.items=this.items.slice(0,this.index+1);this.items.push(item);if(this.items.length>this.limit)this.items.shift();this.index=this.items.length-1;return this.current;}
 get current(){return this.index>=0?clone(this.items[this.index]):null;}get canBack(){return this.index>0;}get canForward(){return this.index+1<this.items.length;}
 back(){if(this.canBack)this.index--;return this.current;}forward(){if(this.canForward)this.index++;return this.current;}
}
function explorerLink(state,{projectId,folderId='',documentId=''}={}){const params=new URLSearchParams({workspace:state.id,project:projectId||''});if(folderId)params.set('folder',folderId);if(documentId)params.set('document',documentId);return '#documents?'+params.toString();}
function resolveExplorerLink(state,userId,hash){
 check(typeof hash==='string'&&hash.length<=1500,'Invalid workspace link.');const [route,query]=hash.replace(/^#/,'').split('?');check(route==='documents','This is not an Explorer link.');const p=new URLSearchParams(query);check(!p.get('workspace')||p.get('workspace')===state.id,'This link belongs to another workspace.','NOT_FOUND');
 const projectId=p.get('project'),folderId=p.get('folder')||null,documentId=p.get('document')||null;
 check(state.projects.some(x=>x.id===projectId),'Project unavailable.','NOT_FOUND');
 if(documentId){const d=state.documents.find(d=>d.id===documentId);check(d&&!d.deletedAt&&d.projectId===projectId&&explorerCan(state,userId,'read','document',d.id),'Document unavailable.','NOT_FOUND');return {projectId,folderId:d.folderId,documentId};}
 if(folderId)check(state.folders.some(f=>f.id===folderId&&f.projectId===projectId)&&explorerCan(state,userId,'read','folder',folderId),'Folder unavailable.','NOT_FOUND');
 if(folderId)return {projectId,folderId,documentId:null};
 check(explorerCan(state,userId,'read','project',projectId),'Project unavailable.','NOT_FOUND');return {projectId,folderId,documentId:null};
}

/** Browser-local presentation settings. These never change workspace data or permissions. */
function defaultExplorerLayout() {
 return {treeWidth:258,previewSize:246,previewWidth:360,previewPosition:'bottom',treeVisible:true,ribbonVisible:true,columnFilters:false,commandStyle:'standard',navigationRail:false,rowLines:true,fileDescriptions:false};
}
function normalizeExplorerLayout(input={}) {
 const base=defaultExplorerLayout(),source=input&&typeof input==='object'&&!Array.isArray(input)?input:{},out={...base};
 for(const [key,min,max] of [['treeWidth',190,480],['previewSize',160,600],['previewWidth',260,650]]) {
  if(typeof source[key]==='number'&&Number.isFinite(source[key]))out[key]=Math.round(Math.max(min,Math.min(max,source[key])));
 }
 for(const key of ['treeVisible','ribbonVisible','columnFilters','navigationRail','rowLines','fileDescriptions'])if(typeof source[key]==='boolean')out[key]=source[key];
 if(['bottom','right','hidden'].includes(source.previewPosition))out.previewPosition=source.previewPosition;
 if(['standard','ribbon'].includes(source.commandStyle))out.commandStyle=source.commandStyle;
 return out;
}
function explorerPresentationPreset(name,current={}) {
 check(['explorer','ribbon','review'].includes(name),'Unknown Explorer presentation preset.');
 const out=normalizeExplorerLayout(current);
 if(name==='explorer')Object.assign(out,{commandStyle:'standard',navigationRail:false,rowLines:true,fileDescriptions:false,previewPosition:'bottom',ribbonVisible:true,treeVisible:true});
 if(name==='ribbon')Object.assign(out,{commandStyle:'ribbon',navigationRail:true,rowLines:false,fileDescriptions:true,previewPosition:'bottom',ribbonVisible:true,treeVisible:true});
 if(name==='review')Object.assign(out,{commandStyle:'standard',navigationRail:false,rowLines:true,fileDescriptions:false,previewPosition:'right',previewWidth:420,ribbonVisible:true,treeVisible:true});
 return out;
}
/** A presentation-only detail register; saved views keep their original columns. */
function explorerDetailView(projectId='',folderId=null) {
 return normalizeExplorerView({...defaultExplorerView(projectId,folderId),columns:['name','title','number','state','revision','modifiedAt'],widths:{name:310,title:245,number:160,state:145,revision:75,modifiedAt:145},density:'compact'});
}

/** Versioned, browser-only presentation migration. Never modifies workspace data.
 * Historical preferences had no appearance schema and can restore a pre-redesign
 * ribbon/rail. Migrate only their chrome once; preserve queries and pane sizes.
 */
const EXPLORER_PREFERENCE_SCHEMA = 1;
function migrateExplorerPreferences(input, projectId='') {
 const source=input&&typeof input==='object'&&!Array.isArray(input)?input:{};
 const current=source.schema===EXPLORER_PREFERENCE_SCHEMA;
 const layout=normalizeExplorerLayout(source.layout);
 if(!current)Object.assign(layout,{commandStyle:'standard',navigationRail:false,rowLines:true,fileDescriptions:false});
 let config;try{config=normalizeExplorerView(source.config||explorerDetailView(projectId));}catch{config=explorerDetailView(projectId);}
 const strings=(value,limit)=>Array.isArray(value)?[...new Set(value.filter(x=>typeof x==='string'&&x.length<=500))].slice(0,limit):[];
 return {schema:EXPLORER_PREFERENCE_SCHEMA,layout,config,expanded:Array.isArray(source.expanded)?strings(source.expanded,1000):['project:'+projectId],recents:strings(source.recents,30)};
}

return { EXPLORER_LIMITS, EXPLORER_COLUMNS, FILTER_OPERATORS, explorerColumns, defaultExplorerView, normalizeExplorerView, folderPath, explorerValue, explorerCan, queryExplorer, visibleExplorerViews, visibleExplorerBookmarks, applyExplorerCommand, validateExplorerState, explorerSelection, ExplorerHistory, explorerLink, resolveExplorerLink, defaultExplorerLayout, normalizeExplorerLayout, explorerPresentationPreset, explorerDetailView, EXPLORER_PREFERENCE_SCHEMA, migrateExplorerPreferences };
})();

__modules["packages/automation/index.js"] = (() => {
/** Declarative workflow automation. No executable expressions, network, DOM, or timers.
 * Commands and the server scheduler use these same transactional primitives.
 */
const { canAccess, createAccessContext, notificationVisible } = __modules["packages/access/index.js"];
const { validateMetadata, pendingReviewers, currentReviewStage, reviewIsCurrent } = __modules["packages/document-control/index.js"];

const AUTOMATION_LIMITS = Object.freeze({ rules:1000, rulesPerProject:40, conditions:32, depth:4, subscriptions:10000, subscriptionsPerUser:100, notifications:50000, notificationsPerUser:1000, ledger:100000, tickItems:200 });
const CONDITION_OPERATORS = ['eq','ne','in','notIn','contains','startsWith','gt','gte','lt','lte','exists','missing'];
const WATCH_EVENTS = ['document.created','document.revised','document.updated','document.moved','document.state','document.recycled','document.restored','comment.added','review.started','review.decision','review.assigned','review.cancelled','issue.created','issue.updated','delivery.issued'];
const NOTICE_EVENTS = [...WATCH_EVENTS,'review.reminder','review.overdue','review.escalated','review.escalation-blocked','issue.reminder','issue.overdue','document.reminder','document.overdue'];
const collections = {document:'documents',review:'reviews',issue:'issues',transmittal:'transmittals'};
const check=(ok,message,code='VALIDATION')=>{if(!ok){const error=new Error(message);error.code=code;throw error;}};
const plain=value=>!!value&&typeof value==='object'&&!Array.isArray(value)&&(Object.getPrototypeOf(value)===Object.prototype||Object.getPrototypeOf(value)===null);
const id=prefix=>`${prefix}-${crypto.randomUUID()}`;
const text=(v,label,max=200)=>{check(typeof v==='string'&&v.trim().length>0&&v.length<=max,`${label} must contain 1–${max} characters.`);return v.trim();};
const scalar=v=>typeof v==='string'&&v.length<=500||typeof v==='number'&&Number.isFinite(v)||typeof v==='boolean';
const bool=(v,otherwise=false)=>{if(v===undefined)return otherwise;check(typeof v==='boolean','Expected a boolean.');return v;};
const integer=(v,min,max,label)=>{check(Number.isSafeInteger(v)&&v>=min&&v<=max,`${label} must be an integer from ${min} to ${max}.`);return v;};
const timestamp=value=>typeof value==='string'&&/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$/.test(value)&&!Number.isNaN(Date.parse(value))&&new Date(value).toISOString()===value;
function keys(object,allowed){check(plain(object),'Expected a plain object.');check(Object.keys(object).every(k=>allowed.includes(k)),'Unknown or unsafe configuration property.');}
function uniqueStrings(value,max,label,allowEmpty=true){check(Array.isArray(value)&&value.length<=max&&(allowEmpty||value.length>0)&&value.every(v=>typeof v==='string'&&v.length>0&&v.length<=120)&&new Set(value).size===value.length,`Invalid ${label}.`);return [...value];}
function projectOf(state,projectId){const p=state.projects.find(p=>p.id===projectId);check(p,'Project not found.','NOT_FOUND');return p;}
function fieldType(project,field){
  if(field.startsWith('metadata.')){const key=field.slice(9),f=project.fields.find(f=>f.key===key);check(f,'Unknown metadata field in workflow condition.');return ['number','integer'].includes(f.type)?'number':f.type==='boolean'?'boolean':'string';}
  check(['name','number','title','discipline','state','dueDate','tags','referenceCount','actorRole'].includes(field),'Unsupported workflow condition field.');
  return field==='referenceCount'?'number':field==='tags'?'array':'string';
}
/** Normalization both bounds complexity and validates primitive types; no coercive comparisons. */
function normalizeCondition(input,project){
  let count=0;
  function visit(node,depth){
    check(++count<=AUTOMATION_LIMITS.conditions&&depth<=AUTOMATION_LIMITS.depth,'Workflow condition is too complex.');
    check(plain(node),'Invalid workflow condition.');
    if(Object.hasOwn(node,'all')||Object.hasOwn(node,'any')){
      const op=Object.hasOwn(node,'all')?'all':'any';keys(node,[op]);check(Array.isArray(node[op])&&node[op].length<=16&&(op==='all'||node[op].length>0),'Invalid condition group.');return {[op]:node[op].map(n=>visit(n,depth+1))};
    }
    keys(node,['field','op','value','valueType']);const field=text(node.field,'Condition field',100),type=fieldType(project,field),op=node.op;check(CONDITION_OPERATORS.includes(op),'Unsupported condition operator.');check(!Object.hasOwn(node,'valueType')||node.valueType===type,'Condition field type changed; update its workflow rule.');
    if(['exists','missing'].includes(op)){check(!Object.hasOwn(node,'value'),'Existence conditions do not take a value.');return {field,op,valueType:type};}
    if(['gt','gte','lt','lte'].includes(op))check(type==='number','Ordered comparisons require numeric fields.');
    if(['contains','startsWith'].includes(op))check(type==='string'||type==='array'&&op==='contains','This operator requires text or tags.');
    check(type!=='array'||op==='contains','Tags support contains, exists, or missing.');
    const validate=v=>{check(scalar(v)&&typeof v===(type==='array'?'string':type),'Condition value does not match its field type.');return v;};
    const value=['in','notIn'].includes(op)?(check(Array.isArray(node.value)&&node.value.length>0&&node.value.length<=30,'Use 1–30 values.'),node.value.map(validate)):validate(node.value);
    return {field,op,valueType:type,value};
  }
  return visit(input??{all:[]},0);
}
function evaluateCondition(condition,document,actor){
  if(condition.all)return condition.all.every(c=>evaluateCondition(c,document,actor));
  if(condition.any)return condition.any.some(c=>evaluateCondition(c,document,actor));
  const {field,op,value}=condition;
  let actual=field.startsWith('metadata.')?(Object.hasOwn(document.metadata||{},field.slice(9))?document.metadata[field.slice(9)]:undefined):field==='actorRole'?actor?.role:field==='referenceCount'?document.references.length:document[field];
  // Governed metadata is serialized as canonical strings in Civora. Interpret only
  // schema-normalized numeric/boolean fields; never coerce arbitrary text or blanks.
  if(field.startsWith('metadata.')&&typeof actual==='string'){
    if(condition.valueType==='number'&&/^[+-]?(?:\d+(?:\.\d*)?|\.\d+)(?:[eE][+-]?\d+)?$/.test(actual)&&Number.isFinite(Number(actual)))actual=Number(actual);
    if(condition.valueType==='boolean'&&['true','false'].includes(actual))actual=actual==='true';
  }
  const exists=actual!==undefined&&actual!==null&&actual!==''&&(!Array.isArray(actual)||actual.length>0);
  if(op==='exists')return exists;if(op==='missing')return !exists;
  // Missing values never satisfy negative comparisons accidentally.
  if(!exists)return false;
  if(op==='eq')return actual===value;if(op==='ne')return typeof actual===typeof value&&actual!==value;
  if(op==='in')return value.includes(actual);if(op==='notIn')return value.every(v=>typeof v===typeof actual)&&!value.includes(actual);
  if(op==='contains')return (typeof actual==='string'||Array.isArray(actual))&&actual.includes(value);
  if(op==='startsWith')return typeof actual==='string'&&actual.startsWith(value);
  if(typeof actual!=='number'||!Number.isFinite(actual)||typeof value!=='number')return false;
  return op==='gt'?actual>value:op==='gte'?actual>=value:op==='lt'?actual<value:op==='lte'?actual<=value:false;
}
function normalizeWorkflowRule(state,input){
  keys(input,['id','projectId','name','enabled','from','to','priority','when','require','message','requireReason','metadata','addTags','createdBy','createdAt','modifiedAt']);
  const project=projectOf(state,input.projectId),flowIds=new Set([project.workflowId,...state.documents.filter(d=>d.projectId===project.id).map(d=>d.workflowId)]),states=new Set(state.workflows.filter(w=>flowIds.has(w.id)).flatMap(w=>w.states));
  const from=input.from||'*',to=input.to||'*';check((from==='*'||states.has(from))&&(to==='*'||states.has(to)),'Rule state is not in a project workflow.');
  const metadata=structuredClone(input.metadata??{});keys(metadata,project.fields.map(f=>f.key));
  for(const [key,value]of Object.entries(metadata)){
    // Validate assignments independently of unrelated required fields.
    const field=project.fields.find(f=>f.key===key);metadata[key]=validateMetadata({...project,fields:[{...field,required:false}]},{[key]:value},{defaults:false})[key];
  }
  const addTags=uniqueStrings(input.addTags??[],20,'rule tags').map(t=>text(t,'Tag',60));
  return {projectId:project.id,name:text(input.name,'Rule name',120),enabled:bool(input.enabled,true),from,to,priority:integer(input.priority??100,0,1000,'Priority'),when:normalizeCondition(input.when,project),require:normalizeCondition(input.require,project),message:text(input.message||'Document does not meet this transition policy.','Rule message',500),requireReason:bool(input.requireReason),metadata:structuredClone(metadata),addTags};
}
/** Read-only explanation. All predicates use the same pre-transition snapshot.
 * Assignments use priority then stable identifier order, and are validated together.
 */
function evaluateWorkflowRules(state,document,actor,to,reason=''){
  const matched=(state.workflowRules||[]).filter(r=>r.enabled&&r.projectId===document.projectId&&(r.from==='*'||r.from===document.state)&&(r.to==='*'||r.to===to)&&evaluateCondition(r.when,document,actor)).sort((a,b)=>a.priority-b.priority||(a.id<b.id?-1:a.id>b.id?1:0));
  const metadata=structuredClone(document.metadata),tags=[...document.tags],errors=[];
  for(const rule of matched){if(!evaluateCondition(rule.require,document,actor))errors.push(`${rule.name}: ${rule.message}`);if(rule.requireReason&&(typeof reason!=='string'||!reason.trim()))errors.push(`${rule.name}: enter a transition reason.`);Object.assign(metadata,rule.metadata);for(const tag of rule.addTags)if(!tags.includes(tag))tags.push(tag);}
  check(tags.length<=30,'Workflow rules would exceed 30 document tags.');
  return {matches:matched.map(r=>({id:r.id,name:r.name,priority:r.priority})),metadata,tags,hasAssignments:matched.some(r=>Object.keys(r.metadata).length||r.addTags.length),errors};
}
function normalizeAutomationPolicy(state,input){
  keys(input,['projectId','enabled','reminderHours','escalationHours','escalationMode','delegateId','notifyUserIds','includeIssues','includeDocuments','id','createdBy','createdAt','modifiedAt','version']);
  projectOf(state,input.projectId);const mode=input.escalationMode||'notify';check(['notify','delegate'].includes(mode),'Choose notification or delegation escalation.');
  const delegateId=input.delegateId||'';check(mode!=='delegate'||state.users.some(u=>u.id===delegateId),'Choose a delegation reviewer.');check(!delegateId||state.users.some(u=>u.id===delegateId),'Unknown delegate.');
  const notifyUserIds=uniqueStrings(input.notifyUserIds||[],20,'notification recipients');check(notifyUserIds.every(id=>state.users.some(u=>u.id===id)),'Unknown notification recipient.');
  return {projectId:input.projectId,enabled:bool(input.enabled,true),reminderHours:integer(input.reminderHours??24,0,720,'Reminder lead hours'),escalationHours:integer(input.escalationHours??24,0,720,'Escalation delay hours'),escalationMode:mode,delegateId,notifyUserIds,includeIssues:bool(input.includeIssues,true),includeDocuments:bool(input.includeDocuments,false)};
}
function normalizeSubscription(state,input){
  keys(input,['id','scope','resourceId','events','recursive','enabled','userId','createdAt']);
  check(['project','folder','document'].includes(input.scope),'Choose project, folder, or document scope.');
  check(state[input.scope+'s'].some(x=>x.id===input.resourceId),'Subscription target not found.','NOT_FOUND');
  const events=uniqueStrings(input.events, WATCH_EVENTS.length,'watch events',false);check(events.every(e=>WATCH_EVENTS.includes(e)),'Unsupported watch event.');
  return {scope:input.scope,resourceId:input.resourceId,events,recursive:bool(input.recursive,true),enabled:bool(input.enabled,true)};
}
function eventRecord(state,resourceType,resourceId,event,at,by){
  const resource=state[collections[resourceType]]?.find(x=>x.id===resourceId);if(!resource)return null;
  return {event,resourceType,resourceId,projectId:resource.projectId,documentIds:resourceType==='document'?[resource.id]:resource.documents?.map(s=>s.documentId)|| (resource.documentId?[resource.documentId]:[]),at,by};
}
function matchesSubscription(state,subscription,event){
  if(!subscription.enabled||!subscription.events.includes(event.event))return false;
  if(subscription.scope==='project')return subscription.resourceId===event.projectId;
  if(subscription.scope==='document')return event.documentIds.includes(subscription.resourceId);
  const parents=new Map(state.folders.map(f=>[f.id,f.parentId]));
  return event.documentIds.some(id=>{let folder=state.documents.find(d=>d.id===id)?.folderId;const seen=new Set();while(folder&&!seen.has(folder)){if(folder===subscription.resourceId)return true;if(!subscription.recursive)return false;seen.add(folder);folder=parents.get(folder);}return false;});
}
function trimNotifications(state){
  const records=state.notifications||[],counts=new Map(),retained=[];
  // Bounded inbox history: retain the newest 1,000 records per recipient.
  for(let i=records.length-1;i>=0&&retained.length<AUTOMATION_LIMITS.notifications;i--){const n=records[i],count=counts.get(n.userId)||0;if(count<AUTOMATION_LIMITS.notificationsPerUser){retained.push(n);counts.set(n.userId,count+1);}}
  state.notifications=retained.reverse();
}
function deliver(state,event,recipients,key){
  if(!event)return 0;state.notifications||=[];let added=0;
  for(const userId of new Set(recipients)){
    const notice={...event,userId};
    if(!notificationVisible(state,notice,userId)||state.notifications.some(n=>n.userId===userId&&n.key===key))continue;
    state.notifications.push({...notice,id:id('notice'),key,readAt:null,snoozedUntil:null});added++;
  }
  trimNotifications(state);return added;
}
function publishCommandNotifications(previous,state,command,result,actorId,now){
  const p=command.payload||{},type=command.type;let specs=[];
  const map={'document.create':'document.created','document.checkin':'document.revised','document.restoreVersion':'document.revised','document.update':'document.updated','document.references':'document.updated','document.move':'document.moved','document.transition':'document.state','document.delete':'document.recycled','document.restore':'document.restored'};
  if(map[type])specs.push(['document',type==='document.create'?result:p.id||p.documentId,map[type],[]]);
  if(type==='document.bulkRename')for(const item of result.renamed)specs.push(['document',item.id,'document.updated',[]]);
  if(type==='document.bulkCopy')for(const item of result.copied)specs.push(['document',item.id,'document.created',[]]);
  if(type==='document.bulkMove')for(const item of p.items)specs.push(['document',item.id,'document.moved',[]]);
  if(type==='document.bulkUpdate')for(const update of p.updates)specs.push(['document',update.id,'document.updated',[]]);
  if(type==='comment.add')specs.push(['document',p.id||p.documentId,'comment.added',[]]);
  if(type.startsWith('review.')&&['review.create','review.decide','review.reassign','review.cancel'].includes(type)){
    const r=state.reviews.find(r=>r.id===(type==='review.create'?result:p.id)),old=previous.reviews.find(x=>x.id===r.id);
    specs.push(['review',r.id,type==='review.create'?'review.started':type==='review.decide'?'review.decision':type==='review.cancel'?'review.cancelled':'review.assigned',[r.createdBy]]);
    if(r.status==='In review'&&(type==='review.create'||type==='review.reassign'||old?.currentStage!==r.currentStage))specs.push(['review',r.id,'review.assigned',pendingReviewers(r)]);
  }
  if(type==='issue.create'||type==='issue.update'){const r=state.issues.find(i=>i.id===(type==='issue.create'?result:p.id));specs.push(['issue',r.id,type==='issue.create'?'issue.created':'issue.updated',[r.assignee,r.createdBy]]);}
  if(type==='transmittal.issue')specs.push(['transmittal',p.id,'delivery.issued',[]]);
  for(const [kind,target,event,direct]of specs){const record=eventRecord(state,kind,target,event,now,actorId);if(!record)continue;const recipients=[...direct,...(state.subscriptions||[]).filter(s=>matchesSubscription(state,s,record)||(event==='document.moved'&&matchesSubscription(previous,s,record))).map(s=>s.userId)];deliver(state,record,recipients,`command:${state.revision}:${event}:${target}`);}
}
function policyOwner(state,policy){const user=state.users.find(u=>u.id===policy.createdBy);return user?.active&&['admin','manager'].includes(user.role)&&canAccess(state,user.id,'manage','project',policy.projectId)?user:null;}
function deadlineISO(date){return date?`${date}T23:59:59.999Z`:null;}
function automationDueItems(state,now=new Date().toISOString(),projectId=null){
  check(timestamp(now),'Use an exact UTC timestamp.');const time=Date.parse(now),items=[];
  for(const policy of state.automationPolicies||[]){if(!policy.enabled||(projectId&&policy.projectId!==projectId))continue;
    const add=(kind,resource,date)=>{const due=deadlineISO(date);if(!due)return;const stage=kind==='review'?currentReviewStage(resource):null;
      const base=`${policy.version}:${kind}:${resource.id}:${stage?.id||'legacy'}:${date}`;
      if(time>=Date.parse(due)-policy.reminderHours*3600000&&time<=Date.parse(due))items.push({key:base+':reminder',policy,kind,resourceId:resource.id,stageId:stage?.id||null,due,event:kind+'.reminder'});
      if(time>Date.parse(due))items.push({key:base+':overdue',policy,kind,resourceId:resource.id,stageId:stage?.id||null,due,event:kind+'.overdue'});
      if(kind==='review'&&time>=Date.parse(due)+policy.escalationHours*3600000+1)items.push({key:base+':escalation',policy,kind,resourceId:resource.id,stageId:stage?.id||null,due,event:'review.escalated'});
    };
    for(const r of state.reviews)if(r.projectId===policy.projectId&&r.status==='In review')add('review',r,currentReviewStage(r)?.dueDate||r.dueDate);
    if(policy.includeIssues)for(const issue of state.issues)if(issue.projectId===policy.projectId&&!['Resolved','Closed'].includes(issue.status))add('issue',issue,issue.dueDate);
    if(policy.includeDocuments)for(const d of state.documents)if(d.projectId===policy.projectId&&!d.deletedAt&&!['Published','Archived'].includes(d.state))add('document',d,d.dueDate);
  }
  const done=new Set((state.automationLedger||[]).map(e=>e.key));return items.filter(x=>!done.has(x.key)).sort((a,b)=>a.due.localeCompare(b.due)||a.key.localeCompare(b.key));
}
function delegateReview(state,review,policy,owner,now){
  const stage=currentReviewStage(review);check(stage,'Automatic delegation requires a staged review.','LEGACY');
  const replacement=state.users.find(u=>u.id===policy.delegateId),pending=pendingReviewers(review);
  check(pending.length===1,'Delegation only replaces a single remaining voter; it never reduces quorum.','QUORUM');
  const from=pending[0];check(from!==replacement?.id&&!stage.assignees.includes(replacement?.id),'The configured delegate is already assigned.','ALREADY_ASSIGNED');
  check(replacement?.active&&['admin','manager','reviewer'].includes(replacement.role),'The configured delegate is inactive or cannot review.','DELEGATE');
  check(canAccess(state,replacement.id,'review','project',review.projectId)&&review.documents.every(s=>canAccess(state,replacement.id,'review','document',s.documentId)),'The delegate lacks current review access.','ACCESS');
  check(review.documents.every(s=>canAccess(state,owner.id,'read','document',s.documentId)),'Policy owner cannot access every document.','ACCESS');
  if(review.separationOfDuties)check(replacement.id!==review.createdBy&&review.documents.every(s=>state.documents.find(d=>d.id===s.documentId).versions.find(v=>v.id===s.versionId).createdBy!==replacement.id),'Delegation violates separation of duties.','SEPARATION');
  stage.assignees=stage.assignees.map(u=>u===from?replacement.id:u);review.assignees=[...new Set(review.stages.flatMap(s=>s.assignees))];review.reassignments.push({by:owner.id,at:now,stageId:stage.id,from,to:replacement.id,reason:'Automatic overdue delegation under project policy '+policy.id,automatic:true});
  return replacement.id;
}
/** Mutates only a private transaction copy. Called by core wrapper/server, not untrusted HTTP commands. */
function runScheduledAutomation(state,now,{projectId=null}={}){
  const items=automationDueItems(state,now,projectId).slice(0,AUTOMATION_LIMITS.tickItems),outcomes=[];
  state.automationLedger||=[];
  for(const item of items){
    check(state.automationLedger.length<AUTOMATION_LIMITS.ledger,'Automation ledger is full; export and maintain the workspace before continuing.');
    const {policy,kind,resourceId}=item,owner=policyOwner(state,policy),resource=state[collections[kind]].find(x=>x.id===resourceId);let status='sent',code='',delegatedTo=null;
    const event=eventRecord(state,kind,resourceId,item.event,now,policy.createdBy);
    if(!owner){status='blocked';code='OWNER_ACCESS';}
    else if(!notificationVisible(state,{...event,userId:owner.id},owner.id)){status='blocked';code='OWNER_ACCESS';}
    else if(kind==='review'&&!reviewIsCurrent(state,resource)){status='blocked';code='STALE_REVIEW';}
    else if(item.event==='review.escalated'&&policy.escalationMode==='delegate'){
      try{delegatedTo=delegateReview(state,resource,policy,owner,now);status='delegated';}catch(error){status='blocked';code=error.code||'VALIDATION';}
    }
    let recipients=[];
    if(owner&&status!=='blocked')recipients=kind==='review'?[...pendingReviewers(resource),resource.createdBy,...(item.event==='review.escalated'?policy.notifyUserIds:[])]:kind==='issue'?[resource.assignee,resource.createdBy]:[resource.createdBy];
    // A blocked escalation is visible to its still-authorized policy owner only.
    if(status==='blocked'&&owner&&item.event==='review.escalated'){event.event='review.escalation-blocked';recipients=[owner.id];}
    const delivered=deliver(state,event,recipients,'scheduled:'+item.key);
    const entry={id:id('automation'),key:item.key,projectId:policy.projectId,policyId:policy.id,resourceType:kind,resourceId,stageId:item.stageId,event:item.event,status,code,at:now,by:policy.createdBy,delivered,delegatedTo};
    state.automationLedger.push(entry);outcomes.push(entry);
  }
  return outcomes;
}
function applyAutomationCommand(state,command,user,now){
  const p=command.payload||{},type=command.type;let result=null,summary='',targetId=p.id||p.projectId||p.resourceId||'';
  if(type==='workflowRule.save'){
    check(['admin','manager'].includes(user.role),'A manager role is required.','FORBIDDEN');const normal=normalizeWorkflowRule(state,p),old=(state.workflowRules||[]).find(r=>r.id===p.id);check(!p.id||old,'Rule not found.','NOT_FOUND');check(!old||old.projectId===normal.projectId,'A rule cannot move between projects.');
    state.workflowRules||=[];check(old||state.workflowRules.length<AUTOMATION_LIMITS.rules&&state.workflowRules.filter(r=>r.projectId===normal.projectId).length<AUTOMATION_LIMITS.rulesPerProject,'Workflow rule limit reached.');
    const record={...normal,id:old?.id||id('rule'),createdBy:old?.createdBy||user.id,createdAt:old?.createdAt||now,modifiedAt:now};state.workflowRules=state.workflowRules.filter(r=>r.id!==record.id);state.workflowRules.push(record);result=targetId=record.id;summary=`Saved workflow rule ${record.name}`;
  }else if(type==='workflowRule.delete'){
    const rule=(state.workflowRules||[]).find(r=>r.id===p.id);check(rule,'Rule not found.','NOT_FOUND');state.workflowRules=state.workflowRules.filter(r=>r.id!==p.id);summary=`Removed workflow rule ${rule.name}`;
  }else if(type==='automation.configure'){
    check(['admin','manager'].includes(user.role),'A manager role is required.','FORBIDDEN');const normal=normalizeAutomationPolicy(state,p),old=(state.automationPolicies||[]).find(r=>r.projectId===normal.projectId);
    if(normal.escalationMode==='delegate'){const delegate=state.users.find(u=>u.id===normal.delegateId);check(delegate?.active&&['admin','manager','reviewer'].includes(delegate.role),'Choose an active reviewer as delegate.');}
    const record={...normal,id:old?.id||id('policy'),createdBy:user.id,createdAt:old?.createdAt||now,modifiedAt:now,version:id('policyver')};state.automationPolicies=(state.automationPolicies||[]).filter(r=>r.projectId!==normal.projectId);state.automationPolicies.push(record);result=targetId=record.id;summary='Configured project reminders and overdue escalation';
  }else if(type==='automation.run'){
    check(['admin','manager'].includes(user.role),'A manager role is required.','FORBIDDEN');projectOf(state,p.projectId);result=runScheduledAutomation(state,now,{projectId:p.projectId});summary=`Reconciled ${result.length} scheduled workflow events`;
  }else if(type==='subscription.save'){
    const normal=normalizeSubscription(state,p);check(canAccess(state,user.id,'read',normal.scope,normal.resourceId),'Read access is required to watch this resource.','FORBIDDEN');
    const existing=(state.subscriptions||[]).find(s=>s.userId===user.id&&s.scope===normal.scope&&s.resourceId===normal.resourceId);check(!p.id||existing?.id===p.id,'Subscription not found.','NOT_FOUND');
    state.subscriptions||=[];check(existing||state.subscriptions.length<AUTOMATION_LIMITS.subscriptions&&state.subscriptions.filter(s=>s.userId===user.id).length<AUTOMATION_LIMITS.subscriptionsPerUser,'Watch subscription limit reached.');const record={...normal,id:existing?.id||id('watch'),userId:user.id,createdAt:existing?.createdAt||now};state.subscriptions=state.subscriptions.filter(s=>s.id!==record.id);state.subscriptions.push(record);result=targetId=record.id;summary='Updated personal change subscription';
  }else if(type==='subscription.delete'){
    const old=(state.subscriptions||[]).find(s=>s.id===p.id);check(old?.userId===user.id,'Subscription not found.','NOT_FOUND');state.subscriptions=state.subscriptions.filter(s=>s.id!==old.id);summary='Removed personal change subscription';
  }else if(type==='notification.update'){
    const ids=uniqueStrings(p.ids,200,'notification selection',false);check(['read','unread','snooze','unsnooze'].includes(p.action),'Unsupported notification action.');
    if(p.action==='snooze')check(timestamp(p.until)&&Date.parse(p.until)>Date.parse(now)&&Date.parse(p.until)<=Date.parse(now)+30*86400000,'Snooze must be in the next 30 days.');
    for(const id of ids){const n=(state.notifications||[]).find(n=>n.id===id);check(n?.userId===user.id&&notificationVisible(state,n,user.id),'Notification not found.','NOT_FOUND');if(p.action==='read')n.readAt=now;if(p.action==='unread')n.readAt=null;if(p.action==='snooze')n.snoozedUntil=p.until;if(p.action==='unsnooze')n.snoozedUntil=null;}
    result=ids.length;summary=`Updated ${ids.length} personal notifications`;
  }else return null;
  return {result,summary,targetId};
}
function validateAutomationState(state){
  const definitions={workflowRules:AUTOMATION_LIMITS.rules,automationPolicies:2000,subscriptions:AUTOMATION_LIMITS.subscriptions,notifications:AUTOMATION_LIMITS.notifications,automationLedger:AUTOMATION_LIMITS.ledger},users=new Set(state.users.map(u=>u.id)),projects=new Set(state.projects.map(p=>p.id));
  for(const [name,limit]of Object.entries(definitions)){const items=state[name]===undefined?[]:state[name];check(Array.isArray(items)&&items.length<=limit,`Invalid ${name} collection.`);const ids=new Set();for(const item of items){check(plain(item)&&typeof item.id==='string'&&item.id.length>0&&item.id.length<=120&&!ids.has(item.id),`Invalid ${name} identifier.`);ids.add(item.id);}}
  const ruleCounts=new Map();for(const r of state.workflowRules||[]){normalizeWorkflowRule(state,r);check(users.has(r.createdBy)&&timestamp(r.createdAt)&&timestamp(r.modifiedAt),'Invalid rule authorship.');ruleCounts.set(r.projectId,(ruleCounts.get(r.projectId)||0)+1);check(ruleCounts.get(r.projectId)<=AUTOMATION_LIMITS.rulesPerProject,'Too many project rules.');}
  const policies=new Set();for(const p of state.automationPolicies||[]){normalizeAutomationPolicy(state,p);check(!policies.has(p.projectId)&&users.has(p.createdBy)&&timestamp(p.createdAt)&&timestamp(p.modifiedAt)&&typeof p.version==='string'&&p.version.length>0&&p.version.length<=120,'Invalid automation policy.');policies.add(p.projectId);}
  const watched=new Set(),counts=new Map();for(const s of state.subscriptions||[]){normalizeSubscription(state,s);const key=s.userId+':'+s.scope+':'+s.resourceId;check(users.has(s.userId)&&timestamp(s.createdAt)&&!watched.has(key),'Invalid or duplicate subscription.');watched.add(key);counts.set(s.userId,(counts.get(s.userId)||0)+1);check(counts.get(s.userId)<=AUTOMATION_LIMITS.subscriptionsPerUser,'Too many personal subscriptions.');}
  const deliveries=new Set(),noticeCounts=new Map();for(const n of state.notifications||[]){keys(n,['id','event','resourceType','resourceId','projectId','documentIds','at','by','userId','key','readAt','snoozedUntil']);noticeCounts.set(n.userId,(noticeCounts.get(n.userId)||0)+1);check(noticeCounts.get(n.userId)<=AUTOMATION_LIMITS.notificationsPerUser,'Too many personal notifications.');const resource=state[collections[n.resourceType]]?.find(r=>r.id===n.resourceId);check(resource&&resource.projectId===n.projectId&&NOTICE_EVENTS.includes(n.event)&&projects.has(n.projectId)&&users.has(n.userId)&&users.has(n.by)&&timestamp(n.at)&&typeof n.key==='string'&&n.key.length<=1000&&(n.readAt===null||timestamp(n.readAt))&&(n.snoozedUntil===null||timestamp(n.snoozedUntil)),'Invalid notification.');uniqueStrings(n.documentIds,1000,'notification documents');check(n.documentIds.every(id=>state.documents.some(d=>d.id===id&&d.projectId===n.projectId)),'Invalid notification resource.');const key=n.userId+':'+n.key;check(!deliveries.has(key),'Duplicate notification delivery.');deliveries.add(key);}
  const ledgerKeys=new Set();for(const entry of state.automationLedger||[]){keys(entry,['id','key','projectId','policyId','resourceType','resourceId','stageId','event','status','code','at','by','delivered','delegatedTo']);check(projects.has(entry.projectId)&&users.has(entry.by)&&timestamp(entry.at)&&typeof entry.key==='string'&&entry.key.length<=1000&&!ledgerKeys.has(entry.key)&&['sent','delegated','blocked'].includes(entry.status)&&typeof entry.code==='string'&&NOTICE_EVENTS.includes(entry.event)&&state[collections[entry.resourceType]]?.some(r=>r.id===entry.resourceId&&r.projectId===entry.projectId)&&Number.isSafeInteger(entry.delivered)&&entry.delivered>=0&&(!entry.delegatedTo||users.has(entry.delegatedTo)),'Invalid automation ledger.');ledgerKeys.add(entry.key);}
  return true;
}

return { AUTOMATION_LIMITS, CONDITION_OPERATORS, WATCH_EVENTS, NOTICE_EVENTS, normalizeCondition, evaluateCondition, normalizeWorkflowRule, evaluateWorkflowRules, normalizeAutomationPolicy, normalizeSubscription, publishCommandNotifications, automationDueItems, runScheduledAutomation, applyAutomationCommand, validateAutomationState };
})();

__modules["packages/core/index.js"] = (() => {
const { planDocumentRename } = __modules["packages/document-rename/index.js"];
const { planDocumentCopy } = __modules["packages/document-copy/index.js"];
const { applyDocumentSetCommand, validateDocumentSets, snapshotDocumentSet } = __modules["packages/document-sets/index.js"];
const { applyExplorerCommand, validateExplorerState } = __modules["packages/explorer/index.js"];
const { applyAutomationCommand, validateAutomationState, evaluateWorkflowRules, publishCommandNotifications, runScheduledAutomation } = __modules["packages/automation/index.js"];
const { normalizeFields, validateMetadata, allocateDocumentNumber, normalizeNumbering, captureBaseline, normalizeReviewStages, recordStageDecision, currentReviewStage, reviewContext, reviewIsCurrent, reviewDocumentCurrent, validateControlState, CONTROL_LIMITS } = __modules["packages/document-control/index.js"];
const { authorizeCommand, normalizePolicy, validateAccessState, canAccess, PERMISSIONS, invalidateAccessCache } = __modules["packages/access/index.js"];
/** Civora's framework-independent command engine. No DOM, network, or database dependencies. */
const SCHEMA_VERSION = 1;
const STATES = ['Work in progress', 'Shared', 'Published', 'Archived'];
const ROLES = ['admin', 'manager', 'author', 'reviewer', 'viewer'];
class DomainError extends Error {
  constructor(message, code = 'VALIDATION') { super(message); this.name = 'DomainError'; this.code = code; }
}
const uid = (prefix = 'id') => `${prefix}-${crypto.randomUUID()}`;
const copy = value => structuredClone(value);
const assert = (condition, message, code) => { if (!condition) throw new DomainError(message, code); };
const clean = (value, limit = 1000) => String(value ?? '').trim().slice(0, limit);
const required = (value, label, limit = 200) => { const text = clean(value, limit); assert(text, `${label} is required.`); return text; };
const roles = (user, allowed) => assert(allowed.includes(user.role), `Your ${user.role} role cannot perform this action.`, 'FORBIDDEN');
const writers = ['admin', 'manager', 'author'];
const reviewers = ['admin', 'manager', 'reviewer'];
const managers = ['admin', 'manager'];
const tags = v => [...new Set((Array.isArray(v) ? v : String(v || '').split(',')).map(x => clean(x, 60)).filter(Boolean))].slice(0, 30);
const date = value => { const d = clean(value, 10), parsed = new Date(d + 'T00:00:00.000Z'); assert(!d || /^\d{4}-\d{2}-\d{2}$/.test(d) && !Number.isNaN(parsed.getTime()) && parsed.toISOString().slice(0, 10) === d, 'Enter a valid calendar date.'); return d; };
const list = (value, max = 1000) => { assert(Array.isArray(value) && value.length <= max, 'Invalid list.'); return [...new Set(value.map(x => clean(x, 120)))]; };
function entity(state, collection, id) { const result = state[collection]?.find(x => x.id === id); assert(result, `${collection} item not found.`, 'NOT_FOUND'); return result; }
function currentVersion(doc) { return doc.versions.at(-1); }
function userName(state, id) { return state.users.find(u => u.id === id)?.name || 'Unknown member'; }
function projectDocs(state, projectId) { return state.documents.filter(d => !d.deletedAt && (!projectId || d.projectId === projectId)); }
function referencesOf(state, id, recursive = true) {
  const documents = new Map(state.documents.map(d => [d.id, d]));
  assert(documents.has(id), 'Document not found.', 'NOT_FOUND');
  const result = new Set(), stack = [...documents.get(id).references].reverse();
  while (stack.length) {
    const next = stack.pop(); if (result.has(next)) continue;
    assert(documents.has(next), 'Referenced document not found.', 'NOT_FOUND');
    result.add(next);
    if (recursive) stack.push(...[...documents.get(next).references].reverse());
  }
  return [...result];
}
function editable(doc, user, { locked = false } = {}) {
  assert(!doc.deletedAt, 'Restore this document before editing it.');
  assert(!doc.legalHold, 'This document is on legal hold.');
  assert(doc.state !== 'Archived', 'Archived documents are read-only.');
  assert(!doc.checkedOutBy || doc.checkedOutBy === user.id, 'This document is checked out by another member.', 'LOCKED');
  if (locked) assert(doc.checkedOutBy === user.id, 'Check out this document before checking in a revision.', 'LOCKED');
}
function validMetadata(project, input = {}, options = {}) { return validateMetadata(project, input, options); }

function validFile(file) {
  assert(file && /^[a-f0-9]{64}$/.test(file.hash) && file.blobId === file.hash, 'Verified file content is required.');
  assert(Number.isSafeInteger(file.size) && file.size >= 0 && file.size <= 50 * 1024 * 1024, 'Files are limited to 50 MiB in this edition.');
  return { blobId: file.blobId, hash: file.hash, size: file.size, mime: clean(file.mime || 'application/octet-stream', 100) };
}
function uniqueName(state, projectId, folderId, name, except) {
  assert(!state.documents.some(d => !d.deletedAt && d.id !== except && d.projectId === projectId && d.folderId === folderId && d.name.toLocaleLowerCase() === name.toLocaleLowerCase()), 'A document with this filename already exists in the folder.');
}
function validateFolder(state, projectId, folderId) {
  if (folderId) assert(entity(state, 'folders', folderId).projectId === projectId, 'The folder is in a different project.');
}
function snapshot(state, ids, projectId) {
  return list(ids).map(id => { const d = entity(state, 'documents', id); assert(!d.deletedAt && d.projectId === projectId, 'Choose active documents in this project.'); const v = currentVersion(d); return { documentId: d.id, versionId: v.id, name: d.name, number: d.number, revision: v.label, blobId: v.blobId, hash: v.hash, size: v.size }; });
}
function createEmptyWorkspace() {
  return {
    schema: SCHEMA_VERSION, id: uid('workspace'), name: 'Civora workspace', revision: 0,
    users: [{ id: 'u-admin', name: 'Alex Morgan', email: 'admin@civora.local', organization: 'Civora Studio', role: 'admin', active: true }],
    projects: [], folders: [], documents: [], comments: [], markups: [], reviews: [], issues: [], transmittals: [], sets: [], savedSearches: [], milestones: [], audit: [],
    explorerViews: [], explorerBookmarks: [],
    groups: [], accessPolicies: [], models: [], clashRuns: [], baselines: [], reviewTemplates: [],
    workflowRules: [], automationPolicies: [], subscriptions: [], notifications: [], automationLedger: [],
    workflows: [{ id: 'wf-standard', name: 'Controlled delivery', states: [...STATES], transitions: [
      { from: 'Work in progress', to: 'Shared', roles: writers, requireReview: false },
      { from: 'Shared', to: 'Work in progress', roles: writers, requireReview: false },
      { from: 'Shared', to: 'Published', roles: managers, requireReview: true },
      { from: 'Published', to: 'Work in progress', roles: managers, requireReview: false },
      { from: 'Published', to: 'Archived', roles: managers, requireReview: false },
      { from: 'Archived', to: 'Work in progress', roles: managers, requireReview: false }
    ] }]
  };
}
/** Pure transactional reducer. Failure never mutates the input workspace. */
function applyCommand(previous, command, actorId, options = {}) {
  validateWorkspace(previous);
  authorizeCommand(previous, command, actorId);
  const state = copy(previous), user = entity(state, 'users', actorId);
  assert(user.active, 'Your membership is disabled.', 'FORBIDDEN');
  const now = options.now || new Date().toISOString();
  const p = command.payload || {}, type = command.type;
  assert(typeof type === 'string', 'Command type is required.');
  let targetId = p.id || p.documentId || p.projectId || '', summary = '', result = null;
  const project = () => entity(state, 'projects', p.projectId);
  const doc = () => entity(state, 'documents', p.id || p.documentId);
  const stamp = object => { object.modifiedAt = now; object.modifiedBy = user.id; };
  const makeVersion = (file, label, comment) => ({ id: uid('ver'), ...validFile(file), label: required(label, 'Revision label', 30), comment: clean(comment, 2000), createdAt: now, createdBy: user.id });
  switch (type) {
    case 'model.register': {
      roles(user,writers);const d=entity(state,'documents',p.documentId);assert(d.projectId===p.projectId&&!d.deletedAt,'Choose an active document in this project.');const v=p.versionId?d.versions.find(v=>v.id===p.versionId):currentVersion(d);assert(v,'Revision not found.');const transform=p.transform||[1,0,0,0,0,1,0,0,0,0,1,0,0,0,0,1];assert(Array.isArray(transform)&&transform.length===16&&transform.every(Number.isFinite)&&transform[3]===0&&transform[7]===0&&transform[11]===0&&transform[15]===1,'Use an affine 4x4 transform.');
      const item={id:uid('model'),projectId:d.projectId,documentId:d.id,versionId:v.id,name:required(p.name||d.title,'Model name'),transform:[...transform],visible:true,createdAt:now,createdBy:user.id};state.models||=[];state.models.push(item);targetId=result=item.id;summary=`Registered model ${item.name} at revision ${v.label}`;break;
    }
    case 'model.update': {
      roles(user,writers);const m=entity(state,'models',p.id);if('name'in p)m.name=required(p.name,'Model name');if('visible'in p)m.visible=!!p.visible;if('transform'in p){assert(Array.isArray(p.transform)&&p.transform.length===16&&p.transform.every(Number.isFinite)&&p.transform[3]===0&&p.transform[7]===0&&p.transform[11]===0&&p.transform[15]===1,'Invalid affine transform.');m.transform=[...p.transform];}if(p.versionId){assert(entity(state,'documents',m.documentId).versions.some(v=>v.id===p.versionId),'Revision not found.');m.versionId=p.versionId;}summary=`Updated federation model ${m.name}`;break;
    }
    case 'model.delete': {roles(user,writers);const m=entity(state,'models',p.id);state.models=state.models.filter(x=>x.id!==m.id);summary=`Removed model ${m.name} from federation`;break;}
    case 'clash.record': {
      roles(user,['admin','manager','author','reviewer']);project();const documentIds=list(p.documentIds);for(const id of documentIds)assert(entity(state,'documents',id).projectId===p.projectId,'Clash sources must belong to this project.');assert(p.report&&Array.isArray(p.report.results)&&p.report.results.length<=500,'Invalid clash report.');assert(JSON.stringify(p.report).length<=1000000,'Clash report is too large.');const item={id:uid('clash'),projectId:p.projectId,name:required(p.name||'Coordination run','Run name'),documentIds,report:copy(p.report),createdAt:now,createdBy:user.id};state.clashRuns||=[];state.clashRuns.push(item);targetId=result=item.id;summary=`Recorded ${item.report.results.length} coordination findings`;break;
    }
    case 'access.set': {
      const policy=normalizePolicy(state,p);state.accessPolicies||=[];state.accessPolicies=state.accessPolicies.filter(x=>!(x.scope===policy.scope&&x.resourceId===policy.resourceId));state.accessPolicies.push(policy);targetId=policy.resourceId;summary=`Updated ${policy.scope} access policy`;break;
    }
    case 'access.remove': {
      normalizePolicy(state,{...p,inherit:true,entries:[]});state.accessPolicies=(state.accessPolicies||[]).filter(x=>!(x.scope===p.scope&&x.resourceId===p.resourceId));targetId=p.resourceId;summary=`Restored inherited ${p.scope} access`;break;
    }
    case 'group.create': {
      roles(user,['admin']);const members=list(p.members||[],10000);for(const id of members)entity(state,'users',id);const item={id:uid('group'),name:required(p.name,'Group name'),members};state.groups||=[];state.groups.push(item);targetId=result=item.id;summary=`Created access group ${item.name}`;break;
    }
    case 'group.update': {
      roles(user,['admin']);const item=entity(state,'groups',p.id);if('name'in p)item.name=required(p.name,'Group name');if('members'in p){item.members=list(p.members,10000);for(const id of item.members)entity(state,'users',id);}summary=`Updated access group ${item.name}`;break;
    }
    case 'group.delete': {
      roles(user,['admin']);entity(state,'groups',p.id);state.groups=state.groups.filter(g=>g.id!==p.id);for(const policy of state.accessPolicies||[])policy.entries=policy.entries.filter(e=>e.principal!=='group:'+p.id);summary='Removed access group and its grants';break;
    }
    case 'project.create': {
      roles(user, managers);
      const code = required(p.code, 'Project code', 30).toUpperCase();
      assert(!state.projects.some(x => x.code === code), 'Project code already exists.');
      const item = { id: uid('project'), code, name: required(p.name, 'Project name'), client: clean(p.client), description: clean(p.description, 2000), phase: clean(p.phase || 'Design'), status: 'Active', location: clean(p.location), dueDate: date(p.dueDate), workflowId: 'wf-standard', fields: [{ key: 'zone', label: 'Zone / location', type: 'text', required: false }, { key: 'originator', label: 'Originator', type: 'text', required: false }], createdAt: now, createdBy: user.id };
      state.projects.push(item);
      state.accessPolicies ||= []; state.accessPolicies.push({id: `acl-project-${item.id}`,scope:"project",resourceId:item.id,inherit:true,entries:[{principal:`user:${user.id}`,allow:[...PERMISSIONS],deny:[]}]});
      if (p.template !== 'blank') for (const name of ['01 · Project information', '02 · Design development', '03 · Shared coordination', '04 · Published deliverables']) state.folders.push({ id: uid('folder'), name, projectId: item.id, parentId: null });
      targetId = item.id; result = item.id; summary = `Created project ${item.code} · ${item.name}`; break;
    }
    case 'project.update': {
      roles(user, managers); const item = entity(state, 'projects', p.id);
      for (const key of ['name', 'client', 'description', 'phase', 'location']) if (key in p) item[key] = key === 'name' ? required(p[key], 'Project name') : clean(p[key], 2000);
      if ('dueDate' in p) item.dueDate = date(p.dueDate);
      if ('status' in p) { assert(['Active', 'On hold', 'Completed'].includes(p.status), 'Invalid status.'); item.status = p.status; }
      stamp(item); summary = `Updated project ${item.name}`; break;
    }
    case 'project.fields': {
      roles(user, managers); const item = entity(state, 'projects', p.id);
      item.fields = normalizeFields(p.fields);
      if (item.numbering) normalizeNumbering(item, item.numbering);
      item.environmentVersion = (item.environmentVersion || 0) + 1;
      summary = `Updated metadata environment for ${item.name}`; break;
    }
    case 'project.numbering': {
      roles(user, managers); const item = entity(state, 'projects', p.id);
      item.numbering = normalizeNumbering(item, p.numbering, item.numbering || {nextSequence: item.nextDocumentSequence || 1});
      stamp(item); summary = `Updated document numbering for ${item.name}`; break;
    }
    case 'baseline.create': {
      roles(user, writers);
      const baseline = captureBaseline(state, p, user.id, now, uid);
      for (const record of baseline.documents) { assert(canAccess(state,user.id,'read','document',record.documentId), 'Access to every baseline dependency is required.', 'FORBIDDEN'); for(const ref of record.context.references)assert(canAccess(state,user.id,'read','document',ref),'Read access to captured reference metadata is required.','FORBIDDEN'); }
      state.baselines ||= []; state.baselines.push(baseline); targetId = result = baseline.id;
      summary = `Froze baseline ${baseline.name} with ${baseline.documents.length} exact revisions`; break;
    }
    case 'reviewTemplate.save': {
      roles(user, managers); const prj = project(); const existing = p.id ? entity(state,'reviewTemplates',p.id) : null;
      assert(!existing || existing.projectId === prj.id, 'The template belongs to another project.');
      const stages = normalizeReviewStages(p.stages,state,{template:true});
      for(const stage of stages)for(const id of stage.assignees)assert(canAccess(state,id,'read','project',prj.id),'A template reviewer cannot read this project.');
      assert(typeof p.separationOfDuties === 'boolean','Choose the separation-of-duties setting.');
      const item = {id:existing?.id||uid('review-template'),projectId:prj.id,name:required(p.name,'Template name'),stages,separationOfDuties:p.separationOfDuties,createdBy:existing?.createdBy||user.id,createdAt:existing?.createdAt||now,modifiedAt:now};
      state.reviewTemplates ||= []; state.reviewTemplates = state.reviewTemplates.filter(t=>t.id!==item.id); state.reviewTemplates.push(item);
      targetId = result = item.id; summary = `${existing?'Updated':'Created'} review route template ${item.name}`; break;
    }
    case 'reviewTemplate.remove': {
      roles(user,managers); const item=entity(state,'reviewTemplates',p.id);state.reviewTemplates=state.reviewTemplates.filter(t=>t.id!==p.id);
      summary=`Removed review template ${item.name}; existing review routes retained`;break;
    }
    case 'document.bulkUpdate': {
      roles(user,writers);
      assert(p.baseRevision === previous.revision,'The workspace changed since this bulk-edit preview. Preview the changes again.','CONFLICT');
      assert(Array.isArray(p.updates)&&p.updates.length>0&&p.updates.length<=CONTROL_LIMITS.batch,'Choose 1–100 bulk updates.');
      const ids=new Set();let staged=state;
      for(const item of p.updates){
        assert(item&&typeof item.id==='string'&&!ids.has(item.id),'Duplicate or invalid document in the batch.');ids.add(item.id);
        const d=entity(staged,'documents',item.id);assert(d.projectId===p.projectId,'Bulk updates must belong to one project.');
        assert(item.expectedVersionId===currentVersion(d).id,'A document revision changed since preview.','CONFLICT');
        assert(item.patch&&typeof item.patch==='object'&&!Array.isArray(item.patch),'A metadata patch is required.');
        assert(Object.keys(item.patch).every(k=>['title','description','discipline','tags','dueDate','metadata'].includes(k)),'Bulk edits cannot change identity, content, state, or security.');
        for(const k of ['title','description','discipline'])if(k in item.patch)assert(typeof item.patch[k]==='string'&&item.patch[k].length<=4000,'Bulk text values must be text of at most 4,000 characters.');
        if('tags' in item.patch){const values=Array.isArray(item.patch.tags)?item.patch.tags:typeof item.patch.tags==='string'?item.patch.tags.split(','):null;assert(values&&values.length<=30&&values.every(v=>typeof v==='string'&&v.trim().length<=60),'Bulk tags need at most 30 strings of 60 characters.');}
        if('dueDate' in item.patch)assert(typeof item.patch.dueDate==='string'&&(!item.patch.dueDate||/^\d{4}-\d{2}-\d{2}$/.test(item.patch.dueDate)),'Invalid bulk calendar date.');
        staged=applyCommand(staged,{type:'document.update',payload:{...item.patch,id:d.id}},user.id,{now}).state;
      }
      state.documents=staged.documents;result={updated:[...ids]};targetId=p.projectId;
      summary=`Atomically updated metadata on ${ids.size} documents`;break;
    }
    case 'folder.create': {
      roles(user, writers); project(); const parentId = p.parentId || null; validateFolder(state, p.projectId, parentId);
      const name = required(p.name, 'Folder name'); assert(!state.folders.some(f => f.projectId === p.projectId && f.parentId === parentId && f.name.toLowerCase() === name.toLowerCase()), 'Folder name already exists.');
      const item = { id: uid('folder'), name, projectId: p.projectId, parentId }; state.folders.push(item); result = targetId = item.id; summary = `Created folder ${name}`; break;
    }
    case 'folder.update': {
      roles(user, writers); const item = entity(state, 'folders', p.id);
      const parentId = 'parentId' in p ? p.parentId || null : item.parentId;
      validateFolder(state, item.projectId, parentId);
      let parent = parentId; const seen = new Set();
      while (parent) { assert(parent !== item.id && !seen.has(parent), 'A folder cannot contain itself.'); seen.add(parent); parent = entity(state, 'folders', parent).parentId; }
      const name = required(p.name || item.name, 'Folder name');
      assert(!state.folders.some(f => f.id !== item.id && f.projectId === item.projectId && f.parentId === parentId && f.name.toLowerCase() === name.toLowerCase()), 'Folder name already exists.');
      Object.assign(item, { name, parentId }); summary = `Updated folder ${name}`; break;
    }
    case 'folder.delete': {
      roles(user, managers); const item = entity(state, 'folders', p.id);
      assert(!state.folders.some(f => f.parentId === item.id) && !state.documents.some(d => d.folderId === item.id), 'Only empty folders can be deleted. Move documents, including recycled documents, first.');
      state.accessPolicies = (state.accessPolicies||[]).filter(a => !(a.scope==='folder'&&a.resourceId===item.id));
      state.subscriptions=(state.subscriptions||[]).filter(s=>!(s.scope==='folder'&&s.resourceId===item.id));
      state.explorerViews=(state.explorerViews||[]).filter(v=>v.config.folderId!==item.id);
      state.explorerBookmarks=(state.explorerBookmarks||[]).filter(b=>!(b.scope==='folder'&&b.resourceId===item.id));
      state.folders = state.folders.filter(f => f.id !== item.id); summary = `Deleted empty folder ${item.name}`; break;
    }
    case 'document.create': {
      roles(user, writers); const prj = project(); validateFolder(state, p.projectId, p.folderId);
      const name = required(p.name, 'Filename', 240); assert(!/[\\/\x00-\x1f]/.test(name), 'Filename cannot contain separators or control characters.'); uniqueName(state, p.projectId, p.folderId || null, name);
      const metadata = validMetadata(prj, p.metadata);
      const number = allocateDocumentNumber(state,prj,p,metadata);
      const item = { id: uid('doc'), projectId: prj.id, folderId: p.folderId || null, number, name, title: clean(p.title || name), description: clean(p.description, 4000), discipline: clean(p.discipline || 'General', 60), tags: tags(p.tags), metadata, state: 'Work in progress', workflowId: prj.workflowId, dueDate: date(p.dueDate), versions: [makeVersion(p.file, p.revision || 'P01', p.comment || 'Initial issue')], references: [], checkedOutBy: null, checkedOutAt: null, deletedAt: null, legalHold: false, retentionUntil: '', createdAt: now, createdBy: user.id, modifiedAt: now, modifiedBy: user.id };
      state.documents.push(item); result = targetId = item.id; summary = `Added ${item.name}`; break;
    }
    case 'document.update': {
      roles(user, writers); const d = doc(); editable(d, user);
      if ('name' in p) { const name = required(p.name, 'Filename', 240); assert(!/[\\/\x00-\x1f]/.test(name), 'Invalid filename.'); uniqueName(state, d.projectId, d.folderId, name, d.id); d.name = name; }
      if ('number' in p) { const number = required(p.number, 'Document number', 100); const prj=entity(state,'projects',d.projectId);assert(number===d.number||!prj.numbering||prj.numbering.allowManual,'This project uses controlled automatic document numbers.');assert(!state.documents.some(x=>x.id!==d.id&&x.projectId===d.projectId&&x.number.toUpperCase()===number.toUpperCase()),'Document number already exists.');d.number=number; }
      for (const key of ['title', 'description', 'discipline']) if (key in p) d[key] = clean(p[key], 4000);
      if ('tags' in p) d.tags = tags(p.tags);
      if ('metadata' in p) d.metadata = validMetadata(entity(state, 'projects', d.projectId), p.metadata);
      if ('dueDate' in p) d.dueDate = date(p.dueDate);
      stamp(d); summary = `Updated metadata for ${d.name}`; break;
    }
    case 'document.bulkRename': {
      const plan=planDocumentRename(previous,user.id,p);
      for(const row of plan.rows)if(row.changed){const d=entity(state,'documents',row.id);d.name=row.to;stamp(d);}
      result={renamed:plan.rows.filter(r=>r.changed).map(({id,from,to})=>({id,from,to}))};targetId=plan.projectId;
      summary=`Atomically renamed ${result.renamed.length} documents: ${plan.reason}`;break;
    }
    case 'document.bulkCopy': {
      const plan = planDocumentCopy(previous,user.id,p);
      let staged=state; const mapping=new Map(),copied=[];
      for (const item of plan.items) {
        const next=applyCommand(staged,{type:'document.create',payload:item.destination},user.id,{now});
        staged=next.state; mapping.set(item.sourceId,next.result);
        copied.push({sourceId:item.sourceId,sourceVersionId:item.sourceVersionId,id:next.result});
      }
      // These are Civora relationship IDs, not paths embedded in a CAD file.
      for (const item of plan.items) {
        const created=staged.documents.find(d=>d.id===mapping.get(item.sourceId));
        created.references=item.references.map(id=>mapping.get(id));
      }
      state.documents=staged.documents;state.projects=staged.projects;
      result={copied};targetId=plan.projectId;
      summary=`Atomically copied ${copied.length} documents as new Work in progress records: ${plan.reason}`;
      break;
    }
    case 'document.bulkMove': {
      roles(user,writers);
      assert(p.baseRevision===previous.revision,'The workspace changed since the move preview. Preview again.','CONFLICT');
      project(); validateFolder(state,p.projectId,p.folderId);
      assert(Array.isArray(p.items)&&p.items.length>0&&p.items.length<=100,'Choose 1–100 documents to move.');
      const ids=new Set();let staged=state;
      for(const item of p.items){
        assert(item&&typeof item.id==='string'&&!ids.has(item.id),'Duplicate or invalid document in move.');ids.add(item.id);
        const d=entity(staged,'documents',item.id);
        assert(d.projectId===p.projectId,'Bulk moves must stay in one project.');
        assert(item.versionId===currentVersion(d).id&&(item.folderId||null)===d.folderId,'The source changed since preview.','CONFLICT');
        assert(d.folderId!==(p.folderId||null),'Choose a different destination folder.');
        staged=applyCommand(staged,{type:'document.move',payload:{id:d.id,folderId:p.folderId||null}},user.id,{now}).state;
      }
      state.documents=staged.documents;result={moved:[...ids]};targetId=p.projectId;
      summary=`Atomically moved ${ids.size} documents`;break;
    }
    case 'document.move': {
      roles(user, writers); const d = doc(); editable(d, user); validateFolder(state, d.projectId, p.folderId); uniqueName(state, d.projectId, p.folderId || null, d.name, d.id); d.folderId = p.folderId || null; stamp(d); summary = `Moved ${d.name}`; break;
    }
    case 'document.checkout': {
      roles(user, writers); const d = doc(); editable(d, user); assert(d.state === 'Work in progress', 'Return this document to Work in progress before editing content.'); assert(!d.checkedOutBy, 'This document is already checked out.', 'LOCKED'); d.checkedOutBy = user.id; d.checkedOutAt = now; stamp(d); summary = `Checked out ${d.name}`; break;
    }
    case 'document.release': {
      roles(user, writers); const d = doc(); assert(d.checkedOutBy, 'This document is not checked out.'); assert(d.checkedOutBy === user.id || user.role === 'admin', 'Only the owner or an administrator can release this lock.', 'FORBIDDEN'); d.checkedOutBy = null; d.checkedOutAt = null; stamp(d); summary = `Released checkout of ${d.name}`; break;
    }
    case 'document.checkin': {
      roles(user, writers); const d = doc(); editable(d, user, { locked: true }); if (p.baseVersionId !== undefined) assert(p.baseVersionId === currentVersion(d).id, 'The working copy is based on an older revision.', 'CONFLICT'); assert(d.state === 'Work in progress', 'Content revisions require Work in progress.'); const label = required(p.revision, 'Revision label', 30); assert(!d.versions.some(v => v.label === label), 'Use a new, unique revision label.'); d.versions.push(makeVersion(p.file, label, p.comment)); d.checkedOutBy = null; d.checkedOutAt = null; stamp(d); summary = `Checked in ${d.name} · ${label}`; break;
    }
    case 'document.restoreVersion': {
      roles(user, writers); const d = doc(); editable(d, user, { locked: true }); assert(d.state === 'Work in progress', 'Restoring content requires Work in progress.'); const old = d.versions.find(v => v.id === p.versionId); assert(old, 'Revision not found.'); const label = required(p.revision, 'New revision label', 30); assert(!d.versions.some(v => v.label === label), 'Use a new revision label.'); d.versions.push(makeVersion(old, label, `Restored from ${old.label}: ${clean(p.comment)}`)); d.checkedOutBy = null; d.checkedOutAt = null; stamp(d); summary = `Restored ${d.name} from ${old.label} as ${label}`; break;
    }
    case 'document.transition': {
      if(p.baseRevision!==undefined)assert(p.baseRevision===previous.revision,'The transition preview is stale. Preview it again.','CONFLICT');
      const d = doc(); assert(!d.deletedAt && !d.legalHold, 'This document is not available for state changes.'); assert(!d.checkedOutBy, 'Release the checkout before changing state.');
      const flow = entity(state, 'workflows', d.workflowId), transition = flow.transitions.find(t => t.from === d.state && t.to === p.to);
      assert(transition, 'This workflow does not allow that transition.'); roles(user, transition.roles);
      const rules=evaluateWorkflowRules(state,d,user,p.to,p.reason||'');
      assert(!rules.errors.length,rules.errors.join(' '));
      if(rules.hasAssignments){assert(canAccess(state,user.id,'write','document',d.id),'Write permission is required for workflow metadata assignments.','FORBIDDEN');d.metadata=rules.metadata;d.tags=rules.tags;}
      validMetadata(entity(state, 'projects', d.projectId), d.metadata, {defaults:false});
      if (transition.requireReview) assert(state.reviews.some(r => r.status === 'Approved' && reviewDocumentCurrent(state,r,d.id)), 'This exact revision must pass a review before publication.');
      const old = d.state; d.state = p.to; stamp(d); summary = `${d.name}: ${old} → ${d.state}${p.reason ? ` · ${clean(p.reason)}` : ''}`; break;
    }
    case 'document.references': {
      roles(user, writers); const d = doc(); editable(d, user); if(p.baseVersionId!==undefined)assert(p.baseVersionId===currentVersion(d).id,'The source revision changed after reference scanning.','CONFLICT');const refs = list(p.references);
      for (const id of refs) { const ref = entity(state, 'documents', id); assert(!ref.deletedAt && ref.projectId === d.projectId && ref.id !== d.id, 'References must point to other active documents in this project.'); }
      d.references = refs; assert(!referencesOf(state, d.id).includes(d.id), 'Circular references are not allowed.'); stamp(d); summary = `Updated reference graph for ${d.name}`; break;
    }
    case 'document.delete': {
      roles(user, writers); const d = doc(); editable(d, user); assert(!d.checkedOutBy, 'Release the checkout before recycling.'); assert(!d.retentionUntil || d.retentionUntil < now.slice(0, 10), 'The retention period has not expired.'); assert(!state.sets.some(s=>s.locked&&s.documentIds.includes(d.id)), 'A locked document set retains this document. Unlock and remove its membership first.', 'LOCKED'); assert(!state.documents.some(x => !x.deletedAt && x.references.includes(d.id)), 'Another active document references this document. Remove the reference first.'); d.deletedAt = now; stamp(d); summary = `Moved ${d.name} to the recycle bin`; break;
    }
    case 'document.restore': {
      roles(user, writers); const d = doc(); assert(d.deletedAt, 'Document is not recycled.'); uniqueName(state, d.projectId, d.folderId, d.name, d.id); d.deletedAt = null; stamp(d); summary = `Restored ${d.name} from the recycle bin`; break;
    }
    case 'document.retention': {
      roles(user, managers); const d = doc(); d.legalHold = !!p.legalHold; d.retentionUntil = date(p.retentionUntil); stamp(d); summary = `Updated retention for ${d.name} · legal hold ${d.legalHold ? 'on' : 'off'}`; break;
    }
    case 'comment.add': {
      roles(user, ['admin', 'manager', 'author', 'reviewer']); const d = doc(); assert(!d.deletedAt, 'Document is recycled.'); const item = { id: uid('comment'), documentId: d.id, versionId: p.versionId || currentVersion(d).id, text: required(p.text, 'Comment', 6000), by: user.id, createdAt: now, resolved: false }; assert(d.versions.some(v => v.id === item.versionId), 'Revision not found.'); state.comments.push(item); result = item.id; summary = `Commented on ${d.name}`; break;
    }
    case 'comment.resolve': {
      roles(user, ['admin', 'manager', 'author', 'reviewer']); const c = entity(state, 'comments', p.id); c.resolved = !c.resolved; c.resolvedBy = user.id; summary = `${c.resolved ? 'Resolved' : 'Reopened'} a document comment`; break;
    }
    case 'markup.add': {
      roles(user, ['admin', 'manager', 'author', 'reviewer']); const d = doc(); assert(!d.deletedAt, 'Document is recycled.');
      const versionId = p.versionId || currentVersion(d).id; assert(d.versions.some(v => v.id === versionId), 'Revision not found.'); assert(['pin', 'rectangle'].includes(p.tool), 'Unsupported markup tool.');
      assert(Number.isFinite(p.x) && Number.isFinite(p.y), 'Markup coordinates x and y are required.');
      for (const key of ['x', 'y', 'w', 'h']) assert(Number.isFinite(p[key] ?? 0) && (p[key] ?? 0) >= 0 && (p[key] ?? 0) <= 1, 'Invalid normalized markup coordinates.');
      assert(p.x + (p.w || 0) <= 1.00000001 && p.y + (p.h || 0) <= 1.00000001, 'Markup extends outside the drawing.');
      const item = { id: uid('markup'), documentId: d.id, versionId, tool: p.tool, x: p.x, y: p.y, w: p.w || 0, h: p.h || 0, text: required(p.text, 'Markup note', 2000), by: user.id, createdAt: now, resolved: false }; state.markups.push(item); result = item.id; summary = `Added a ${p.tool} markup to ${d.name}`; break;
    }
    case 'markup.resolve': {
      roles(user, ['admin', 'manager', 'author', 'reviewer']); const m = entity(state, 'markups', p.id); m.resolved = !m.resolved; summary = `${m.resolved ? 'Resolved' : 'Reopened'} a markup`; break;
    }
    case 'review.create': {
      roles(user, ['admin', 'manager', 'author', 'reviewer']); project(); const records = p.setId?snapshotDocumentSet(state,user.id,p,{currentOnly:true}):snapshot(state, p.documentIds, p.projectId); assert(records.length, 'Choose at least one document.');
      for (const s of records) assert(!entity(state, 'documents', s.documentId).checkedOutBy, 'Checked-out documents cannot be submitted for review.');
      const template=p.templateId?entity(state,'reviewTemplates',p.templateId):null;assert(!template||template.projectId===p.projectId,'The review template belongs to another project.');
      const routed=!!(p.stages||template), stages=routed?normalizeReviewStages(p.stages||template.stages,state):null;
      const separationOfDuties=routed?(p.separationOfDuties??template?.separationOfDuties??false):false;
      assert(typeof separationOfDuties==='boolean','Invalid separation-of-duties setting.');
      const assignees=routed?[...new Set(stages.flatMap(s=>s.assignees))]:list(p.assignees,50);
      assert(assignees.length,'Choose at least one reviewer.');
      for(const id of assignees){const assignee=entity(state,'users',id);assert(assignee.active&&reviewers.includes(assignee.role),'Reviewers must be active reviewers, managers, or administrators.');assert(canAccess(state,id,'read','project',p.projectId)&&records.every(r=>canAccess(state,id,'review','document',r.documentId)),'Reviewer does not have access to every review document.');
        if(separationOfDuties)assert(id!==user.id&&records.every(r=>entity(state,'documents',r.documentId).versions.find(v=>v.id===r.versionId).createdBy!==id),'Separation of duties excludes the initiator and pinned-revision authors.');}
      if(routed)for(const record of records){const source=entity(state,'documents',record.documentId);validMetadata(entity(state,'projects',source.projectId),source.metadata,{defaults:false});record.context=reviewContext(source);}
      const item={id:uid('review'),projectId:p.projectId,title:required(p.title,'Review title'),documents:records,assignees,dueDate:date(p.dueDate),description:clean(p.description,4000),status:'In review',decisions:[],createdAt:now,createdBy:user.id};
      if(routed)Object.assign(item,{stages:stages.map((stage,i)=>({...stage,status:i===0?'In review':'Pending',...(i===0?{activatedAt:now}:{})})),currentStage:0,separationOfDuties,templateId:template?.id||null,reassignments:[]});
      state.reviews.push(item);result=targetId=item.id;summary=`Started ${routed?`${stages.length}-stage `:''}review ${item.title}`;break;
    }
    case 'review.decide': {
      roles(user,reviewers);const r=entity(state,'reviews',p.id);assert(r.status==='In review','This review is already closed.');
      assert(reviewIsCurrent(state,r),'A reviewed document is checked out, recycled, has changed metadata, or has a newer revision. Cancel this review and create a new one.','CONFLICT');
      for(const record of r.documents)assert(canAccess(state,user.id,'review','document',record.documentId),'Review permission is required for every document.','FORBIDDEN');
      if(r.stages)recordStageDecision(r,p,user,now);
      else{assert(r.assignees.includes(user.id),'Only an assigned reviewer can submit a decision.','FORBIDDEN');assert(['Approved','Changes requested'].includes(p.decision),'Invalid review decision.');assert(!r.decisions.some(d=>d.by===user.id),'You have already submitted a decision.');
        r.decisions.push({by:user.id,decision:p.decision,comment:required(p.comment,'Decision comment',4000),at:now});
        if(p.decision==='Changes requested')r.status='Changes requested';else if(r.decisions.length===r.assignees.length)r.status='Approved';}
      summary=`${p.decision} · ${r.title}`;break;
    }
    case 'review.reassign': {
      roles(user,managers);const r=entity(state,'reviews',p.id),stage=currentReviewStage(r);
      assert(r.status==='In review'&&stage,'Only an active routed review supports reassignment.');
      assert(stage.id===p.stageId,'The active review stage changed.','CONFLICT');
      assert(stage.assignees.includes(p.from)&&!stage.assignees.includes(p.to),'Choose an existing assignee and a new replacement.');
      assert(!r.decisions.some(d=>d.stageId===stage.id&&d.by===p.from),'An assignee with a recorded decision cannot be replaced.');
      const replacement=entity(state,'users',p.to);assert(replacement.active&&reviewers.includes(replacement.role),'Choose an active reviewer, manager, or administrator.');
      assert(canAccess(state,p.to,'read','project',r.projectId)&&r.documents.every(s=>canAccess(state,p.to,'review','document',s.documentId)),'Replacement reviewer cannot access every document.');
      if(r.separationOfDuties)assert(p.to!==r.createdBy&&r.documents.every(s=>entity(state,'documents',s.documentId).versions.find(v=>v.id===s.versionId).createdBy!==p.to),'Replacement violates separation of duties.');
      const reason=required(p.reason,'Reassignment reason',2000);stage.assignees=stage.assignees.map(id=>id===p.from?p.to:id);r.assignees=[...new Set(r.stages.flatMap(s=>s.assignees))];r.reassignments.push({by:user.id,at:now,stageId:stage.id,from:p.from,to:p.to,reason});
      summary=`Reassigned ${stage.name} in ${r.title}: ${reason}`;break;
    }
    case 'review.cancel': { roles(user, managers); const r = entity(state, 'reviews', p.id); assert(r.status === 'In review', 'Only an open review can be cancelled.'); r.status = 'Cancelled'; summary = `Cancelled review ${r.title}`; break; }
    case 'issue.create': {
      roles(user, ['admin', 'manager', 'author', 'reviewer']); project(); if (p.documentId) assert(entity(state, 'documents', p.documentId).projectId === p.projectId, 'Document belongs to another project.'); if (p.assignee) { assert(entity(state, 'users', p.assignee).active, 'Assignee is inactive.'); assert(canAccess(state,p.assignee,'read','project',p.projectId)&&(!p.documentId||canAccess(state,p.assignee,'read','document',p.documentId)),'Assignee does not have access to this issue.'); }
      const kind = p.kind === 'RFI' ? 'RFI' : 'Issue', number = `${kind.toUpperCase()}-${String(state.issues.length + 1).padStart(3, '0')}`;
      assert(['Low', 'Normal', 'High', 'Critical'].includes(p.priority || 'Normal'), 'Invalid priority.');
      const item = { id: uid('issue'), number, projectId: p.projectId, documentId: p.documentId || null, kind, title: required(p.title, 'Title'), description: clean(p.description, 6000), priority: p.priority || 'Normal', status: 'Open', assignee: p.assignee || user.id, dueDate: date(p.dueDate), createdBy: user.id, createdAt: now, modifiedAt: now, responses: [] }; state.issues.push(item); result = targetId = item.id; summary = `Created ${number} · ${item.title}`; break;
    }
    case 'issue.update': {
      roles(user, ['admin', 'manager', 'author', 'reviewer']); const i = entity(state, 'issues', p.id);
      assert(i.assignee === user.id || i.createdBy === user.id || managers.includes(user.role), 'Only the assignee, author, or a manager can update this issue.', 'FORBIDDEN');
      if ('status' in p) { assert(['Open', 'In progress', 'Resolved', 'Closed'].includes(p.status), 'Invalid issue status.'); i.status = p.status; }
      if ('priority' in p) { assert(['Low', 'Normal', 'High', 'Critical'].includes(p.priority), 'Invalid priority.'); i.priority = p.priority; }
      if ('assignee' in p) { assert(entity(state, 'users', p.assignee).active, 'Assignee is inactive.'); assert(canAccess(state,p.assignee,'read','project',i.projectId)&&(!i.documentId||canAccess(state,p.assignee,'read','document',i.documentId)),'Assignee does not have access to this issue.'); i.assignee = p.assignee; }
      if ('dueDate' in p) i.dueDate = date(p.dueDate);
      if (p.response) i.responses.push({ id: uid('response'), text: clean(p.response, 6000), by: user.id, at: now });
      stamp(i); summary = `Updated ${i.number} · ${i.status}`; break;
    }
    case 'transmittal.create': {
      roles(user, managers); project(); const baseline=p.baselineId?entity(state,'baselines',p.baselineId):null;assert(!baseline||baseline.projectId===p.projectId,'Baseline belongs to another project.');assert(!(p.baselineId&&p.setId),'Choose either a baseline or a document set.');const records=p.setId?snapshotDocumentSet(state,user.id,p):baseline?copy(baseline.documents):snapshot(state,p.documentIds,p.projectId); assert(records.length, 'Choose at least one document.'); const recipients = [...new Set(tags(p.recipients).map(email => email.toLowerCase()))]; assert(recipients.length && recipients.every(e => /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(e)), 'Enter valid recipient email addresses.');
      const item = { id: uid('transmittal'), number: `TR-${String(state.transmittals.length + 1).padStart(4, '0')}`, projectId: p.projectId, title: required(p.title, 'Transmittal title'), purpose: clean(p.purpose || 'For information', 200), ...(baseline?{baselineId:baseline.id}:{}), ...(p.setId?{sourceSetId:p.setId,sourceSetVersion:p.expectedSetVersion}:{}), message: clean(p.message, 6000), recipients, dueDate: date(p.dueDate), documents: records, status: 'Draft', createdAt: now, createdBy: user.id, issuedAt: null, acknowledgements: [] }; state.transmittals.push(item); result = targetId = item.id; summary = `Prepared transmittal ${item.number}`; break;
    }
    case 'transmittal.issue': {
      roles(user, managers); const t = entity(state, 'transmittals', p.id); assert(t.status === 'Draft', 'Only draft transmittals can be issued.'); for (const s of t.documents) { const d = entity(state, 'documents', s.documentId); assert(!d.deletedAt && !d.checkedOutBy, 'Cannot issue recycled or checked-out documents.'); }
      t.status = 'Issued'; t.issuedAt = now; t.issuedBy = user.id; summary = `Issued ${t.number} with ${t.documents.length} pinned revisions (delivery is external)`; break;
    }
    case 'transmittal.acknowledge': {
      roles(user, managers); const t = entity(state, 'transmittals', p.id); assert(t.status === 'Issued', 'Only issued transmittals can be acknowledged.'); const recipient = clean(p.recipient).toLowerCase(); assert(t.recipients.some(e => e.toLowerCase() === recipient), 'Recipient is not in this transmittal.'); assert(!t.acknowledgements.some(a => a.recipient === recipient), 'Receipt is already recorded.'); t.acknowledgements.push({ recipient, note: required(p.note, 'Receipt evidence / note', 2000), recordedBy: user.id, at: now }); if (t.acknowledgements.length === t.recipients.length) t.status = 'Acknowledged'; summary = `Recorded external receipt of ${t.number} by ${recipient}`; break;
    }
    case 'search.save': {
      const item = { id: uid('search'), name: required(p.name, 'View name', 80), query: clean(p.query, 500), state: clean(p.state, 80), discipline: clean(p.discipline, 80), projectId: p.projectId || null, userId: user.id }; if (item.projectId) project(); state.savedSearches.push(item); result = targetId = item.id; summary = `Saved view ${item.name}`; break;
    }
    case 'search.delete': { const s = entity(state, 'savedSearches', p.id); assert(s.userId === user.id || user.role === 'admin', 'This view belongs to another member.', 'FORBIDDEN'); state.savedSearches = state.savedSearches.filter(x => x.id !== s.id); summary = `Deleted saved view ${s.name}`; break; }
    case 'milestone.create': { roles(user, managers); project(); const item = { id: uid('milestone'), projectId: p.projectId, title: required(p.title, 'Milestone title'), dueDate: required(date(p.dueDate), 'Due date'), completed: false, createdAt: now }; state.milestones.push(item); result = targetId = item.id; summary = `Created milestone ${item.title}`; break; }
    case 'milestone.toggle': { roles(user, managers); const m = entity(state, 'milestones', p.id); m.completed = !m.completed; summary = `${m.completed ? 'Completed' : 'Reopened'} milestone ${m.title}`; break; }
    case 'user.create': {
      roles(user, ['admin']); const email = required(p.email, 'Email', 200).toLowerCase(); assert(/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email) && !state.users.some(u => u.email === email), 'Enter a valid, unique email.'); assert(ROLES.includes(p.role), 'Invalid role.'); const item = { id: uid('user'), name: required(p.name, 'Name'), email, organization: clean(p.organization), role: p.role, active: true }; state.users.push(item); result = targetId = item.id; summary = `Added member ${item.name}`; break;
    }
    case 'user.update': {
      roles(user, ['admin']); const u = entity(state, 'users', p.id);
      if ('role' in p) { assert(ROLES.includes(p.role), 'Invalid role.'); u.role = p.role; }
      if ('active' in p) u.active = !!p.active;
      if ('name' in p) u.name = required(p.name, 'Name');
      if ('organization' in p) u.organization = clean(p.organization);
      assert(state.users.some(x => x.active && x.role === 'admin'), 'At least one active administrator is required.'); summary = `Updated member ${u.name} · ${u.role}${u.active ? '' : ' · disabled'}`; break;
    }
    case 'workflow.create': {
      roles(user, ['admin']); assert(Array.isArray(p.states) && p.states.length >= 2 && p.states.length <= 12, 'A workflow needs 2–12 states.'); const states = list(p.states, 12); assert(states.every(Boolean) && states.includes('Work in progress'), 'Include the initial Work in progress state.');
      assert(Array.isArray(p.transitions) && p.transitions.length > 0 && p.transitions.length <= 50, 'Enter workflow transitions.'); const transitions = p.transitions.map(t => { assert(states.includes(t.from) && states.includes(t.to) && t.from !== t.to, 'Invalid workflow transition.'); const allowed = list(t.roles, 5); assert(allowed.length && allowed.every(r => ROLES.includes(r) && r !== 'viewer'), 'Choose valid transition roles.'); return { from: t.from, to: t.to, roles: allowed, requireReview: !!t.requireReview }; });
      const item = { id: uid('workflow'), name: required(p.name, 'Workflow name'), states, transitions }; state.workflows.push(item); result = targetId = item.id; summary = `Created workflow ${item.name}`; break;
    }
    case 'project.workflow': { roles(user, ['admin']); const prj = entity(state, 'projects', p.id); entity(state, 'workflows', p.workflowId); prj.workflowId = p.workflowId; summary = `Assigned workflow for future documents in ${prj.name}`; break; }
    default: {const outcome=applyDocumentSetCommand(state,command,user,now)||applyExplorerCommand(state,command,user,now)||applyAutomationCommand(state,command,user,now);assert(outcome,`Unknown command: ${type}`);({result,summary,targetId}=outcome);break;}
  }
  state.revision = previous.revision + 1;
  invalidateAccessCache(state);
  publishCommandNotifications(previous,state,command,result,user.id,now);
  state.audit.push({ id: uid('audit'), sequence: state.revision, commandId: clean(command.id || uid('cmd'), 100), at: now, by: user.id, type, targetId, summary });
  if(type==='document.bulkCopy')state.audit.at(-1).copySources=copy(result.copied);
  if(type==='document.bulkRename')state.audit.at(-1).renameChanges=copy(result.renamed);
  validateWorkspace(state);
  return { state, result };
}
/** Server-owned reconciliation with live policy-owner authorization. No synthetic admin.
 * Empty ticks do not write or advance the optimistic-concurrency revision. */
function applyScheduledAutomation(previous, now=new Date().toISOString()) {
  validateWorkspace(previous);const state=copy(previous),outcomes=runScheduledAutomation(state,now);
  if(!outcomes.length)return {state:previous,result:[],changed:false};
  state.revision=previous.revision+1;invalidateAccessCache(state);
  state.audit.push({id:uid('audit'),sequence:state.revision,commandId:uid('scheduler'),at:now,by:'system:scheduler',type:'automation.tick',targetId:'',summary:`Reconciled ${outcomes.length} scheduled events; ${outcomes.filter(x=>x.status==='delegated').length} delegated, ${outcomes.filter(x=>x.status==='blocked').length} blocked`});
  validateWorkspace(state);return {state,result:outcomes,changed:true};
}
/** Preview runs the real command reducer and discards its output. No blob writes. */
function previewDocumentCopy(state,actorId,input) {
  const payload=copy(input); delete payload.expectedRevision;
  payload.baseRevision=state.revision;
  const plan=planDocumentCopy(state,actorId,payload);
  const out=applyCommand(state,{type:'document.bulkCopy',payload},actorId);
  const rows=plan.items.map((item,i)=>{const d=out.state.documents.find(d=>d.id===out.result.copied[i].id);return {
    sourceId:item.sourceId,sourceVersionId:item.sourceVersionId,sourceName:item.sourceName,sourceRevision:item.sourceRevision,
    sourceCheckedOut:item.sourceCheckedOut,historical:item.historical,omittedMetadata:item.omittedMetadata,
    omittedReferences:item.omittedReferences,remappedReferences:item.references.length,
    name:d.name,number:d.number,title:d.title,metadata:d.metadata,state:d.state,revision:currentVersion(d).label,
    hash:currentVersion(d).hash,size:currentVersion(d).size
  };});
  return {allowed:true,sourceRevision:state.revision,payload,rows};
}
function previewDocumentRename(state,actorId,input) {
  const payload=copy(input);delete payload.expectedRevision;payload.baseRevision=state.revision;
  const plan=planDocumentRename(state,actorId,payload);
  applyCommand(state,{type:'document.bulkRename',payload},actorId);
  return {allowed:true,sourceRevision:state.revision,payload,rows:plan.rows};
}
function previewDocumentMove(state,actorId,{projectId,folderId=null,documentIds=[]}={}) {
  assert(Array.isArray(documentIds)&&documentIds.length>0&&documentIds.length<=100,'Choose 1–100 documents.');
  const items=documentIds.map(id=>{
    assert(canAccess(state,actorId,'read','document',id),'A source document is not available.','FORBIDDEN');
    const d=entity(state,'documents',id);return {id:d.id,versionId:currentVersion(d).id,folderId:d.folderId};
  });
  const payload={projectId,folderId,items,baseRevision:state.revision};
  applyCommand(state,{type:'document.bulkMove',payload},actorId);
  return {allowed:true,sourceRevision:state.revision,payload};
}
function previewDocumentTransition(state,actorId,payload) {
  const document=state.documents.find(d=>d.id===payload.id);
  const output=applyCommand(state,{type:'document.transition',payload},actorId);
  const proposed=output.state.documents.find(d=>d.id===payload.id);
  return {allowed:true,documentId:document.id,sourceRevision:state.revision,from:document.state,to:proposed.state,metadata:proposed.metadata,tags:proposed.tags,summary:output.state.audit.at(-1).summary};
}
function searchDocuments(state, { projectId = '', folderId = '', query = '', state: stateFilter = '', discipline = '', checkedOutBy = '', deleted = false, recursive = true, sort = 'modifiedAt', direction = 'desc' } = {}) {
  const folders = new Set(folderId ? [folderId] : []);
  if (folderId && recursive) { let changed = true; while (changed) { changed = false; for (const f of state.folders) if (folders.has(f.parentId) && !folders.has(f.id)) { folders.add(f.id); changed = true; } } }
  const tokens = [...String(query).matchAll(/(?:([^\s:"]+):)?(?:"([^"]+)"|(\S+))/g)].map(m => ({ key: m[1]?.toLowerCase(), value: (m[2] || m[3]).toLowerCase() }));
  const result = state.documents.filter(d => {
    if (!!d.deletedAt !== !!deleted || projectId && d.projectId !== projectId || folderId && !folders.has(d.folderId) || stateFilter && d.state !== stateFilter || discipline && d.discipline !== discipline || checkedOutBy && d.checkedOutBy !== checkedOutBy) return false;
    const haystack = [d.name, d.number, d.title, d.description, d.discipline, ...d.tags, ...Object.values(d.metadata || {})].join(' ').toLowerCase();
    return tokens.every(({ key, value }) => {
      if (!key) return haystack.includes(value);
      if (key === 'type') return d.name.split('.').pop().toLowerCase() === value;
      if (key === 'tag') return d.tags.some(t => t.toLowerCase().includes(value));
      if (key === 'state') return d.state.toLowerCase().includes(value);
      if (key === 'owner') return userName(state, d.createdBy).toLowerCase().includes(value);
      if (key === 'revision') return currentVersion(d).label.toLowerCase().includes(value);
      return String(d[key] ?? d.metadata?.[key] ?? '').toLowerCase().includes(value);
    });
  });
  const multiplier = direction === 'asc' ? 1 : -1;
  result.sort((a, b) => String(a[sort] || '').localeCompare(String(b[sort] || ''), undefined, { numeric: true }) * multiplier || a.id.localeCompare(b.id));
  return result;
}
function validateWorkspace(state) {
  if(state&&typeof state==='object')invalidateAccessCache(state);
  assert(!state?.projection?.filtered, 'A filtered workspace cannot be used as an authoritative backup.');
  assert(state && state.schema === SCHEMA_VERSION, 'Unsupported workspace schema.');
  assert(typeof state.name === 'string' && typeof state.id === 'string', 'Invalid workspace identity.');
  assert(Number.isSafeInteger(state.revision) && state.revision >= 0, 'Invalid workspace revision.');
  const collections = ['users', 'projects', 'folders', 'documents', 'comments', 'markups', 'reviews', 'issues', 'transmittals', 'sets', 'savedSearches', 'milestones', 'workflows', 'audit'];
  for (const name of collections) { assert(Array.isArray(state[name]) && state[name].length <= 200000, `Invalid ${name} collection.`); const seen = new Set(); for (const item of state[name]) { assert(item && typeof item.id === 'string' && item.id.length <= 120 && !seen.has(item.id), `Invalid or duplicate ${name} identifier.`); seen.add(item.id); } }
  validateAccessState(state);
  validateControlState(state);
  validateAutomationState(state);
  validateExplorerState(state);
  validateDocumentSets(state);
  const projects = new Set(state.projects.map(p => p.id)), folders = new Map(state.folders.map(f => [f.id, f])), docs = new Map(state.documents.map(d => [d.id, d])), users = new Set(state.users.map(u => u.id)), flows = new Map(state.workflows.map(w => [w.id, w]));
  assert(state.users.some(u => u.role === 'admin' && u.active), 'Workspace requires an administrator.');
  for (const u of state.users) assert(ROLES.includes(u.role) && typeof u.name === 'string' && typeof u.email === 'string', 'Invalid member.');
  for (const prj of state.projects) assert(flows.has(prj.workflowId) && Array.isArray(prj.fields) && typeof prj.name === 'string', 'Invalid project.');
  for (const f of state.folders) {
    assert(projects.has(f.projectId) && (!f.parentId || folders.get(f.parentId)?.projectId === f.projectId), 'Invalid folder parent.'); const seen = new Set([f.id]); let parent = f.parentId;
    while (parent) { assert(!seen.has(parent), 'Folder cycle detected.'); seen.add(parent); parent = folders.get(parent)?.parentId; }
  }
  const string = (v, label) => assert(typeof v === 'string', `Invalid ${label}.`);
  for (const w of state.workflows) {
    string(w.name, 'workflow name');
    assert(Array.isArray(w.states) && w.states.includes('Work in progress') && w.states.every(x => typeof x === 'string') && new Set(w.states).size === w.states.length, 'Invalid workflow states.');
    assert(Array.isArray(w.transitions) && w.transitions.every(t => w.states.includes(t.from) && w.states.includes(t.to) && t.from !== t.to && Array.isArray(t.roles) && t.roles.length && t.roles.every(r => ROLES.includes(r) && r !== 'viewer') && typeof t.requireReview === 'boolean'), 'Invalid workflow transitions.');
  }
  for (const prj of state.projects) {
    string(prj.code, 'project code');
    const seen = new Set();
    for (const f of prj.fields) { assert(f && typeof f.key === 'string' && /^[a-z][a-z0-9_]*$/.test(f.key) && !['constructor','prototype','__proto__'].includes(f.key) && !seen.has(f.key) && typeof f.label === 'string' && ['text','date','number','integer','choice','boolean'].includes(f.type) && typeof f.required === 'boolean', 'Invalid project metadata field.'); seen.add(f.key); }
  }
  for (const f of state.folders) string(f.name, 'folder name');
  for (const r of state.reviews) assert(typeof r.title === 'string' && ['In review','Approved','Changes requested','Cancelled'].includes(r.status) && Array.isArray(r.assignees) && r.assignees.every(id => users.has(id)) && Array.isArray(r.decisions) && r.decisions.every(d => r.assignees.includes(d.by) && typeof d.comment === 'string' && ['Approved','Changes requested'].includes(d.decision)), 'Invalid review details.');
  for (const t of state.transmittals) assert(typeof t.title === 'string' && typeof t.number === 'string' && typeof t.message === 'string' && typeof t.purpose === 'string' && Array.isArray(t.recipients) && t.recipients.every(r => typeof r === 'string') && Array.isArray(t.acknowledgements) && t.acknowledgements.every(a => typeof a.recipient === 'string' && typeof a.note === 'string') && ['Draft','Issued','Acknowledged'].includes(t.status), 'Invalid transmittal details.');
  for (const i of state.issues) assert(typeof i.title === 'string' && typeof i.number === 'string' && ['Issue','RFI'].includes(i.kind) && ['Low','Normal','High','Critical'].includes(i.priority) && ['Open','In progress','Resolved','Closed'].includes(i.status) && Array.isArray(i.responses) && i.responses.every(r => typeof r.text === 'string') && users.has(i.assignee), 'Invalid issue details.');
  for (const c of state.comments) assert(typeof c.text === 'string' && users.has(c.by), 'Invalid comment details.');
  for (const m of state.markups) assert(typeof m.text === 'string' && ['pin','rectangle'].includes(m.tool) && [m.x,m.y,m.w,m.h].every(n => Number.isFinite(n) && n >= 0 && n <= 1), 'Invalid markup details.');
  for (const v of state.savedSearches) assert(typeof v.name === 'string' && typeof v.query === 'string' && users.has(v.userId), 'Invalid saved search.');
  for (const a of state.audit) assert(typeof a.summary === 'string' && typeof a.at === 'string' && !Number.isNaN(Date.parse(a.at)) && typeof a.type === 'string' && Number.isSafeInteger(a.sequence), 'Invalid audit record.');
  const versionIds = new Set();
  for (const d of state.documents) {
    assert(projects.has(d.projectId) && (!d.folderId || folders.get(d.folderId)?.projectId === d.projectId), 'Invalid document location.');
    assert(typeof d.name === 'string' && typeof d.title === 'string' && typeof d.description === 'string' && typeof d.discipline === 'string' && typeof d.number === 'string' && Array.isArray(d.tags) && d.tags.every(t => typeof t === 'string') && d.metadata && typeof d.metadata === 'object', 'Invalid document metadata.');
    assert(flows.get(d.workflowId)?.states.includes(d.state) && Array.isArray(d.versions) && d.versions.length > 0, 'Invalid document workflow or revisions.');
    assert(!d.checkedOutBy || users.has(d.checkedOutBy), 'Invalid checkout owner.');
    const labels = new Set(); for (const v of d.versions) { validFile(v); assert(typeof v.id === 'string' && !versionIds.has(v.id) && typeof v.label === 'string' && !labels.has(v.label), 'Invalid or duplicate revision.'); versionIds.add(v.id); labels.add(v.label); }
    assert(Array.isArray(d.references) && d.references.every(r => docs.get(r)?.projectId === d.projectId && r !== d.id), 'Invalid document reference.');
  }
  // Iterative topological check, including disconnected components.
  const indegree = new Map(state.documents.map(d => [d.id, 0])); for (const d of state.documents) for (const r of d.references) indegree.set(r, indegree.get(r) + 1);
  const queue = [...indegree].filter(([, n]) => n === 0).map(([id]) => id); let cursor = 0;
  while (cursor < queue.length) for (const r of docs.get(queue[cursor++]).references) { indegree.set(r, indegree.get(r) - 1); if (indegree.get(r) === 0) queue.push(r); }
  assert(cursor === docs.size, 'Document reference cycle detected.');
  for (const r of [...state.reviews, ...state.transmittals]) { assert(projects.has(r.projectId) && Array.isArray(r.documents), 'Invalid delivery record.'); for (const s of r.documents) { const d = docs.get(s.documentId), v = d?.versions.find(x => x.id === s.versionId); assert(d?.projectId === r.projectId && v && v.blobId === s.blobId && v.hash === s.hash && v.label === s.revision && v.size === s.size && typeof s.name === 'string', 'Broken pinned revision.'); } }
  for (const c of [...state.comments, ...state.markups]) assert(docs.get(c.documentId)?.versions.some(v => v.id === c.versionId), 'Broken comment or markup revision.');
  for (const s of state.sets) assert(projects.has(s.projectId) && Array.isArray(s.documentIds) && s.documentIds.every(id => docs.get(id)?.projectId === s.projectId), 'Invalid document set.');
  for (const i of state.issues) assert(projects.has(i.projectId) && (!i.documentId || docs.get(i.documentId)?.projectId === i.projectId), 'Invalid issue reference.');
  for(const m of state.models||[])assert(typeof m.id==='string'&&typeof m.name==='string'&&projects.has(m.projectId)&&docs.get(m.documentId)?.projectId===m.projectId&&docs.get(m.documentId).versions.some(v=>v.id===m.versionId)&&Array.isArray(m.transform)&&m.transform.length===16&&m.transform.every(Number.isFinite),'Invalid model registration.');
  for(const r of state.clashRuns||[])assert(typeof r.id==='string'&&projects.has(r.projectId)&&Array.isArray(r.documentIds)&&r.documentIds.every(id=>docs.get(id)?.projectId===r.projectId)&&r.report&&Array.isArray(r.report.results)&&r.report.results.length<=500,'Invalid clash report.');
  for (const m of state.milestones) assert(projects.has(m.projectId), 'Invalid milestone.');
  return true;
}
function csv(rows, columns) {
  columns = columns.map(c => typeof c === 'string' ? { label: c, value: c } : c);
  const cell = value => { let v = String(value ?? ''); if (/^[=+\-@\t\r]/.test(v)) v = "'" + v; return `"${v.replaceAll('"', '""')}"`; };
  return '\uFEFF' + [columns.map(c => cell(c.label)).join(','), ...rows.map(r => columns.map(c => cell(typeof c.value === 'function' ? c.value(r) : r[c.value])).join(','))].join('\r\n');
}

return { SCHEMA_VERSION, STATES, ROLES, DomainError, uid, copy, currentVersion, userName, projectDocs, referencesOf, createEmptyWorkspace, applyCommand, applyScheduledAutomation, previewDocumentCopy, previewDocumentRename, previewDocumentMove, previewDocumentTransition, searchDocuments, validateWorkspace, csv };
})();

__modules["packages/storage/index.js"] = (() => {
const { verifyCopyContent } = __modules["packages/document-copy/index.js"];
const { applyCommand, validateWorkspace, DomainError, uid, copy } = __modules["packages/core/index.js"];
const MAX_FILE_BYTES = 50 * 1024 * 1024;
async function sha256(bytes) {
  if (!globalThis.crypto?.subtle) throw new Error('Secure browser storage requires HTTPS or localhost.');
  return [...new Uint8Array(await crypto.subtle.digest('SHA-256', bytes))].map(x => x.toString(16).padStart(2, '0')).join('');
}
async function prepareFile(file) {
  if (!(file instanceof Blob) || file.size > MAX_FILE_BYTES) throw new Error('Choose a file no larger than 50 MiB.');
  const bytes = new Uint8Array(await file.arrayBuffer()), hash = await sha256(bytes);
  return { descriptor: { blobId: hash, hash, size: bytes.length, mime: file.type || 'application/octet-stream' }, blob: new Blob([bytes], { type: file.type || 'application/octet-stream' }) };
}
function requestPromise(request) { return new Promise((resolve, reject) => { request.onsuccess = () => resolve(request.result); request.onerror = () => reject(request.error); }); }
function complete(transaction) { return new Promise((resolve, reject) => { transaction.oncomplete = () => resolve(); transaction.onabort = transaction.onerror = () => reject(transaction.error || new Error('The database transaction was cancelled.')); }); }
class IndexedDBRepository {
  constructor(name = 'civora-workspace-v1') { this.name = name; this.kind = 'local'; this.listeners = new Set(); }
  async open() {
    if (!globalThis.indexedDB) throw new Error('IndexedDB is unavailable. Use a current browser with site storage enabled.');
    const request = indexedDB.open(this.name, 1);
    request.onupgradeneeded = () => { const db = request.result; db.createObjectStore('workspace'); db.createObjectStore('blobs'); };
    request.onblocked = () => this.onblocked?.();
    this.db = await requestPromise(request);
    this.db.onversionchange = () => { this.db.close(); this.onblocked?.(); };
    if (globalThis.BroadcastChannel) { this.channel = new BroadcastChannel(this.name); this.channel.onmessage = event => this.listeners.forEach(fn => fn(event.data)); }
    return this;
  }
  subscribe(fn) { this.listeners.add(fn); return () => this.listeners.delete(fn); }
  async read() { return requestPromise(this.db.transaction('workspace').objectStore('workspace').get('root')); }
  async initialize(state, files = new Map()) {
    validateWorkspace(state); const tx = this.db.transaction(['workspace', 'blobs'], 'readwrite'), done = complete(tx), store = tx.objectStore('workspace');
    const request = store.get('root');
    request.onsuccess = () => { if (!request.result) { store.put(copy(state), 'root'); for (const [id, blob] of files) tx.objectStore('blobs').put(blob, id); } };
    await done; return this.read();
  }
  async commit(command, actorId, expectedRevision, file = null) {
    const tx = this.db.transaction(['workspace', 'blobs'], 'readwrite'), store = tx.objectStore('workspace');
    let output, failure; const done = complete(tx);
    const request = store.get('root'); request.onsuccess = () => {
      try {
        const state = request.result;
        if (state.revision !== expectedRevision) throw new DomainError('The workspace changed in another tab. Your view has been refreshed; review it and try again.', 'CONFLICT');
        output = applyCommand(state, command, actorId);
        if (file) tx.objectStore('blobs').put(file.blob, file.descriptor.blobId);
        store.put(output.state, 'root');
      } catch (error) { failure = error; tx.abort(); }
    };
    try { await done; } catch (error) { throw failure || error; }
    this.channel?.postMessage({ revision: output.state.revision }); return output;
  }
  async blob(id) { if (!/^[a-f0-9]{64}$/.test(id)) throw new Error('Invalid blob identifier.'); const blob = await requestPromise(this.db.transaction('blobs').objectStore('blobs').get(id)); if (!blob) throw new Error('Document content is missing from storage.'); return blob; }
  async replace(state, files, expectedRevision) {
    validateWorkspace(state); const tx = this.db.transaction(['workspace', 'blobs'], 'readwrite'), done = complete(tx); let failure;
    const request = tx.objectStore('workspace').get('root');
    request.onsuccess = () => {
      try {
        if (request.result?.revision !== expectedRevision) throw new DomainError('The workspace changed during import. Try again.', 'CONFLICT');
        const next = copy(state); next.revision = Math.max(next.revision, expectedRevision) + 1;
        next.audit.push({ id: uid('audit'), sequence: next.revision, commandId: uid('cmd'), at: new Date().toISOString(), by: next.users.find(u => u.role === 'admin' && u.active).id, type: 'workspace.restore', targetId: next.id, summary: 'Restored a verified workspace backup (local operation)' });
        tx.objectStore('blobs').clear(); for (const [id, blob] of files) tx.objectStore('blobs').put(blob, id);
        tx.objectStore('workspace').put(next, 'root');
      } catch (error) { failure = error; tx.abort(); }
    };
    try { await done; } catch (error) { throw failure || error; }
    const result = await this.read(); this.channel?.postMessage({ revision: result.revision }); return result;
  }
  async estimate() { return navigator.storage?.estimate ? navigator.storage.estimate() : { usage: 0, quota: 0 }; }
  close() { this.channel?.close(); this.db?.close(); }
}
class MemoryRepository {
  constructor() { this.kind = 'memory'; this.files = new Map(); this.state = null; }
  async open() { return this; }
  async initialize(state, files = new Map()) { if (!this.state) { this.state = copy(state); this.files = new Map(files); } return this.read(); }
  async read() { return copy(this.state); }
  subscribe() { return () => {}; }
  async commit(command, actorId, expectedRevision, file = null) { if (this.state.revision !== expectedRevision) throw new DomainError('Conflict', 'CONFLICT'); const out = applyCommand(this.state, command, actorId); this.state = out.state; if (file) this.files.set(file.descriptor.blobId, file.blob); return copy(out); }
  async blob(id) { if (!this.files.has(id)) throw new Error('Missing file.'); return this.files.get(id); }
  async replace(state, files, expectedRevision) { if (this.state.revision !== expectedRevision) throw new DomainError('Conflict', 'CONFLICT'); validateWorkspace(state); this.state = copy(state); this.state.revision = Math.max(state.revision, expectedRevision) + 1; this.files = new Map(files); return this.read(); }
  close() {}
}
async function fetchJSON(url, options = {}) {
  let response;
  try { response = await fetch(url, { ...options, headers: { Accept: 'application/json', ...(options.body ? { 'Content-Type': 'application/json' } : {}), ...options.headers } }); }
  catch { throw new Error('Could not reach the server. Check the endpoint, HTTPS, and network connection.'); }
  const content = response.headers.get('content-type') || '';
  const value = content.includes('json') ? await response.json() : { error: `Unexpected response (${response.status}). Check the server endpoint.` };
  if (!response.ok) throw new DomainError(value.error || `Request failed (${response.status})`, value.code || String(response.status));
  return value;
}
class HttpRepository {
  constructor(base = '/api') { this.base = base.replace(/\/$/, ''); this.kind = 'server'; this.listeners = new Set(); }
  async open() { const session = await fetchJSON(`${this.base}/session`); if (!session.user) throw new DomainError('Sign in to the team workspace.', '401'); this.actorId = session.user.id; this.session = session; return this; }
  async read() { return (await fetchJSON(`${this.base}/workspace`)).state; }
  async commit(command, _actorId, expectedRevision, file = null) {
    const payload = { command, expectedRevision };
    if (file) payload.file = { data: toBase64(new Uint8Array(await file.blob.arrayBuffer())), mime: file.descriptor.mime };
    return fetchJSON(`${this.base}/commands`, { method: 'POST', body: JSON.stringify(payload) });
  }
  async blob(id) { const response = await fetch(`${this.base}/blobs/${encodeURIComponent(id)}`); if (!response.ok) throw new Error('Unable to load document content. Sign in again if your session expired.'); return response.blob(); }
  subscribe(fn) {
    this.listeners.add(fn);
    if (!this.source) { this.source = new EventSource(`${this.base}/events`); this.source.onerror = () => this.listeners.forEach(listener=>listener({connectionError:true})); this.source.onmessage = e => { try { const data = JSON.parse(e.data); this.listeners.forEach(listener => listener(data)); } catch {} }; }
    return () => this.listeners.delete(fn);
  }
  close() { this.source?.close(); this.source = null; }
}
class WorkspaceEngine extends EventTarget {
  constructor(repository, actorId = 'u-admin') { super(); this.repository = repository; this.actorId = actorId; this.state = null; this.queue = Promise.resolve(); this.pending = 0; }
  async initialize(state, files) { this.state = this.repository.kind === 'server' ? await this.repository.read() : await this.repository.initialize(state, files); this.unsubscribe = this.repository.subscribe(async event => { if (event.connectionError || event.revision && event.revision !== this.state?.revision) { try { await this.refresh(); this.dispatchEvent(new CustomEvent('externalchange', { detail: event })); } catch (error) { this.dispatchEvent(new CustomEvent('connectionerror', { detail: error })); } } }); return this; }
  async refresh() { this.state = await this.repository.read(); this.dispatchEvent(new Event('change')); return this.state; }
  run(type, payload = {}, file = null) {
    const work = async () => {
      const command = { id: uid('cmd'), type, payload: copy(payload) };
      try { if(type==='document.bulkCopy'&&this.repository.kind!=='server'){const actorId=this.actorId;await verifyCopyContent(this.state,actorId,command.payload,id=>this.repository.blob(id));if(actorId!==this.actorId)throw new DomainError('Account changed during content verification.','CONFLICT');} const out = await this.repository.commit(command, this.actorId, this.state.revision, file); this.state = out.state; this.dispatchEvent(new CustomEvent('change', { detail: { command, result: out.result } })); return out.result; }
      catch (error) { if (error.code === 'CONFLICT') await this.refresh(); throw error; }
    };
    this.pending++; const promise = this.queue.then(work, work).finally(() => { this.pending--; }); this.queue = promise.catch(() => {}); return promise;
  }
  async addFile(file, metadata) { const content = await prepareFile(file); return this.run('document.create', { ...metadata, name: metadata.name || file.name, file: content.descriptor }, content); }
  async checkin(file, metadata) { const content = await prepareFile(file); return this.run('document.checkin', { ...metadata, file: content.descriptor }, content); }
  close() { this.unsubscribe?.(); this.repository.close(); }
}
function toBase64(bytes) { let binary = ''; for (let i = 0; i < bytes.length; i += 32768) binary += String.fromCharCode(...bytes.subarray(i, i + 32768)); return btoa(binary); }
function fromBase64(value) { if (typeof value !== 'string' || !/^[A-Za-z0-9+/]*={0,2}$/.test(value) || value.length % 4) throw new Error('Invalid backup encoding.'); const binary = atob(value); return Uint8Array.from(binary, c => c.charCodeAt(0)); }
async function exportBackup(repository, state) {
  validateWorkspace(state); const files = {}, ids = new Set(state.documents.flatMap(d => d.versions.map(v => v.blobId))); let total = 0;
  for (const id of ids) { const blob = await repository.blob(id); total += blob.size; if (total > 90 * 1024 * 1024) throw new Error('This browser backup is limited to 90 MiB of source files. Use server database backups for larger workspaces.'); files[id] = { mime: blob.type, data: toBase64(new Uint8Array(await blob.arrayBuffer())) }; }
  return { format: 'civora-workspace-backup', version: 1, exportedAt: new Date().toISOString(), workspace: copy(state), files };
}
async function verifyBackup(input) {
  if (!input || input.format !== 'civora-workspace-backup' || input.version !== 1 || !input.files || typeof input.files !== 'object') throw new Error('This is not a Civora workspace backup.');
  validateWorkspace(input.workspace); const files = new Map(); let total = 0;
  for (const id of new Set(input.workspace.documents.flatMap(d => d.versions.map(v => v.blobId)))) {
    const record = input.files[id]; if (!record) throw new Error(`The backup is missing content ${id.slice(0, 12)}.`);
    const bytes = fromBase64(record.data); total += bytes.length;
    if (bytes.length > MAX_FILE_BYTES || total > 90 * 1024 * 1024) throw new Error('Backup exceeds this edition’s file limits.');
    if (await sha256(bytes) !== id) throw new Error('A backup checksum does not match. Nothing has been imported.');
    for (const d of input.workspace.documents) for (const v of d.versions) if (v.blobId === id && v.size !== bytes.length) throw new Error('A backup file size does not match its revision record.');
    files.set(id, new Blob([bytes], { type: String(record.mime || 'application/octet-stream') }));
  }
  return { state: copy(input.workspace), files };
}

return { MAX_FILE_BYTES, sha256, prepareFile, IndexedDBRepository, MemoryRepository, fetchJSON, HttpRepository, WorkspaceEngine, toBase64, fromBase64, exportBackup, verifyBackup };
})();

__modules["packages/filesystem/index.js"] = (() => {
/** Portable local filesystem capabilities. No browser-specific globals at import time.
 * A granted folder is a capability, not unrestricted machine access. */
const { DomainError, uid } = __modules["packages/core/index.js"];
const { sha256, MAX_FILE_BYTES, fetchJSON, toBase64 } = __modules["packages/storage/index.js"];
const LOCAL_LIMITS = Object.freeze({ fileBytes: MAX_FILE_BYTES, entries: 10000, depth: 48 });
function localError(message, code = 'VALIDATION') { return new DomainError(message, code); }
function relativePath(value, { empty = false, internal = false } = {}) {
  if (typeof value !== 'string' || value.length > 1800 || (!value && !empty)) throw localError('A relative path is required.');
  if (!value) return '';
  const parts = value.split('/');
  if (parts.length > LOCAL_LIMITS.depth || parts.some(p => !p || p === '.' || p === '..' || /[\\\x00-\x1f\x7f<>:"|?*]/.test(p) || /[. ]$/.test(p) || p.length > 200 || /^(CON|PRN|AUX|NUL|COM[1-9]|LPT[1-9])(?:\.|$)/i.test(p))) throw localError('Use a portable relative path without traversal, reserved names, or control characters.');
  if (!internal && parts.some(p => p.toLowerCase() === '.civora-trash')) throw localError('Trash is accessible only through the recovery controls.', 'FORBIDDEN');
  return value;
}
function portableName(value, fallback = 'item') {
  let text = String(value || '').normalize('NFC').replace(/[\\/\x00-\x1f\x7f<>:"|?*]/g, '_').replace(/[. ]+$/g, '').slice(0, 150);
  if (!text || text === '.' || text === '..') text = fallback;
  if (/^(CON|PRN|AUX|NUL|COM[1-9]|LPT[1-9])(?:\.|$)/i.test(text)) text = '_' + text;
  return text;
}
const joinPath = (...parts) => relativePath(parts.filter(Boolean).join('/'), { empty: true });
function localFileBlob(blob, name, mime = '') {
  if (!(blob instanceof Blob)) throw localError('Expected original file bytes.');
  const types = {svg:'image/svg+xml',png:'image/png',jpg:'image/jpeg',jpeg:'image/jpeg',webp:'image/webp',gif:'image/gif',pdf:'application/pdf',txt:'text/plain',csv:'text/csv',md:'text/markdown',json:'application/json',xml:'application/xml',dxf:'application/dxf',ifc:'application/x-step',obj:'text/plain',stl:'model/stl',glb:'model/gltf-binary'};
  const type = mime && mime !== 'application/octet-stream' ? mime : blob.type && blob.type !== 'application/octet-stream' ? blob.type : types[String(name).split('.').at(-1).toLowerCase()] || 'application/octet-stream';
  return new Blob([blob], {type}); // Rewrap bytes; never transcode original content.
}
async function hashBlob(blob) { if (!(blob instanceof Blob) || blob.size > MAX_FILE_BYTES) throw localError('Local files are limited to 50 MiB.'); return sha256(await blob.arrayBuffer()); }
function isMissing(error) { return ['NotFoundError', 'ENOENT', 'NOT_FOUND', '404'].includes(error?.name) || ['ENOENT', 'NOT_FOUND', '404'].includes(error?.code); }
async function optionalRead(fs, path) { try { return await fs.read(path); } catch (error) { if (isMissing(error)) return null; throw error; } }
async function assertExpected(fs, path, options = {}) {
  const existing = await optionalRead(fs, path);
  if (options.createOnly || options.expectedHash === null) { if (existing) throw localError('The destination already exists. No file was overwritten.', 'CONFLICT'); }
  else if (typeof options.expectedHash === 'string' && /^[a-f0-9]{64}$/.test(options.expectedHash)) { if (!existing || await hashBlob(existing) !== options.expectedHash) throw localError('The disk file changed. Refresh and review before saving.', 'CONFLICT'); }
  else throw localError('Writes require createOnly or an explicit expected SHA-256 hash.');
  return existing;
}
function filesystemCapabilities() {
  return { directoryPicker: typeof globalThis.showDirectoryPicker === 'function', savePicker: typeof globalThis.showSaveFilePicker === 'function', persistentHandles: !!globalThis.indexedDB, locks: !!globalThis.navigator?.locks, secureContext: !!globalThis.isSecureContext, native: false };
}
class BrowserDirectoryFS {
  constructor(handle, { readOnly = false, id = '', label = '' } = {}) {
    if (!handle || handle.kind !== 'directory') throw localError('Choose a directory.');
    this.handle = handle; this.readOnly = readOnly; this.id = id || uid('mount'); this.label = label || handle.name; this.kind = 'browser-folder'; this.closed = false;
  }
  async permission(request = false) {
    if (this.closed) throw localError('Folder access was disconnected.', 'FORBIDDEN');
    const descriptor = { mode: this.readOnly ? 'read' : 'readwrite' };
    if (!this.handle.queryPermission) return 'granted';
    let result = await this.handle.queryPermission(descriptor);
    if (result !== 'granted' && request) result = await this.handle.requestPermission(descriptor);
    return result;
  }
  async guard(write = false) {
    if (this.closed || write && this.readOnly) throw localError('This folder is disconnected or read-only.', 'FORBIDDEN');
    if (await this.permission() !== 'granted') throw localError('Folder permission expired. Reconnect and grant access to continue.', 'FORBIDDEN');
  }
  async directory(path = '', create = false, internal = false) {
    await this.guard(create); relativePath(path, { empty: true, internal }); let directory = this.handle;
    for (const segment of path.split('/').filter(Boolean)) directory = await directory.getDirectoryHandle(segment, { create });
    return directory;
  }
  async fileHandle(path, create = false, internal = false) { relativePath(path, { internal }); const parts = path.split('/'), name = parts.pop(); return (await this.directory(parts.join('/'), create, internal)).getFileHandle(name, { create }); }
  async read(path) { await this.guard(); const file = await (await this.fileHandle(path)).getFile(); if (file.size > MAX_FILE_BYTES) throw localError('File exceeds the 50 MiB local-file limit.'); return file; }
  async stat(path, { hash = true } = {}) { const f = await this.read(path); return { path, name: path.split('/').at(-1), kind: 'file', size: f.size, modifiedAt: f.lastModified || 0, ...(hash ? { hash: await hashBlob(f) } : {}) }; }
  async list(path = '', { recursive = false, limit = LOCAL_LIMITS.entries, signal, includeInternal = false } = {}) {
    await this.guard(); relativePath(path, { empty: true }); const output = []; limit = Math.min(limit, LOCAL_LIMITS.entries);
    const visit = async (directory, prefix, depth) => {
      if (depth > LOCAL_LIMITS.depth) throw localError('Directory nesting exceeds the scan limit.');
      const entries = []; for await (const entry of directory.values()) { if (entries.length >= LOCAL_LIMITS.entries) throw localError('This directory exceeds the scan limit.'); entries.push(entry); }
      entries.sort((a,b) => a.name.localeCompare(b.name));
      for (const entry of entries) {
        signal?.throwIfAborted(); if (!includeInternal && entry.name.startsWith('.civora')) continue;
        let p;try{p=joinPath(prefix,entry.name);}catch{output.push({path:prefix?prefix+'/'+entry.name:entry.name,name:entry.name,kind:'blocked',size:0,modifiedAt:0});continue;} if (output.length >= limit) throw localError(`Directory scan exceeds ${limit} entries. Select a smaller folder.`);
        const info = { path: p, name: entry.name, kind: entry.kind, size: 0, modifiedAt: 0 };
        if (entry.kind === 'file') { const f = await entry.getFile(); info.size = f.size; info.modifiedAt = f.lastModified; }
        output.push(info); if (recursive && entry.kind === 'directory') await visit(entry, p, depth + 1);
      }
    };
    await visit(await this.directory(path), path, 0); return output;
  }
  async mkdir(path) { await this.guard(true); await this.directory(path, true); return { path }; }
  async write(path, blob, options = {}) {
    await this.guard(true); relativePath(path); const hash = await hashBlob(blob); await assertExpected(this, path, options);
    const handle = await this.fileHandle(path, true); const stream = await handle.createWritable();
    try {
      // A writable stream stages bytes until close(). This is not an OS-level
      // compare-and-swap against native applications; check immediately before close.
      await stream.write(blob);
      if (options.expectedHash) { const current = await handle.getFile(); if (await hashBlob(current) !== options.expectedHash) throw localError('The file changed while it was being saved.', 'CONFLICT'); }
      await stream.close();
    } catch (error) { try { await stream.abort(); } catch {} throw error; }
    return { path, hash, size: blob.size };
  }
  async removeEmptyFile(path, expectedHash) { await this.guard(true); await assertExpected(this, path, { expectedHash }); const parts = path.split('/'), name = parts.pop(); await (await this.directory(parts.join('/'))).removeEntry(name); }
  async move(path, destination, { expectedHash } = {}) {
    await this.guard(true); relativePath(destination); const file = await assertExpected(this, path, { expectedHash });
    await this.write(destination, file, { createOnly: true });
    // Portable fallback is copy/verify/delete, not atomic rename. A failure leaves
    // a recoverable duplicate rather than destroying the source.
    if (await hashBlob(await this.read(destination)) !== expectedHash) throw localError('Destination verification failed. The source was retained.');
    await this.removeEmptyFile(path, expectedHash); return { path: destination, hash: expectedHash, copied: true };
  }
  async archive(path, file, reason = 'replace') {
    await this.guard(true); relativePath(path); const id = uid('trash'), dir = await this.directory('.civora-trash/' + id, true, true), hash = await hashBlob(file);
    const put = async (name, blob) => { const out = await (await dir.getFileHandle(name, { create: true })).createWritable(); try { await out.write(blob); await out.close(); } catch (error) { try { await out.abort(); } catch {} throw error; } };
    await put('content', file); const metadata = { id, path, kind: 'file', size: file.size, hash, at: new Date().toISOString(), reason };
    await put('record.json', new Blob([JSON.stringify(metadata)])); return metadata;
  }
  async trash(path, { expectedHash } = {}) {
    await this.guard(true); const file = await assertExpected(this, path, { expectedHash });
    const metadata = await this.archive(path, file, 'trash'); await this.removeEmptyFile(path, expectedHash); return metadata;
  }
  async trashList() {
    await this.guard(); let dir; try { dir = await this.directory('.civora-trash', false, true); } catch (error) { if (isMissing(error)) return []; throw error; }
    const result = []; for await (const entry of dir.values()) { if (result.length >= 1000) break; if (entry.kind !== 'directory') continue; try { result.push(JSON.parse(await (await (await entry.getFileHandle('record.json')).getFile()).text())); } catch {} }
    return result.sort((a,b) => b.at.localeCompare(a.at));
  }
  async restoreTrash(id, destination = '') {
    await this.guard(true); if (!/^[A-Za-z0-9_-]{1,120}$/.test(id)) throw localError('Invalid trash identifier.');
    const dir = await this.directory('.civora-trash/' + id, false, true), record = JSON.parse(await (await (await dir.getFileHandle('record.json')).getFile()).text());
    const file = await (await dir.getFileHandle('content')).getFile(); if (await hashBlob(file) !== record.hash) throw localError('Trash content failed integrity verification.');
    await this.write(destination || record.path, file, { createOnly: true });
    await (await this.directory('.civora-trash', false, true)).removeEntry(id, { recursive: true }); return { path: destination || record.path };
  }
  close() { this.closed = true; }
}
/** Remember capabilities, never serialized directory contents or credentials. */
class FolderBookmarks {
  async database() { if (!globalThis.indexedDB) throw localError('This browser cannot remember folder handles.'); return new Promise((resolve,reject) => { const r = indexedDB.open('civora-folder-bookmarks', 1); r.onupgradeneeded = () => r.result.createObjectStore('handles', { keyPath: 'id' }); r.onsuccess = () => resolve(r.result); r.onerror = () => reject(r.error); }); }
  async operation(mode, callback) { const db = await this.database(); try { return await new Promise((resolve,reject) => { const tx = db.transaction('handles',mode), request = callback(tx.objectStore('handles')); let output; request.onsuccess = () => { output = request.result; }; tx.oncomplete = () => resolve(output); tx.onerror = tx.onabort = () => reject(tx.error || request.error); }); } finally { db.close(); } }
  save(fs) { return this.operation('readwrite', s => s.put({ id: fs.id, label: fs.label, readOnly: fs.readOnly, handle: fs.handle, savedAt: new Date().toISOString() })); }
  list() { return this.operation('readonly', s => s.getAll()); }
  forget(id) { return this.operation('readwrite', s => s.delete(id)); }
}
class HttpDirectoryFS {
  constructor(root, base = '/api/local') { this.id = root.id; this.label = root.label; this.readOnly = root.readOnly; this.kind = 'localhost-folder'; this.base = `${base}/roots/${encodeURIComponent(root.id)}`; this.native = root.native || false; this.revealEnabled = root.reveal || false; this.location = root.location || '';  this.closed = false; }
  check() { if (this.closed) throw localError('Local folder was disconnected.', 'FORBIDDEN'); }
  async permission() { this.check(); return 'granted'; }
  async request(route, method = 'GET', body) { this.check(); return fetchJSON(this.base + route, { method, ...(body === undefined ? {} : { body: JSON.stringify(body) }) }); }
  async list(path = '', options = {}) { return (await this.request(`/list?path=${encodeURIComponent(relativePath(path, { empty: true }))}&recursive=${options.recursive ? '1' : '0'}&internal=${options.includeInternal ? '1' : '0'}`)).entries; }
  async stat(path) { return this.request('/stat?path=' + encodeURIComponent(relativePath(path))); }
  async read(path) { this.check(); const response = await fetch(this.base + '/file?path=' + encodeURIComponent(relativePath(path)), { credentials: 'same-origin' }); if (!response.ok) { const problem = await response.json().catch(() => ({})); throw localError(problem.error || 'Local file is unavailable.', problem.code || String(response.status)); } return response.blob(); }
  async write(path, blob, options = {}) { await hashBlob(blob); return this.request('/write','POST',{ path: relativePath(path), data: toBase64(new Uint8Array(await blob.arrayBuffer())), ...options }); }
  mkdir(path) { return this.request('/mkdir','POST',{ path: relativePath(path) }); }
  move(path,destination,options = {}) { return this.request('/move','POST',{ path: relativePath(path), destination: relativePath(destination), ...options }); }
  trash(path,options = {}) { return this.request('/trash','POST',{ path: relativePath(path), ...options }); }
  trashList() { return this.request('/trash').then(r => r.items); }
  restoreTrash(id,destination = '') { return this.request('/restore','POST',{ id, destination }); }
  nativeOpen(path,expectedHash) { return this.request('/open','POST',{ path, expectedHash, confirm: true }); }
  reveal(path = '') { return this.request('/reveal','POST',{ path, confirm: true }); }
  close() { this.closed = true; }
}
/** Polling intentionally reconciles state; it does not rely on unreliable OS watch events. */
class DirectoryMonitor extends EventTarget {
  constructor(scan, { interval = 5000 } = {}) { super(); this.scan = scan; this.interval = Math.max(2000, interval); this.running = false; this.busy = false; this.last = null; this.error = null; this.generation=0; }
  async tick() { if (this.busy) return; this.busy = true; try { const value = await this.scan(); this.last = value; this.error = null; this.dispatchEvent(new CustomEvent('change', { detail: value })); return value; } catch (error) { this.error = error; this.dispatchEvent(new CustomEvent('error', { detail: error })); throw error; } finally { this.busy = false; } }
  start() { if (this.running) return; this.running = true; const generation=++this.generation; const run = async () => { if(!this.running||generation!==this.generation)return; try { await this.tick(); } catch {} if (this.running&&generation===this.generation) this.timer = setTimeout(run, this.interval); }; void run(); }
  stop() { this.running = false; this.generation++; clearTimeout(this.timer); }
}

return { LOCAL_LIMITS, localError, relativePath, portableName, joinPath, localFileBlob, hashBlob, isMissing, optionalRead, assertExpected, filesystemCapabilities, BrowserDirectoryFS, FolderBookmarks, HttpDirectoryFS, DirectoryMonitor };
})();

__modules["packages/filesystem/text.js"] = (() => {
/** Bounded, reversible BOM-aware local text editing. Binary files remain binary. */
const { localError } = __modules["packages/filesystem/index.js"];
async function decodeTextFile(blob) {
  if (blob.size > 2 * 1024 * 1024) throw localError('The built-in local text editor is limited to 2 MiB. Use your native editor for larger files.');
  const bytes = new Uint8Array(await blob.arrayBuffer()); let encoding = 'utf-8', bom = false, offset = 0;
  if (bytes[0] === 0xef && bytes[1] === 0xbb && bytes[2] === 0xbf) { bom = true; offset = 3; }
  else if (bytes[0] === 0xff && bytes[1] === 0xfe) { encoding = 'utf-16le'; bom = true; offset = 2; }
  else if (bytes[0] === 0xfe && bytes[1] === 0xff) { encoding = 'utf-16be'; bom = true; offset = 2; }
  let text; try { text = new TextDecoder(encoding, { fatal: true, ignoreBOM: true }).decode(bytes.subarray(offset)); } catch { throw localError('This is binary data or an unsupported text encoding. Use a native editor.'); }
  if (/[\x00-\x08\x0b\x0c\x0e-\x1f]/.test(text)) throw localError('Binary control bytes were detected. This file will not be edited as text.');
  const crlf = (text.match(/\r\n/g) || []).length, lf = (text.match(/(?<!\r)\n/g) || []).length, cr = (text.match(/\r(?!\n)/g) || []).length;
  const newline = crlf >= lf && crlf >= cr && crlf ? '\r\n' : cr > lf ? '\r' : '\n';
  return { text, encoding, bom, newline, mixedNewlines: [crlf, lf, cr].filter(Boolean).length > 1 };
}
function encodeTextFile(document, text) {
  if (typeof text !== 'string' || !['utf-8','utf-16le','utf-16be'].includes(document.encoding) || !['\n','\r\n','\r'].includes(document.newline)) throw localError('Invalid text encoding settings.');
  text = text.replace(/\r\n|\r|\n/g, document.newline); let bytes;
  if (document.encoding === 'utf-8') bytes = new TextEncoder().encode(text);
  else { bytes = new Uint8Array(text.length * 2); const view = new DataView(bytes.buffer); for (let i = 0; i < text.length; i++) view.setUint16(i*2, text.charCodeAt(i), document.encoding === 'utf-16le'); }
  const prefix = document.bom ? document.encoding === 'utf-8' ? [0xef,0xbb,0xbf] : document.encoding === 'utf-16le' ? [0xff,0xfe] : [0xfe,0xff] : [];
  return new Blob([new Uint8Array(prefix), bytes], { type: 'text/plain' });
}

return { decodeTextFile, encodeTextFile };
})();

export const { decodeTextFile, encodeTextFile } = __modules["packages/filesystem/text.js"];
