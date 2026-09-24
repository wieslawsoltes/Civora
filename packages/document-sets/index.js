import { createAccessContext } from '../access/index.js';
/** Ordered, reference-only document sets. A fixed member pins a version, never a copy.
 * Legacy {documentIds} sets remain live. No Bentley SDK or native set format is used.
 */
export const SET_LIMITS = Object.freeze({members:1000,setsPerProject:2000});
export class SetError extends Error { constructor(message,code='VALIDATION'){super(message);this.name='SetError';this.code=code;} }
const check=(value,message,code)=>{if(!value)throw new SetError(message,code);};
const text=(value,label,max,empty=false)=>{check(typeof value==='string'&&value.length<=max,`${label} must be text of at most ${max} characters.`);value=value.trim();check(empty||!!value,`${label} is required.`);return value;};
export const setVersion = set => set.version ?? 1;
export function setMembers(set){return (set.members || set.documentIds.map(documentId=>({documentId,versionId:null}))).map(m=>({...m}));}
function permission(state,actor,perm,scope,id){
 if(state.projection?.filtered){check(state.projection.userId===undefined||state.projection.userId===actor,'This projection belongs to another account.','FORBIDDEN');if(scope==='project')return state.projection.projectPermissions?.[id]?.includes(perm)||false;return state.documents.find(d=>d.id===id)?.permissions?.includes(perm)||false;}
 return createAccessContext(state,actor).can(perm,scope,id);
}
export function canReadSet(state,actor,set){return !!set&&permission(state,actor,'read','project',set.projectId)&&set.documentIds.every(id=>permission(state,actor,'read','document',id));}
export function visibleDocumentSets(state,actor,projectId=''){return state.sets.filter(set=>(!projectId||set.projectId===projectId)&&canReadSet(state,actor,set));}
function normalizeMembers(state,projectId,value,{allowRecycled=false}={}){
 check(Array.isArray(value)&&value.length<=SET_LIMITS.members,`A set supports at most ${SET_LIMITS.members} members.`);const seen=new Set();
 return value.map(m=>{check(m&&typeof m==='object'&&!Array.isArray(m)&&typeof m.documentId==='string'&&!seen.has(m.documentId),'Set members must be distinct document identifiers.');seen.add(m.documentId);const d=state.documents.find(d=>d.id===m.documentId);check(d&&d.projectId===projectId&&(allowRecycled||!d.deletedAt),'Choose readable, active documents in this project.');check(m.versionId===null||typeof m.versionId==='string'&&d.versions.some(v=>v.id===m.versionId),'Choose Latest or an existing document revision.');return {documentId:d.id,versionId:m.versionId};});
}
function pathFor(state,d){const parts=[d.name],seen=new Set();for(let id=d.folderId;id;){check(!seen.has(id),'Invalid folder graph.');seen.add(id);const f=state.folders.find(f=>f.id===id);check(f,'Folder no longer exists.');parts.unshift(f.name);id=f.parentId;}return parts.join('/');}
/** Returns the authoritative member order with current rights. Never trusts caller snapshots. */
export function resolveDocumentSet(state,actor,id,{permission:required='read',allowRecycled=false,expectedVersion}={}){
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
export function snapshotDocumentSet(state,actor,payload,{currentOnly=false}={}){
 const resolved=resolveDocumentSet(state,actor,payload.setId,{expectedVersion:payload.expectedSetVersion});check(Number.isSafeInteger(payload.expectedSetVersion),'A set-version precondition is required.');check(resolved.set.projectId===payload.projectId,'The set belongs to another project.');check(resolved.records.length,'Choose a nonempty document set.');
 if(currentOnly)check(!resolved.records.some(r=>r.newerRevision),'Reviews require current revisions. This set pins an older revision; update its binding first.','CONFLICT');
 return resolved.records.map(({binding,latestVersionId,latestRevision,newerRevision,recycled,...r})=>r);
}
export function applyDocumentSetCommand(state,command,user,now){
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
export function validateDocumentSets(state){
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
