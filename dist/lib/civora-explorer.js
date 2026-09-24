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

export const { EXPLORER_LIMITS, EXPLORER_COLUMNS, FILTER_OPERATORS, explorerColumns, defaultExplorerView, normalizeExplorerView, folderPath, explorerValue, explorerCan, queryExplorer, visibleExplorerViews, visibleExplorerBookmarks, applyExplorerCommand, validateExplorerState, explorerSelection, ExplorerHistory, explorerLink, resolveExplorerLink, defaultExplorerLayout, normalizeExplorerLayout, explorerPresentationPreset, explorerDetailView, EXPLORER_PREFERENCE_SCHEMA, migrateExplorerPreferences } = __modules["packages/explorer/index.js"];
