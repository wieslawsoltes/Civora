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

export const { AUTOMATION_LIMITS, CONDITION_OPERATORS, WATCH_EVENTS, NOTICE_EVENTS, normalizeCondition, evaluateCondition, normalizeWorkflowRule, evaluateWorkflowRules, normalizeAutomationPolicy, normalizeSubscription, publishCommandNotifications, automationDueItems, runScheduledAutomation, applyAutomationCommand, validateAutomationState } = __modules["packages/automation/index.js"];
