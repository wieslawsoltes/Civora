import { SetError, resolveDocumentSet } from './index.js';
import { sha256 } from '../storage/index.js';
import { createZip } from '../storage/archive.js';
/** Captures the source manifest once, rechecks live rights before/after every read and
 * verifies exact bytes. getState is mandatory for asynchronous revocation checks.
 * Already-exported bytes cannot be recalled; no export claims such a capability.
 */
export async function exportDocumentSetArchive(getState,actorId,id,repository,{expectedVersion,signal,onProgress,maxBytes=90*1024*1024}={}){
 if(typeof getState!=='function')throw new SetError('A live workspace accessor is required.');
 const state=getState(),workspaceId=state.id,source=resolveDocumentSet(state,actorId,id,{permission:'download',expectedVersion});
 if(!source.records.length)throw new SetError('This set has no documents.');
 if(!Number.isSafeInteger(maxBytes)||maxBytes<1||maxBytes>90*1024*1024||source.totalBytes>maxBytes)throw new SetError('The set exceeds the 90 MiB package limit.');
 const signature=JSON.stringify(source.records.map(r=>[r.documentId,r.versionId,r.name,r.path,r.number]));
 const check=()=>{signal?.throwIfAborted();const current=getState();if(current.id!==workspaceId)throw new SetError('Workspace changed during export.','CONFLICT');const live=resolveDocumentSet(current,actorId,id,{permission:'download',expectedVersion:source.version});if(JSON.stringify(live.records.map(r=>[r.documentId,r.versionId,r.name,r.path,r.number]))!==signature)throw new SetError('A live member changed during export. Try again.','CONFLICT');};
 const files=[],records=[],content=new Map();
 for(let i=0;i<source.records.length;i++){
  check();const r=source.records[i];let blob=content.get(r.blobId);
  if(!blob){blob=await repository.blob(r.blobId);if(!(blob instanceof Blob)||blob.size!==r.size||await sha256(await blob.arrayBuffer())!==r.hash)throw new SetError('Set content failed checksum verification.','INTEGRITY');content.set(r.blobId,blob);}check();
  const name=r.name.replace(/[\\/:*?"<>|\x00-\x1f\x7f]/g,'_').replace(/[. ]+$/g,'').slice(0,180)||'document';
  const archivePath=`documents/${String(i+1).padStart(4,'0')}/${name}`;files.push({name:archivePath,data:blob});records.push({...r,archivePath});onProgress?.({done:i+1,total:source.records.length,name:r.name});
 }
 const manifest={format:'civora-document-set',version:1,workspaceId,setId:id,setVersion:source.version,name:source.set.name,description:source.set.description,locked:!!source.set.locked,documents:records,notice:'These are exact verified original bytes. No native CAD paths were rewritten. SHA-256 checks integrity, not authorship or authenticity. A live set export captures the resolved revisions at export time.'};
 check();const zip=await createZip([{name:'manifest.json',data:JSON.stringify(manifest,null,2)},...files]);check();return {zip,manifest};
}
