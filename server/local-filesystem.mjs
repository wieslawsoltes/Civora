/** Scoped local disk I/O. Never evaluates commands or resolves client absolute paths.
 * Protection is against HTTP clients, not a hostile process with the same OS UID. */
import { open, mkdir, lstat, realpath, readdir, rename, link, unlink, rm, statfs } from 'node:fs/promises';
import { constants } from 'node:fs';
import { resolve, join, dirname, sep } from 'node:path';
import { randomUUID, createHash } from 'node:crypto';
import { relativePath, LOCAL_LIMITS, localError, isMissing } from '../packages/filesystem/index.js';
const digest = bytes => createHash('sha256').update(bytes).digest('hex');
const missing = error => error?.code === 'ENOENT';
const internalName = name => name.startsWith('.civora');
export class NodeDirectoryFS {
  constructor(root, options = {}) { this.root = resolve(root); this.readOnly = !!options.readOnly; this.label = options.label || this.root.split(sep).at(-1); this.kind = 'node-folder'; this.queue = Promise.resolve(); this.closed = false; }
  async open() {
    if (!this.readOnly) await mkdir(this.root, { recursive: true, mode: 0o700 });
    const info = await lstat(this.root); if (!info.isDirectory() || info.isSymbolicLink()) throw localError('Configured root must be a real directory, not a symbolic link.');
    this.root = await realpath(this.root); this.identity = `${info.dev}:${info.ino}`; return this;
  }
  async guard(write = false) {
    if (this.closed || write && this.readOnly) throw localError('Local directory is read-only or disconnected.', 'FORBIDDEN');
    const info = await lstat(this.root);
    if (!info.isDirectory() || info.isSymbolicLink() || `${info.dev}:${info.ino}` !== this.identity || await realpath(this.root) !== this.root) throw localError('The configured root changed. Restart and review its configuration.', 'FORBIDDEN');
  }
  async permission() { await this.guard(); return 'granted'; }
  async checked(path, { createParents = false, internal = false, allowMissing = false } = {}) {
    relativePath(path, { empty: true, internal }); await this.guard(createParents);
    const parts = path.split('/').filter(Boolean); let current = this.root;
    for (let i = 0; i < parts.length; i++) {
      current = join(current, parts[i]); if (current !== this.root && !current.startsWith(this.root + sep)) throw localError('Path escaped the configured root.', 'FORBIDDEN');
      let info; try { info = await lstat(current); } catch (error) {
        if (!missing(error)) throw error;
        if (createParents && i < parts.length - 1) { await mkdir(current, { mode: 0o700 }); info = await lstat(current); }
        else if (allowMissing && i === parts.length - 1) return current;
        else throw localError('Local path was not found.', 'NOT_FOUND');
      }
      if (info.isSymbolicLink() || !info.isFile() && !info.isDirectory() || info.isFile() && info.nlink !== 1) throw localError('Links and special files are not allowed in a scoped local directory.', 'FORBIDDEN');
      if (i < parts.length - 1 && !info.isDirectory()) throw localError('A path component is not a directory.');
    }
    return current;
  }
  serial(work) { const pending = this.queue.then(work, work); this.queue = pending.catch(() => {}); return pending; }
  async readBytes(path, { internal = false } = {}) {
    const absolute = await this.checked(path, { internal }); let handle;
    try {
      handle = await open(absolute, constants.O_RDONLY | (constants.O_NOFOLLOW || 0)); const before = await handle.stat();
      if (!before.isFile() || before.nlink !== 1) throw localError('Only ordinary non-linked files can be read.', 'FORBIDDEN');
      if (before.size > LOCAL_LIMITS.fileBytes) throw localError('Local file exceeds 50 MiB.');
      const chunks = []; let total = 0; for (;;) {
        const buffer = Buffer.alloc(65536), { bytesRead } = await handle.read(buffer, 0, buffer.length, null); if (!bytesRead) break;
        total += bytesRead; if (total > LOCAL_LIMITS.fileBytes) throw localError('File grew beyond the 50 MiB limit during reading.'); chunks.push(buffer.subarray(0, bytesRead));
      }
      const after = await handle.stat(); const now = await lstat(absolute);
      if (before.size !== after.size || before.mtimeMs !== after.mtimeMs || before.ctimeMs !== after.ctimeMs || before.ino !== now.ino || before.dev !== now.dev || now.isSymbolicLink()) throw localError('The local file changed while it was read. Try again.', 'CONFLICT');
      return { bytes: Buffer.concat(chunks), info: after };
    } finally { await handle?.close(); }
  }
  async read(path) { return new Blob([(await this.readBytes(path)).bytes]); }
  async stat(path) { const { bytes, info } = await this.readBytes(path); return { path, name: path.split('/').at(-1), kind: 'file', size: bytes.length, modifiedAt: info.mtimeMs, hash: digest(bytes) }; }
  async list(path = '', { recursive = false, includeInternal = false, limit = LOCAL_LIMITS.entries, signal } = {}) {
    const absolute = await this.checked(path); const output = []; let count = 0;
    const visit = async (directory, prefix, depth) => {
      if (depth > LOCAL_LIMITS.depth) throw localError('Directory nesting exceeds the scan limit.');
      const entries = await readdir(directory, { withFileTypes: true }); entries.sort((a,b) => a.name.localeCompare(b.name));
      if (entries.length > LOCAL_LIMITS.entries) throw localError('Directory exceeds the scan limit.');
      for (const entry of entries) {
        signal?.throwIfAborted(); if (entry.name === '.civora-trash' || !includeInternal && internalName(entry.name)) continue;
        if (++count > Math.min(limit, LOCAL_LIMITS.entries)) throw localError('Scan exceeds the entry limit. Select a smaller folder.');
        const p = prefix ? `${prefix}/${entry.name}` : entry.name; let record = { path: p, name: entry.name, kind: 'blocked', size: 0, modifiedAt: 0 };
        try {
          relativePath(p); const safe = await this.checked(p), info = await lstat(safe);
          record = { ...record, kind: info.isDirectory() ? 'directory' : 'file', size: info.isFile() ? info.size : 0, modifiedAt: info.mtimeMs };
          output.push(record); if (recursive && info.isDirectory()) await visit(safe, p, depth + 1);
        } catch (error) {
          if (['FORBIDDEN','VALIDATION'].includes(error.code)) output.push({ ...record, reason: 'Unsafe name, link, or special file' }); else throw error;
        }
      }
    }; await visit(absolute, path, 0); return output;
  }
  async mkdir(path) { return this.serial(async () => { await this.guard(true); relativePath(path); const absolute = await this.checked(path, { createParents: true, allowMissing: true }); try { await mkdir(absolute, { mode: 0o700 }); } catch (error) { if (error.code !== 'EEXIST') throw error; } const info = await lstat(absolute); if (!info.isDirectory() || info.isSymbolicLink()) throw localError('The destination is not a safe directory.'); return { path }; }); }
  async expected(path, options = {}) {
    let value = null; try { value = await this.readBytes(path); } catch (error) { if (!isMissing(error)) throw error; }
    if (options.createOnly || options.expectedHash === null) { if (value) throw localError('The destination exists; no file was overwritten.', 'CONFLICT'); }
    else if (typeof options.expectedHash === 'string' && /^[a-f0-9]{64}$/.test(options.expectedHash)) { if (!value || digest(value.bytes) !== options.expectedHash) throw localError('The local file changed. Refresh before saving.', 'CONFLICT'); }
    else throw localError('A write requires createOnly or an expected SHA-256 hash.');
    return value;
  }
  async syncDirectory(absolute) { let fd; try { fd = await open(absolute, constants.O_RDONLY); await fd.sync(); } catch (error) { if (!['EINVAL','ENOTSUP','EISDIR','EPERM','EACCES'].includes(error.code)) throw error; } finally { await fd?.close(); } }
  async rawNew(path, bytes, internal = false) {
    const absolute = await this.checked(path, { createParents: true, allowMissing: true, internal }), temp = join(dirname(absolute), '.civora-tmp-' + randomUUID());
    let fd; try { fd = await open(temp, 'wx', 0o600); await fd.writeFile(bytes); await fd.sync(); await fd.close(); fd = null;
      // Atomic no-clobber publication. Filesystems without hard-link support fail
      // rather than falling back to a potentially destructive replacement.
      await link(temp, absolute); await unlink(temp); await this.syncDirectory(dirname(absolute));
    } catch (error) { if (error.code === 'EEXIST') throw localError('The destination was created concurrently.', 'CONFLICT'); throw error; }
    finally { await fd?.close(); await unlink(temp).catch(() => {}); }
  }
  async archive(path, bytes, reason = 'replace') {
    const id = randomUUID(), record = { id, path, kind: 'file', size: bytes.length, hash: digest(bytes), at: new Date().toISOString(), reason };
    await this.rawNew(`.civora-trash/${id}/content`, bytes, true); await this.rawNew(`.civora-trash/${id}/record.json`, Buffer.from(JSON.stringify(record)), true); return record;
  }
  async write(path, blob, options = {}) {
    return this.serial(async () => {
      await this.guard(true); relativePath(path); if (!(blob instanceof Blob) || blob.size > LOCAL_LIMITS.fileBytes) throw localError('Files are limited to 50 MiB.');
      const bytes = Buffer.from(await blob.arrayBuffer()), existing = await this.expected(path, options), absolute = await this.checked(path, { createParents: true, allowMissing: true });
      if (!existing) { await this.rawNew(path, bytes); return { path, hash: digest(bytes), size: bytes.length }; }
      const backup = await this.archive(path, existing.bytes), temp = join(dirname(absolute), '.civora-tmp-' + randomUUID()); let fd;
      try {
        fd = await open(temp, 'wx', 0o600); await fd.writeFile(bytes); await fd.sync(); await fd.close(); fd = null;
        await this.expected(path, options); await this.checked(path);
        // Never unlink an existing destination as a Windows busy-file fallback.
        await rename(temp, absolute); await this.syncDirectory(dirname(absolute));
      } finally { await fd?.close(); await unlink(temp).catch(() => {}); }
      return { path, hash: digest(bytes), size: bytes.length, previous: backup.id };
    });
  }
  async move(path, destination, { expectedHash } = {}) {
    return this.serial(async () => {
      await this.guard(true); relativePath(destination); const original = await this.expected(path, { expectedHash }); await this.expected(destination, { createOnly: true });
      await this.rawNew(destination, original.bytes); await this.expected(path, { expectedHash }); const source = await this.checked(path); await unlink(source); await this.syncDirectory(dirname(source));
      return { path: destination, hash: expectedHash, copied: true };
    });
  }
  async trash(path, { expectedHash } = {}) {
    return this.serial(async () => { await this.guard(true); const original = await this.expected(path, { expectedHash }), record = await this.archive(path, original.bytes, 'trash'); await this.expected(path, { expectedHash }); const source = await this.checked(path); await unlink(source); await this.syncDirectory(dirname(source)); return record; });
  }
  async trashList() {
    await this.guard(); let directory; try { directory = await this.checked('.civora-trash', { internal: true }); } catch (error) { if (isMissing(error)) return []; throw error; }
    const result = []; for (const entry of (await readdir(directory, { withFileTypes: true })).slice(0,1000)) {
      if (!entry.isDirectory() || !/^[a-f0-9-]{36}$/.test(entry.name)) continue;
      try { const { bytes } = await this.readBytes(`.civora-trash/${entry.name}/record.json`, { internal: true }); const row = JSON.parse(bytes); if (row.id === entry.name) result.push(row); } catch {}
    } return result.sort((a,b) => b.at.localeCompare(a.at));
  }
  async restoreTrash(id, destination = '') {
    return this.serial(async () => {
      await this.guard(true); if (!/^[a-f0-9-]{36}$/.test(id)) throw localError('Invalid trash identifier.');
      const base = '.civora-trash/' + id, { bytes: metadata } = await this.readBytes(base + '/record.json', { internal: true }), record = JSON.parse(metadata);
      const { bytes } = await this.readBytes(base + '/content', { internal: true }); if (digest(bytes) !== record.hash) throw localError('Trash checksum failed.');
      const target = relativePath(destination || record.path); await this.expected(target, { createOnly: true }); await this.rawNew(target, bytes);
      await rm(await this.checked(base, { internal: true }), { recursive: true }); return { path: target, hash: record.hash };
    });
  }
  async diskInfo() { await this.guard(); const s = await statfs(this.root); return { available: s.bavail * s.bsize, capacity: s.blocks * s.bsize }; }
  close() { this.closed = true; }
}
