import { ControlError, documentPath } from './index.js';
/** Bounded reference discovery. Never follows URLs, opens local paths or executes content. */
export const REFERENCE_SCAN_LIMIT = 4 * 1024 * 1024;
function error(message) { throw new ControlError(message); }
function decodeEntities(value) {
  const entities = { amp: '&', quot: '"', apos: "'", lt: '<', gt: '>' };
  return value.replace(/&(#x[0-9a-f]+|#\d+|amp|quot|apos|lt|gt);/gi, (whole, name) => {
    if (name[0] !== '#') return entities[name] ?? whole;
    const code = name[1].toLowerCase() === 'x' ? parseInt(name.slice(2), 16) : Number(name.slice(1));
    return code > 0 && code <= 0x10ffff && !(code >= 0xd800 && code <= 0xdfff) ? String.fromCodePoint(code) : whole;
  });
}
function stripXMLBlocks(source) {
  // Single forward pass: malformed repeated openings cannot cause quadratic regex rescans.
  const lower=source.toLowerCase();let offset=0,result='';
  const opening=/<!--|<!\[CDATA\[|<script\b/gi;
  while(offset<source.length){opening.lastIndex=offset;const match=opening.exec(source);if(!match){result+=source.slice(offset);break;}result+=source.slice(offset,match.index);
    let end;
    if(match[0]==='<!--'){end=source.indexOf('-->',opening.lastIndex);offset=end<0?source.length:end+3;}
    else if(match[0].startsWith('<!')){end=source.indexOf(']]>',opening.lastIndex);offset=end<0?source.length:end+3;}
    else{end=lower.indexOf('</script',opening.lastIndex);if(end<0){offset=source.length;continue;}const finish=source.indexOf('>',end+8);offset=finish<0?source.length:finish+1;}
  }return result;
}
export function scanReferences(name, source) {
  if (typeof source !== 'string' || source.length > REFERENCE_SCAN_LIMIT || source.includes('\0')) error('Reference scanning accepts at most 4 MiB of text, not binary CAD files.');
  const extension = name.split('.').pop().toLowerCase(), findings = [], warnings = [];
  const add = (path, kind, detail = '') => {
    path = String(path || '').trim(); if (!path || path.startsWith('#') || /^data:/i.test(path)) return;
    if (path.length > 2000 || /[\x00-\x1f]/.test(path)) { warnings.push('Skipped an unsafe or overlong reference.'); return; }
    if (findings.some(f => f.path === path && f.kind === kind)) return;
    if (findings.length >= 1000) error('Reference scan exceeds 1,000 external entries.'); findings.push({ path, kind, detail });
  };
  if (extension === 'dxf') {
    const lines = source.replace(/^\uFEFF/, '').split(/\r\n|\n|\r/); while (lines.at(-1) === '') lines.pop();
    if (lines.length % 2) error('ASCII DXF must contain complete group-code/value pairs.');
    let record = null; const records = [];
    for (let i = 0; i < lines.length; i += 2) {
      const codeText = lines[i].trim(); if (!/^\d+$/.test(codeText)) error(`Invalid DXF group code on line ${i + 1}.`);
      const code = Number(codeText), value = lines[i + 1];
      if (code === 0) { record = { type: value.trim().toUpperCase(), values: [] }; records.push(record); }
      else if (record) record.values.push([code, value]);
    }
    const get = (r, code) => r.values.find(([c]) => c === code)?.[1]?.trim() || '';
    for (const r of records) {
      if (r.type === 'BLOCK' && (Number(get(r, 70)) & 12)) add(get(r, 1), 'CAD xref', get(r, 2));
      if (r.type === 'IMAGEDEF') add(get(r, 1), 'Raster image');
      if (['PDFDEFINITION', 'DWFDEFINITION', 'DGNDEFINITION'].includes(r.type)) add(get(r, 1), 'Underlay', get(r, 2));
    }
    warnings.push('ASCII DXF BLOCK xrefs, IMAGEDEF and PDF/DWF/DGN definitions only; private objects and native DWG/DGN are not parsed.');
  } else if (extension === 'svg') {
    if (/<!DOCTYPE|<!ENTITY/i.test(source)) error('SVG reference discovery does not process DTDs or external entities.');
    const xml = stripXMLBlocks(source);
    const baseUnsupported = /\bxml:base\s*=/.test(xml);
    if (baseUnsupported) warnings.push('xml:base is present: resolve its relative references manually.');
    for (const match of xml.matchAll(/<(?:[A-Za-z_][\w.-]*:)?(image|use|feImage|linearGradient|radialGradient|pattern|textPath)\b((?:[^<>"']|"[^"<]*"|'[^'<]*')*)>/g)) {
      const attrs = Object.create(null);
      for (const a of match[2].matchAll(/([:\w.-]+)\s*=\s*(?:"([^"]*)"|'([^']*)')/g)) attrs[a[1]] = decodeEntities(a[2] ?? a[3]);
      const href = attrs.href ?? attrs['xlink:href'];
      if (href) add(href, 'SVG asset', baseUnsupported ? 'Manual resolution: xml:base' : match[1]);
    }
    warnings.push('Static href/xlink:href attributes only. CSS, animation, script, and arbitrary XML semantics are not evaluated.');
  } else if (extension === 'obj') {
    for (const line of source.split(/\r?\n/)) if (/^\s*mtllib\s+/.test(line)) {
      const value = line.replace(/^\s*mtllib\s+/, '').trim();
      for (const path of value.match(/"[^"]*"|'[^']*'|\S+/g) || []) add(path.replace(/^['"]|['"]$/g, ''), 'Material library');
    }
    warnings.push('OBJ mtllib statements only; quoted paths are supported. Unquoted paths containing spaces require manual resolution.');
  } else error('Reference discovery supports textual DXF, SVG, and OBJ files. Originals remain downloadable for all other formats.');
  return { extension, findings, warnings };
}
function normalizeRelative(base, path) {
  const stack = base ? base.split('/') : [];
  for (const part of path.split('/')) {
    if (!part || part === '.') continue;
    if (part === '..') { if (!stack.length) return null; stack.pop(); }
    else stack.push(part);
  }
  return stack.join('/');
}
/** Only provide an access-filtered state to avoid exposing filenames to a caller. */
export function resolveReferenceFindings(state, sourceId, scan) {
  const source = state.documents.find(d => d.id === sourceId); if (!source) error('Source document is unavailable.');
  const documents = state.documents.filter(d => d.projectId === source.projectId && !d.deletedAt && d.id !== source.id), base = documentPath(state, source).split('/').slice(0, -1).join('/');
  const byPath = new Map(), byName = new Map();
  for (const doc of documents) { const path = documentPath(state, doc).toLowerCase(), name = doc.name.toLowerCase(); byPath.set(path, [...(byPath.get(path) || []), doc]); byName.set(name, [...(byName.get(name) || []), doc]); }
  return scan.findings.map((finding, i) => {
    let path = finding.path.replaceAll('\\', '/');
    if (scan.extension === 'svg') { path = path.split(/[?#]/)[0]; try { path = decodeURIComponent(path); } catch { return { ...finding, index: i, status: 'Invalid URI', candidates: [], documentId: null }; } }
    if (/^[A-Za-z][\w+.-]*:|^\//.test(path) || finding.detail.startsWith('Manual resolution')) return { ...finding, index: i, status: 'External / manual', candidates: [], documentId: null };
    const relative = normalizeRelative(base, path);
    if (relative === null) return { ...finding, index: i, status: 'Outside project', candidates: [], documentId: null };
    const exact = byPath.get(relative.toLowerCase()) || [], fallback = exact.length ? exact : byName.get(path.split('/').at(-1).toLowerCase()) || [];
    return { ...finding, index: i, status: exact.length === 1 ? 'Matched path' : fallback.length === 1 ? 'Suggested filename' : fallback.length ? 'Ambiguous' : 'Missing', candidates: fallback.map(d => ({ id: d.id, name: d.name, number: d.number, path: documentPath(state, d) })), documentId: exact.length === 1 ? exact[0].id : null };
  });
}
