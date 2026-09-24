/** Managed external-editor working copies, independent of the application UI. */
import { localFileBlob } from './index.js';
import { currentVersion, uid } from '../core/index.js';
import { canAccess } from '../access/index.js';
import { prepareFile, sha256 } from '../storage/index.js';
import { portableName, relativePath, joinPath, hashBlob, optionalRead, localError, isMissing } from './index.js';
export function documentPermission(engine, permission, doc) {
  if (!doc || doc.deletedAt) return false;
  const state = engine.state;
  return state.projection?.filtered ? !!state.projection.documentPermissions?.[doc.id]?.includes(permission) : canAccess(state, engine.actorId, permission, 'document', doc.id);
}
export function workingPath(state, doc) {
  const project = state.projects.find(p => p.id === doc.projectId), folders = [], seen = new Set(); let id = doc.folderId;
  while (id) { if (seen.has(id)) throw localError('Folder cycle detected.'); seen.add(id); const f = state.folders.find(x => x.id === id); if (!f) break; folders.unshift(portableName(f.name)); id = f.parentId; }
  return joinPath('Documents', portableName(project?.code || 'Project'), ...folders, `${portableName(doc.number || 'Document')}-${portableName(doc.id.slice(-10))}`, portableName(doc.name));
}
function publicWorkPath(path) { relativePath(path); if (path.split('/').some(p => p.toLowerCase().startsWith('.civora'))) throw localError('Working copies cannot overwrite workspace metadata.'); return path; }
// A workspace backup can deliberately retain IDs, and pre-0.3 workspaces used
// a shared legacy ID. Repository identity therefore also scopes every index.
// Unknown adapters can supply a stable namespace; memory adapters are ephemeral.
const transientRepositories = new WeakMap();
function repositoryNamespace(repository, explicit) {
  if (explicit !== undefined) {
    if (typeof explicit !== 'string' || !explicit.trim() || explicit.length > 2000) throw localError('Use a nonempty repository namespace of at most 2,000 characters.');
    return 'explicit:' + explicit;
  }
  if (repository.kind === 'directory' && repository.format?.id) return 'directory:' + repository.format.id;
  if (repository.kind === 'server' && repository.base) {
    try { return 'server:' + new URL(repository.base, globalThis.location?.href || 'http://localhost/').href; }
    catch { throw localError('The repository endpoint is invalid.'); }
  }
  if (repository.kind === 'local' && repository.name) return 'indexeddb:' + (globalThis.location?.origin || 'opaque') + ':' + repository.name;
  if (!transientRepositories.has(repository)) transientRepositories.set(repository, uid('repository'));
  return 'session:' + transientRepositories.get(repository);
}
export class WorkingCopyManager {
  constructor(engine, fs, { namespace } = {}) { this.engine = engine; this.fs = fs; this.namespaceOption = namespace; this.links = []; this.queue = Promise.resolve(); this.ledgerHash = null; this.closed = false; }
  async open() {
    this.workspaceId = this.engine.state.id; this.actorId = this.engine.actorId; this.repositoryScope = repositoryNamespace(this.engine.repository, this.namespaceOption);
    const key = await sha256(new TextEncoder().encode(JSON.stringify([this.repositoryScope, this.workspaceId, this.actorId]))); this.ledgerPath = `.civora-work/${key}.json`;
    await this.reload(); return this;
  }
  guard() { if (this.closed || this.engine.state.id !== this.workspaceId || this.engine.actorId !== this.actorId || repositoryNamespace(this.engine.repository, this.namespaceOption) !== this.repositoryScope) throw localError('The workspace or signed-in account changed. Reconnect the local folder.', 'FORBIDDEN'); }
  async reload() {
    const file = await optionalRead(this.fs, this.ledgerPath); this.ledgerHash = file ? await hashBlob(file) : null;
    if (!file) { this.links = []; return; }
    let data; try { data = JSON.parse(await file.text()); } catch { throw localError('The working-copy index is damaged. Your disk files were not changed.'); }
    if (data.format !== 'civora-working-copies' || data.version !== 1 || data.workspaceId !== this.workspaceId || data.actorId !== this.actorId || data.repositoryScope !== this.repositoryScope || !Array.isArray(data.links) || data.links.length > 10000) throw localError('Invalid working-copy index.');
    const ids = new Set(), paths = new Set(); for (const row of data.links) {
      if (!row || typeof row.id !== 'string' || typeof row.documentId !== 'string' || typeof row.versionId !== 'string' || typeof row.path !== 'string' || !/^[a-f0-9]{64}$/.test(row.baseHash) || ids.has(row.id) || paths.has(row.path.toLowerCase())) throw localError('Invalid or duplicate working-copy record.');
      publicWorkPath(row.path); ids.add(row.id); paths.add(row.path.toLowerCase());
    } this.links = data.links;
  }
  async save() { this.guard(); const blob = new Blob([JSON.stringify({ format: 'civora-working-copies', version: 1, workspaceId: this.workspaceId, actorId: this.actorId, repositoryScope: this.repositoryScope, links: this.links })], { type: 'application/json' }); const result = await this.fs.write(this.ledgerPath, blob, this.ledgerHash ? { expectedHash: this.ledgerHash } : { createOnly: true }); this.ledgerHash = result.hash; }
  serial(work) { const next = this.queue.then(async () => { this.guard(); await this.reload(); return work(); }); this.queue = next.catch(() => {}); return next; }
  doc(id, permission = 'download') { const d = this.engine.state.documents.find(d => d.id === id); if (!documentPermission(this.engine, permission, d)) throw localError('The controlled document is unavailable or access was revoked.', 'FORBIDDEN'); return d; }
  async materialize(documentId, { path, checkout = true } = {}) {
    return this.serial(async () => {
      await this.engine.refresh(); let doc = this.doc(documentId); path = publicWorkPath(path || workingPath(this.engine.state, doc));
      if (this.links.some(l => l.documentId === documentId || l.path.toLowerCase() === path.toLowerCase())) throw localError('A working copy already exists. Use its refresh or checkout controls.');
      if (await optionalRead(this.fs, path)) throw localError('A file already exists at this path. Choose another path; it was not overwritten.', 'CONFLICT');
      const beforeVersion = currentVersion(doc).id; let acquired = false;
      if (checkout) {
        if (!documentPermission(this.engine, 'write', doc)) throw localError('You cannot check out this document.', 'FORBIDDEN');
        if (doc.checkedOutBy && doc.checkedOutBy !== this.actorId) throw localError('Another user holds this document lock.', 'LOCKED');
        if (!doc.checkedOutBy) { await this.engine.run('document.checkout', { id: doc.id }); acquired = true; }
        doc = this.doc(documentId); if (currentVersion(doc).id !== beforeVersion) throw localError('The document changed during checkout. Refresh before exporting.', 'CONFLICT');
      }
      const version = currentVersion(doc); let wrote = false;
      try {
        const file = await this.engine.repository.blob(version.blobId); if (await hashBlob(file) !== version.hash) throw localError('Source checksum failed.');
        await this.fs.write(path, file, { createOnly: true }); wrote = true;
        const record = { id: uid('work'), documentId, path, versionId: version.id, baseHash: version.hash, revision: version.label, writable: checkout, createdAt: new Date().toISOString(), updatedAt: new Date().toISOString() };
        this.links.push(record); await this.save(); return record;
      } catch (error) {
        if (acquired && !wrote) { try { await this.engine.run('document.release', { id: documentId }); } catch {} }
        if (wrote) error.message += ' The exported file was retained. Check the document lock before retrying.';
        throw error;
      }
    });
  }
  async status(link) {
    this.guard(); const doc = this.engine.state.documents.find(d => d.id === link.documentId);
    if (!documentPermission(this.engine, 'download', doc)) return { ...link, status: 'access revoked', canCheckin: false };
    try {
      const info = await this.fs.stat(link.path), changed = info.hash !== link.baseHash, remoteChanged = currentVersion(doc).id !== link.versionId;
      return { ...link, name: doc.name, number: doc.number, localHash: info.hash, size: info.size, modifiedAt: info.modifiedAt, remoteRevision: currentVersion(doc).label, changed, remoteChanged, owned: doc.checkedOutBy === this.actorId, status: remoteChanged ? changed ? 'conflict' : 'out of date' : changed ? 'modified' : 'unchanged', canCheckin: !remoteChanged && changed && doc.checkedOutBy === this.actorId && documentPermission(this.engine, 'write', doc) };
    } catch (error) { return { ...link, name: doc.name, number: doc.number, status: isMissing(error) ? 'missing' : 'unavailable', error: error.message, canCheckin: false }; }
  }
  async scan() { this.guard(); await this.reload(); const result = []; for (const link of this.links) result.push(await this.status(link)); return result; }
  async acquire(id) {
    return this.serial(async () => { await this.engine.refresh(); const link = this.links.find(l => l.id === id); if (!link) throw localError('Working copy not found.'); const doc = this.doc(link.documentId, 'write'); if (currentVersion(doc).id !== link.versionId) throw localError('This working copy is based on an older revision. Resolve it first.', 'CONFLICT'); if (doc.checkedOutBy !== this.actorId) await this.engine.run('document.checkout', { id: doc.id }); link.writable = true; await this.save(); return link; });
  }
  async checkin(id, { revision, comment, expectedLocalHash } = {}) {
    return this.serial(async () => {
      await this.engine.refresh(); const link = this.links.find(l => l.id === id); if (!link) throw localError('Working copy not found.');
      const doc = this.doc(link.documentId), snapshot = await this.fs.read(link.path), file = await prepareFile(localFileBlob(snapshot,doc.name,currentVersion(doc).mime));
      if (expectedLocalHash && file.descriptor.hash !== expectedLocalHash) throw localError('The file changed after you opened the check-in dialog. Review the new contents.', 'CONFLICT');
      if (currentVersion(doc).id !== link.versionId) throw localError('The controlled document changed. This working copy was not checked in.', 'CONFLICT');
      if (doc.checkedOutBy !== this.actorId) throw localError('Check out this document before checking in the working copy.', 'LOCKED');
      if (file.descriptor.hash === link.baseHash) throw localError('The local file is unchanged. Release the checkout or edit the file first.');
      await this.engine.run('document.checkin', { id: doc.id, revision, comment, baseVersionId: link.versionId, file: file.descriptor }, file);
      const version = currentVersion(this.doc(doc.id)); link.versionId = version.id; link.baseHash = version.hash; link.revision = version.label; link.writable = false; link.updatedAt = new Date().toISOString();
      try { await this.save(); } catch (error) { error.message = 'The revision was committed, but the local index could not be saved. Do not repeat the check-in; refresh/relink. ' + error.message; throw error; }
      return link;
    });
  }
  async refresh(id, { expectedLocalHash, keepModified = false } = {}) {
    return this.serial(async () => {
      await this.engine.refresh(); const link = this.links.find(l => l.id === id); if (!link) throw localError('Working copy not found.'); const doc = this.doc(link.documentId), version = currentVersion(doc), existing = await optionalRead(this.fs, link.path), hash = existing ? await hashBlob(existing) : null;
      if (hash !== (expectedLocalHash || null)) throw localError('Local content changed after review.', 'CONFLICT');
      if (hash && hash !== link.baseHash && !keepModified) throw localError('Local edits need preservation before replacing this working copy.', 'CONFLICT');
      let preserved = null;
      if (hash && hash !== link.baseHash) { preserved = link.path + '.local-' + Date.now(); await this.fs.write(preserved, existing, { createOnly: true }); }
      const file = await this.engine.repository.blob(version.blobId); if (await hashBlob(file) !== version.hash) throw localError('Source checksum failed.');
      await this.fs.write(link.path, file, hash ? { expectedHash: hash } : { createOnly: true });
      Object.assign(link, { versionId: version.id, baseHash: version.hash, revision: version.label, writable: doc.checkedOutBy === this.actorId, updatedAt: new Date().toISOString() }); await this.save(); return { ...link, preserved };
    });
  }
  async untrack(id) { return this.serial(async () => { this.links = this.links.filter(l => l.id !== id); await this.save(); return { retained: true }; }); }
  close() { this.closed = true; }
}
/** Hierarchical imports retain folder structure. A batch is a series of audited
 * commits, not a single transaction; cancellation/failure reports partial results. */
export async function importTree(engine, entries, { projectId, folderId = null, revision = 'P01', discipline = 'General', metadata = {}, signal, onProgress } = {}) {
  if (!Array.isArray(entries) || entries.length > 5000) throw localError('Import at most 5,000 files per batch.');
  const normalized = [], seen = new Set();
  for (const entry of entries) { const path = relativePath(entry.path), key = path.normalize('NFC').toLocaleLowerCase('en-US'); if (path.split('/').some(p => p.toLowerCase().startsWith('.civora'))) continue; if (seen.has(key)) throw localError('The import has case-insensitive or Unicode-normalization filename collisions.'); seen.add(key); if (!(entry.file instanceof Blob) && typeof entry.read !== 'function') throw localError('An import file is missing.'); normalized.push({ ...entry, path }); }
  normalized.sort((a,b) => a.path.localeCompare(b.path)); const report = { created: [], failed: [], cancelled: false };
  const folderCache = new Map([['', folderId]]);
  const ensureFolder = async path => {
    if (folderCache.has(path)) return folderCache.get(path); const parts = path.split('/'), name = parts.pop(), parent = await ensureFolder(parts.join('/'));
    const found = engine.state.folders.find(f => f.projectId === projectId && (f.parentId || null) === (parent || null) && f.name.normalize('NFC').toLowerCase() === name.normalize('NFC').toLowerCase());
    const id = found?.id || await engine.run('folder.create', { projectId, parentId: parent, name }); folderCache.set(path,id); return id;
  };
  for (const entry of normalized) {
    if (signal?.aborted) { report.cancelled = true; break; }
    try { const parts = entry.path.split('/'), name = parts.pop(), parentId = await ensureFolder(parts.join('/')), file = entry.file || await entry.read();
      const id = await engine.addFile(localFileBlob(file,name), { projectId, folderId: parentId, name, title: name.replace(/\.[^.]+$/, ''), revision, discipline, metadata }); report.created.push({ path: entry.path, documentId: id });
    } catch (error) { report.failed.push({ path: entry.path, error: error.message }); }
    onProgress?.({ completed: report.created.length + report.failed.length, total: normalized.length, ...report });
  } return report;
}
export async function exportTree(engine, fs, documentIds, { basePath = '', signal, onProgress } = {}) {
  relativePath(basePath, { empty: true }); const records = [], seen = new Set();
  // Pin all selected revisions before the first asynchronous read.
  for (const id of documentIds) { const doc = engine.state.documents.find(d => d.id === id); if (!documentPermission(engine, 'download', doc)) throw localError('One or more documents cannot be exported.', 'FORBIDDEN'); const version = currentVersion(doc), path = joinPath(basePath, workingPath(engine.state, doc)); if (seen.has(path.toLowerCase())) throw localError('Export paths collide.'); seen.add(path.toLowerCase()); records.push({ documentId: id, versionId: version.id, hash: version.hash, revision: version.label, mime: version.mime, name: doc.name, path }); }
  const report = { created: [], failed: [], cancelled: false };
  for (const record of records) { if (signal?.aborted) { report.cancelled = true; break; } try { const file = await engine.repository.blob(record.hash); if (await hashBlob(file) !== record.hash) throw localError('Source checksum failed.'); await fs.write(record.path, file, { createOnly: true }); report.created.push(record); } catch (error) { report.failed.push({ ...record, error: error.message }); } onProgress?.(report); }
  return report;
}
