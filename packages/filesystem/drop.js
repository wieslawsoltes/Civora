/** Folder-drop traversal, captured synchronously during the browser drop event.
 * FileSystemEntry readers return batches; draining only one would lose files. */
import { localError, relativePath, LOCAL_LIMITS } from './index.js';
export function collectDroppedFiles(dataTransfer, { limit = 5000, signal } = {}) {
  if (!dataTransfer) return Promise.resolve([]);
  const fallback = Array.from(dataTransfer.files || []);
  const captures = Array.from(dataTransfer.items || []).filter(item => item.kind === 'file').map(item => {
    // These calls must happen before the first await: drag-store access is transient.
    let handle = null, entry = null, file = null;
    try { if (item.getAsFileSystemHandle) handle = item.getAsFileSystemHandle(); } catch {}
    try { if (item.webkitGetAsEntry) entry = item.webkitGetAsEntry(); } catch {}
    try { file = item.getAsFile?.(); } catch {}
    return { handle, entry, file };
  });
  return (async () => {
    const result = [], seen = new Set(); limit = Math.min(5000, Math.max(1, limit));
    function put(path, file) {
      signal?.throwIfAborted(); relativePath(path);
      if (path.split('/').some(p => p.toLowerCase().startsWith('.civora'))) return;
      if (result.length >= limit) throw localError(`Drop exceeds ${limit} files; choose a smaller folder.`);
      const key = path.normalize('NFC').toLowerCase();
      if (seen.has(key)) throw localError('The dropped tree contains case-insensitive filename collisions.');
      if (!(file instanceof Blob) || file.size > LOCAL_LIMITS.fileBytes) throw localError('Dropped files are limited to 50 MiB each.');
      seen.add(key); result.push({ path, file });
    }
    async function modern(handle, prefix = '', depth = 0) {
      signal?.throwIfAborted(); if (depth > LOCAL_LIMITS.depth) throw localError('Dropped tree is too deeply nested.');
      if (handle.name.toLowerCase().startsWith('.civora')) return;
      const path = relativePath(prefix ? prefix + '/' + handle.name : handle.name);
      if (handle.kind === 'file') return put(path, await handle.getFile());
      if (handle.kind !== 'directory') throw localError('Unsupported dropped item.');
      let entries = 0; for await (const child of handle.values()) { if (++entries > LOCAL_LIMITS.entries) throw localError('Dropped directory exceeds its entry limit.'); await modern(child,path,depth+1); }
    }
    async function legacy(entry, prefix = '', depth = 0) {
      signal?.throwIfAborted(); if (depth > LOCAL_LIMITS.depth) throw localError('Dropped tree is too deeply nested.');
      if (entry.name.toLowerCase().startsWith('.civora')) return;
      const path = relativePath(prefix ? prefix + '/' + entry.name : entry.name);
      if (entry.isFile) return put(path, await new Promise((resolve,reject) => entry.file(resolve,reject)));
      if (!entry.isDirectory) throw localError('Unsupported dropped item.');
      const reader = entry.createReader(); let entries = 0;
      while (true) { const batch = await new Promise((resolve,reject) => reader.readEntries(resolve,reject)); if (!batch.length) break; entries += batch.length; if (entries > LOCAL_LIMITS.entries) throw localError('Dropped directory exceeds its entry limit.'); for (const child of batch) await legacy(child,path,depth+1); }
    }
    if (captures.length) for (const capture of captures) {
      let handle; if (capture.handle) { try { handle = await capture.handle; } catch {} }
      if (handle) await modern(handle); else if (capture.entry) await legacy(capture.entry); else if (capture.file) put(capture.file.webkitRelativePath || capture.file.name,capture.file); else throw localError('This browser cannot read the dropped folder. Use Import folder instead.');
    } else for (const file of fallback) put(file.webkitRelativePath || file.name,file);
    return result;
  })();
}
