import { ControlError, CONTROL_LIMITS } from './index.js';
import { createAccessContext } from '../access/index.js';
import { sha256 } from '../storage/index.js';
import { createZip } from '../storage/archive.js';
/** Export a frozen baseline. Every source blob is verified, and current access is required. */
export async function exportBaselineArchive(state, baseline, repository, actorId, { signal, onProgress, maxBytes = 90 * 1024 * 1024 } = {}) {
  if (!baseline || !(state.baselines || []).some(b => b.id === baseline.id) || baseline.documents.length > CONTROL_LIMITS.baselineDocuments) throw new ControlError('Baseline is unavailable.');
  // Callers may only export the authoritative/projection record, not a substituted manifest.
  const source = state.baselines.find(b => b.id === baseline.id);
  const access = state.projection?.filtered ? null : createAccessContext(state, actorId);
  const canDownload = id => access ? access.can('download', 'document', id) : state.documents.find(d => d.id === id)?.permissions?.includes('download');
  if (source.documents.some(s => !canDownload(s.documentId))) throw new ControlError('Download permission is required for every baseline document.', 'FORBIDDEN');
  const total = source.documents.reduce((sum, s) => sum + s.size, 0);
  if (!Number.isSafeInteger(total) || total > maxBytes) throw new ControlError('This baseline exceeds the 90 MiB archive limit.');
  const entries = [], records = [], content = new Map();
  for (let i = 0; i < source.documents.length; i++) {
    signal?.throwIfAborted(); const s = source.documents[i], doc = state.documents.find(d => d.id === s.documentId), version = doc?.versions.find(v => v.id === s.versionId);
    if (!version || version.hash !== s.hash || version.blobId !== s.blobId || version.size !== s.size) throw new ControlError('Broken pinned baseline revision.');
    let blob = content.get(s.blobId);
    if (!blob) { blob = await repository.blob(s.blobId); if (blob.size !== s.size || await sha256(await blob.arrayBuffer()) !== s.hash) throw new ControlError(`Content verification failed: ${s.name}.`, 'INTEGRITY'); content.set(s.blobId, blob); }
    const safeName = s.name.replace(/[\\/:*?"<>|\x00-\x1f\x7f]/g, '_').replace(/[. ]+$/g, '').slice(0, 200) || 'document';
    const archivePath = `documents/${String(i + 1).padStart(4, '0')}/${safeName}`;
    entries.push({ name: archivePath, data: blob }); records.push({ ...structuredClone(s), archivePath }); onProgress?.({ done: i + 1, total: source.documents.length, name: s.name });
  }
  signal?.throwIfAborted();
  const manifest = { format: 'civora-baseline', version: 1, baseline: { ...structuredClone(source), documents: records }, notice: 'Original bytes are unchanged. Logical references are recorded in the manifest; native file paths are not rewritten. SHA-256 detects corruption, not authenticity.' };
  entries.unshift({ name: 'manifest.json', data: JSON.stringify(manifest, null, 2) });
  const zip = await createZip(entries); signal?.throwIfAborted(); return { zip, manifest };
}
