import { Viewport2D, PointerSession } from '../interactions/index.js';
import { escapeHTML, icon } from '../controls/index.js';
/** Native-safe file preview. Unknown/CAD binaries are not parsed or executed. */
export async function mountPreview(host, { blob, name, markups = [], onMarkup = null, onResolve = null }) {
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
export function parseOBJ(text) {
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
export function compareText(a, b, maximumLines = 10000) {
  const left = String(a).split(/\r?\n/).slice(0, maximumLines), right = String(b).split(/\r?\n/).slice(0, maximumLines); const rows = [];
  for (let i = 0; i < Math.max(left.length, right.length); i++) rows.push({ line: i + 1, left: left[i] ?? '', right: right[i] ?? '', changed: left[i] !== right[i] });
  return rows;
}
