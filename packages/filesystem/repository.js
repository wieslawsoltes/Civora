/** Disk-folder workspace format: immutable original blobs and checkpoint commits,
 * followed by a small hash-pinned HEAD update. Local profiles are NOT authentication.
 * Writable browser repositories require Web Locks and a single cooperating origin. */
import { applyCommand, validateWorkspace, copy, uid } from '../core/index.js';
import { hashBlob, optionalRead, localError, localFileBlob } from './index.js';
const jsonBlob = value => new Blob([JSON.stringify(value)], { type: 'application/json' });
const hashes = state => new Set(state.documents.flatMap(d => d.versions.map(v => v.blobId)));
const hashId = id => { if (!/^[a-f0-9]{64}$/.test(id)) throw localError('Invalid checkpoint or content hash.'); return id; };
export class DirectoryRepository {
  constructor(fs, { create = false, lock = null, pollInterval = 4000 } = {}) {
    this.fs = fs; this.kind = 'directory'; this.create = create; this.lock = lock; this.listeners = new Set(); this.pollInterval = pollInterval; this.closed = false; this.lastRevision = null; this.currentCommit = null;
  }
  async open() {
    if (this.closed) throw localError('Repository is closed.');
    const existing = await optionalRead(this.fs, '.civora/format.json');
    if (existing) { this.format = JSON.parse(await existing.text()); if (this.format.format !== 'civora-directory-workspace' || this.format.version !== 1 || typeof this.format.id !== 'string' || !/^[A-Za-z0-9_-]{1,120}$/.test(this.format.id)) throw localError('This folder has an unsupported workspace format.'); }
    else {
      if (!this.create) throw localError('No folder workspace exists here. Use Create folder workspace to initialize it.', 'NOT_FOUND');
      this.checkWritable(); const marker = { format: 'civora-directory-workspace', version: 1, id: uid('disk'), createdAt: new Date().toISOString() };
      try { await this.fs.write('.civora/format.json', jsonBlob(marker), { createOnly: true }); this.format = marker; }
      catch (error) { if (error.code !== 'CONFLICT') throw error; this.format = JSON.parse(await (await this.fs.read('.civora/format.json')).text()); if (this.format.format !== marker.format || this.format.version !== 1) throw localError('A different folder initialization was detected.'); }
    }
    return this;
  }
  checkWritable() { if (this.fs.readOnly) throw localError('The folder workspace is read-only.', 'FORBIDDEN'); if (!this.lock && !globalThis.navigator?.locks) throw localError('This browser has no Web Locks support. Open read-only, or use the localhost edition.'); }
  async exclusive(work) { this.checkWritable(); if (this.closed) throw localError('Repository is closed.'); const name = 'civora-directory:' + this.format.id; return this.lock ? this.lock(name, work) : navigator.locks.request(name, { mode: 'exclusive' }, work); }
  async head() { const file = await optionalRead(this.fs, '.civora/HEAD.json'); if (!file) return null; let record; try { record = JSON.parse(await file.text()); hashId(record.commit); } catch { throw localError('Folder HEAD is damaged. No data was reset; use checkpoint recovery.'); } return { ...record, hash: await hashBlob(file) }; }
  async checkpoint(id) {
    hashId(id); const blob = await this.fs.read(`.civora/commits/${id}.json`); if (await hashBlob(blob) !== id) throw localError('Checkpoint checksum failed. The workspace has not been reset.');
    const record = JSON.parse(await blob.text());
    if (record.format !== 'civora-directory-commit' || record.version !== 1 || record.repositoryId !== this.format.id || record.parent !== null && !/^[a-f0-9]{64}$/.test(record.parent)) throw localError('Invalid folder checkpoint.');
    validateWorkspace(record.state); return record;
  }
  rememberTypes(state) { this.fileTypes=new Map(); for(const doc of state.documents)for(const version of doc.versions)if(!this.fileTypes.has(version.blobId))this.fileTypes.set(version.blobId,{name:doc.name,mime:version.mime}); }
  async read() { const head = await this.head(); if (!head) return null; const record = await this.checkpoint(head.commit); this.currentCommit = head.commit; this.lastRevision = record.state.revision; this.rememberTypes(record.state); return copy(record.state); }
  async blob(id) { hashId(id); const file = await this.fs.read(`.civora/blobs/${id}`); if (await hashBlob(file) !== id) throw localError('Original content failed SHA-256 verification.'); const type=this.fileTypes?.get(id);return type?localFileBlob(file,type.name,type.mime):file; }
  async publish(state, parent, files, headHash) {
    validateWorkspace(state); const required = hashes(state);
    for (const [id, file] of files) {
      hashId(id); if (!required.has(id)) continue;
      if (await hashBlob(file) !== id) throw localError('A file does not match its content hash.');
      const existing = await optionalRead(this.fs, `.civora/blobs/${id}`);
      if (existing) { if (await hashBlob(existing) !== id) throw localError('An existing original is corrupt; it was not overwritten.'); }
      else await this.fs.write(`.civora/blobs/${id}`, file, { createOnly: true });
    }
    // Verify every new reference before publishing metadata. Retained references
    // were verified on their initial commit; a full scan is available separately.
    const priorIds = parent ? hashes((await this.checkpoint(parent)).state) : new Set();
    for (const id of required) if (!priorIds.has(id) || files.has(id)) {
      const file = await this.blob(id); for (const d of state.documents) for (const v of d.versions) if (v.blobId === id && v.size !== file.size) throw localError('Original file size does not match the revision record.');
    }
    const record = { format: 'civora-directory-commit', version: 1, repositoryId: this.format.id, parent, at: new Date().toISOString(), state: copy(state) };
    const blob = jsonBlob(record); if (blob.size > 32 * 1024 * 1024) throw localError('Folder checkpoint metadata exceeds 32 MiB.');
    const commit = await hashBlob(blob); await this.fs.write(`.civora/commits/${commit}.json`, blob, { createOnly: true });
    await this.fs.write('.civora/HEAD.json', jsonBlob({ commit, revision: state.revision }), headHash ? { expectedHash: headHash } : { createOnly: true });
    this.currentCommit = commit; this.lastRevision = state.revision;this.rememberTypes(state); return copy(state);
  }
  async initialize(state, files = new Map()) {
    const existing = await this.read(); if (existing) return existing;
    return this.exclusive(async () => { const head = await this.head(); if (head) return this.read(); return this.publish(state, null, files, null); });
  }
  async commit(command, actorId, expectedRevision, file = null) {
    return this.exclusive(async () => {
      const head = await this.head(), current = head ? (await this.checkpoint(head.commit)).state : null;
      if (!current || current.revision !== expectedRevision) throw localError('The folder workspace changed. Refresh before saving.', 'CONFLICT');
      const output = applyCommand(current, command, actorId), files = file ? new Map([[file.descriptor.blobId, file.blob]]) : new Map();
      output.state = await this.publish(output.state, head.commit, files, head.hash); return output;
    });
  }
  async replace(state, files, expectedRevision) {
    return this.exclusive(async () => {
      const head = await this.head(), current = head ? (await this.checkpoint(head.commit)).state : null;
      if (!current || current.revision !== expectedRevision) throw localError('The folder changed during restore.', 'CONFLICT');
      const next = copy(state); next.revision = Math.max(expectedRevision, next.revision) + 1;
      next.audit.push({ id: uid('audit'), sequence: next.revision, commandId: uid('cmd'), at: new Date().toISOString(), by: next.users.find(u => u.active && u.role === 'admin').id, type: 'workspace.restore', targetId: next.id, summary: 'Restored a verified local folder checkpoint or backup' });
      return this.publish(next, head.commit, files, head.hash);
    });
  }
  async integrity(state = null, { signal, onProgress } = {}) {
    state ||= await this.read(); validateWorkspace(state); const ids = hashes(state); let bytes = 0, completed = 0;
    for (const id of ids) { signal?.throwIfAborted(); const blob = await this.blob(id); for (const d of state.documents) for (const v of d.versions) if (v.blobId === id && v.size !== blob.size) throw localError('A revision size differs from disk content.'); bytes += blob.size; onProgress?.({ completed: ++completed, total: ids.size }); }
    return { valid: true, files: ids.size, bytes, revisions: state.documents.reduce((n,d) => n + d.versions.length, 0), checkedAt: new Date().toISOString() };
  }
  async history() {
    const items = await this.fs.list('.civora/commits', { includeInternal: true }); if(items.length>1000)throw localError('Checkpoint recovery is limited to 1,000 checkpoints; archive old history with the workspace closed before using this view.'); let head; try { head = await this.head(); } catch {}
    const results = [];
    for (const row of items.filter(e => e.kind === 'file').slice(0,1000)) {
      const id = row.name.replace(/\.json$/, ''); if (!/^[a-f0-9]{64}$/.test(id)) continue;
      try { const record = await this.checkpoint(id); results.push({ id, at: record.at, revision: record.state.revision, documents: record.state.documents.length, current: head?.commit === id, parent: record.parent, valid: true }); }
      catch (error) { results.push({ id, valid: false, error: error.message, at: '' }); }
    } return results.sort((a,b) => b.at.localeCompare(a.at));
  }
  async recover(id, { expectedHeadHash = null } = {}) {
    // Explicit recovery, including a damaged HEAD. Never choose a checkpoint
    // automatically: a crash can leave a staged but uncommitted checkpoint.
    return this.exclusive(async () => {
      const record = await this.checkpoint(id); await this.integrity(record.state);
      const current = await optionalRead(this.fs, '.civora/HEAD.json'), actual = current ? await hashBlob(current) : null;
      if (actual !== expectedHeadHash) throw localError('HEAD changed during recovery. Review again.', 'CONFLICT');
      const history = await this.history(), state = copy(record.state);
      state.revision = Math.max(state.revision, ...history.filter(row => row.valid).map(row => row.revision)) + 1;
      state.audit.push({ id: uid('audit'), sequence: state.revision, commandId: uid('cmd'), at: new Date().toISOString(), by: state.users.find(u => u.active && u.role === 'admin').id, type: 'workspace.restore', targetId: state.id, summary: 'Explicit recovery from verified local checkpoint ' + id.slice(0, 12) });
      // A recovery is itself a new commit, preventing revision-number reuse (ABA).
      return this.publish(state, id, new Map(), actual);
    });
  }
  subscribe(listener) {
    this.listeners.add(listener);
    if (!this.timer) this.timer = setInterval(async () => {
      if (this.polling || this.closed) return; this.polling = true;
      try { const head = await this.head(); if (head && head.commit !== this.currentCommit) { const record = await this.checkpoint(head.commit); this.listeners.forEach(fn => fn({ revision: record.state.revision, commit: head.commit })); } }
      catch (error) { this.listeners.forEach(fn => fn({ connectionError: true, message: error.message })); } finally { this.polling = false; }
    }, this.pollInterval);
    this.timer?.unref?.(); return () => { this.listeners.delete(listener); if (!this.listeners.size) { clearInterval(this.timer); this.timer = null; } };
  }
  close() { this.closed = true; clearInterval(this.timer); this.timer = null; this.listeners.clear(); }
}
