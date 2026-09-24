export const escapeHTML = value => String(value ?? '').replace(/[&<>"']/g, char => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[char]));
const paths = {
    camera: '<path d="M4 7h4l2-3h4l2 3h4v13H4z"/><circle cx="12" cy="13" r="4"/>',
  up: '<path d="M6 15l6-6 6 6"/>',
  workflow: '<rect x="3" y="3" width="6" height="6" rx="1.5"/><rect x="15" y="15" width="6" height="6" rx="1.5"/><path d="M9 6h6a3 3 0 0 1 3 3v6M15 12l3 3 3-3M6 9v9h6m-3-3 3 3-3 3"/>',
  pause: '<rect x="6" y="4" width="4" height="16" rx="1"/><rect x="14" y="4" width="4" height="16" rx="1"/>',
  play: '<path d="M7 4l14 8-14 8z"/>',
  grid: '<rect x="3" y="3" width="7" height="7" rx="1.6"/><rect x="14" y="3" width="7" height="7" rx="1.6"/><rect x="3" y="14" width="7" height="7" rx="1.6"/><rect x="14" y="14" width="7" height="7" rx="1.6"/>',
  overview: '<path d="M3 10l9-7 9 7v10a1 1 0 0 1-1 1H4a1 1 0 0 1-1-1z"/><path d="M9 21v-8h6v8"/>',
  folder: '<path d="M3 7V5a2 2 0 0 1 2-2h4l2 3h8a2 2 0 0 1 2 2v11a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z"/><path d="M3 9h18"/>',
  file: '<path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/><path d="M14 2v6h6M8 13h8M8 17h5"/>',
  review: '<rect x="5" y="4" width="14" height="17" rx="2"/><path d="M9 4V2h6v2M9 12l2 2 4-4"/>',
  issue: '<path d="M10.3 3.7L2.2 18a2 2 0 0 0 1.7 3h16.2a2 2 0 0 0 1.7-3L13.7 3.7a2 2 0 0 0-3.4 0z"/><path d="M12 8v5M12 17h.01"/>',
  send: '<path d="M22 2L9 15M22 2l-8 20-5-7-7-5z"/>',
  layers: '<path d="M12 2L2 7l10 5 10-5-10-5zM2 12l10 5 10-5M2 17l10 5 10-5"/>',
  calendar: '<rect x="3" y="5" width="18" height="16" rx="2"/><path d="M16 3v4M8 3v4M3 11h18M8 15h2M14 15h2"/>',
  chart: '<path d="M3 3v18h18M7 16v-4M12 16V8M17 16V5"/>',
  activity: '<path d="M2 12h5l3-8 4 16 3-8h5"/>',
  users: '<path d="M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2M22 21v-2a4 4 0 0 0-3-3.9M16 3a4 4 0 0 1 0 8"/><circle cx="9" cy="7" r="4"/>',
  cloud: '<path d="M20 16a4 4 0 0 0-1-7.9A7 7 0 0 0 5.2 7a5 5 0 0 0-.2 10h2M12 22V12m-4 4 4-4 4 4"/>',
  database: '<ellipse cx="12" cy="5" rx="9" ry="3"/><path d="M3 5v14c0 4 18 4 18 0V5M3 12c0 4 18 4 18 0"/>',
  settings: '<path d="M9 3h6l1 3 3 1 2 5-2 2v4l-5 3-3-2-3 1-4-4 1-3-2-3 3-5z"/><circle cx="12" cy="12" r="3"/>',
  search: '<circle cx="10.5" cy="10.5" r="7"/><path d="M16 16l5 5"/>',
  minus: '<path d="M5 12h14"/>',
  plus: '<path d="M12 5v14M5 12h14"/>',
  chevron: '<path d="M9 5l7 7-7 7"/>',
  down: '<path d="M6 9l6 6 6-6"/>',
  arrow: '<path d="M5 12h14m-6-6 6 6-6 6"/>',
  left: '<path d="M19 12H5m6-6-6 6 6 6"/>',
  upload: '<path d="M12 16V3m-5 5 5-5 5 5M3 16v4a1 1 0 0 0 1 1h16a1 1 0 0 0 1-1v-4"/>',
  download: '<path d="M12 3v13m-5-5 5 5 5-5M3 16v4a1 1 0 0 0 1 1h16a1 1 0 0 0 1-1v-4"/>',
  bell: '<path d="M18 8a6 6 0 0 0-12 0c0 7-3 7-3 9h18c0-2-3-2-3-9M10 21h4"/>',
  help: '<circle cx="12" cy="12" r="9"/><path d="M9.5 8a2.5 2.5 0 1 1 3 2.5c-.5.2-.5 1-.5 2M12 17h.01"/>',
  more: '<circle cx="5" cy="12" r="1"/><circle cx="12" cy="12" r="1"/><circle cx="19" cy="12" r="1"/>',
  check: '<path d="M5 12l4 4L19 6"/>',
  close: '<path d="M6 6l12 12M18 6L6 18"/>',
  lock: '<rect x="4" y="10" width="16" height="11" rx="2"/><path d="M8 10V7a4 4 0 0 1 8 0v3M12 14v3"/>',
  unlock: '<rect x="4" y="10" width="16" height="11" rx="2"/><path d="M8 10V7a4 4 0 0 1 7.5-2M12 14v3"/>',
  history: '<path d="M3 3v6h6M3.5 9a9 9 0 1 1-.3 7M12 7v5l3 2"/>',
  edit: '<path d="M16 3l5 5-13 13H3v-5zM13 6l5 5"/>',
  trash: '<path d="M3 6h18M9 6V3h6v3M5 6l1 15h12l1-15M10 10v7M14 10v7"/>',
  link: '<path d="M10 13a5 5 0 0 0 7 0l3-3a5 5 0 0 0-7-7l-2 2M14 11a5 5 0 0 0-7 0l-3 3a5 5 0 0 0 7 7l2-2"/>',
  comment: '<path d="M21 12a9 9 0 0 1-9 9 9 9 0 0 1-4-1L3 21l1-5a9 9 0 1 1 17-4z"/><path d="M8 10h8M8 14h5"/>',
  eye: '<path d="M2 12s4-7 10-7 10 7 10 7-4 7-10 7-10-7-10-7z"/><circle cx="12" cy="12" r="3"/>',
  filter: '<path d="M3 4h18l-7 8v7l-4 2v-9z"/>',
  list: '<path d="M8 6h13M8 12h13M8 18h13M3 6h.01M3 12h.01M3 18h.01"/>',
  star: '<path d="M12 3l2.8 5.7 6.2.9-4.5 4.4 1.1 6.2-5.6-3-5.6 3 1.1-6.2L3 9.6l6.2-.9z"/>',
  shield: '<path d="M12 2l9 4v6c0 5-9 10-9 10S3 17 3 12V6z"/><path d="M8 12l3 3 5-6"/>',
  external: '<path d="M14 3h7v7M21 3L10 14M10 3H4a1 1 0 0 0-1 1v16a1 1 0 0 0 1 1h16a1 1 0 0 0 1-1v-6"/>',
  pin: '<path d="M20 10c0 6-8 12-8 12S4 16 4 10a8 8 0 1 1 16 0z"/><circle cx="12" cy="10" r="3"/>',
  copy: '<rect x="8" y="8" width="13" height="13" rx="2"/><path d="M16 8V3H3v13h5"/>',
  box: '<path d="M12 2L2 7v10l10 5 10-5V7zM2 7l10 5 10-5M12 12v10M7 4.5l10 5"/>',
  menu: '<path d="M4 6h16M4 12h16M4 18h16"/>',
  clock: '<circle cx="12" cy="12" r="9"/><path d="M12 7v5l3 2"/>',
  refresh: '<path d="M21 2v6h-6M3 22v-6h6M3 10a9 9 0 0 1 15.7-6.4L21 8M3 16l2.3 4.4A9 9 0 0 0 21 14"/>',
  rectangle: '<rect x="3" y="5" width="18" height="14" rx="1"/>',
  zoom: '<circle cx="10" cy="10" r="7"/><path d="M15 15l6 6M10 7v6M7 10h6"/>',
  moon: '<path d="M21 13a9 9 0 0 1-10-10 9 9 0 1 0 10 10z"/>',
  book: '<path d="M12 5c-3-3-8-3-10-2v16c2-1 7-1 10 2 3-3 8-3 10-2V3c-2-1-7-1-10 2zM12 5v16"/>'
};
export function icon(name, size = 18) { return `<svg class="icon" width="${size}" height="${size}" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.65" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${paths[name] || paths.file}</svg>`; }
export function initials(name) { return String(name || '?').trim().split(/\s+/).slice(0, 2).map(s => s[0]).join('').toUpperCase(); }
export function avatar(name, size = '', index = 0) { return `<span class="avatar ${escapeHTML(size)} tone-${Math.abs(index) % 5}" title="${escapeHTML(name)}">${escapeHTML(initials(name))}</span>`; }
export function fileBadge(name, large = false) { const ext = String(name).split('.').pop().toUpperCase().slice(0, 4); const type = ['SVG', 'DWG', 'DGN', 'DXF'].includes(ext) ? 'drawing' : ['OBJ', 'IFC', 'GLB'].includes(ext) ? 'model' : ['CSV', 'XLSX', 'XLS'].includes(ext) ? 'sheet' : ext === 'PDF' ? 'pdf' : 'text'; return `<span class="file-badge ${type}${large ? ' large' : ''}">${icon(type === 'model' ? 'box' : 'file', large ? 28 : 21)}<span>${escapeHTML(ext)}</span></span>`; }
export function statusBadge(state) { const tone = ['Published', 'Approved', 'Acknowledged', 'Resolved', 'Completed'].includes(state) ? 'green' : ['Shared', 'In review', 'In progress', 'Issued'].includes(state) ? 'blue' : ['Changes requested', 'High', 'Critical', 'Overdue'].includes(state) ? 'amber' : 'gray'; return `<span class="badge ${tone}"><i></i>${escapeHTML(state)}</span>`; }
export function formatBytes(bytes) { if (!bytes) return '0 B'; const unit = Math.min(3, Math.floor(Math.log(bytes) / Math.log(1024))); return `${(bytes / 1024 ** unit).toFixed(unit ? 1 : 0)} ${['B', 'KB', 'MB', 'GB'][unit]}`; }
export function formatDate(value, options = {}) { if (!value) return '—'; const d = new Date(value.length === 10 ? value + 'T12:00:00' : value); return Number.isNaN(d.getTime()) ? '—' : new Intl.DateTimeFormat('en-GB', { day: 'numeric', month: 'short', ...options }).format(d); }
export function relativeTime(value) { const days = Math.floor((Date.now() - Date.parse(value)) / 86400000); if (days <= 0) return 'Today'; if (days === 1) return 'Yesterday'; if (days < 7) return `${days} days ago`; return formatDate(value); }
export function isOverdue(value) { return !!value && value < new Date().toLocaleDateString('en-CA'); }
export function emptyState(title, description, action = '') { return `<div class="empty-state">${icon('folder', 34)}<h3>${escapeHTML(title)}</h3><p>${escapeHTML(description)}</p>${action}</div>`; }
export function downloadBlob(blob, name) { const a = document.createElement('a'); a.href = URL.createObjectURL(blob); a.download = String(name).replace(/[\\/\x00-\x1f]/g, '_'); a.click(); setTimeout(() => URL.revokeObjectURL(a.href), 30000); }
export function toast(message, kind = 'success') { let host = document.getElementById('toast-host'); if (!host) { host = document.createElement('div'); host.id = 'toast-host'; host.setAttribute('aria-live', 'polite'); document.body.append(host); } const el = document.createElement('div'); el.className = `toast ${kind}`; el.innerHTML = `${icon(kind === 'error' ? 'issue' : 'check')}<span>${escapeHTML(message)}</span>`; host.append(el); while (host.children.length > 3) host.firstElementChild.remove(); el.title = 'Click to dismiss'; el.addEventListener('click', () => el.remove()); setTimeout(() => el.remove(), kind === 'error' ? 10000 : 4500); }
export function openDialog({ title, subtitle = '', body, footer = '', wide = false, onClose }) {
  const previousFocus=document.activeElement, labelId='dialog-label-'+crypto.randomUUID();
  const dialog = document.createElement('dialog'); dialog.setAttribute('aria-labelledby',labelId); dialog.className = `dialog${wide ? ' wide' : ''}`;
  dialog.innerHTML = `<div class="dialog-head"><div><h2 id="${labelId}">${escapeHTML(title)}</h2>${subtitle ? `<p>${escapeHTML(subtitle)}</p>` : ''}</div><button type="button" class="icon-button" data-close aria-label="Close dialog">${icon('close')}</button></div><div class="dialog-body">${body}</div>${footer ? `<div class="dialog-foot">${footer}</div>` : ''}`;
  document.body.append(dialog); dialog.querySelector('[data-close]').addEventListener('click', () => dialog.close()); dialog.addEventListener('click', e => { if (e.target === dialog) { const r = dialog.getBoundingClientRect(); if (e.clientX < r.left || e.clientX > r.right || e.clientY < r.top || e.clientY > r.bottom) dialog.close(); } }); dialog.addEventListener('close', () => { onClose?.(); dialog.remove(); const activeDialog=[...document.querySelectorAll('dialog[open]')].at(-1); if(previousFocus?.isConnected&&typeof previousFocus.focus==='function'&&(!activeDialog||activeDialog.contains(previousFocus)))previousFocus.focus({preventScroll:true}); }, { once: true }); dialog.showModal(); return dialog;
}
export function formField(label, name, value = '', { type = 'text', required = false, placeholder = '', options = null, help = '', full = false } = {}) {
  const attributes = `name="${escapeHTML(name)}" ${required ? 'required' : ''} ${placeholder ? `placeholder="${escapeHTML(placeholder)}"` : ''}`;
  const input = options ? `<select ${attributes}>${options.map(o => { const v = typeof o === 'object' ? o.value : o, text = typeof o === 'object' ? o.label : o; return `<option value="${escapeHTML(v)}" ${String(value) === String(v) ? 'selected' : ''}>${escapeHTML(text)}</option>`; }).join('')}</select>` : type === 'textarea' ? `<textarea ${attributes} rows="4">${escapeHTML(value)}</textarea>` : `<input type="${escapeHTML(type)}" ${attributes} value="${escapeHTML(value)}">`;
  return `<label class="field${full ? ' full' : ''}"><span>${escapeHTML(label)}${required ? '<b> *</b>' : ''}</span>${input}${help ? `<small>${escapeHTML(help)}</small>` : ''}</label>`;
}
