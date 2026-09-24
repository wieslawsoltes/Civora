/** Portable local filesystem capabilities. No browser-specific globals at import time.
 * A granted folder is a capability, not unrestricted machine access. */
import { DomainError, uid } from '../core/index.js';
import { sha256, MAX_FILE_BYTES, fetchJSON, toBase64 } from '../storage/index.js';
export const LOCAL_LIMITS = Object.freeze({ fileBytes: MAX_FILE_BYTES, entries: 10000, depth: 48 });
export function localError(message, code = 'VALIDATION') { return new DomainError(message, code); }
export function relativePath(value, { empty = false, internal = false } = {}) {
  if (typeof value !== 'string' || value.length > 1800 || (!value && !empty)) throw localError('A relative path is required.');
  if (!value) return '';
  const parts = value.split('/');
  if (parts.length > LOCAL_LIMITS.depth || parts.some(p => !p || p === '.' || p === '..' || /[\\\x00-\x1f\x7f<>:"|?*]/.test(p) || /[. ]$/.test(p) || p.length > 200 || /^(CON|PRN|AUX|NUL|COM[1-9]|LPT[1-9])(?:\.|$)/i.test(p))) throw localError('Use a portable relative path without traversal, reserved names, or control characters.');
  if (!internal && parts.some(p => p.toLowerCase() === '.civora-trash')) throw localError('Trash is accessible only through the recovery controls.', 'FORBIDDEN');
  return value;
}
export function portableName(value, fallback = 'item') {
  let text = String(value || '').normalize('NFC').replace(/[\\/\x00-\x1f\x7f<>:"|?*]/g, '_').replace(/[. ]+$/g, '').slice(0, 150);
  if (!text || text === '.' || text === '..') text = fallback;
  if (/^(CON|PRN|AUX|NUL|COM[1-9]|LPT[1-9])(?:\.|$)/i.test(text)) text = '_' + text;
  return text;
}
export const joinPath = (...parts) => relativePath(parts.filter(Boolean).join('/'), { empty: true });
export function localFileBlob(blob, name, mime = '') {
  if (!(blob instanceof Blob)) throw localError('Expected original file bytes.');
  const types = {svg:'image/svg+xml',png:'image/png',jpg:'image/jpeg',jpeg:'image/jpeg',webp:'image/webp',gif:'image/gif',pdf:'application/pdf',txt:'text/plain',csv:'text/csv',md:'text/markdown',json:'application/json',xml:'application/xml',dxf:'application/dxf',ifc:'application/x-step',obj:'text/plain',stl:'model/stl',glb:'model/gltf-binary'};
  const type = mime && mime !== 'application/octet-stream' ? mime : blob.type && blob.type !== 'application/octet-stream' ? blob.type : types[String(name).split('.').at(-1).toLowerCase()] || 'application/octet-stream';
  return new Blob([blob], {type}); // Rewrap bytes; never transcode original content.
}
export async function hashBlob(blob) { if (!(blob instanceof Blob) || blob.size > MAX_FILE_BYTES) throw localError('Local files are limited to 50 MiB.'); return sha256(await blob.arrayBuffer()); }
export function isMissing(error) { return ['NotFoundError', 'ENOENT', 'NOT_FOUND', '404'].includes(error?.name) || ['ENOENT', 'NOT_FOUND', '404'].includes(error?.code); }
export async function optionalRead(fs, path) { try { return await fs.read(path); } catch (error) { if (isMissing(error)) return null; throw error; } }
export async function assertExpected(fs, path, options = {}) {
  const existing = await optionalRead(fs, path);
  if (options.createOnly || options.expectedHash === null) { if (existing) throw localError('The destination already exists. No file was overwritten.', 'CONFLICT'); }
  else if (typeof options.expectedHash === 'string' && /^[a-f0-9]{64}$/.test(options.expectedHash)) { if (!existing || await hashBlob(existing) !== options.expectedHash) throw localError('The disk file changed. Refresh and review before saving.', 'CONFLICT'); }
  else throw localError('Writes require createOnly or an explicit expected SHA-256 hash.');
  return existing;
}
export function filesystemCapabilities() {
  return { directoryPicker: typeof globalThis.showDirectoryPicker === 'function', savePicker: typeof globalThis.showSaveFilePicker === 'function', persistentHandles: !!globalThis.indexedDB, locks: !!globalThis.navigator?.locks, secureContext: !!globalThis.isSecureContext, native: false };
}
export class BrowserDirectoryFS {
  constructor(handle, { readOnly = false, id = '', label = '' } = {}) {
    if (!handle || handle.kind !== 'directory') throw localError('Choose a directory.');
    this.handle = handle; this.readOnly = readOnly; this.id = id || uid('mount'); this.label = label || handle.name; this.kind = 'browser-folder'; this.closed = false;
  }
  async permission(request = false) {
    if (this.closed) throw localError('Folder access was disconnected.', 'FORBIDDEN');
    const descriptor = { mode: this.readOnly ? 'read' : 'readwrite' };
    if (!this.handle.queryPermission) return 'granted';
    let result = await this.handle.queryPermission(descriptor);
    if (result !== 'granted' && request) result = await this.handle.requestPermission(descriptor);
    return result;
  }
  async guard(write = false) {
    if (this.closed || write && this.readOnly) throw localError('This folder is disconnected or read-only.', 'FORBIDDEN');
    if (await this.permission() !== 'granted') throw localError('Folder permission expired. Reconnect and grant access to continue.', 'FORBIDDEN');
  }
  async directory(path = '', create = false, internal = false) {
    await this.guard(create); relativePath(path, { empty: true, internal }); let directory = this.handle;
    for (const segment of path.split('/').filter(Boolean)) directory = await directory.getDirectoryHandle(segment, { create });
    return directory;
  }
  async fileHandle(path, create = false, internal = false) { relativePath(path, { internal }); const parts = path.split('/'), name = parts.pop(); return (await this.directory(parts.join('/'), create, internal)).getFileHandle(name, { create }); }
  async read(path) { await this.guard(); const file = await (await this.fileHandle(path)).getFile(); if (file.size > MAX_FILE_BYTES) throw localError('File exceeds the 50 MiB local-file limit.'); return file; }
  async stat(path, { hash = true } = {}) { const f = await this.read(path); return { path, name: path.split('/').at(-1), kind: 'file', size: f.size, modifiedAt: f.lastModified || 0, ...(hash ? { hash: await hashBlob(f) } : {}) }; }
  async list(path = '', { recursive = false, limit = LOCAL_LIMITS.entries, signal, includeInternal = false } = {}) {
    await this.guard(); relativePath(path, { empty: true }); const output = []; limit = Math.min(limit, LOCAL_LIMITS.entries);
    const visit = async (directory, prefix, depth) => {
      if (depth > LOCAL_LIMITS.depth) throw localError('Directory nesting exceeds the scan limit.');
      const entries = []; for await (const entry of directory.values()) { if (entries.length >= LOCAL_LIMITS.entries) throw localError('This directory exceeds the scan limit.'); entries.push(entry); }
      entries.sort((a,b) => a.name.localeCompare(b.name));
      for (const entry of entries) {
        signal?.throwIfAborted(); if (!includeInternal && entry.name.startsWith('.civora')) continue;
        let p;try{p=joinPath(prefix,entry.name);}catch{output.push({path:prefix?prefix+'/'+entry.name:entry.name,name:entry.name,kind:'blocked',size:0,modifiedAt:0});continue;} if (output.length >= limit) throw localError(`Directory scan exceeds ${limit} entries. Select a smaller folder.`);
        const info = { path: p, name: entry.name, kind: entry.kind, size: 0, modifiedAt: 0 };
        if (entry.kind === 'file') { const f = await entry.getFile(); info.size = f.size; info.modifiedAt = f.lastModified; }
        output.push(info); if (recursive && entry.kind === 'directory') await visit(entry, p, depth + 1);
      }
    };
    await visit(await this.directory(path), path, 0); return output;
  }
  async mkdir(path) { await this.guard(true); await this.directory(path, true); return { path }; }
  async write(path, blob, options = {}) {
    await this.guard(true); relativePath(path); const hash = await hashBlob(blob); await assertExpected(this, path, options);
    const handle = await this.fileHandle(path, true); const stream = await handle.createWritable();
    try {
      // A writable stream stages bytes until close(). This is not an OS-level
      // compare-and-swap against native applications; check immediately before close.
      await stream.write(blob);
      if (options.expectedHash) { const current = await handle.getFile(); if (await hashBlob(current) !== options.expectedHash) throw localError('The file changed while it was being saved.', 'CONFLICT'); }
      await stream.close();
    } catch (error) { try { await stream.abort(); } catch {} throw error; }
    return { path, hash, size: blob.size };
  }
  async removeEmptyFile(path, expectedHash) { await this.guard(true); await assertExpected(this, path, { expectedHash }); const parts = path.split('/'), name = parts.pop(); await (await this.directory(parts.join('/'))).removeEntry(name); }
  async move(path, destination, { expectedHash } = {}) {
    await this.guard(true); relativePath(destination); const file = await assertExpected(this, path, { expectedHash });
    await this.write(destination, file, { createOnly: true });
    // Portable fallback is copy/verify/delete, not atomic rename. A failure leaves
    // a recoverable duplicate rather than destroying the source.
    if (await hashBlob(await this.read(destination)) !== expectedHash) throw localError('Destination verification failed. The source was retained.');
    await this.removeEmptyFile(path, expectedHash); return { path: destination, hash: expectedHash, copied: true };
  }
  async archive(path, file, reason = 'replace') {
    await this.guard(true); relativePath(path); const id = uid('trash'), dir = await this.directory('.civora-trash/' + id, true, true), hash = await hashBlob(file);
    const put = async (name, blob) => { const out = await (await dir.getFileHandle(name, { create: true })).createWritable(); try { await out.write(blob); await out.close(); } catch (error) { try { await out.abort(); } catch {} throw error; } };
    await put('content', file); const metadata = { id, path, kind: 'file', size: file.size, hash, at: new Date().toISOString(), reason };
    await put('record.json', new Blob([JSON.stringify(metadata)])); return metadata;
  }
  async trash(path, { expectedHash } = {}) {
    await this.guard(true); const file = await assertExpected(this, path, { expectedHash });
    const metadata = await this.archive(path, file, 'trash'); await this.removeEmptyFile(path, expectedHash); return metadata;
  }
  async trashList() {
    await this.guard(); let dir; try { dir = await this.directory('.civora-trash', false, true); } catch (error) { if (isMissing(error)) return []; throw error; }
    const result = []; for await (const entry of dir.values()) { if (result.length >= 1000) break; if (entry.kind !== 'directory') continue; try { result.push(JSON.parse(await (await (await entry.getFileHandle('record.json')).getFile()).text())); } catch {} }
    return result.sort((a,b) => b.at.localeCompare(a.at));
  }
  async restoreTrash(id, destination = '') {
    await this.guard(true); if (!/^[A-Za-z0-9_-]{1,120}$/.test(id)) throw localError('Invalid trash identifier.');
    const dir = await this.directory('.civora-trash/' + id, false, true), record = JSON.parse(await (await (await dir.getFileHandle('record.json')).getFile()).text());
    const file = await (await dir.getFileHandle('content')).getFile(); if (await hashBlob(file) !== record.hash) throw localError('Trash content failed integrity verification.');
    await this.write(destination || record.path, file, { createOnly: true });
    await (await this.directory('.civora-trash', false, true)).removeEntry(id, { recursive: true }); return { path: destination || record.path };
  }
  close() { this.closed = true; }
}
/** Remember capabilities, never serialized directory contents or credentials. */
export class FolderBookmarks {
  async database() { if (!globalThis.indexedDB) throw localError('This browser cannot remember folder handles.'); return new Promise((resolve,reject) => { const r = indexedDB.open('civora-folder-bookmarks', 1); r.onupgradeneeded = () => r.result.createObjectStore('handles', { keyPath: 'id' }); r.onsuccess = () => resolve(r.result); r.onerror = () => reject(r.error); }); }
  async operation(mode, callback) { const db = await this.database(); try { return await new Promise((resolve,reject) => { const tx = db.transaction('handles',mode), request = callback(tx.objectStore('handles')); let output; request.onsuccess = () => { output = request.result; }; tx.oncomplete = () => resolve(output); tx.onerror = tx.onabort = () => reject(tx.error || request.error); }); } finally { db.close(); } }
  save(fs) { return this.operation('readwrite', s => s.put({ id: fs.id, label: fs.label, readOnly: fs.readOnly, handle: fs.handle, savedAt: new Date().toISOString() })); }
  list() { return this.operation('readonly', s => s.getAll()); }
  forget(id) { return this.operation('readwrite', s => s.delete(id)); }
}
export class HttpDirectoryFS {
  constructor(root, base = '/api/local') { this.id = root.id; this.label = root.label; this.readOnly = root.readOnly; this.kind = 'localhost-folder'; this.base = `${base}/roots/${encodeURIComponent(root.id)}`; this.native = root.native || false; this.revealEnabled = root.reveal || false; this.location = root.location || '';  this.closed = false; }
  check() { if (this.closed) throw localError('Local folder was disconnected.', 'FORBIDDEN'); }
  async permission() { this.check(); return 'granted'; }
  async request(route, method = 'GET', body) { this.check(); return fetchJSON(this.base + route, { method, ...(body === undefined ? {} : { body: JSON.stringify(body) }) }); }
  async list(path = '', options = {}) { return (await this.request(`/list?path=${encodeURIComponent(relativePath(path, { empty: true }))}&recursive=${options.recursive ? '1' : '0'}&internal=${options.includeInternal ? '1' : '0'}`)).entries; }
  async stat(path) { return this.request('/stat?path=' + encodeURIComponent(relativePath(path))); }
  async read(path) { this.check(); const response = await fetch(this.base + '/file?path=' + encodeURIComponent(relativePath(path)), { credentials: 'same-origin' }); if (!response.ok) { const problem = await response.json().catch(() => ({})); throw localError(problem.error || 'Local file is unavailable.', problem.code || String(response.status)); } return response.blob(); }
  async write(path, blob, options = {}) { await hashBlob(blob); return this.request('/write','POST',{ path: relativePath(path), data: toBase64(new Uint8Array(await blob.arrayBuffer())), ...options }); }
  mkdir(path) { return this.request('/mkdir','POST',{ path: relativePath(path) }); }
  move(path,destination,options = {}) { return this.request('/move','POST',{ path: relativePath(path), destination: relativePath(destination), ...options }); }
  trash(path,options = {}) { return this.request('/trash','POST',{ path: relativePath(path), ...options }); }
  trashList() { return this.request('/trash').then(r => r.items); }
  restoreTrash(id,destination = '') { return this.request('/restore','POST',{ id, destination }); }
  nativeOpen(path,expectedHash) { return this.request('/open','POST',{ path, expectedHash, confirm: true }); }
  reveal(path = '') { return this.request('/reveal','POST',{ path, confirm: true }); }
  close() { this.closed = true; }
}
/** Polling intentionally reconciles state; it does not rely on unreliable OS watch events. */
export class DirectoryMonitor extends EventTarget {
  constructor(scan, { interval = 5000 } = {}) { super(); this.scan = scan; this.interval = Math.max(2000, interval); this.running = false; this.busy = false; this.last = null; this.error = null; this.generation=0; }
  async tick() { if (this.busy) return; this.busy = true; try { const value = await this.scan(); this.last = value; this.error = null; this.dispatchEvent(new CustomEvent('change', { detail: value })); return value; } catch (error) { this.error = error; this.dispatchEvent(new CustomEvent('error', { detail: error })); throw error; } finally { this.busy = false; } }
  start() { if (this.running) return; this.running = true; const generation=++this.generation; const run = async () => { if(!this.running||generation!==this.generation)return; try { await this.tick(); } catch {} if (this.running&&generation===this.generation) this.timer = setTimeout(run, this.interval); }; void run(); }
  stop() { this.running = false; this.generation++; clearTimeout(this.timer); }
}
