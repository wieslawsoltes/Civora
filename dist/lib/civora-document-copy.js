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

export const { COPY_LIMITS, DocumentCopyError, copyFilename, suggestCopyNames, planDocumentCopy, verifyCopyContent } = __modules["packages/document-copy/index.js"];
