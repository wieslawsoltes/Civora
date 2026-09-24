import { ControlError, CONTROL_LIMITS, canonical, validateMetadata, calendarDate } from './index.js';
/** Strict CSV interchange for reviewable, atomic metadata updates. */
const fail = message => { throw new ControlError(message); };
const fixedColumns = ['document_id', 'version_id', 'workspace_revision', 'number', 'filename', 'title', 'discipline', 'due_date', 'tags_json', 'description'];
const protect = value => /^[=+\-@\t\r\n']/.test(value) ? "'" + value : value;
const unprotect = value => /^'[=+\-@\t\r\n']/.test(value) ? value.slice(1) : value;
function cell(value) { return '"' + protect(String(value ?? '')).replaceAll('"', '""') + '"'; }
export function metadataRegisterCSV(state, projectId, documentIds = null) {
  const project = state.projects.find(p => p.id === projectId); if (!project) fail('Project is unavailable.');
  const wanted = documentIds ? new Set(documentIds) : null, documents = state.documents.filter(d => d.projectId === projectId && !d.deletedAt && (!wanted || wanted.has(d.id)));
  if (documents.length > CONTROL_LIMITS.batch) fail('Select at most 100 documents per editable register.');
  const columns = [...fixedColumns, ...project.fields.map(f => `meta:${f.key}`)];
  const rows = documents.map(d => [d.id, d.versions.at(-1).id, state.revision, d.number, d.name, d.title, d.discipline, d.dueDate, JSON.stringify(d.tags), d.description, ...project.fields.map(f => d.metadata[f.key] || '')]);
  return '\uFEFF' + [columns, ...rows].map(row => row.map(cell).join(',')).join('\r\n') + '\r\n';
}
export function parseRegisterCSV(source) {
  if (typeof source !== 'string' || source.length > 3 * 1024 * 1024) fail('CSV input is limited to 3 MiB of text.');
  source = source.replace(/^\uFEFF/, '');
  const rows = []; let row = [], value = '', quoted = false, closed = false, started = false;
  const pushCell = () => { if (value.length > 20000) fail('CSV cell is too long.'); row.push(unprotect(value)); value = ''; closed = false; started = false; if (row.length > 60) fail('Too many CSV columns.'); };
  const pushRow = () => { pushCell(); if (!(row.length === 1 && row[0] === '')) rows.push(row); row = []; if (rows.length > CONTROL_LIMITS.batch + 1) fail('CSV batches are limited to 100 documents.'); };
  for (let i = 0; i < source.length; i++) {
    const char = source[i];
    if (quoted) { if (char === '"') { if (source[i + 1] === '"') { value += '"'; i++; } else { quoted = false; closed = true; } } else value += char; continue; }
    if (char === '"') { if (started || closed) fail('Unexpected quote in CSV.'); quoted = true; started = true; }
    else if (char === ',') pushCell();
    else if (char === '\n' || char === '\r') { if (char === '\r' && source[i + 1] === '\n') i++; pushRow(); }
    else { if (closed) fail('Unexpected data after a quoted CSV cell.'); value += char; started = true; }
  }
  if (quoted) fail('Unterminated quoted CSV cell.');
  if (value || started || closed || row.length) pushRow();
  if (!rows.length) fail('CSV is empty.');
  const columns = rows.shift(); if (new Set(columns).size !== columns.length) fail('CSV headers must be unique.');
  if (rows.some(row => row.length !== columns.length)) fail('Every CSV row must have the same number of columns.');
  return { columns, rows: rows.map(row => Object.fromEntries(columns.map((column, i) => [column, row[i]]))) };
}
export function previewMetadataRegister(state, projectId, source) {
  const { columns, rows } = parseRegisterCSV(source), project = state.projects.find(p => p.id === projectId);
  if (!project) fail('Project is unavailable.');
  const allowed = new Set([...fixedColumns, ...project.fields.map(f => `meta:${f.key}`)]);
  if (columns.some(c => !allowed.has(c))) fail('CSV contains unknown or protected columns.');
  for (const key of ['document_id', 'version_id', 'workspace_revision', 'number', 'filename']) if (!columns.includes(key)) fail(`CSV is missing ${key}.`);
  const seen = new Set(), updates = [], changes = [], lookup = new Map(state.documents.map(d => [d.id, d]));
  for (let i = 0; i < rows.length; i++) {
    const row = rows[i], doc = lookup.get(row.document_id), label = `Row ${i + 2}`;
    if (!doc || doc.deletedAt || doc.projectId !== projectId) fail(`${label}: document is not available in this project.`);
    if (seen.has(doc.id)) fail(`${label}: duplicate document.`); seen.add(doc.id);
    if (!/^\d+$/.test(row.workspace_revision) || Number(row.workspace_revision) !== state.revision) throw new ControlError(`${label}: workspace changed since export. Export a fresh register and reapply your edits.`, 'CONFLICT');
    if (row.version_id !== doc.versions.at(-1).id) throw new ControlError(`${label}: source revision changed.`, 'CONFLICT');
    if (row.number !== doc.number || row.filename !== doc.name) fail(`${label}: document number and filename are read-only in bulk interchange.`);
    const patch = {};
    for (const key of ['title','discipline','description']) if(columns.includes(key)&&row[key].length>4000) fail(`${label}: ${key} exceeds 4,000 characters.`);
    for (const key of ['title', 'discipline', 'description']) if (columns.includes(key) && row[key] !== doc[key]) patch[key] = row[key];
    if ('due_date' in row && row.due_date !== doc.dueDate) patch.dueDate = calendarDate(row.due_date);
    if ('tags_json' in row) {
      let tags; try { tags = JSON.parse(row.tags_json); } catch { fail(`${label}: tags_json must be a JSON array of strings.`); }
      if (!Array.isArray(tags) || tags.length > 30 || tags.some(t => typeof t !== 'string' || t.length > 60)) fail(`${label}: invalid tags list.`);
      if (canonical(tags) !== canonical(doc.tags)) patch.tags = tags;
    }
    const metadata = { ...doc.metadata }; let changed = false;
    for (const f of project.fields) if (`meta:${f.key}` in row && row[`meta:${f.key}`] !== (doc.metadata[f.key] || '')) { metadata[f.key] = row[`meta:${f.key}`]; changed = true; }
    if (changed) patch.metadata = validateMetadata(project, metadata);
    if (Object.keys(patch).length) { updates.push({ id: doc.id, expectedVersionId: doc.versions.at(-1).id, patch }); changes.push({ documentId: doc.id, number: doc.number, name: doc.name, fields: Object.keys(patch) }); }
  }
  return { payload: { projectId, baseRevision: state.revision, updates }, changes, unchanged: rows.length - changes.length };
}
