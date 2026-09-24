/** Transaction planning for controlled filename changes. No original bytes are changed.
 * Plan against authoritative state; callers must commit with compare-and-swap.
 */
import { canAccess } from '../access/index.js';
export const RENAME_LIMITS = Object.freeze({documents:100,filename:240,reason:500,pattern:300});
export class RenameError extends Error {
  constructor(message,code='VALIDATION'){super(message);this.name='RenameError';this.code=code;}
}
const check=(v,m,c)=>{if(!v)throw new RenameError(m,c);};
const plain=v=>v&&typeof v==='object'&&!Array.isArray(v)&&[Object.prototype,null].includes(Object.getPrototypeOf(v));
const keys=(v,allowed,label)=>check(plain(v)&&Object.keys(v).every(k=>allowed.includes(k)),`${label} contains unsupported fields.`);
export function renameFilename(value){
  check(typeof value==='string','Filename must be text.');const name=value.trim();
  check(name.length>0&&name.length<=RENAME_LIMITS.filename,'Filenames must contain 1–240 characters.');
  check(!/[\\/\x00-\x1f\x7f]/.test(name)&&!['.','..'].includes(name),'Filenames cannot contain path separators, control characters or dot paths.');return name;
}
export function filenameParts(value){const name=renameFilename(value),at=name.lastIndexOf('.');return at>0?{stem:name.slice(0,at),extension:name.slice(at)}:{stem:name,extension:''};}
/** Literal transformation only: no regular expressions, code execution, or path access.
 * The original extension is appended and cannot be changed by this helper.
 */
export function suggestRenames(documents,options={}){
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
export function planDocumentRename(state,actorId,input){
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
