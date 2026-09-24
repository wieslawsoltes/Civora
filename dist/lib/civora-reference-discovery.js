// Civora 0.10.0 — independently authored. MIT license.
const __modules = Object.create(null);

__modules["packages/document-control/index.js"] = (() => {
/** Governed metadata, numbering, revision baselines and review routes.
 * Pure ES module: no DOM, file access, network requests, or mutable singleton state.
 * Command authorization is performed by the core/access packages.
 */
class ControlError extends Error {
  constructor(message, code = 'VALIDATION') { super(message); this.name = 'ControlError'; this.code = code; }
}
const check = (test, message, code) => { if (!test) throw new ControlError(message, code); };
const text = (value, label, max = 200, optional = false) => {
  check(typeof value === 'string', `${label} must be text.`);
  const out = value.trim();
  check((optional || out.length > 0) && out.length <= max, `${label} must contain ${optional ? '0' : '1'}–${max} characters.`);
  return out;
};
const own = (object, key) => Object.hasOwn(object, key);
const plain = value => value && typeof value === 'object' && !Array.isArray(value) && [Object.prototype, null].includes(Object.getPrototypeOf(value));
const keyPattern = /^[a-z][a-z0-9_]{0,49}$/;
const unsafe = new Set(['__proto__', 'constructor', 'prototype']);
const METADATA_TYPES = ['text', 'number', 'integer', 'date', 'choice', 'boolean'];
const METADATA_FORMATS = ['any', 'code', 'uppercase', 'email'];
const CONTROL_LIMITS = Object.freeze({ fields: 40, batch: 100, baselineDocuments: 2000, baselines: 2000, stages: 8, assignees: 50 });
function calendarDate(value, label = 'Date') {
  if (!value) return '';
  const result = text(value, label, 10), date = new Date(result + 'T00:00:00.000Z');
  check(/^\d{4}-\d{2}-\d{2}$/.test(result) && !Number.isNaN(+date) && date.toISOString().slice(0, 10) === result, `${label} is not a valid calendar date.`);
  return result;
}
function fieldValue(field, value, { defaults = true } = {}) {
  check(value == null || ['string', 'number', 'boolean'].includes(typeof value), `${field.label} must be a scalar value.`);
  let out = value == null ? '' : String(value).trim();
  if (!out && defaults && own(field, 'defaultValue')) out = field.defaultValue;
  check(!field.required || out !== '', `${field.label} is required.`);
  if (!out) return '';
  check(out.length <= (field.maxLength ?? 500), `${field.label} exceeds its ${field.maxLength ?? 500}-character limit.`);
  if (['number', 'integer'].includes(field.type)) {
    check(/^[+-]?(?:\d+(?:\.\d*)?|\.\d+)(?:[eE][+-]?\d+)?$/.test(out) && Number.isFinite(Number(out)), `${field.label} must be a finite number.`);
    const n = Number(out);
    if (field.type === 'integer') check(Number.isSafeInteger(n), `${field.label} must be a safe integer.`);
    if (own(field, 'min')) check(n >= field.min, `${field.label} must be at least ${field.min}.`);
    if (own(field, 'max')) check(n <= field.max, `${field.label} must be at most ${field.max}.`);
  }
  if (field.type === 'date') calendarDate(out, field.label);
  if (field.type === 'boolean') check(['true', 'false'].includes(out), `${field.label} must be true or false.`);
  if (field.type === 'choice') check(field.options.includes(out), `${field.label} must use an allowed option.`);
  if (field.format === 'code') check(/^[A-Za-z0-9][A-Za-z0-9_.-]*$/.test(out), `${field.label} must be a code without spaces.`);
  if (field.format === 'uppercase') check(out === out.toUpperCase(), `${field.label} must be uppercase.`);
  if (field.format === 'email') check(/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(out), `${field.label} must be an email address.`);
  return out;
}
function normalizeFields(fields) {
  check(Array.isArray(fields) && fields.length <= CONTROL_LIMITS.fields, 'Up to 40 metadata fields are supported.');
  const seen = new Set();
  return fields.map(input => {
    check(plain(input), 'Invalid metadata field.');
    const key = text(input.key, 'Field key', 50);
    check(keyPattern.test(key) && !unsafe.has(key) && !seen.has(key), 'Field keys must be unique, safe lowercase identifiers.'); seen.add(key);
    check(METADATA_TYPES.includes(input.type), 'Unknown metadata field type.');
    const field = { key, label: text(input.label, 'Field label', 100), type: input.type, required: !!input.required };
    if (input.type === 'choice') {
      check(Array.isArray(input.options) && input.options.length > 0 && input.options.length <= 100, 'Choice fields need 1–100 options.');
      field.options = input.options.map(v => text(v, 'Choice option', 100));
      check(new Set(field.options).size === field.options.length, 'Choice options must be unique.');
    }
    if (own(input, 'maxLength')) { check(Number.isInteger(input.maxLength) && input.maxLength >= 1 && input.maxLength <= 500, 'Field length must be 1–500.'); field.maxLength = input.maxLength; }
    for (const bound of ['min', 'max']) if (own(input, bound)) {
      check(['number', 'integer'].includes(input.type) && Number.isFinite(input[bound]), 'Numeric limits require a numeric field and finite bounds.'); field[bound] = input[bound];
    }
    check(!own(field, 'min') || !own(field, 'max') || field.min <= field.max, 'Minimum must not exceed maximum.');
    if (own(input, 'format')) { check(METADATA_FORMATS.includes(input.format), 'Unknown field format.'); field.format = input.format; }
    if (own(input, 'defaultValue') && String(input.defaultValue) !== '') field.defaultValue = fieldValue({ ...field, required: false }, input.defaultValue, { defaults: false });
    return field;
  });
}
function validateMetadata(project, input = {}, options = {}) {
  check(plain(input), 'Metadata must be a plain object.');
  const result = {};
  for (const field of project.fields || []) result[field.key] = fieldValue(field, input[field.key], options);
  return result;
}
function metadataIssues(project, input = {}) {
  const issues = [];
  for (const field of project.fields || []) {
    try { fieldValue(field, input?.[field.key], { defaults: false }); }
    catch (error) { issues.push({ key: field.key, label: field.label, message: error.message }); }
  }
  return issues;
}
function normalizeNumbering(project, input, previous = null) {
  check(plain(input), 'Numbering configuration is required.');
  const pattern = text(input.pattern, 'Numbering pattern', 120);
  check(!/[\\/\x00-\x1f\x7f]/.test(pattern), 'Numbering patterns cannot contain path separators or control characters.');
  const tokens = [...pattern.matchAll(/\{([^{}]+)\}/g)].map(m => m[1]);
  check(!/[{}]/.test(pattern.replace(/\{[^{}]+\}/g, '')), 'Unbalanced numbering placeholder.');
  check(tokens.filter(t => /^seq:[1-9]$/.test(t)).length === 1, 'Include exactly one sequence placeholder, e.g. {seq:5}.');
  for (const token of tokens) check(token === 'project' || token === 'discipline' || /^seq:[1-9]$/.test(token) || token.startsWith('meta:') && project.fields.some(f => f.key === token.slice(5)), `Unknown numbering placeholder: {${token}}.`);
  const nextSequence = input.nextSequence ?? previous?.nextSequence ?? 1;
  check(Number.isSafeInteger(nextSequence) && nextSequence >= 1 && nextSequence <= 1000000000, 'Sequence must be an integer from 1 to 1000000000 (exhausted).');
  check(nextSequence >= (previous?.nextSequence ?? 1), 'Numbering sequences cannot be moved backwards.');
  check(typeof input.allowManual === 'boolean', 'Choose whether manual document numbers are allowed.');
  return { pattern, nextSequence, allowManual: input.allowManual };
}
function formatDocumentNumber(project, { discipline = 'General', metadata = {} } = {}, sequence = project.numbering?.nextSequence ?? 1) {
  const pattern = project.numbering?.pattern ?? '{project}-{seq:5}';
  const result = pattern.replace(/\{([^{}]+)\}/g, (_, token) => {
    if (token.startsWith('seq:')) return String(sequence).padStart(Number(token.slice(4)), '0');
    const value = token === 'project' ? project.code : token === 'discipline' ? discipline : metadata[token.slice(5)];
    const part = String(value ?? '').trim();
    check(part && !/[{}\\/\x00-\x1f\x7f]/.test(part), `Numbering value for {${token}} is missing or unsafe.`); return part;
  });
  check(result.length > 0 && result.length <= 100, 'The generated document number must fit in 100 characters.');
  return result;
}
function allocateDocumentNumber(state, project, payload, metadata) {
  const manual = String(payload.number ?? '').trim(), occupied = new Set(state.documents.filter(d => d.projectId === project.id).map(d => d.number.toUpperCase()));
  if (manual) {
    check(!project.numbering || project.numbering.allowManual, 'This project requires automatically assigned document numbers.');
    check(manual.length <= 100 && !/[\x00-\x1f\x7f]/.test(manual), 'Invalid document number.');
    check(!occupied.has(manual.toUpperCase()), 'Document number already exists.'); return manual;
  }
  let next = project.numbering?.nextSequence ?? (project.nextDocumentSequence ?? 1);
  for (let attempt = 0; attempt <= 10000; attempt++, next++) {
    check(next <= 999999999, 'Document number sequence is exhausted.');
    const number = formatDocumentNumber(project, { discipline: payload.discipline || 'General', metadata }, next);
    if (!occupied.has(number.toUpperCase())) {
      if (project.numbering) project.numbering.nextSequence = next + 1; else project.nextDocumentSequence = next + 1;
      return number;
    }
  }
  throw new ControlError('Too many occupied numbers. Move the next sequence forward in Document control.');
}
function documentMap(state) { return new Map(state.documents.map(d => [d.id, d])); }
function dependencyClosure(state, rootIds, projectId, { max = CONTROL_LIMITS.baselineDocuments } = {}) {
  check(Array.isArray(rootIds) && rootIds.length > 0 && rootIds.length <= max, `Choose 1–${max} documents.`);
  const lookup = documentMap(state), result = [], seen = new Set(), stack = [...rootIds].reverse();
  while (stack.length) {
    const id = stack.pop(); if (seen.has(id)) continue;
    const doc = lookup.get(id); check(doc && !doc.deletedAt && doc.projectId === projectId, 'A dependency is missing, recycled, or outside this project.');
    seen.add(id); result.push(id); check(result.length <= max, `Dependency closure exceeds ${max} documents.`);
    stack.push(...[...doc.references].reverse());
  }
  return result;
}
function documentPath(state, doc) {
  const folders = new Map(state.folders.map(f => [f.id, f])), path = [], seen = new Set(); let id = doc.folderId;
  while (id) { check(!seen.has(id), 'Folder cycle detected.'); seen.add(id); const f = folders.get(id); check(f, 'Folder is unavailable.'); path.unshift(f.name); id = f.parentId; }
  return [...path, doc.name].join('/');
}
function reviewContext(doc) {
  return { name: doc.name, title: doc.title, number: doc.number, description: doc.description, discipline: doc.discipline, metadata: structuredClone(doc.metadata), tags: [...doc.tags], dueDate: doc.dueDate, references: [...doc.references].sort() };
}
function canonical(value) {
  if (Array.isArray(value)) return '[' + value.map(canonical).join(',') + ']';
  if (value && typeof value === 'object') return '{' + Object.keys(value).sort().map(k => JSON.stringify(k) + ':' + canonical(value[k])).join(',') + '}';
  return JSON.stringify(value);
}
function snapshotDocument(state, doc) {
  const version = doc.versions.at(-1);
  return { documentId: doc.id, versionId: version.id, name: doc.name, number: doc.number, revision: version.label, blobId: version.blobId, hash: version.hash, size: version.size, mime: version.mime, context: reviewContext(doc), state: doc.state, path: documentPath(state, doc) };
}
function captureBaseline(state, payload, actorId, now, makeId) {
  const project = state.projects.find(p => p.id === payload.projectId); check(project, 'Project not found.', 'NOT_FOUND');
  check((state.baselines || []).length < CONTROL_LIMITS.baselines, 'Baseline collection limit reached.');
  check(typeof payload.includeReferences === 'boolean', 'Choose whether to include dependencies.');
  const roots = payload.documentIds;
  check(Array.isArray(roots) && roots.length > 0 && roots.length <= CONTROL_LIMITS.baselineDocuments && new Set(roots).size === roots.length, 'Choose a unique nonempty list of documents.');
  const ids = payload.includeReferences ? dependencyClosure(state, roots, project.id) : [...roots], lookup = documentMap(state);
  const records = ids.map(id => {
    const doc = lookup.get(id); check(doc && doc.projectId === project.id && !doc.deletedAt, 'Choose active documents in this project.');
    check(!doc.checkedOutBy, 'Release checkouts before freezing a baseline.'); return snapshotDocument(state, doc);
  });
  return { id: makeId('baseline'), projectId: project.id, name: text(payload.name, 'Baseline name'), description: text(payload.description || '', 'Description', 2000, true), createdBy: actorId, createdAt: now, workspaceRevision: state.revision, rootDocumentIds: [...roots], includeReferences: payload.includeReferences, documents: records };
}
function liveBaseline(state, baseline) {
  const lookup = documentMap(state);
  const ids = baseline.includeReferences ? (() => {
    // Recycled roots and dependencies are represented as removals, not fatal errors.
    const found = [], seen = new Set(), stack = [...baseline.rootDocumentIds].reverse();
    while (stack.length) { const id = stack.pop(); if (seen.has(id)) continue; seen.add(id); const d = lookup.get(id); if (!d || d.deletedAt || d.projectId !== baseline.projectId) continue; found.push(id); check(found.length <= CONTROL_LIMITS.baselineDocuments, 'Live closure exceeds baseline limit.'); stack.push(...[...d.references].reverse()); }
    return found;
  })() : baseline.rootDocumentIds.filter(id => lookup.has(id) && !lookup.get(id).deletedAt);
  return { name: 'Current workspace', projectId: baseline.projectId, documents: ids.map(id => snapshotDocument(state, lookup.get(id))) };
}
function compareBaselines(before, after) {
  check(before.projectId === after.projectId, 'Compare baselines in the same project.');
  const a = new Map(before.documents.map(d => [d.documentId, d])), b = new Map(after.documents.map(d => [d.documentId, d]));
  return [...new Set([...a.keys(), ...b.keys()])].map(documentId => {
    const left = a.get(documentId), right = b.get(documentId);
    const changedFields = left && right ? [...new Set([...Object.keys(left.context || {}), ...Object.keys(right.context || {})])].filter(k => canonical(left.context?.[k]) !== canonical(right.context?.[k])) : [];
    if (left && right && left.path !== right.path) changedFields.push('path');
    if (left && right && left.state !== right.state) changedFields.push('state');
    const contentChanged = !!left && !!right && left.hash !== right.hash, revisionChanged = !!left && !!right && left.versionId !== right.versionId;
    return { documentId, before: left || null, after: right || null, contentChanged, revisionChanged, changedFields, status: !left ? 'Added' : !right ? 'Removed' : contentChanged ? 'Content changed' : revisionChanged ? 'Revision changed' : changedFields.length ? 'Metadata changed' : 'Unchanged' };
  }).sort((a, b) => (a.after || a.before).number.localeCompare((b.after || b.before).number, undefined, { numeric: true }));
}
function uniqueIds(value, label, max = CONTROL_LIMITS.assignees) {
  check(Array.isArray(value) && value.length > 0 && value.length <= max && value.every(v => typeof v === 'string') && new Set(value).size === value.length, `${label} needs 1–${max} unique identifiers.`); return [...value];
}
function normalizeReviewStages(input, state, { template = false } = {}) {
  check(Array.isArray(input) && input.length > 0 && input.length <= CONTROL_LIMITS.stages, 'A review route needs 1–8 stages.');
  return input.map((s, i) => {
    check(plain(s), 'Invalid review stage.');
    const assignees = uniqueIds(s.assignees, 'Review stage');
    for (const id of assignees) { const u = state.users.find(u => u.id === id); check(u?.active && ['admin', 'manager', 'reviewer'].includes(u.role), 'Assign active reviewers, managers, or administrators.'); }
    const quorum = s.quorum ?? assignees.length;
    check(Number.isInteger(quorum) && quorum > 0 && quorum <= assignees.length, 'Stage quorum must be between one and the number of assignees.');
    return { id: `stage-${i + 1}`, name: text(s.name, 'Stage name', 100), assignees, quorum, dueDate: template ? '' : calendarDate(s.dueDate || '', 'Stage deadline') };
  });
}
function currentReviewStage(review) { return review.stages?.[review.currentStage] || null; }
function pendingReviewers(review) {
  if (review.status !== 'In review') return [];
  const stage = currentReviewStage(review), assignees = stage?.assignees || review.assignees;
  return assignees.filter(id => !review.decisions.some(d => d.by === id && (!stage || d.stageId === stage.id)));
}
function reviewDocumentCurrent(state, review, documentId) {
  const snap = review.documents.find(s => s.documentId === documentId), doc = state.documents.find(d => d.id === documentId);
  return !!snap && !!doc && !doc.deletedAt && !doc.checkedOutBy && doc.versions.at(-1).id === snap.versionId && (!snap.context || canonical(snap.context) === canonical(reviewContext(doc)));
}
function reviewIsCurrent(state, review) { return review.documents.every(s => reviewDocumentCurrent(state, review, s.documentId)); }
function recordStageDecision(review, payload, user, now) {
  const stage = currentReviewStage(review);
  check(stage && review.status === 'In review', 'This routed review is not open.');
  check(payload.stageId === stage.id, 'The active review stage changed. Reopen the review before deciding.', 'CONFLICT');
  check(stage.assignees.includes(user.id), 'Only an assigned reviewer in the active stage can decide.', 'FORBIDDEN');
  check(!review.decisions.some(d => d.stageId === stage.id && d.by === user.id), 'You already decided in this stage.');
  check(['Approved', 'Changes requested'].includes(payload.decision), 'Invalid review decision.');
  review.decisions.push({ by: user.id, stageId: stage.id, decision: payload.decision, comment: text(payload.comment, 'Decision comment', 4000), at: now });
  if (payload.decision === 'Changes requested') { stage.status = 'Changes requested'; stage.closedAt = now; review.status = 'Changes requested'; review.closedAt = now; return; }
  const approvals = review.decisions.filter(d => d.stageId === stage.id && d.decision === 'Approved').length;
  if (approvals >= stage.quorum) {
    stage.status = 'Approved'; stage.closedAt = now;
    if (review.currentStage + 1 === review.stages.length) { review.status = 'Approved'; review.closedAt = now; }
    else { review.currentStage++; const next = currentReviewStage(review); next.status = 'In review'; next.activatedAt = now; }
  }
}
function validSnapshotContext(context, projectId, docs) {
  check(plain(context) && plain(context.metadata), 'Missing or invalid pinned metadata context.');
  for(const key of ['name','number','title','description','discipline','dueDate']) check(typeof context[key] === 'string', 'Invalid pinned metadata text.');
  check(Array.isArray(context.tags) && context.tags.length <= 30 && context.tags.every(t=>typeof t==='string'), 'Invalid pinned tags.');
  check(Object.values(context.metadata).every(v=>typeof v==='string'), 'Invalid pinned metadata values.');
  check(Array.isArray(context.references) && context.references.length <= 1000 && new Set(context.references).size===context.references.length && context.references.every(id=>docs.get(id)?.projectId===projectId), 'Invalid pinned references.');
  calendarDate(context.dueDate);
}
/** Validation runs on commands and authoritative backup imports. Legacy collections are optional. */
function validateControlState(state) {
  for (const project of state.projects) {
    normalizeFields(project.fields);
    if (project.numbering) normalizeNumbering(project, project.numbering);
    if (project.nextDocumentSequence !== undefined) check(Number.isSafeInteger(project.nextDocumentSequence) && project.nextDocumentSequence > 0, 'Invalid document sequence.');
  }
  const projects = new Set(state.projects.map(p => p.id)), users = new Set(state.users.map(u => u.id)), docs = documentMap(state);
  for (const collection of ['baselines', 'reviewTemplates']) {
    const items = state[collection] || []; check(Array.isArray(items) && items.length <= 2000, `Invalid ${collection} collection.`); const seen = new Set();
    for (const item of items) { check(item && typeof item.id === 'string' && item.id.length <= 120 && !seen.has(item.id) && projects.has(item.projectId) && users.has(item.createdBy), `Invalid ${collection} identity.`); seen.add(item.id); text(item.name, 'Name'); }
  }
  for (const baseline of state.baselines || []) {
    check(Number.isSafeInteger(baseline.workspaceRevision) && baseline.workspaceRevision >= 0 && baseline.workspaceRevision <= state.revision, 'Invalid baseline source revision.');
    uniqueIds(baseline.rootDocumentIds, 'Baseline roots', CONTROL_LIMITS.baselineDocuments);
    check(typeof baseline.includeReferences === 'boolean' && Array.isArray(baseline.documents) && baseline.documents.length > 0 && baseline.documents.length <= CONTROL_LIMITS.baselineDocuments, 'Invalid baseline contents.');
    const ids = new Set();
    for (const s of baseline.documents) {
      check(!ids.has(s.documentId), 'Duplicate baseline document.'); ids.add(s.documentId);
      validSnapshotContext(s.context,baseline.projectId,docs);
      const d = docs.get(s.documentId), v = d?.versions.find(v => v.id === s.versionId);
      check(d?.projectId === baseline.projectId && v && v.hash === s.hash && v.blobId === s.blobId && v.size === s.size && v.label === s.revision, 'Broken baseline revision.');
      check(typeof s.name === 'string' && typeof s.number === 'string' && typeof s.path === 'string' && plain(s.context) && plain(s.context.metadata) && Array.isArray(s.context.references) && s.context.references.every(id => docs.get(id)?.projectId === baseline.projectId), 'Invalid baseline metadata snapshot.');
    }
    check(baseline.rootDocumentIds.every(id => ids.has(id)), 'Missing baseline root.');
    if (baseline.includeReferences) check(baseline.documents.every(s => s.context.references.every(id => ids.has(id))), 'Baseline dependency closure is incomplete.');
  }
  for (const template of state.reviewTemplates || []) {
    check(Array.isArray(template.stages) && template.stages.length > 0 && template.stages.length <= CONTROL_LIMITS.stages && typeof template.separationOfDuties === 'boolean', 'Invalid review template.');
    for (const s of template.stages) { uniqueIds(s.assignees, 'Stage assignees'); check(s.assignees.every(id => users.has(id)) && Number.isInteger(s.quorum) && s.quorum > 0 && s.quorum <= s.assignees.length && typeof s.name === 'string', 'Invalid template stage.'); }
  }
  for (const r of state.reviews) if (r.stages) {
    check(Array.isArray(r.stages) && r.stages.length > 0 && r.stages.length <= CONTROL_LIMITS.stages && Number.isInteger(r.currentStage) && r.currentStage >= 0 && r.currentStage < r.stages.length && typeof r.separationOfDuties === 'boolean', 'Invalid review route.');
    for(const record of r.documents)validSnapshotContext(record.context,r.projectId,docs);
    check(Array.isArray(r.reassignments) && r.reassignments.every(a=>a&&users.has(a.by)&&users.has(a.from)&&users.has(a.to)&&r.stages.some(s=>s.id===a.stageId)&&typeof a.reason==='string'&&a.reason.trim().length>0&&typeof a.at==='string'),'Invalid review reassignment history.');
    const stageIds = new Set(), assigned = new Set(); let lastDecisionIndex = -1;
    for (let i = 0; i < r.stages.length; i++) {
      const stage = r.stages[i]; check(typeof stage.id === 'string' && !stageIds.has(stage.id), 'Duplicate review stage.'); stageIds.add(stage.id);
      uniqueIds(stage.assignees, 'Stage assignees'); stage.assignees.forEach(id => assigned.add(id));
      check(stage.assignees.every(id => users.has(id)) && Number.isInteger(stage.quorum) && stage.quorum >= 1 && stage.quorum <= stage.assignees.length && typeof stage.name === 'string', 'Invalid stage configuration.');
      calendarDate(stage.dueDate);
      const decisions = r.decisions.filter(d => d.stageId === stage.id), voted = new Set(); let approvals = 0, rejected = false;
      for (const d of decisions) { check(!voted.has(d.by) && stage.assignees.includes(d.by) && !rejected && approvals < stage.quorum, 'Invalid or duplicate stage decision.'); voted.add(d.by); if (d.decision === 'Approved') approvals++; else rejected = true; }
      const expected = rejected ? 'Changes requested' : approvals >= stage.quorum ? 'Approved' : i === r.currentStage ? 'In review' : 'Pending';
      check(stage.status === expected && (i >= r.currentStage || stage.status === 'Approved') && (i <= r.currentStage || decisions.length === 0), 'Inconsistent review stage progression.');
    }
    for (const d of r.decisions) { const i = r.stages.findIndex(s => s.id === d.stageId); check(i >= lastDecisionIndex && i >= 0, 'Out-of-order stage decision.'); lastDecisionIndex = i; }
    check(r.assignees.length === assigned.size && r.assignees.every(id => assigned.has(id)), 'Review assignees do not match its stages.');
    if (r.status === 'Approved') check(r.stages.every(s => s.status === 'Approved'), 'Unfinished stages cannot approve a review.');
    if (r.status === 'In review') check(currentReviewStage(r).status === 'In review', 'Invalid active review stage.');
    if (r.status === 'Changes requested') check(currentReviewStage(r).status === 'Changes requested', 'Missing rejected stage.');
  }
  return true;
}

return { ControlError, METADATA_TYPES, METADATA_FORMATS, CONTROL_LIMITS, calendarDate, normalizeFields, validateMetadata, metadataIssues, normalizeNumbering, formatDocumentNumber, allocateDocumentNumber, dependencyClosure, documentPath, reviewContext, canonical, snapshotDocument, captureBaseline, liveBaseline, compareBaselines, normalizeReviewStages, currentReviewStage, pendingReviewers, reviewDocumentCurrent, reviewIsCurrent, recordStageDecision, validateControlState };
})();

__modules["packages/document-control/references.js"] = (() => {
const { ControlError, documentPath } = __modules["packages/document-control/index.js"];
/** Bounded reference discovery. Never follows URLs, opens local paths or executes content. */
const REFERENCE_SCAN_LIMIT = 4 * 1024 * 1024;
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
function scanReferences(name, source) {
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
function resolveReferenceFindings(state, sourceId, scan) {
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

return { REFERENCE_SCAN_LIMIT, scanReferences, resolveReferenceFindings };
})();

export const { REFERENCE_SCAN_LIMIT, scanReferences, resolveReferenceFindings } = __modules["packages/document-control/references.js"];
