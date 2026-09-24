/** Controlled copy planning, independent of persistence and UI.
 * Existing revisions are selected by ID; callers cannot supply a content hash.
 * New files inherit DESTINATION access. Cross-project copying requires share.
 */
import { canAccess } from '../access/index.js';
import { validateMetadata } from '../document-control/index.js';
export const COPY_LIMITS = Object.freeze({ documents: 100, reason: 500, filename: 240, fileBytes: 50 * 1024 * 1024, batchBytes: 250 * 1024 * 1024 });
export class DocumentCopyError extends Error {
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
export function copyFilename(value) {
  const name = text(value, 'Destination filename', COPY_LIMITS.filename);
  check(!/[\\/\x00-\x1f]/.test(name) && !['.', '..'].includes(name), 'Invalid destination filename.');
  return name;
}
/** Non-destructive suggestions only: the real transaction rechecks every name. */
export function suggestCopyNames(names, occupied = []) {
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
export function planDocumentCopy(state, actorId, input) {
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
export async function verifyCopyContent(state, actorId, input, getBlob) {
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
