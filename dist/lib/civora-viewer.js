// Civora 0.10.0 — independently authored. MIT license.
const __modules = Object.create(null);

__modules["packages/interactions/index.js"] = (() => {
/** Framework-free, deterministic geometry and pointer bookkeeping.
 * Pointer capture and browser event registration belong to the presentation adapter.
 */
const finite=(n,name)=>{if(!Number.isFinite(n))throw new TypeError(`${name} must be finite.`);return n;};
const positive=(n,name)=>{finite(n,name);if(n<=0)throw new RangeError(`${name} must be positive.`);return n;};
const clamp=(n,min,max)=>Math.max(min,Math.min(max,n));
class Viewport2D {
 constructor({width=1,height=1,contentWidth=1,contentHeight=1,minZoom=.25,maxZoom=12}={}){
  this.minZoom=positive(minZoom,'minimum zoom');this.maxZoom=positive(maxZoom,'maximum zoom');if(minZoom>maxZoom)throw new RangeError('Invalid zoom interval.');
  this.zoom=1;this.x=0;this.y=0;this.resize(width,height,contentWidth,contentHeight,true);
 }
 get scale(){return this.fitScale*this.zoom;}
 get value(){return {x:this.x,y:this.y,zoom:this.zoom,scale:this.scale,width:this.width,height:this.height,contentWidth:this.contentWidth,contentHeight:this.contentHeight};}
 resize(width,height,contentWidth=this.contentWidth,contentHeight=this.contentHeight,fit=false){
  positive(width,'viewport width');positive(height,'viewport height');positive(contentWidth,'content width');positive(contentHeight,'content height');
  const center=this.width?this.normalized(this.width/2,this.height/2):{x:.5,y:.5};
  this.width=width;this.height=height;this.contentWidth=contentWidth;this.contentHeight=contentHeight;this.fitScale=Math.min(width/contentWidth,height/contentHeight);
  if(fit){this.fit();return this.value;}this.x=width/2-center.x*contentWidth*this.scale;this.y=height/2-center.y*contentHeight*this.scale;this.constrain();return this.value;
 }
 fit(){this.zoom=clamp(1,this.minZoom,this.maxZoom);this.x=(this.width-this.contentWidth*this.scale)/2;this.y=(this.height-this.contentHeight*this.scale)/2;return this.value;}
 normalized(x,y){finite(x,'x');finite(y,'y');return {x:(x-this.x)/(this.contentWidth*this.scale),y:(y-this.y)/(this.contentHeight*this.scale)};}
 point(normalized){return {x:this.x+finite(normalized.x,'x')*this.contentWidth*this.scale,y:this.y+finite(normalized.y,'y')*this.contentHeight*this.scale};}
 zoomAt(factor,x=this.width/2,y=this.height/2){positive(factor,'zoom factor');const p=this.normalized(x,y);this.zoom=clamp(this.zoom*factor,this.minZoom,this.maxZoom);this.x=x-p.x*this.contentWidth*this.scale;this.y=y-p.y*this.contentHeight*this.scale;this.constrain();return this.value;}
 setZoom(zoom){positive(zoom,'zoom');return this.zoomAt(zoom/this.zoom);}
 pan(dx,dy){this.x+=finite(dx,'horizontal movement');this.y+=finite(dy,'vertical movement');this.constrain();return this.value;}
 constrain(){
  // Keep some of the image reachable, while permitting inspection near its edges.
  const w=this.contentWidth*this.scale,h=this.contentHeight*this.scale,margin=Math.min(48,this.width/4,this.height/4);
  this.x=clamp(this.x,margin-w,this.width-margin);this.y=clamp(this.y,margin-h,this.height-margin);
 }
}
const point=event=>({x:finite(event.clientX,'pointer x'),y:finite(event.clientY,'pointer y')});
const distance=(a,b)=>Math.hypot(a.x-b.x,a.y-b.y),mid=(a,b)=>({x:(a.x+b.x)/2,y:(a.y+b.y)/2});
class PointerSession {
 constructor({tapSlop=8}={}){this.tapSlop=positive(tapSlop,'tap tolerance');this.pointers=new Map();this.suppressed=false;}
 get size(){return this.pointers.size;}
 down(event){
  if(event.button!==undefined&&event.button!==0&&event.button!==1)return null;
  if(this.pointers.has(event.pointerId)||this.pointers.size>=3)return null;
  const p=point(event);this.pointers.set(event.pointerId,{start:p,last:p,distance:0});
  if(this.pointers.size>1){this.suppressed=true;return {kind:'multiple',count:this.pointers.size};}
  return {kind:'start',point:p,id:event.pointerId};
 }
 move(event){
  const item=this.pointers.get(event.pointerId);if(!item)return null;const p=point(event),last=item.last;
  if(this.pointers.size===2){const previous=[...this.pointers.values()].map(p=>p.last);item.last=p;item.distance=Math.max(item.distance,distance(item.start,p));const current=[...this.pointers.values()].map(p=>p.last),before=distance(...previous),after=distance(...current);return {kind:'pinch',from:mid(...previous),to:mid(...current),factor:before>1&&after>1?clamp(after/before,.1,10):1};}
  item.last=p;item.distance=Math.max(item.distance,distance(item.start,p));if(this.suppressed||this.pointers.size!==1)return null;
  return {kind:'drag',point:p,start:item.start,dx:p.x-last.x,dy:p.y-last.y,distance:item.distance};
 }
 up(event){const item=this.pointers.get(event.pointerId);if(!item)return null;const p=point(event),count=this.pointers.size,blocked=this.suppressed;this.pointers.delete(event.pointerId);if(!this.pointers.size)this.suppressed=false;
  if(blocked||count!==1)return {kind:'cancelled'};const moved=Math.max(item.distance,distance(item.start,p));return {kind:'end',point:p,start:item.start,distance:moved,tap:moved<=this.tapSlop};
 }
 cancel(){this.pointers.clear();this.suppressed=false;return {kind:'cancelled'};}
}
/** A non-destructive long-press recognizer. Scroll, second finger, cancel, release and
 * disposal all clear the timer. Applications must still provide a visible action button.
 */
function bindLongPress(element,onPress,{delay=600,slop=10,signal}={}){
 let timer=null,active=null,pressed=false;const controller=new AbortController();const clear=()=>{clearTimeout(timer);timer=null;active=null;};
 const opts={signal:controller.signal};element.addEventListener('pointerdown',event=>{
  if(event.pointerType!=='touch'&&event.pointerType!=='pen')return;
  if(active){clear();return;}if(event.button!==0)return;active={id:event.pointerId,x:event.clientX,y:event.clientY,target:event.target};pressed=false;
  timer=setTimeout(()=>{const value=active;clear();if(value){pressed=onPress(value)!==false;}},delay);
 },opts);
 element.addEventListener('pointermove',event=>{if(active&&active.id===event.pointerId&&Math.hypot(event.clientX-active.x,event.clientY-active.y)>slop)clear();},opts);
 for(const name of ['pointerup','pointercancel','lostpointercapture'])element.addEventListener(name,clear,opts);
 element.addEventListener('scroll',clear,{capture:true,signal:controller.signal});
 element.addEventListener('click',event=>{if(pressed){pressed=false;event.preventDefault();event.stopImmediatePropagation();}},{capture:true,signal:controller.signal});
 const dispose=()=>{clear();controller.abort();};signal?.addEventListener('abort',dispose,{once:true});if(signal?.aborted)dispose();return dispose;
}

return { Viewport2D, PointerSession, bindLongPress };
})();

__modules["packages/controls/index.js"] = (() => {
const escapeHTML = value => String(value ?? '').replace(/[&<>"']/g, char => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[char]));
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
function icon(name, size = 18) { return `<svg class="icon" width="${size}" height="${size}" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.65" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${paths[name] || paths.file}</svg>`; }
function initials(name) { return String(name || '?').trim().split(/\s+/).slice(0, 2).map(s => s[0]).join('').toUpperCase(); }
function avatar(name, size = '', index = 0) { return `<span class="avatar ${escapeHTML(size)} tone-${Math.abs(index) % 5}" title="${escapeHTML(name)}">${escapeHTML(initials(name))}</span>`; }
function fileBadge(name, large = false) { const ext = String(name).split('.').pop().toUpperCase().slice(0, 4); const type = ['SVG', 'DWG', 'DGN', 'DXF'].includes(ext) ? 'drawing' : ['OBJ', 'IFC', 'GLB'].includes(ext) ? 'model' : ['CSV', 'XLSX', 'XLS'].includes(ext) ? 'sheet' : ext === 'PDF' ? 'pdf' : 'text'; return `<span class="file-badge ${type}${large ? ' large' : ''}">${icon(type === 'model' ? 'box' : 'file', large ? 28 : 21)}<span>${escapeHTML(ext)}</span></span>`; }
function statusBadge(state) { const tone = ['Published', 'Approved', 'Acknowledged', 'Resolved', 'Completed'].includes(state) ? 'green' : ['Shared', 'In review', 'In progress', 'Issued'].includes(state) ? 'blue' : ['Changes requested', 'High', 'Critical', 'Overdue'].includes(state) ? 'amber' : 'gray'; return `<span class="badge ${tone}"><i></i>${escapeHTML(state)}</span>`; }
function formatBytes(bytes) { if (!bytes) return '0 B'; const unit = Math.min(3, Math.floor(Math.log(bytes) / Math.log(1024))); return `${(bytes / 1024 ** unit).toFixed(unit ? 1 : 0)} ${['B', 'KB', 'MB', 'GB'][unit]}`; }
function formatDate(value, options = {}) { if (!value) return '—'; const d = new Date(value.length === 10 ? value + 'T12:00:00' : value); return Number.isNaN(d.getTime()) ? '—' : new Intl.DateTimeFormat('en-GB', { day: 'numeric', month: 'short', ...options }).format(d); }
function relativeTime(value) { const days = Math.floor((Date.now() - Date.parse(value)) / 86400000); if (days <= 0) return 'Today'; if (days === 1) return 'Yesterday'; if (days < 7) return `${days} days ago`; return formatDate(value); }
function isOverdue(value) { return !!value && value < new Date().toLocaleDateString('en-CA'); }
function emptyState(title, description, action = '') { return `<div class="empty-state">${icon('folder', 34)}<h3>${escapeHTML(title)}</h3><p>${escapeHTML(description)}</p>${action}</div>`; }
function downloadBlob(blob, name) { const a = document.createElement('a'); a.href = URL.createObjectURL(blob); a.download = String(name).replace(/[\\/\x00-\x1f]/g, '_'); a.click(); setTimeout(() => URL.revokeObjectURL(a.href), 30000); }
function toast(message, kind = 'success') { let host = document.getElementById('toast-host'); if (!host) { host = document.createElement('div'); host.id = 'toast-host'; host.setAttribute('aria-live', 'polite'); document.body.append(host); } const el = document.createElement('div'); el.className = `toast ${kind}`; el.innerHTML = `${icon(kind === 'error' ? 'issue' : 'check')}<span>${escapeHTML(message)}</span>`; host.append(el); while (host.children.length > 3) host.firstElementChild.remove(); el.title = 'Click to dismiss'; el.addEventListener('click', () => el.remove()); setTimeout(() => el.remove(), kind === 'error' ? 10000 : 4500); }
function openDialog({ title, subtitle = '', body, footer = '', wide = false, onClose }) {
  const previousFocus=document.activeElement, labelId='dialog-label-'+crypto.randomUUID();
  const dialog = document.createElement('dialog'); dialog.setAttribute('aria-labelledby',labelId); dialog.className = `dialog${wide ? ' wide' : ''}`;
  dialog.innerHTML = `<div class="dialog-head"><div><h2 id="${labelId}">${escapeHTML(title)}</h2>${subtitle ? `<p>${escapeHTML(subtitle)}</p>` : ''}</div><button type="button" class="icon-button" data-close aria-label="Close dialog">${icon('close')}</button></div><div class="dialog-body">${body}</div>${footer ? `<div class="dialog-foot">${footer}</div>` : ''}`;
  document.body.append(dialog); dialog.querySelector('[data-close]').addEventListener('click', () => dialog.close()); dialog.addEventListener('click', e => { if (e.target === dialog) { const r = dialog.getBoundingClientRect(); if (e.clientX < r.left || e.clientX > r.right || e.clientY < r.top || e.clientY > r.bottom) dialog.close(); } }); dialog.addEventListener('close', () => { onClose?.(); dialog.remove(); const activeDialog=[...document.querySelectorAll('dialog[open]')].at(-1); if(previousFocus?.isConnected&&typeof previousFocus.focus==='function'&&(!activeDialog||activeDialog.contains(previousFocus)))previousFocus.focus({preventScroll:true}); }, { once: true }); dialog.showModal(); return dialog;
}
function formField(label, name, value = '', { type = 'text', required = false, placeholder = '', options = null, help = '', full = false } = {}) {
  const attributes = `name="${escapeHTML(name)}" ${required ? 'required' : ''} ${placeholder ? `placeholder="${escapeHTML(placeholder)}"` : ''}`;
  const input = options ? `<select ${attributes}>${options.map(o => { const v = typeof o === 'object' ? o.value : o, text = typeof o === 'object' ? o.label : o; return `<option value="${escapeHTML(v)}" ${String(value) === String(v) ? 'selected' : ''}>${escapeHTML(text)}</option>`; }).join('')}</select>` : type === 'textarea' ? `<textarea ${attributes} rows="4">${escapeHTML(value)}</textarea>` : `<input type="${escapeHTML(type)}" ${attributes} value="${escapeHTML(value)}">`;
  return `<label class="field${full ? ' full' : ''}"><span>${escapeHTML(label)}${required ? '<b> *</b>' : ''}</span>${input}${help ? `<small>${escapeHTML(help)}</small>` : ''}</label>`;
}

return { escapeHTML, icon, initials, avatar, fileBadge, statusBadge, formatBytes, formatDate, relativeTime, isOverdue, emptyState, downloadBlob, toast, openDialog, formField };
})();

__modules["packages/viewer/index.js"] = (() => {
const { Viewport2D, PointerSession } = __modules["packages/interactions/index.js"];
const { escapeHTML, icon } = __modules["packages/controls/index.js"];
/** Native-safe file preview. Unknown/CAD binaries are not parsed or executed. */
async function mountPreview(host, { blob, name, markups = [], onMarkup = null, onResolve = null }) {
  host.replaceChildren(); host.classList.add('preview-host'); const cleanup = [], extension = name.split('.').pop().toLowerCase();
  let disposed = false, mode = 'pan';
  const destroy = () => { disposed = true; cleanup.forEach(fn => fn()); host.replaceChildren(); };
  if (extension === 'obj') { const result = await mountOBJ(host, await blob.text()); cleanup.push(result.destroy); return { destroy, setMode: () => {} }; }
  if (blob.type.startsWith('image/') || ['svg', 'png', 'jpg', 'jpeg', 'webp', 'gif', 'bmp'].includes(extension)) {
    const viewport=document.createElement('div');viewport.className='image-viewport touch-viewport';viewport.tabIndex=0;viewport.setAttribute('role','region');viewport.setAttribute('aria-label','Drawing viewport. Drag to pan, pinch to zoom, or use the navigation buttons.');
    const sheet=document.createElement('div');sheet.className='image-sheet touch-sheet';const image=document.createElement('img');image.alt=name;image.draggable=false;
    const overlay=document.createElementNS('http://www.w3.org/2000/svg','svg');overlay.setAttribute('viewBox','0 0 1000 1000');overlay.setAttribute('preserveAspectRatio','none');overlay.classList.add('markup-overlay');
    const controls=document.createElement('div');controls.className='viewport-controls';controls.setAttribute('aria-label','Drawing navigation');
    controls.innerHTML=`<button type="button" data-vp="out" aria-label="Zoom out">−</button><output aria-label="Drawing zoom">100%</output><button type="button" data-vp="in" aria-label="Zoom in">+</button><button type="button" data-vp="fit">Fit</button><span class="viewport-pan-buttons"><button type="button" data-vp="left" aria-label="Pan left">←</button><button type="button" data-vp="up" aria-label="Pan up">↑</button><button type="button" data-vp="down" aria-label="Pan down">↓</button><button type="button" data-vp="right" aria-label="Pan right">→</button></span>`;
    const hint=document.createElement('div');hint.className='viewport-hint';hint.setAttribute('role','status');hint.textContent='One finger to pan · Two fingers to zoom';
    sheet.append(image,overlay);viewport.append(sheet);host.append(viewport,controls,hint);
    const url=URL.createObjectURL(blob);cleanup.push(()=>URL.revokeObjectURL(url));
    const transform=new Viewport2D(),session=new PointerSession();let ready=false,start=null,shape=null,tapCorner=null;
    const events=new AbortController(),opts={signal:events.signal};cleanup.push(()=>events.abort());
    function paint(){if(disposed||!ready)return;sheet.style.width=transform.contentWidth+'px';sheet.style.height=transform.contentHeight+'px';sheet.style.transform=`translate(${transform.x}px, ${transform.y}px) scale(${transform.scale})`;controls.querySelector('output').textContent=Math.round(transform.zoom*100)+'%';viewport.dataset.zoom=String(transform.zoom);}
    const drawMarkups=()=>{overlay.replaceChildren();shape=null;markups.filter(m=>!m.resolved).forEach(m=>{const element=document.createElementNS(overlay.namespaceURI,m.tool==='rectangle'?'rect':'circle');if(m.tool==='rectangle'){for(const [k,v]of Object.entries({x:m.x,y:m.y,width:m.w,height:m.h}))element.setAttribute(k,String(v*1000));}else{element.setAttribute('cx',String(m.x*1000));element.setAttribute('cy',String(m.y*1000));element.setAttribute('r','10');}element.setAttribute('class','markup-shape');element.setAttribute('vector-effect','non-scaling-stroke');const title=document.createElementNS(overlay.namespaceURI,'title');title.textContent=m.text;element.append(title);overlay.append(element);});};drawMarkups();
    const local=p=>{const r=viewport.getBoundingClientRect();return {x:p.x-r.left,y:p.y-r.top};};
    const normalized=p=>{const q=local(p);return transform.normalized(q.x,q.y);};
    const inside=p=>p.x>=0&&p.x<=1&&p.y>=0&&p.y<=1;
    function cancelDrawing(){start=null;tapCorner=null;shape?.remove();shape=null;hint.textContent=mode==='rectangle-tap'?'Tap two opposite corners. Escape cancels.':mode==='pan'?'One finger to pan · Two fingers to zoom':mode==='pin'?'Tap the drawing to place a note.':'Drag a rectangle, or use the two-tap box tool.';}
    const rect=(a,b)=>({tool:'rectangle',x:Math.min(a.x,b.x),y:Math.min(a.y,b.y),w:Math.abs(a.x-b.x),h:Math.abs(a.y-b.y)});
    function emit(markup){if(markup.tool==='rectangle'&&(markup.w<.003||markup.h<.003))return;onMarkup?.(markup);}
    function down(ev){if(!ready)return;const action=session.down(ev);if(!action)return;ev.preventDefault();try{viewport.setPointerCapture(ev.pointerId);}catch{}if(action.kind==='multiple'){cancelDrawing();return;}if(mode==='pan'||!onMarkup)return;const p=normalized(action.point);if(!inside(p))return;start=p;if(mode==='rectangle'){shape=document.createElementNS(overlay.namespaceURI,'rect');shape.classList.add('markup-shape','drawing');shape.setAttribute('vector-effect','non-scaling-stroke');overlay.append(shape);}}
    function move(ev){const action=session.move(ev);if(!action)return;ev.preventDefault();if(action.kind==='pinch'){cancelDrawing();const p=local(action.from);transform.zoomAt(action.factor,p.x,p.y);transform.pan(action.to.x-action.from.x,action.to.y-action.from.y);paint();return;}if(mode==='pan'){transform.pan(action.dx,action.dy);paint();return;}if(start&&shape){const p=normalized(action.point),q={x:Math.max(0,Math.min(1,p.x)),y:Math.max(0,Math.min(1,p.y))},r=rect(start,q);for(const[k,v]of Object.entries({x:r.x,y:r.y,width:r.w,height:r.h}))shape.setAttribute(k,String(v*1000));}}
    function up(ev){const action=session.up(ev);if(!action)return;try{viewport.releasePointerCapture(ev.pointerId);}catch{}if(action.kind==='cancelled'){cancelDrawing();return;}if(!onMarkup||mode==='pan')return;const end=normalized(action.point),begin=start;start=null;shape?.remove();shape=null;if(!begin||!inside(end))return;
      if(mode==='rectangle-tap'&&action.tap){if(!tapCorner){tapCorner=end;hint.textContent='First corner set. Tap the opposite corner. Escape cancels.';}else{const box=rect(tapCorner,end);cancelDrawing();emit(box);}}
      else if(mode==='pin'&&action.tap)emit({tool:'pin',x:end.x,y:end.y,w:0,h:0});else if(mode==='rectangle')emit(rect(begin,end));
    }
    viewport.addEventListener('pointerdown',down,opts);viewport.addEventListener('pointermove',move,opts);viewport.addEventListener('pointerup',up,opts);viewport.addEventListener('pointercancel',()=>{session.cancel();cancelDrawing();},opts);
    viewport.addEventListener('lostpointercapture',ev=>{if(session.pointers.has(ev.pointerId)){session.cancel();cancelDrawing();}},opts);
    viewport.addEventListener('wheel',ev=>{if(!ready)return;ev.preventDefault();const p=local({x:ev.clientX,y:ev.clientY});transform.zoomAt(Math.exp(-Math.max(-1000,Math.min(1000,ev.deltaY))*.002),p.x,p.y);paint();},{passive:false,signal:events.signal});
    const navigate=key=>{if(key==='in')transform.zoomAt(1.25);else if(key==='out')transform.zoomAt(.8);else if(key==='fit')transform.fit();else transform.pan(key==='left'?48:key==='right'?-48:0,key==='up'?48:key==='down'?-48:0);paint();};
    controls.addEventListener('click',ev=>{const b=ev.target.closest('[data-vp]');if(b){cancelDrawing();navigate(b.dataset.vp);}},opts);
    viewport.addEventListener('keydown',ev=>{const key={'+':'in','=':'in','-':'out','0':'fit',Home:'fit',ArrowLeft:'left',ArrowRight:'right',ArrowUp:'up',ArrowDown:'down'}[ev.key];if(key){ev.preventDefault();cancelDrawing();navigate(key);}else if(ev.key==='Escape'){ev.preventDefault();ev.stopPropagation();session.cancel();cancelDrawing();}},opts);
    const resize=()=>{if(!ready)return;const r=viewport.getBoundingClientRect();if(r.width&&r.height){transform.resize(r.width,r.height,image.naturalWidth||1200,image.naturalHeight||800);paint();}};
    const observer=new ResizeObserver(resize);observer.observe(viewport);cleanup.push(()=>observer.disconnect());
    image.onload=()=>{if(disposed)return;ready=true;const r=viewport.getBoundingClientRect();transform.resize(Math.max(1,r.width),Math.max(1,r.height),image.naturalWidth||1200,image.naturalHeight||800,true);paint();};
    image.onerror=()=>{if(!disposed){ready=false;host.innerHTML=`<div class="preview-unavailable">${icon('file',38)}<h3>Image preview unavailable</h3><p>The original is retained unchanged.</p></div>`;}};image.src=url;
    return {destroy,setMode(value){if(!['pan','pin','rectangle','rectangle-tap'].includes(value))throw new Error('Unsupported drawing mode.');session.cancel();mode=value;sheet.dataset.mode=value;cancelDrawing();},setZoom(percent){transform.setZoom(percent/100);cancelDrawing();paint();},fit(){transform.fit();paint();},get viewport(){return transform.value;},updateMarkups(value){markups=value;drawMarkups();}};
  }
  if (extension === 'pdf' || blob.type === 'application/pdf') {
    const url = URL.createObjectURL(new Blob([blob], { type: 'application/pdf' })); cleanup.push(() => URL.revokeObjectURL(url)); const frame = document.createElement('iframe'); frame.title = name; frame.className = 'pdf-frame'; frame.setAttribute('sandbox', ''); frame.src = url; host.append(frame);
    const hint = document.createElement('p'); hint.className = 'preview-note'; hint.textContent = 'Native browser PDF preview. Some browsers require downloading the file. Page-anchored PDF markups are not implemented.'; host.append(hint);
    return { destroy, setMode() {} };
  }
  if (['txt', 'md', 'csv', 'json', 'xml', 'log', 'yaml', 'yml', 'html', 'js', 'css'].includes(extension) || blob.type.startsWith('text/')) {
    const text = await blob.text(); if (disposed) return { destroy };
    const pre = document.createElement('pre'); pre.className = 'text-preview'; pre.textContent = text.slice(0, 1000000); host.append(pre); if (text.length > 1000000) { const note = document.createElement('p'); note.textContent = 'Preview truncated to 1,000,000 characters. Download the file to read all content.'; host.append(note); }
    return { destroy, setMode() {} };
  }
  host.innerHTML = `<div class="preview-unavailable">${icon('box', 46)}<h3>Preserved in its native format</h3><p>${escapeHTML(name)}</p><p>This edition stores and versions this file without altering it. Native DGN, DWG, RVT, IFC and Office rendering is not included. Download to open in a compatible application.</p></div>`;
  return { destroy, setMode() {} };
}
function parseOBJ(text) {
  const vertices = [], faces = []; let object = 'Model'; const objects = new Set();
  if (text.length > 10000000) throw new Error('OBJ preview is limited to 10 MB.');
  for (const raw of text.split(/\r?\n/)) {
    const parts = raw.trim().split(/\s+/); if (parts[0] === 'v') { const v = parts.slice(1, 4).map(Number); if (v.length !== 3 || !v.every(Number.isFinite)) throw new Error('Invalid OBJ vertex.'); vertices.push(v); }
    else if (parts[0] === 'o' || parts[0] === 'g') { object = parts.slice(1).join(' ') || 'Model'; objects.add(object); }
    else if (parts[0] === 'f') { if (parts.length > 1001) throw new Error('OBJ face has too many vertices.'); const indices = parts.slice(1).map(p => { const index = Number(p.split('/')[0]); if (!Number.isInteger(index) || index === 0) throw new Error('Invalid OBJ face index.'); return index < 0 ? vertices.length + index : index - 1; }); faces.push({ indices, object }); }
    if (vertices.length > 100000 || faces.length > 100000) throw new Error('OBJ preview is limited to 100,000 vertices and faces.');
  }
  if (!vertices.length) throw new Error('OBJ file contains no supported vertices.');
  for (const f of faces) if (f.indices.length < 3 || f.indices.some(i => i < 0 || i >= vertices.length)) throw new Error('Invalid OBJ face reference.');
  return { vertices, faces, objects: [...objects] };
}
async function mountOBJ(host, text) {
  const model = parseOBJ(text), canvas = document.createElement('canvas'); canvas.className = 'model-canvas'; canvas.setAttribute('aria-label', 'OBJ model preview. Drag to orbit; scroll to zoom.');
  const note = document.createElement('div'); note.className = 'model-note'; note.textContent = `OBJ · ${model.vertices.length} vertices · ${model.faces.length} faces · Drag to orbit · Scroll to zoom`;
  host.append(canvas, note); const ctx = canvas.getContext('2d');
  const min = [Infinity, Infinity, Infinity], max = [-Infinity, -Infinity, -Infinity]; for (const v of model.vertices) for (let j = 0; j < 3; j++) { min[j] = Math.min(min[j], v[j]); max[j] = Math.max(max[j], v[j]); }
  const center = min.map((v, j) => (v + max[j]) / 2), extent = Math.max(...max.map((v, j) => v - min[j])) || 1; let yaw = .65, pitch = -.42, scale = 1, point = null, frame = 0;
  function draw() {
    const rect = host.getBoundingClientRect(), dpr = Math.min(devicePixelRatio || 1, 2); canvas.width = Math.max(1, rect.width * dpr); canvas.height = Math.max(1, rect.height * dpr); ctx.setTransform(dpr, 0, 0, dpr, 0, 0); const w = rect.width, h = rect.height;
    ctx.fillStyle = '#edf2f4'; ctx.fillRect(0, 0, w, h); ctx.strokeStyle = '#d9e3e7'; ctx.lineWidth = 1;
    for (let x = 0; x < w; x += 30) { ctx.beginPath(); ctx.moveTo(x, 0); ctx.lineTo(x, h); ctx.stroke(); } for (let y = 0; y < h; y += 30) { ctx.beginPath(); ctx.moveTo(0, y); ctx.lineTo(w, y); ctx.stroke(); }
    const factor = Math.min(w, h) * .65 * scale / extent;
    const points = model.vertices.map(v => { const [x, y, z] = v.map((n, j) => n - center[j]); const a = x * Math.cos(yaw) + z * Math.sin(yaw), b = -x * Math.sin(yaw) + z * Math.cos(yaw); return [w / 2 + a * factor, h / 2 - (y * Math.cos(pitch) - b * Math.sin(pitch)) * factor, y * Math.sin(pitch) + b * Math.cos(pitch)]; });
    const faces = model.faces.map(f => ({ ...f, depth: f.indices.reduce((s, i) => s + points[i][2], 0) / f.indices.length })).sort((a, b) => a.depth - b.depth);
    for (const f of faces) { ctx.beginPath(); f.indices.forEach((index, j) => { const p = points[index]; if (!j) ctx.moveTo(p[0], p[1]); else ctx.lineTo(p[0], p[1]); }); ctx.closePath(); ctx.fillStyle = f.object.toLowerCase().includes('canopy') ? '#8db7b3bb' : '#c1d1dbea'; ctx.fill(); ctx.strokeStyle = '#466b76'; ctx.stroke(); }
  }
  const render = () => { cancelAnimationFrame(frame); frame = requestAnimationFrame(draw); };
  canvas.onpointerdown = e => { point = [e.clientX, e.clientY]; canvas.setPointerCapture(e.pointerId); }; canvas.onpointermove = e => { if (!point) return; yaw += (e.clientX - point[0]) * .008; pitch = Math.max(-1.5, Math.min(1.5, pitch + (e.clientY - point[1]) * .008)); point = [e.clientX, e.clientY]; render(); }; canvas.onpointerup = canvas.onpointercancel = () => point = null;
  canvas.addEventListener('wheel', e => { e.preventDefault(); scale = Math.max(.15, Math.min(5, scale * Math.exp(-e.deltaY * .001))); render(); }, { passive: false });
  const observer = new ResizeObserver(render); observer.observe(host); render();
  return { destroy() { observer.disconnect(); cancelAnimationFrame(frame); }, setMode() {} };
}
/** Simple bounded line comparison, not a semantic CAD comparison. */
function compareText(a, b, maximumLines = 10000) {
  const left = String(a).split(/\r?\n/).slice(0, maximumLines), right = String(b).split(/\r?\n/).slice(0, maximumLines); const rows = [];
  for (let i = 0; i < Math.max(left.length, right.length); i++) rows.push({ line: i + 1, left: left[i] ?? '', right: right[i] ?? '', changed: left[i] !== right[i] });
  return rows;
}

return { mountPreview, parseOBJ, compareText };
})();

export const { mountPreview, parseOBJ, compareText } = __modules["packages/viewer/index.js"];
