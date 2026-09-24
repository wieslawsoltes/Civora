import { planDocumentRename } from '../document-rename/index.js';
import { planDocumentCopy } from '../document-copy/index.js';
import { applyDocumentSetCommand, validateDocumentSets, snapshotDocumentSet } from '../document-sets/index.js';
import { applyExplorerCommand, validateExplorerState } from '../explorer/index.js';
import { applyAutomationCommand, validateAutomationState, evaluateWorkflowRules, publishCommandNotifications, runScheduledAutomation } from '../automation/index.js';
import { normalizeFields, validateMetadata, allocateDocumentNumber, normalizeNumbering, captureBaseline, normalizeReviewStages, recordStageDecision, currentReviewStage, reviewContext, reviewIsCurrent, reviewDocumentCurrent, validateControlState, CONTROL_LIMITS } from '../document-control/index.js';
import { authorizeCommand, normalizePolicy, validateAccessState, canAccess, PERMISSIONS, invalidateAccessCache } from '../access/index.js';
/** Civora's framework-independent command engine. No DOM, network, or database dependencies. */
export const SCHEMA_VERSION = 1;
export const STATES = ['Work in progress', 'Shared', 'Published', 'Archived'];
export const ROLES = ['admin', 'manager', 'author', 'reviewer', 'viewer'];
export class DomainError extends Error {
  constructor(message, code = 'VALIDATION') { super(message); this.name = 'DomainError'; this.code = code; }
}
export const uid = (prefix = 'id') => `${prefix}-${crypto.randomUUID()}`;
export const copy = value => structuredClone(value);
const assert = (condition, message, code) => { if (!condition) throw new DomainError(message, code); };
const clean = (value, limit = 1000) => String(value ?? '').trim().slice(0, limit);
const required = (value, label, limit = 200) => { const text = clean(value, limit); assert(text, `${label} is required.`); return text; };
const roles = (user, allowed) => assert(allowed.includes(user.role), `Your ${user.role} role cannot perform this action.`, 'FORBIDDEN');
const writers = ['admin', 'manager', 'author'];
const reviewers = ['admin', 'manager', 'reviewer'];
const managers = ['admin', 'manager'];
const tags = v => [...new Set((Array.isArray(v) ? v : String(v || '').split(',')).map(x => clean(x, 60)).filter(Boolean))].slice(0, 30);
const date = value => { const d = clean(value, 10), parsed = new Date(d + 'T00:00:00.000Z'); assert(!d || /^\d{4}-\d{2}-\d{2}$/.test(d) && !Number.isNaN(parsed.getTime()) && parsed.toISOString().slice(0, 10) === d, 'Enter a valid calendar date.'); return d; };
const list = (value, max = 1000) => { assert(Array.isArray(value) && value.length <= max, 'Invalid list.'); return [...new Set(value.map(x => clean(x, 120)))]; };
function entity(state, collection, id) { const result = state[collection]?.find(x => x.id === id); assert(result, `${collection} item not found.`, 'NOT_FOUND'); return result; }
export function currentVersion(doc) { return doc.versions.at(-1); }
export function userName(state, id) { return state.users.find(u => u.id === id)?.name || 'Unknown member'; }
export function projectDocs(state, projectId) { return state.documents.filter(d => !d.deletedAt && (!projectId || d.projectId === projectId)); }
export function referencesOf(state, id, recursive = true) {
  const documents = new Map(state.documents.map(d => [d.id, d]));
  assert(documents.has(id), 'Document not found.', 'NOT_FOUND');
  const result = new Set(), stack = [...documents.get(id).references].reverse();
  while (stack.length) {
    const next = stack.pop(); if (result.has(next)) continue;
    assert(documents.has(next), 'Referenced document not found.', 'NOT_FOUND');
    result.add(next);
    if (recursive) stack.push(...[...documents.get(next).references].reverse());
  }
  return [...result];
}
function editable(doc, user, { locked = false } = {}) {
  assert(!doc.deletedAt, 'Restore this document before editing it.');
  assert(!doc.legalHold, 'This document is on legal hold.');
  assert(doc.state !== 'Archived', 'Archived documents are read-only.');
  assert(!doc.checkedOutBy || doc.checkedOutBy === user.id, 'This document is checked out by another member.', 'LOCKED');
  if (locked) assert(doc.checkedOutBy === user.id, 'Check out this document before checking in a revision.', 'LOCKED');
}
function validMetadata(project, input = {}, options = {}) { return validateMetadata(project, input, options); }

function validFile(file) {
  assert(file && /^[a-f0-9]{64}$/.test(file.hash) && file.blobId === file.hash, 'Verified file content is required.');
  assert(Number.isSafeInteger(file.size) && file.size >= 0 && file.size <= 50 * 1024 * 1024, 'Files are limited to 50 MiB in this edition.');
  return { blobId: file.blobId, hash: file.hash, size: file.size, mime: clean(file.mime || 'application/octet-stream', 100) };
}
function uniqueName(state, projectId, folderId, name, except) {
  assert(!state.documents.some(d => !d.deletedAt && d.id !== except && d.projectId === projectId && d.folderId === folderId && d.name.toLocaleLowerCase() === name.toLocaleLowerCase()), 'A document with this filename already exists in the folder.');
}
function validateFolder(state, projectId, folderId) {
  if (folderId) assert(entity(state, 'folders', folderId).projectId === projectId, 'The folder is in a different project.');
}
function snapshot(state, ids, projectId) {
  return list(ids).map(id => { const d = entity(state, 'documents', id); assert(!d.deletedAt && d.projectId === projectId, 'Choose active documents in this project.'); const v = currentVersion(d); return { documentId: d.id, versionId: v.id, name: d.name, number: d.number, revision: v.label, blobId: v.blobId, hash: v.hash, size: v.size }; });
}
export function createEmptyWorkspace() {
  return {
    schema: SCHEMA_VERSION, id: uid('workspace'), name: 'Civora workspace', revision: 0,
    users: [{ id: 'u-admin', name: 'Alex Morgan', email: 'admin@civora.local', organization: 'Civora Studio', role: 'admin', active: true }],
    projects: [], folders: [], documents: [], comments: [], markups: [], reviews: [], issues: [], transmittals: [], sets: [], savedSearches: [], milestones: [], audit: [],
    explorerViews: [], explorerBookmarks: [],
    groups: [], accessPolicies: [], models: [], clashRuns: [], baselines: [], reviewTemplates: [],
    workflowRules: [], automationPolicies: [], subscriptions: [], notifications: [], automationLedger: [],
    workflows: [{ id: 'wf-standard', name: 'Controlled delivery', states: [...STATES], transitions: [
      { from: 'Work in progress', to: 'Shared', roles: writers, requireReview: false },
      { from: 'Shared', to: 'Work in progress', roles: writers, requireReview: false },
      { from: 'Shared', to: 'Published', roles: managers, requireReview: true },
      { from: 'Published', to: 'Work in progress', roles: managers, requireReview: false },
      { from: 'Published', to: 'Archived', roles: managers, requireReview: false },
      { from: 'Archived', to: 'Work in progress', roles: managers, requireReview: false }
    ] }]
  };
}
/** Pure transactional reducer. Failure never mutates the input workspace. */
export function applyCommand(previous, command, actorId, options = {}) {
  validateWorkspace(previous);
  authorizeCommand(previous, command, actorId);
  const state = copy(previous), user = entity(state, 'users', actorId);
  assert(user.active, 'Your membership is disabled.', 'FORBIDDEN');
  const now = options.now || new Date().toISOString();
  const p = command.payload || {}, type = command.type;
  assert(typeof type === 'string', 'Command type is required.');
  let targetId = p.id || p.documentId || p.projectId || '', summary = '', result = null;
  const project = () => entity(state, 'projects', p.projectId);
  const doc = () => entity(state, 'documents', p.id || p.documentId);
  const stamp = object => { object.modifiedAt = now; object.modifiedBy = user.id; };
  const makeVersion = (file, label, comment) => ({ id: uid('ver'), ...validFile(file), label: required(label, 'Revision label', 30), comment: clean(comment, 2000), createdAt: now, createdBy: user.id });
  switch (type) {
    case 'model.register': {
      roles(user,writers);const d=entity(state,'documents',p.documentId);assert(d.projectId===p.projectId&&!d.deletedAt,'Choose an active document in this project.');const v=p.versionId?d.versions.find(v=>v.id===p.versionId):currentVersion(d);assert(v,'Revision not found.');const transform=p.transform||[1,0,0,0,0,1,0,0,0,0,1,0,0,0,0,1];assert(Array.isArray(transform)&&transform.length===16&&transform.every(Number.isFinite)&&transform[3]===0&&transform[7]===0&&transform[11]===0&&transform[15]===1,'Use an affine 4x4 transform.');
      const item={id:uid('model'),projectId:d.projectId,documentId:d.id,versionId:v.id,name:required(p.name||d.title,'Model name'),transform:[...transform],visible:true,createdAt:now,createdBy:user.id};state.models||=[];state.models.push(item);targetId=result=item.id;summary=`Registered model ${item.name} at revision ${v.label}`;break;
    }
    case 'model.update': {
      roles(user,writers);const m=entity(state,'models',p.id);if('name'in p)m.name=required(p.name,'Model name');if('visible'in p)m.visible=!!p.visible;if('transform'in p){assert(Array.isArray(p.transform)&&p.transform.length===16&&p.transform.every(Number.isFinite)&&p.transform[3]===0&&p.transform[7]===0&&p.transform[11]===0&&p.transform[15]===1,'Invalid affine transform.');m.transform=[...p.transform];}if(p.versionId){assert(entity(state,'documents',m.documentId).versions.some(v=>v.id===p.versionId),'Revision not found.');m.versionId=p.versionId;}summary=`Updated federation model ${m.name}`;break;
    }
    case 'model.delete': {roles(user,writers);const m=entity(state,'models',p.id);state.models=state.models.filter(x=>x.id!==m.id);summary=`Removed model ${m.name} from federation`;break;}
    case 'clash.record': {
      roles(user,['admin','manager','author','reviewer']);project();const documentIds=list(p.documentIds);for(const id of documentIds)assert(entity(state,'documents',id).projectId===p.projectId,'Clash sources must belong to this project.');assert(p.report&&Array.isArray(p.report.results)&&p.report.results.length<=500,'Invalid clash report.');assert(JSON.stringify(p.report).length<=1000000,'Clash report is too large.');const item={id:uid('clash'),projectId:p.projectId,name:required(p.name||'Coordination run','Run name'),documentIds,report:copy(p.report),createdAt:now,createdBy:user.id};state.clashRuns||=[];state.clashRuns.push(item);targetId=result=item.id;summary=`Recorded ${item.report.results.length} coordination findings`;break;
    }
    case 'access.set': {
      const policy=normalizePolicy(state,p);state.accessPolicies||=[];state.accessPolicies=state.accessPolicies.filter(x=>!(x.scope===policy.scope&&x.resourceId===policy.resourceId));state.accessPolicies.push(policy);targetId=policy.resourceId;summary=`Updated ${policy.scope} access policy`;break;
    }
    case 'access.remove': {
      normalizePolicy(state,{...p,inherit:true,entries:[]});state.accessPolicies=(state.accessPolicies||[]).filter(x=>!(x.scope===p.scope&&x.resourceId===p.resourceId));targetId=p.resourceId;summary=`Restored inherited ${p.scope} access`;break;
    }
    case 'group.create': {
      roles(user,['admin']);const members=list(p.members||[],10000);for(const id of members)entity(state,'users',id);const item={id:uid('group'),name:required(p.name,'Group name'),members};state.groups||=[];state.groups.push(item);targetId=result=item.id;summary=`Created access group ${item.name}`;break;
    }
    case 'group.update': {
      roles(user,['admin']);const item=entity(state,'groups',p.id);if('name'in p)item.name=required(p.name,'Group name');if('members'in p){item.members=list(p.members,10000);for(const id of item.members)entity(state,'users',id);}summary=`Updated access group ${item.name}`;break;
    }
    case 'group.delete': {
      roles(user,['admin']);entity(state,'groups',p.id);state.groups=state.groups.filter(g=>g.id!==p.id);for(const policy of state.accessPolicies||[])policy.entries=policy.entries.filter(e=>e.principal!=='group:'+p.id);summary='Removed access group and its grants';break;
    }
    case 'project.create': {
      roles(user, managers);
      const code = required(p.code, 'Project code', 30).toUpperCase();
      assert(!state.projects.some(x => x.code === code), 'Project code already exists.');
      const item = { id: uid('project'), code, name: required(p.name, 'Project name'), client: clean(p.client), description: clean(p.description, 2000), phase: clean(p.phase || 'Design'), status: 'Active', location: clean(p.location), dueDate: date(p.dueDate), workflowId: 'wf-standard', fields: [{ key: 'zone', label: 'Zone / location', type: 'text', required: false }, { key: 'originator', label: 'Originator', type: 'text', required: false }], createdAt: now, createdBy: user.id };
      state.projects.push(item);
      state.accessPolicies ||= []; state.accessPolicies.push({id: `acl-project-${item.id}`,scope:"project",resourceId:item.id,inherit:true,entries:[{principal:`user:${user.id}`,allow:[...PERMISSIONS],deny:[]}]});
      if (p.template !== 'blank') for (const name of ['01 · Project information', '02 · Design development', '03 · Shared coordination', '04 · Published deliverables']) state.folders.push({ id: uid('folder'), name, projectId: item.id, parentId: null });
      targetId = item.id; result = item.id; summary = `Created project ${item.code} · ${item.name}`; break;
    }
    case 'project.update': {
      roles(user, managers); const item = entity(state, 'projects', p.id);
      for (const key of ['name', 'client', 'description', 'phase', 'location']) if (key in p) item[key] = key === 'name' ? required(p[key], 'Project name') : clean(p[key], 2000);
      if ('dueDate' in p) item.dueDate = date(p.dueDate);
      if ('status' in p) { assert(['Active', 'On hold', 'Completed'].includes(p.status), 'Invalid status.'); item.status = p.status; }
      stamp(item); summary = `Updated project ${item.name}`; break;
    }
    case 'project.fields': {
      roles(user, managers); const item = entity(state, 'projects', p.id);
      item.fields = normalizeFields(p.fields);
      if (item.numbering) normalizeNumbering(item, item.numbering);
      item.environmentVersion = (item.environmentVersion || 0) + 1;
      summary = `Updated metadata environment for ${item.name}`; break;
    }
    case 'project.numbering': {
      roles(user, managers); const item = entity(state, 'projects', p.id);
      item.numbering = normalizeNumbering(item, p.numbering, item.numbering || {nextSequence: item.nextDocumentSequence || 1});
      stamp(item); summary = `Updated document numbering for ${item.name}`; break;
    }
    case 'baseline.create': {
      roles(user, writers);
      const baseline = captureBaseline(state, p, user.id, now, uid);
      for (const record of baseline.documents) { assert(canAccess(state,user.id,'read','document',record.documentId), 'Access to every baseline dependency is required.', 'FORBIDDEN'); for(const ref of record.context.references)assert(canAccess(state,user.id,'read','document',ref),'Read access to captured reference metadata is required.','FORBIDDEN'); }
      state.baselines ||= []; state.baselines.push(baseline); targetId = result = baseline.id;
      summary = `Froze baseline ${baseline.name} with ${baseline.documents.length} exact revisions`; break;
    }
    case 'reviewTemplate.save': {
      roles(user, managers); const prj = project(); const existing = p.id ? entity(state,'reviewTemplates',p.id) : null;
      assert(!existing || existing.projectId === prj.id, 'The template belongs to another project.');
      const stages = normalizeReviewStages(p.stages,state,{template:true});
      for(const stage of stages)for(const id of stage.assignees)assert(canAccess(state,id,'read','project',prj.id),'A template reviewer cannot read this project.');
      assert(typeof p.separationOfDuties === 'boolean','Choose the separation-of-duties setting.');
      const item = {id:existing?.id||uid('review-template'),projectId:prj.id,name:required(p.name,'Template name'),stages,separationOfDuties:p.separationOfDuties,createdBy:existing?.createdBy||user.id,createdAt:existing?.createdAt||now,modifiedAt:now};
      state.reviewTemplates ||= []; state.reviewTemplates = state.reviewTemplates.filter(t=>t.id!==item.id); state.reviewTemplates.push(item);
      targetId = result = item.id; summary = `${existing?'Updated':'Created'} review route template ${item.name}`; break;
    }
    case 'reviewTemplate.remove': {
      roles(user,managers); const item=entity(state,'reviewTemplates',p.id);state.reviewTemplates=state.reviewTemplates.filter(t=>t.id!==p.id);
      summary=`Removed review template ${item.name}; existing review routes retained`;break;
    }
    case 'document.bulkUpdate': {
      roles(user,writers);
      assert(p.baseRevision === previous.revision,'The workspace changed since this bulk-edit preview. Preview the changes again.','CONFLICT');
      assert(Array.isArray(p.updates)&&p.updates.length>0&&p.updates.length<=CONTROL_LIMITS.batch,'Choose 1–100 bulk updates.');
      const ids=new Set();let staged=state;
      for(const item of p.updates){
        assert(item&&typeof item.id==='string'&&!ids.has(item.id),'Duplicate or invalid document in the batch.');ids.add(item.id);
        const d=entity(staged,'documents',item.id);assert(d.projectId===p.projectId,'Bulk updates must belong to one project.');
        assert(item.expectedVersionId===currentVersion(d).id,'A document revision changed since preview.','CONFLICT');
        assert(item.patch&&typeof item.patch==='object'&&!Array.isArray(item.patch),'A metadata patch is required.');
        assert(Object.keys(item.patch).every(k=>['title','description','discipline','tags','dueDate','metadata'].includes(k)),'Bulk edits cannot change identity, content, state, or security.');
        for(const k of ['title','description','discipline'])if(k in item.patch)assert(typeof item.patch[k]==='string'&&item.patch[k].length<=4000,'Bulk text values must be text of at most 4,000 characters.');
        if('tags' in item.patch){const values=Array.isArray(item.patch.tags)?item.patch.tags:typeof item.patch.tags==='string'?item.patch.tags.split(','):null;assert(values&&values.length<=30&&values.every(v=>typeof v==='string'&&v.trim().length<=60),'Bulk tags need at most 30 strings of 60 characters.');}
        if('dueDate' in item.patch)assert(typeof item.patch.dueDate==='string'&&(!item.patch.dueDate||/^\d{4}-\d{2}-\d{2}$/.test(item.patch.dueDate)),'Invalid bulk calendar date.');
        staged=applyCommand(staged,{type:'document.update',payload:{...item.patch,id:d.id}},user.id,{now}).state;
      }
      state.documents=staged.documents;result={updated:[...ids]};targetId=p.projectId;
      summary=`Atomically updated metadata on ${ids.size} documents`;break;
    }
    case 'folder.create': {
      roles(user, writers); project(); const parentId = p.parentId || null; validateFolder(state, p.projectId, parentId);
      const name = required(p.name, 'Folder name'); assert(!state.folders.some(f => f.projectId === p.projectId && f.parentId === parentId && f.name.toLowerCase() === name.toLowerCase()), 'Folder name already exists.');
      const item = { id: uid('folder'), name, projectId: p.projectId, parentId }; state.folders.push(item); result = targetId = item.id; summary = `Created folder ${name}`; break;
    }
    case 'folder.update': {
      roles(user, writers); const item = entity(state, 'folders', p.id);
      const parentId = 'parentId' in p ? p.parentId || null : item.parentId;
      validateFolder(state, item.projectId, parentId);
      let parent = parentId; const seen = new Set();
      while (parent) { assert(parent !== item.id && !seen.has(parent), 'A folder cannot contain itself.'); seen.add(parent); parent = entity(state, 'folders', parent).parentId; }
      const name = required(p.name || item.name, 'Folder name');
      assert(!state.folders.some(f => f.id !== item.id && f.projectId === item.projectId && f.parentId === parentId && f.name.toLowerCase() === name.toLowerCase()), 'Folder name already exists.');
      Object.assign(item, { name, parentId }); summary = `Updated folder ${name}`; break;
    }
    case 'folder.delete': {
      roles(user, managers); const item = entity(state, 'folders', p.id);
      assert(!state.folders.some(f => f.parentId === item.id) && !state.documents.some(d => d.folderId === item.id), 'Only empty folders can be deleted. Move documents, including recycled documents, first.');
      state.accessPolicies = (state.accessPolicies||[]).filter(a => !(a.scope==='folder'&&a.resourceId===item.id));
      state.subscriptions=(state.subscriptions||[]).filter(s=>!(s.scope==='folder'&&s.resourceId===item.id));
      state.explorerViews=(state.explorerViews||[]).filter(v=>v.config.folderId!==item.id);
      state.explorerBookmarks=(state.explorerBookmarks||[]).filter(b=>!(b.scope==='folder'&&b.resourceId===item.id));
      state.folders = state.folders.filter(f => f.id !== item.id); summary = `Deleted empty folder ${item.name}`; break;
    }
    case 'document.create': {
      roles(user, writers); const prj = project(); validateFolder(state, p.projectId, p.folderId);
      const name = required(p.name, 'Filename', 240); assert(!/[\\/\x00-\x1f]/.test(name), 'Filename cannot contain separators or control characters.'); uniqueName(state, p.projectId, p.folderId || null, name);
      const metadata = validMetadata(prj, p.metadata);
      const number = allocateDocumentNumber(state,prj,p,metadata);
      const item = { id: uid('doc'), projectId: prj.id, folderId: p.folderId || null, number, name, title: clean(p.title || name), description: clean(p.description, 4000), discipline: clean(p.discipline || 'General', 60), tags: tags(p.tags), metadata, state: 'Work in progress', workflowId: prj.workflowId, dueDate: date(p.dueDate), versions: [makeVersion(p.file, p.revision || 'P01', p.comment || 'Initial issue')], references: [], checkedOutBy: null, checkedOutAt: null, deletedAt: null, legalHold: false, retentionUntil: '', createdAt: now, createdBy: user.id, modifiedAt: now, modifiedBy: user.id };
      state.documents.push(item); result = targetId = item.id; summary = `Added ${item.name}`; break;
    }
    case 'document.update': {
      roles(user, writers); const d = doc(); editable(d, user);
      if ('name' in p) { const name = required(p.name, 'Filename', 240); assert(!/[\\/\x00-\x1f]/.test(name), 'Invalid filename.'); uniqueName(state, d.projectId, d.folderId, name, d.id); d.name = name; }
      if ('number' in p) { const number = required(p.number, 'Document number', 100); const prj=entity(state,'projects',d.projectId);assert(number===d.number||!prj.numbering||prj.numbering.allowManual,'This project uses controlled automatic document numbers.');assert(!state.documents.some(x=>x.id!==d.id&&x.projectId===d.projectId&&x.number.toUpperCase()===number.toUpperCase()),'Document number already exists.');d.number=number; }
      for (const key of ['title', 'description', 'discipline']) if (key in p) d[key] = clean(p[key], 4000);
      if ('tags' in p) d.tags = tags(p.tags);
      if ('metadata' in p) d.metadata = validMetadata(entity(state, 'projects', d.projectId), p.metadata);
      if ('dueDate' in p) d.dueDate = date(p.dueDate);
      stamp(d); summary = `Updated metadata for ${d.name}`; break;
    }
    case 'document.bulkRename': {
      const plan=planDocumentRename(previous,user.id,p);
      for(const row of plan.rows)if(row.changed){const d=entity(state,'documents',row.id);d.name=row.to;stamp(d);}
      result={renamed:plan.rows.filter(r=>r.changed).map(({id,from,to})=>({id,from,to}))};targetId=plan.projectId;
      summary=`Atomically renamed ${result.renamed.length} documents: ${plan.reason}`;break;
    }
    case 'document.bulkCopy': {
      const plan = planDocumentCopy(previous,user.id,p);
      let staged=state; const mapping=new Map(),copied=[];
      for (const item of plan.items) {
        const next=applyCommand(staged,{type:'document.create',payload:item.destination},user.id,{now});
        staged=next.state; mapping.set(item.sourceId,next.result);
        copied.push({sourceId:item.sourceId,sourceVersionId:item.sourceVersionId,id:next.result});
      }
      // These are Civora relationship IDs, not paths embedded in a CAD file.
      for (const item of plan.items) {
        const created=staged.documents.find(d=>d.id===mapping.get(item.sourceId));
        created.references=item.references.map(id=>mapping.get(id));
      }
      state.documents=staged.documents;state.projects=staged.projects;
      result={copied};targetId=plan.projectId;
      summary=`Atomically copied ${copied.length} documents as new Work in progress records: ${plan.reason}`;
      break;
    }
    case 'document.bulkMove': {
      roles(user,writers);
      assert(p.baseRevision===previous.revision,'The workspace changed since the move preview. Preview again.','CONFLICT');
      project(); validateFolder(state,p.projectId,p.folderId);
      assert(Array.isArray(p.items)&&p.items.length>0&&p.items.length<=100,'Choose 1–100 documents to move.');
      const ids=new Set();let staged=state;
      for(const item of p.items){
        assert(item&&typeof item.id==='string'&&!ids.has(item.id),'Duplicate or invalid document in move.');ids.add(item.id);
        const d=entity(staged,'documents',item.id);
        assert(d.projectId===p.projectId,'Bulk moves must stay in one project.');
        assert(item.versionId===currentVersion(d).id&&(item.folderId||null)===d.folderId,'The source changed since preview.','CONFLICT');
        assert(d.folderId!==(p.folderId||null),'Choose a different destination folder.');
        staged=applyCommand(staged,{type:'document.move',payload:{id:d.id,folderId:p.folderId||null}},user.id,{now}).state;
      }
      state.documents=staged.documents;result={moved:[...ids]};targetId=p.projectId;
      summary=`Atomically moved ${ids.size} documents`;break;
    }
    case 'document.move': {
      roles(user, writers); const d = doc(); editable(d, user); validateFolder(state, d.projectId, p.folderId); uniqueName(state, d.projectId, p.folderId || null, d.name, d.id); d.folderId = p.folderId || null; stamp(d); summary = `Moved ${d.name}`; break;
    }
    case 'document.checkout': {
      roles(user, writers); const d = doc(); editable(d, user); assert(d.state === 'Work in progress', 'Return this document to Work in progress before editing content.'); assert(!d.checkedOutBy, 'This document is already checked out.', 'LOCKED'); d.checkedOutBy = user.id; d.checkedOutAt = now; stamp(d); summary = `Checked out ${d.name}`; break;
    }
    case 'document.release': {
      roles(user, writers); const d = doc(); assert(d.checkedOutBy, 'This document is not checked out.'); assert(d.checkedOutBy === user.id || user.role === 'admin', 'Only the owner or an administrator can release this lock.', 'FORBIDDEN'); d.checkedOutBy = null; d.checkedOutAt = null; stamp(d); summary = `Released checkout of ${d.name}`; break;
    }
    case 'document.checkin': {
      roles(user, writers); const d = doc(); editable(d, user, { locked: true }); if (p.baseVersionId !== undefined) assert(p.baseVersionId === currentVersion(d).id, 'The working copy is based on an older revision.', 'CONFLICT'); assert(d.state === 'Work in progress', 'Content revisions require Work in progress.'); const label = required(p.revision, 'Revision label', 30); assert(!d.versions.some(v => v.label === label), 'Use a new, unique revision label.'); d.versions.push(makeVersion(p.file, label, p.comment)); d.checkedOutBy = null; d.checkedOutAt = null; stamp(d); summary = `Checked in ${d.name} · ${label}`; break;
    }
    case 'document.restoreVersion': {
      roles(user, writers); const d = doc(); editable(d, user, { locked: true }); assert(d.state === 'Work in progress', 'Restoring content requires Work in progress.'); const old = d.versions.find(v => v.id === p.versionId); assert(old, 'Revision not found.'); const label = required(p.revision, 'New revision label', 30); assert(!d.versions.some(v => v.label === label), 'Use a new revision label.'); d.versions.push(makeVersion(old, label, `Restored from ${old.label}: ${clean(p.comment)}`)); d.checkedOutBy = null; d.checkedOutAt = null; stamp(d); summary = `Restored ${d.name} from ${old.label} as ${label}`; break;
    }
    case 'document.transition': {
      if(p.baseRevision!==undefined)assert(p.baseRevision===previous.revision,'The transition preview is stale. Preview it again.','CONFLICT');
      const d = doc(); assert(!d.deletedAt && !d.legalHold, 'This document is not available for state changes.'); assert(!d.checkedOutBy, 'Release the checkout before changing state.');
      const flow = entity(state, 'workflows', d.workflowId), transition = flow.transitions.find(t => t.from === d.state && t.to === p.to);
      assert(transition, 'This workflow does not allow that transition.'); roles(user, transition.roles);
      const rules=evaluateWorkflowRules(state,d,user,p.to,p.reason||'');
      assert(!rules.errors.length,rules.errors.join(' '));
      if(rules.hasAssignments){assert(canAccess(state,user.id,'write','document',d.id),'Write permission is required for workflow metadata assignments.','FORBIDDEN');d.metadata=rules.metadata;d.tags=rules.tags;}
      validMetadata(entity(state, 'projects', d.projectId), d.metadata, {defaults:false});
      if (transition.requireReview) assert(state.reviews.some(r => r.status === 'Approved' && reviewDocumentCurrent(state,r,d.id)), 'This exact revision must pass a review before publication.');
      const old = d.state; d.state = p.to; stamp(d); summary = `${d.name}: ${old} → ${d.state}${p.reason ? ` · ${clean(p.reason)}` : ''}`; break;
    }
    case 'document.references': {
      roles(user, writers); const d = doc(); editable(d, user); if(p.baseVersionId!==undefined)assert(p.baseVersionId===currentVersion(d).id,'The source revision changed after reference scanning.','CONFLICT');const refs = list(p.references);
      for (const id of refs) { const ref = entity(state, 'documents', id); assert(!ref.deletedAt && ref.projectId === d.projectId && ref.id !== d.id, 'References must point to other active documents in this project.'); }
      d.references = refs; assert(!referencesOf(state, d.id).includes(d.id), 'Circular references are not allowed.'); stamp(d); summary = `Updated reference graph for ${d.name}`; break;
    }
    case 'document.delete': {
      roles(user, writers); const d = doc(); editable(d, user); assert(!d.checkedOutBy, 'Release the checkout before recycling.'); assert(!d.retentionUntil || d.retentionUntil < now.slice(0, 10), 'The retention period has not expired.'); assert(!state.sets.some(s=>s.locked&&s.documentIds.includes(d.id)), 'A locked document set retains this document. Unlock and remove its membership first.', 'LOCKED'); assert(!state.documents.some(x => !x.deletedAt && x.references.includes(d.id)), 'Another active document references this document. Remove the reference first.'); d.deletedAt = now; stamp(d); summary = `Moved ${d.name} to the recycle bin`; break;
    }
    case 'document.restore': {
      roles(user, writers); const d = doc(); assert(d.deletedAt, 'Document is not recycled.'); uniqueName(state, d.projectId, d.folderId, d.name, d.id); d.deletedAt = null; stamp(d); summary = `Restored ${d.name} from the recycle bin`; break;
    }
    case 'document.retention': {
      roles(user, managers); const d = doc(); d.legalHold = !!p.legalHold; d.retentionUntil = date(p.retentionUntil); stamp(d); summary = `Updated retention for ${d.name} · legal hold ${d.legalHold ? 'on' : 'off'}`; break;
    }
    case 'comment.add': {
      roles(user, ['admin', 'manager', 'author', 'reviewer']); const d = doc(); assert(!d.deletedAt, 'Document is recycled.'); const item = { id: uid('comment'), documentId: d.id, versionId: p.versionId || currentVersion(d).id, text: required(p.text, 'Comment', 6000), by: user.id, createdAt: now, resolved: false }; assert(d.versions.some(v => v.id === item.versionId), 'Revision not found.'); state.comments.push(item); result = item.id; summary = `Commented on ${d.name}`; break;
    }
    case 'comment.resolve': {
      roles(user, ['admin', 'manager', 'author', 'reviewer']); const c = entity(state, 'comments', p.id); c.resolved = !c.resolved; c.resolvedBy = user.id; summary = `${c.resolved ? 'Resolved' : 'Reopened'} a document comment`; break;
    }
    case 'markup.add': {
      roles(user, ['admin', 'manager', 'author', 'reviewer']); const d = doc(); assert(!d.deletedAt, 'Document is recycled.');
      const versionId = p.versionId || currentVersion(d).id; assert(d.versions.some(v => v.id === versionId), 'Revision not found.'); assert(['pin', 'rectangle'].includes(p.tool), 'Unsupported markup tool.');
      assert(Number.isFinite(p.x) && Number.isFinite(p.y), 'Markup coordinates x and y are required.');
      for (const key of ['x', 'y', 'w', 'h']) assert(Number.isFinite(p[key] ?? 0) && (p[key] ?? 0) >= 0 && (p[key] ?? 0) <= 1, 'Invalid normalized markup coordinates.');
      assert(p.x + (p.w || 0) <= 1.00000001 && p.y + (p.h || 0) <= 1.00000001, 'Markup extends outside the drawing.');
      const item = { id: uid('markup'), documentId: d.id, versionId, tool: p.tool, x: p.x, y: p.y, w: p.w || 0, h: p.h || 0, text: required(p.text, 'Markup note', 2000), by: user.id, createdAt: now, resolved: false }; state.markups.push(item); result = item.id; summary = `Added a ${p.tool} markup to ${d.name}`; break;
    }
    case 'markup.resolve': {
      roles(user, ['admin', 'manager', 'author', 'reviewer']); const m = entity(state, 'markups', p.id); m.resolved = !m.resolved; summary = `${m.resolved ? 'Resolved' : 'Reopened'} a markup`; break;
    }
    case 'review.create': {
      roles(user, ['admin', 'manager', 'author', 'reviewer']); project(); const records = p.setId?snapshotDocumentSet(state,user.id,p,{currentOnly:true}):snapshot(state, p.documentIds, p.projectId); assert(records.length, 'Choose at least one document.');
      for (const s of records) assert(!entity(state, 'documents', s.documentId).checkedOutBy, 'Checked-out documents cannot be submitted for review.');
      const template=p.templateId?entity(state,'reviewTemplates',p.templateId):null;assert(!template||template.projectId===p.projectId,'The review template belongs to another project.');
      const routed=!!(p.stages||template), stages=routed?normalizeReviewStages(p.stages||template.stages,state):null;
      const separationOfDuties=routed?(p.separationOfDuties??template?.separationOfDuties??false):false;
      assert(typeof separationOfDuties==='boolean','Invalid separation-of-duties setting.');
      const assignees=routed?[...new Set(stages.flatMap(s=>s.assignees))]:list(p.assignees,50);
      assert(assignees.length,'Choose at least one reviewer.');
      for(const id of assignees){const assignee=entity(state,'users',id);assert(assignee.active&&reviewers.includes(assignee.role),'Reviewers must be active reviewers, managers, or administrators.');assert(canAccess(state,id,'read','project',p.projectId)&&records.every(r=>canAccess(state,id,'review','document',r.documentId)),'Reviewer does not have access to every review document.');
        if(separationOfDuties)assert(id!==user.id&&records.every(r=>entity(state,'documents',r.documentId).versions.find(v=>v.id===r.versionId).createdBy!==id),'Separation of duties excludes the initiator and pinned-revision authors.');}
      if(routed)for(const record of records){const source=entity(state,'documents',record.documentId);validMetadata(entity(state,'projects',source.projectId),source.metadata,{defaults:false});record.context=reviewContext(source);}
      const item={id:uid('review'),projectId:p.projectId,title:required(p.title,'Review title'),documents:records,assignees,dueDate:date(p.dueDate),description:clean(p.description,4000),status:'In review',decisions:[],createdAt:now,createdBy:user.id};
      if(routed)Object.assign(item,{stages:stages.map((stage,i)=>({...stage,status:i===0?'In review':'Pending',...(i===0?{activatedAt:now}:{})})),currentStage:0,separationOfDuties,templateId:template?.id||null,reassignments:[]});
      state.reviews.push(item);result=targetId=item.id;summary=`Started ${routed?`${stages.length}-stage `:''}review ${item.title}`;break;
    }
    case 'review.decide': {
      roles(user,reviewers);const r=entity(state,'reviews',p.id);assert(r.status==='In review','This review is already closed.');
      assert(reviewIsCurrent(state,r),'A reviewed document is checked out, recycled, has changed metadata, or has a newer revision. Cancel this review and create a new one.','CONFLICT');
      for(const record of r.documents)assert(canAccess(state,user.id,'review','document',record.documentId),'Review permission is required for every document.','FORBIDDEN');
      if(r.stages)recordStageDecision(r,p,user,now);
      else{assert(r.assignees.includes(user.id),'Only an assigned reviewer can submit a decision.','FORBIDDEN');assert(['Approved','Changes requested'].includes(p.decision),'Invalid review decision.');assert(!r.decisions.some(d=>d.by===user.id),'You have already submitted a decision.');
        r.decisions.push({by:user.id,decision:p.decision,comment:required(p.comment,'Decision comment',4000),at:now});
        if(p.decision==='Changes requested')r.status='Changes requested';else if(r.decisions.length===r.assignees.length)r.status='Approved';}
      summary=`${p.decision} · ${r.title}`;break;
    }
    case 'review.reassign': {
      roles(user,managers);const r=entity(state,'reviews',p.id),stage=currentReviewStage(r);
      assert(r.status==='In review'&&stage,'Only an active routed review supports reassignment.');
      assert(stage.id===p.stageId,'The active review stage changed.','CONFLICT');
      assert(stage.assignees.includes(p.from)&&!stage.assignees.includes(p.to),'Choose an existing assignee and a new replacement.');
      assert(!r.decisions.some(d=>d.stageId===stage.id&&d.by===p.from),'An assignee with a recorded decision cannot be replaced.');
      const replacement=entity(state,'users',p.to);assert(replacement.active&&reviewers.includes(replacement.role),'Choose an active reviewer, manager, or administrator.');
      assert(canAccess(state,p.to,'read','project',r.projectId)&&r.documents.every(s=>canAccess(state,p.to,'review','document',s.documentId)),'Replacement reviewer cannot access every document.');
      if(r.separationOfDuties)assert(p.to!==r.createdBy&&r.documents.every(s=>entity(state,'documents',s.documentId).versions.find(v=>v.id===s.versionId).createdBy!==p.to),'Replacement violates separation of duties.');
      const reason=required(p.reason,'Reassignment reason',2000);stage.assignees=stage.assignees.map(id=>id===p.from?p.to:id);r.assignees=[...new Set(r.stages.flatMap(s=>s.assignees))];r.reassignments.push({by:user.id,at:now,stageId:stage.id,from:p.from,to:p.to,reason});
      summary=`Reassigned ${stage.name} in ${r.title}: ${reason}`;break;
    }
    case 'review.cancel': { roles(user, managers); const r = entity(state, 'reviews', p.id); assert(r.status === 'In review', 'Only an open review can be cancelled.'); r.status = 'Cancelled'; summary = `Cancelled review ${r.title}`; break; }
    case 'issue.create': {
      roles(user, ['admin', 'manager', 'author', 'reviewer']); project(); if (p.documentId) assert(entity(state, 'documents', p.documentId).projectId === p.projectId, 'Document belongs to another project.'); if (p.assignee) { assert(entity(state, 'users', p.assignee).active, 'Assignee is inactive.'); assert(canAccess(state,p.assignee,'read','project',p.projectId)&&(!p.documentId||canAccess(state,p.assignee,'read','document',p.documentId)),'Assignee does not have access to this issue.'); }
      const kind = p.kind === 'RFI' ? 'RFI' : 'Issue', number = `${kind.toUpperCase()}-${String(state.issues.length + 1).padStart(3, '0')}`;
      assert(['Low', 'Normal', 'High', 'Critical'].includes(p.priority || 'Normal'), 'Invalid priority.');
      const item = { id: uid('issue'), number, projectId: p.projectId, documentId: p.documentId || null, kind, title: required(p.title, 'Title'), description: clean(p.description, 6000), priority: p.priority || 'Normal', status: 'Open', assignee: p.assignee || user.id, dueDate: date(p.dueDate), createdBy: user.id, createdAt: now, modifiedAt: now, responses: [] }; state.issues.push(item); result = targetId = item.id; summary = `Created ${number} · ${item.title}`; break;
    }
    case 'issue.update': {
      roles(user, ['admin', 'manager', 'author', 'reviewer']); const i = entity(state, 'issues', p.id);
      assert(i.assignee === user.id || i.createdBy === user.id || managers.includes(user.role), 'Only the assignee, author, or a manager can update this issue.', 'FORBIDDEN');
      if ('status' in p) { assert(['Open', 'In progress', 'Resolved', 'Closed'].includes(p.status), 'Invalid issue status.'); i.status = p.status; }
      if ('priority' in p) { assert(['Low', 'Normal', 'High', 'Critical'].includes(p.priority), 'Invalid priority.'); i.priority = p.priority; }
      if ('assignee' in p) { assert(entity(state, 'users', p.assignee).active, 'Assignee is inactive.'); assert(canAccess(state,p.assignee,'read','project',i.projectId)&&(!i.documentId||canAccess(state,p.assignee,'read','document',i.documentId)),'Assignee does not have access to this issue.'); i.assignee = p.assignee; }
      if ('dueDate' in p) i.dueDate = date(p.dueDate);
      if (p.response) i.responses.push({ id: uid('response'), text: clean(p.response, 6000), by: user.id, at: now });
      stamp(i); summary = `Updated ${i.number} · ${i.status}`; break;
    }
    case 'transmittal.create': {
      roles(user, managers); project(); const baseline=p.baselineId?entity(state,'baselines',p.baselineId):null;assert(!baseline||baseline.projectId===p.projectId,'Baseline belongs to another project.');assert(!(p.baselineId&&p.setId),'Choose either a baseline or a document set.');const records=p.setId?snapshotDocumentSet(state,user.id,p):baseline?copy(baseline.documents):snapshot(state,p.documentIds,p.projectId); assert(records.length, 'Choose at least one document.'); const recipients = [...new Set(tags(p.recipients).map(email => email.toLowerCase()))]; assert(recipients.length && recipients.every(e => /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(e)), 'Enter valid recipient email addresses.');
      const item = { id: uid('transmittal'), number: `TR-${String(state.transmittals.length + 1).padStart(4, '0')}`, projectId: p.projectId, title: required(p.title, 'Transmittal title'), purpose: clean(p.purpose || 'For information', 200), ...(baseline?{baselineId:baseline.id}:{}), ...(p.setId?{sourceSetId:p.setId,sourceSetVersion:p.expectedSetVersion}:{}), message: clean(p.message, 6000), recipients, dueDate: date(p.dueDate), documents: records, status: 'Draft', createdAt: now, createdBy: user.id, issuedAt: null, acknowledgements: [] }; state.transmittals.push(item); result = targetId = item.id; summary = `Prepared transmittal ${item.number}`; break;
    }
    case 'transmittal.issue': {
      roles(user, managers); const t = entity(state, 'transmittals', p.id); assert(t.status === 'Draft', 'Only draft transmittals can be issued.'); for (const s of t.documents) { const d = entity(state, 'documents', s.documentId); assert(!d.deletedAt && !d.checkedOutBy, 'Cannot issue recycled or checked-out documents.'); }
      t.status = 'Issued'; t.issuedAt = now; t.issuedBy = user.id; summary = `Issued ${t.number} with ${t.documents.length} pinned revisions (delivery is external)`; break;
    }
    case 'transmittal.acknowledge': {
      roles(user, managers); const t = entity(state, 'transmittals', p.id); assert(t.status === 'Issued', 'Only issued transmittals can be acknowledged.'); const recipient = clean(p.recipient).toLowerCase(); assert(t.recipients.some(e => e.toLowerCase() === recipient), 'Recipient is not in this transmittal.'); assert(!t.acknowledgements.some(a => a.recipient === recipient), 'Receipt is already recorded.'); t.acknowledgements.push({ recipient, note: required(p.note, 'Receipt evidence / note', 2000), recordedBy: user.id, at: now }); if (t.acknowledgements.length === t.recipients.length) t.status = 'Acknowledged'; summary = `Recorded external receipt of ${t.number} by ${recipient}`; break;
    }
    case 'search.save': {
      const item = { id: uid('search'), name: required(p.name, 'View name', 80), query: clean(p.query, 500), state: clean(p.state, 80), discipline: clean(p.discipline, 80), projectId: p.projectId || null, userId: user.id }; if (item.projectId) project(); state.savedSearches.push(item); result = targetId = item.id; summary = `Saved view ${item.name}`; break;
    }
    case 'search.delete': { const s = entity(state, 'savedSearches', p.id); assert(s.userId === user.id || user.role === 'admin', 'This view belongs to another member.', 'FORBIDDEN'); state.savedSearches = state.savedSearches.filter(x => x.id !== s.id); summary = `Deleted saved view ${s.name}`; break; }
    case 'milestone.create': { roles(user, managers); project(); const item = { id: uid('milestone'), projectId: p.projectId, title: required(p.title, 'Milestone title'), dueDate: required(date(p.dueDate), 'Due date'), completed: false, createdAt: now }; state.milestones.push(item); result = targetId = item.id; summary = `Created milestone ${item.title}`; break; }
    case 'milestone.toggle': { roles(user, managers); const m = entity(state, 'milestones', p.id); m.completed = !m.completed; summary = `${m.completed ? 'Completed' : 'Reopened'} milestone ${m.title}`; break; }
    case 'user.create': {
      roles(user, ['admin']); const email = required(p.email, 'Email', 200).toLowerCase(); assert(/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email) && !state.users.some(u => u.email === email), 'Enter a valid, unique email.'); assert(ROLES.includes(p.role), 'Invalid role.'); const item = { id: uid('user'), name: required(p.name, 'Name'), email, organization: clean(p.organization), role: p.role, active: true }; state.users.push(item); result = targetId = item.id; summary = `Added member ${item.name}`; break;
    }
    case 'user.update': {
      roles(user, ['admin']); const u = entity(state, 'users', p.id);
      if ('role' in p) { assert(ROLES.includes(p.role), 'Invalid role.'); u.role = p.role; }
      if ('active' in p) u.active = !!p.active;
      if ('name' in p) u.name = required(p.name, 'Name');
      if ('organization' in p) u.organization = clean(p.organization);
      assert(state.users.some(x => x.active && x.role === 'admin'), 'At least one active administrator is required.'); summary = `Updated member ${u.name} · ${u.role}${u.active ? '' : ' · disabled'}`; break;
    }
    case 'workflow.create': {
      roles(user, ['admin']); assert(Array.isArray(p.states) && p.states.length >= 2 && p.states.length <= 12, 'A workflow needs 2–12 states.'); const states = list(p.states, 12); assert(states.every(Boolean) && states.includes('Work in progress'), 'Include the initial Work in progress state.');
      assert(Array.isArray(p.transitions) && p.transitions.length > 0 && p.transitions.length <= 50, 'Enter workflow transitions.'); const transitions = p.transitions.map(t => { assert(states.includes(t.from) && states.includes(t.to) && t.from !== t.to, 'Invalid workflow transition.'); const allowed = list(t.roles, 5); assert(allowed.length && allowed.every(r => ROLES.includes(r) && r !== 'viewer'), 'Choose valid transition roles.'); return { from: t.from, to: t.to, roles: allowed, requireReview: !!t.requireReview }; });
      const item = { id: uid('workflow'), name: required(p.name, 'Workflow name'), states, transitions }; state.workflows.push(item); result = targetId = item.id; summary = `Created workflow ${item.name}`; break;
    }
    case 'project.workflow': { roles(user, ['admin']); const prj = entity(state, 'projects', p.id); entity(state, 'workflows', p.workflowId); prj.workflowId = p.workflowId; summary = `Assigned workflow for future documents in ${prj.name}`; break; }
    default: {const outcome=applyDocumentSetCommand(state,command,user,now)||applyExplorerCommand(state,command,user,now)||applyAutomationCommand(state,command,user,now);assert(outcome,`Unknown command: ${type}`);({result,summary,targetId}=outcome);break;}
  }
  state.revision = previous.revision + 1;
  invalidateAccessCache(state);
  publishCommandNotifications(previous,state,command,result,user.id,now);
  state.audit.push({ id: uid('audit'), sequence: state.revision, commandId: clean(command.id || uid('cmd'), 100), at: now, by: user.id, type, targetId, summary });
  if(type==='document.bulkCopy')state.audit.at(-1).copySources=copy(result.copied);
  if(type==='document.bulkRename')state.audit.at(-1).renameChanges=copy(result.renamed);
  validateWorkspace(state);
  return { state, result };
}
/** Server-owned reconciliation with live policy-owner authorization. No synthetic admin.
 * Empty ticks do not write or advance the optimistic-concurrency revision. */
export function applyScheduledAutomation(previous, now=new Date().toISOString()) {
  validateWorkspace(previous);const state=copy(previous),outcomes=runScheduledAutomation(state,now);
  if(!outcomes.length)return {state:previous,result:[],changed:false};
  state.revision=previous.revision+1;invalidateAccessCache(state);
  state.audit.push({id:uid('audit'),sequence:state.revision,commandId:uid('scheduler'),at:now,by:'system:scheduler',type:'automation.tick',targetId:'',summary:`Reconciled ${outcomes.length} scheduled events; ${outcomes.filter(x=>x.status==='delegated').length} delegated, ${outcomes.filter(x=>x.status==='blocked').length} blocked`});
  validateWorkspace(state);return {state,result:outcomes,changed:true};
}
/** Preview runs the real command reducer and discards its output. No blob writes. */
export function previewDocumentCopy(state,actorId,input) {
  const payload=copy(input); delete payload.expectedRevision;
  payload.baseRevision=state.revision;
  const plan=planDocumentCopy(state,actorId,payload);
  const out=applyCommand(state,{type:'document.bulkCopy',payload},actorId);
  const rows=plan.items.map((item,i)=>{const d=out.state.documents.find(d=>d.id===out.result.copied[i].id);return {
    sourceId:item.sourceId,sourceVersionId:item.sourceVersionId,sourceName:item.sourceName,sourceRevision:item.sourceRevision,
    sourceCheckedOut:item.sourceCheckedOut,historical:item.historical,omittedMetadata:item.omittedMetadata,
    omittedReferences:item.omittedReferences,remappedReferences:item.references.length,
    name:d.name,number:d.number,title:d.title,metadata:d.metadata,state:d.state,revision:currentVersion(d).label,
    hash:currentVersion(d).hash,size:currentVersion(d).size
  };});
  return {allowed:true,sourceRevision:state.revision,payload,rows};
}
export function previewDocumentRename(state,actorId,input) {
  const payload=copy(input);delete payload.expectedRevision;payload.baseRevision=state.revision;
  const plan=planDocumentRename(state,actorId,payload);
  applyCommand(state,{type:'document.bulkRename',payload},actorId);
  return {allowed:true,sourceRevision:state.revision,payload,rows:plan.rows};
}
export function previewDocumentMove(state,actorId,{projectId,folderId=null,documentIds=[]}={}) {
  assert(Array.isArray(documentIds)&&documentIds.length>0&&documentIds.length<=100,'Choose 1–100 documents.');
  const items=documentIds.map(id=>{
    assert(canAccess(state,actorId,'read','document',id),'A source document is not available.','FORBIDDEN');
    const d=entity(state,'documents',id);return {id:d.id,versionId:currentVersion(d).id,folderId:d.folderId};
  });
  const payload={projectId,folderId,items,baseRevision:state.revision};
  applyCommand(state,{type:'document.bulkMove',payload},actorId);
  return {allowed:true,sourceRevision:state.revision,payload};
}
export function previewDocumentTransition(state,actorId,payload) {
  const document=state.documents.find(d=>d.id===payload.id);
  const output=applyCommand(state,{type:'document.transition',payload},actorId);
  const proposed=output.state.documents.find(d=>d.id===payload.id);
  return {allowed:true,documentId:document.id,sourceRevision:state.revision,from:document.state,to:proposed.state,metadata:proposed.metadata,tags:proposed.tags,summary:output.state.audit.at(-1).summary};
}
export function searchDocuments(state, { projectId = '', folderId = '', query = '', state: stateFilter = '', discipline = '', checkedOutBy = '', deleted = false, recursive = true, sort = 'modifiedAt', direction = 'desc' } = {}) {
  const folders = new Set(folderId ? [folderId] : []);
  if (folderId && recursive) { let changed = true; while (changed) { changed = false; for (const f of state.folders) if (folders.has(f.parentId) && !folders.has(f.id)) { folders.add(f.id); changed = true; } } }
  const tokens = [...String(query).matchAll(/(?:([^\s:"]+):)?(?:"([^"]+)"|(\S+))/g)].map(m => ({ key: m[1]?.toLowerCase(), value: (m[2] || m[3]).toLowerCase() }));
  const result = state.documents.filter(d => {
    if (!!d.deletedAt !== !!deleted || projectId && d.projectId !== projectId || folderId && !folders.has(d.folderId) || stateFilter && d.state !== stateFilter || discipline && d.discipline !== discipline || checkedOutBy && d.checkedOutBy !== checkedOutBy) return false;
    const haystack = [d.name, d.number, d.title, d.description, d.discipline, ...d.tags, ...Object.values(d.metadata || {})].join(' ').toLowerCase();
    return tokens.every(({ key, value }) => {
      if (!key) return haystack.includes(value);
      if (key === 'type') return d.name.split('.').pop().toLowerCase() === value;
      if (key === 'tag') return d.tags.some(t => t.toLowerCase().includes(value));
      if (key === 'state') return d.state.toLowerCase().includes(value);
      if (key === 'owner') return userName(state, d.createdBy).toLowerCase().includes(value);
      if (key === 'revision') return currentVersion(d).label.toLowerCase().includes(value);
      return String(d[key] ?? d.metadata?.[key] ?? '').toLowerCase().includes(value);
    });
  });
  const multiplier = direction === 'asc' ? 1 : -1;
  result.sort((a, b) => String(a[sort] || '').localeCompare(String(b[sort] || ''), undefined, { numeric: true }) * multiplier || a.id.localeCompare(b.id));
  return result;
}
export function validateWorkspace(state) {
  if(state&&typeof state==='object')invalidateAccessCache(state);
  assert(!state?.projection?.filtered, 'A filtered workspace cannot be used as an authoritative backup.');
  assert(state && state.schema === SCHEMA_VERSION, 'Unsupported workspace schema.');
  assert(typeof state.name === 'string' && typeof state.id === 'string', 'Invalid workspace identity.');
  assert(Number.isSafeInteger(state.revision) && state.revision >= 0, 'Invalid workspace revision.');
  const collections = ['users', 'projects', 'folders', 'documents', 'comments', 'markups', 'reviews', 'issues', 'transmittals', 'sets', 'savedSearches', 'milestones', 'workflows', 'audit'];
  for (const name of collections) { assert(Array.isArray(state[name]) && state[name].length <= 200000, `Invalid ${name} collection.`); const seen = new Set(); for (const item of state[name]) { assert(item && typeof item.id === 'string' && item.id.length <= 120 && !seen.has(item.id), `Invalid or duplicate ${name} identifier.`); seen.add(item.id); } }
  validateAccessState(state);
  validateControlState(state);
  validateAutomationState(state);
  validateExplorerState(state);
  validateDocumentSets(state);
  const projects = new Set(state.projects.map(p => p.id)), folders = new Map(state.folders.map(f => [f.id, f])), docs = new Map(state.documents.map(d => [d.id, d])), users = new Set(state.users.map(u => u.id)), flows = new Map(state.workflows.map(w => [w.id, w]));
  assert(state.users.some(u => u.role === 'admin' && u.active), 'Workspace requires an administrator.');
  for (const u of state.users) assert(ROLES.includes(u.role) && typeof u.name === 'string' && typeof u.email === 'string', 'Invalid member.');
  for (const prj of state.projects) assert(flows.has(prj.workflowId) && Array.isArray(prj.fields) && typeof prj.name === 'string', 'Invalid project.');
  for (const f of state.folders) {
    assert(projects.has(f.projectId) && (!f.parentId || folders.get(f.parentId)?.projectId === f.projectId), 'Invalid folder parent.'); const seen = new Set([f.id]); let parent = f.parentId;
    while (parent) { assert(!seen.has(parent), 'Folder cycle detected.'); seen.add(parent); parent = folders.get(parent)?.parentId; }
  }
  const string = (v, label) => assert(typeof v === 'string', `Invalid ${label}.`);
  for (const w of state.workflows) {
    string(w.name, 'workflow name');
    assert(Array.isArray(w.states) && w.states.includes('Work in progress') && w.states.every(x => typeof x === 'string') && new Set(w.states).size === w.states.length, 'Invalid workflow states.');
    assert(Array.isArray(w.transitions) && w.transitions.every(t => w.states.includes(t.from) && w.states.includes(t.to) && t.from !== t.to && Array.isArray(t.roles) && t.roles.length && t.roles.every(r => ROLES.includes(r) && r !== 'viewer') && typeof t.requireReview === 'boolean'), 'Invalid workflow transitions.');
  }
  for (const prj of state.projects) {
    string(prj.code, 'project code');
    const seen = new Set();
    for (const f of prj.fields) { assert(f && typeof f.key === 'string' && /^[a-z][a-z0-9_]*$/.test(f.key) && !['constructor','prototype','__proto__'].includes(f.key) && !seen.has(f.key) && typeof f.label === 'string' && ['text','date','number','integer','choice','boolean'].includes(f.type) && typeof f.required === 'boolean', 'Invalid project metadata field.'); seen.add(f.key); }
  }
  for (const f of state.folders) string(f.name, 'folder name');
  for (const r of state.reviews) assert(typeof r.title === 'string' && ['In review','Approved','Changes requested','Cancelled'].includes(r.status) && Array.isArray(r.assignees) && r.assignees.every(id => users.has(id)) && Array.isArray(r.decisions) && r.decisions.every(d => r.assignees.includes(d.by) && typeof d.comment === 'string' && ['Approved','Changes requested'].includes(d.decision)), 'Invalid review details.');
  for (const t of state.transmittals) assert(typeof t.title === 'string' && typeof t.number === 'string' && typeof t.message === 'string' && typeof t.purpose === 'string' && Array.isArray(t.recipients) && t.recipients.every(r => typeof r === 'string') && Array.isArray(t.acknowledgements) && t.acknowledgements.every(a => typeof a.recipient === 'string' && typeof a.note === 'string') && ['Draft','Issued','Acknowledged'].includes(t.status), 'Invalid transmittal details.');
  for (const i of state.issues) assert(typeof i.title === 'string' && typeof i.number === 'string' && ['Issue','RFI'].includes(i.kind) && ['Low','Normal','High','Critical'].includes(i.priority) && ['Open','In progress','Resolved','Closed'].includes(i.status) && Array.isArray(i.responses) && i.responses.every(r => typeof r.text === 'string') && users.has(i.assignee), 'Invalid issue details.');
  for (const c of state.comments) assert(typeof c.text === 'string' && users.has(c.by), 'Invalid comment details.');
  for (const m of state.markups) assert(typeof m.text === 'string' && ['pin','rectangle'].includes(m.tool) && [m.x,m.y,m.w,m.h].every(n => Number.isFinite(n) && n >= 0 && n <= 1), 'Invalid markup details.');
  for (const v of state.savedSearches) assert(typeof v.name === 'string' && typeof v.query === 'string' && users.has(v.userId), 'Invalid saved search.');
  for (const a of state.audit) assert(typeof a.summary === 'string' && typeof a.at === 'string' && !Number.isNaN(Date.parse(a.at)) && typeof a.type === 'string' && Number.isSafeInteger(a.sequence), 'Invalid audit record.');
  const versionIds = new Set();
  for (const d of state.documents) {
    assert(projects.has(d.projectId) && (!d.folderId || folders.get(d.folderId)?.projectId === d.projectId), 'Invalid document location.');
    assert(typeof d.name === 'string' && typeof d.title === 'string' && typeof d.description === 'string' && typeof d.discipline === 'string' && typeof d.number === 'string' && Array.isArray(d.tags) && d.tags.every(t => typeof t === 'string') && d.metadata && typeof d.metadata === 'object', 'Invalid document metadata.');
    assert(flows.get(d.workflowId)?.states.includes(d.state) && Array.isArray(d.versions) && d.versions.length > 0, 'Invalid document workflow or revisions.');
    assert(!d.checkedOutBy || users.has(d.checkedOutBy), 'Invalid checkout owner.');
    const labels = new Set(); for (const v of d.versions) { validFile(v); assert(typeof v.id === 'string' && !versionIds.has(v.id) && typeof v.label === 'string' && !labels.has(v.label), 'Invalid or duplicate revision.'); versionIds.add(v.id); labels.add(v.label); }
    assert(Array.isArray(d.references) && d.references.every(r => docs.get(r)?.projectId === d.projectId && r !== d.id), 'Invalid document reference.');
  }
  // Iterative topological check, including disconnected components.
  const indegree = new Map(state.documents.map(d => [d.id, 0])); for (const d of state.documents) for (const r of d.references) indegree.set(r, indegree.get(r) + 1);
  const queue = [...indegree].filter(([, n]) => n === 0).map(([id]) => id); let cursor = 0;
  while (cursor < queue.length) for (const r of docs.get(queue[cursor++]).references) { indegree.set(r, indegree.get(r) - 1); if (indegree.get(r) === 0) queue.push(r); }
  assert(cursor === docs.size, 'Document reference cycle detected.');
  for (const r of [...state.reviews, ...state.transmittals]) { assert(projects.has(r.projectId) && Array.isArray(r.documents), 'Invalid delivery record.'); for (const s of r.documents) { const d = docs.get(s.documentId), v = d?.versions.find(x => x.id === s.versionId); assert(d?.projectId === r.projectId && v && v.blobId === s.blobId && v.hash === s.hash && v.label === s.revision && v.size === s.size && typeof s.name === 'string', 'Broken pinned revision.'); } }
  for (const c of [...state.comments, ...state.markups]) assert(docs.get(c.documentId)?.versions.some(v => v.id === c.versionId), 'Broken comment or markup revision.');
  for (const s of state.sets) assert(projects.has(s.projectId) && Array.isArray(s.documentIds) && s.documentIds.every(id => docs.get(id)?.projectId === s.projectId), 'Invalid document set.');
  for (const i of state.issues) assert(projects.has(i.projectId) && (!i.documentId || docs.get(i.documentId)?.projectId === i.projectId), 'Invalid issue reference.');
  for(const m of state.models||[])assert(typeof m.id==='string'&&typeof m.name==='string'&&projects.has(m.projectId)&&docs.get(m.documentId)?.projectId===m.projectId&&docs.get(m.documentId).versions.some(v=>v.id===m.versionId)&&Array.isArray(m.transform)&&m.transform.length===16&&m.transform.every(Number.isFinite),'Invalid model registration.');
  for(const r of state.clashRuns||[])assert(typeof r.id==='string'&&projects.has(r.projectId)&&Array.isArray(r.documentIds)&&r.documentIds.every(id=>docs.get(id)?.projectId===r.projectId)&&r.report&&Array.isArray(r.report.results)&&r.report.results.length<=500,'Invalid clash report.');
  for (const m of state.milestones) assert(projects.has(m.projectId), 'Invalid milestone.');
  return true;
}
export function csv(rows, columns) {
  columns = columns.map(c => typeof c === 'string' ? { label: c, value: c } : c);
  const cell = value => { let v = String(value ?? ''); if (/^[=+\-@\t\r]/.test(v)) v = "'" + v; return `"${v.replaceAll('"', '""')}"`; };
  return '\uFEFF' + [columns.map(c => cell(c.label)).join(','), ...rows.map(r => columns.map(c => cell(typeof c.value === 'function' ? c.value(r) : r[c.value])).join(','))].join('\r\n');
}
