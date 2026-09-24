import { verifyCopyContent } from '../document-copy/index.js';
import { applyCommand, validateWorkspace, DomainError, uid, copy } from '../core/index.js';
export const MAX_FILE_BYTES = 50 * 1024 * 1024;
export async function sha256(bytes) {
  if (!globalThis.crypto?.subtle) throw new Error('Secure browser storage requires HTTPS or localhost.');
  return [...new Uint8Array(await crypto.subtle.digest('SHA-256', bytes))].map(x => x.toString(16).padStart(2, '0')).join('');
}
export async function prepareFile(file) {
  if (!(file instanceof Blob) || file.size > MAX_FILE_BYTES) throw new Error('Choose a file no larger than 50 MiB.');
  const bytes = new Uint8Array(await file.arrayBuffer()), hash = await sha256(bytes);
  return { descriptor: { blobId: hash, hash, size: bytes.length, mime: file.type || 'application/octet-stream' }, blob: new Blob([bytes], { type: file.type || 'application/octet-stream' }) };
}
function requestPromise(request) { return new Promise((resolve, reject) => { request.onsuccess = () => resolve(request.result); request.onerror = () => reject(request.error); }); }
function complete(transaction) { return new Promise((resolve, reject) => { transaction.oncomplete = () => resolve(); transaction.onabort = transaction.onerror = () => reject(transaction.error || new Error('The database transaction was cancelled.')); }); }
export class IndexedDBRepository {
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
export class MemoryRepository {
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
export async function fetchJSON(url, options = {}) {
  let response;
  try { response = await fetch(url, { ...options, headers: { Accept: 'application/json', ...(options.body ? { 'Content-Type': 'application/json' } : {}), ...options.headers } }); }
  catch { throw new Error('Could not reach the server. Check the endpoint, HTTPS, and network connection.'); }
  const content = response.headers.get('content-type') || '';
  const value = content.includes('json') ? await response.json() : { error: `Unexpected response (${response.status}). Check the server endpoint.` };
  if (!response.ok) throw new DomainError(value.error || `Request failed (${response.status})`, value.code || String(response.status));
  return value;
}
export class HttpRepository {
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
export class WorkspaceEngine extends EventTarget {
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
export function toBase64(bytes) { let binary = ''; for (let i = 0; i < bytes.length; i += 32768) binary += String.fromCharCode(...bytes.subarray(i, i + 32768)); return btoa(binary); }
export function fromBase64(value) { if (typeof value !== 'string' || !/^[A-Za-z0-9+/]*={0,2}$/.test(value) || value.length % 4) throw new Error('Invalid backup encoding.'); const binary = atob(value); return Uint8Array.from(binary, c => c.charCodeAt(0)); }
export async function exportBackup(repository, state) {
  validateWorkspace(state); const files = {}, ids = new Set(state.documents.flatMap(d => d.versions.map(v => v.blobId))); let total = 0;
  for (const id of ids) { const blob = await repository.blob(id); total += blob.size; if (total > 90 * 1024 * 1024) throw new Error('This browser backup is limited to 90 MiB of source files. Use server database backups for larger workspaces.'); files[id] = { mime: blob.type, data: toBase64(new Uint8Array(await blob.arrayBuffer())) }; }
  return { format: 'civora-workspace-backup', version: 1, exportedAt: new Date().toISOString(), workspace: copy(state), files };
}
export async function verifyBackup(input) {
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
