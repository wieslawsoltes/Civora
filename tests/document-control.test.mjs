import test from 'node:test';
import assert from 'node:assert/strict';
import { fixture, makeEngine } from './support.mjs';
import { applyCommand, validateWorkspace, currentVersion } from '../packages/core/index.js';
import { projectWorkspace } from '../packages/access/index.js';
import { prepareFile, exportBackup, verifyBackup } from '../packages/storage/index.js';
import { normalizeFields, validateMetadata, metadataIssues, normalizeNumbering, formatDocumentNumber, compareBaselines, liveBaseline, pendingReviewers, reviewIsCurrent } from '../packages/document-control/index.js';
import { metadataRegisterCSV, parseRegisterCSV, previewMetadataRegister } from '../packages/document-control/register.js';
import { exportBaselineArchive } from '../packages/document-control/archive.js';
import { scanReferences, resolveReferenceFindings } from '../packages/document-control/references.js';
const doc = (f, id = f.doc) => f.state.documents.find(d => d.id === id);
const project = f => f.state.projects.find(p => p.id === f.project);
const baseline = (f, extra = {}) => f.run('baseline.create', { projectId: f.project, name: 'Design freeze', documentIds: [f.doc], includeReferences: true, ...extra });
const stage = (ids, name = 'Technical check', quorum = ids.length) => ({ name, assignees: ids, quorum, dueDate: '' });
function grantReview(f) { f.grant('project', f.project, '*'); }
function routed(f, extra = {}) { return f.run('review.create', { projectId: f.project, title: 'Controlled review', documentIds: [f.doc], stages: [stage([f.reviewer]), stage([f.manager], 'Approval')], ...extra }); }
function decision(f, id, by, stageId = 'stage-1', value = 'Approved') { return f.run('review.decide', { id, stageId, decision: value, comment: 'Checked against the frozen source.' }, by); }
async function checkin(f, id = f.doc, content = 'A changed file') {
  f.run('document.checkout', { id }); const file = await prepareFile(new Blob([content], { type: 'text/plain' }));
  f.files.set(file.descriptor.hash, file.blob); f.run('document.checkin', { id, revision: 'P02', file: file.descriptor });
}
function batch(f, patches) { return { projectId: f.project, baseRevision: f.state.revision, updates: patches.map(([id, patch]) => ({ id, expectedVersionId: currentVersion(doc(f, id)).id, patch })) }; }

test('controlled metadata validates choices, defaults, booleans, integers and numeric bounds', () => {
  const fields = normalizeFields([{key:'zone',label:'Zone',type:'choice',required:true,options:['N','S'],defaultValue:'N'}, {key:'level',label:'Level',type:'integer',required:false,min:-2,max:20}, {key:'ready',label:'Ready',type:'boolean',required:true,defaultValue:false}]);
  assert.deepEqual(validateMetadata({fields},{level:2}),{zone:'N',level:'2',ready:'false'});
  assert.throws(()=>validateMetadata({fields},{zone:'E'}),/allowed option/);
  assert.throws(()=>validateMetadata({fields},{level:2.5}),/integer/);
  assert.throws(()=>validateMetadata({fields},{level:21}),/at most/);
  assert.throws(()=>validateMetadata({fields},{ready:'yes'}),/true or false/);
  assert.equal(metadataIssues({fields},{}).length,2);
});
test('field formats, invalid defaults, long values and dangerous keys are rejected', () => {
  for(const input of [{key:'constructor',type:'text'}, {key:'bad',type:'choice',options:['N','N']}, {key:'bad',type:'integer',defaultValue:'hello'}])assert.throws(()=>normalizeFields([{label:'Bad',required:false,...input}]));
  const fields=normalizeFields([{key:'code',label:'Code',type:'text',format:'code',maxLength:4}]);
  assert.throws(()=>validateMetadata({fields},{code:'AB CD'}));assert.throws(()=>validateMetadata({fields},{code:'A B'}),/code without spaces/);
  assert.throws(()=>validateMetadata({fields},{code:{value:'A'}}),/scalar/);
});
test('new schema flags legacy metadata without destroying or silently migrating it',async()=>{
  const f=await fixture();f.run('project.fields',{id:f.project,fields:[{key:'status',label:'Status',type:'choice',required:true,options:['DRAFT','FINAL']}]});
  assert.equal(metadataIssues(project(f),doc(f).metadata).length,1);assert.equal(doc(f).metadata.zone,'');
  assert.throws(()=>f.run('document.transition',{id:f.doc,to:'Shared'}),/Status is required/);
  f.run('document.update',{id:f.doc,metadata:{status:'DRAFT'}});f.run('document.transition',{id:f.doc,to:'Shared'});assert.equal(doc(f).state,'Shared');
});
test('automatic document numbering is transactional, monotonic, metadata-aware and unique',async()=>{
  const f=await fixture();f.run('project.fields',{id:f.project,fields:[{key:'zone',label:'Zone',type:'text',required:true,defaultValue:'N'}]});
  f.run('project.numbering',{id:f.project,numbering:{pattern:'{project}-{meta:zone}-{seq:3}',nextSequence:10,allowManual:false}});
  const file=await prepareFile(new Blob(['numbered']));
  const a=f.run('document.create',{projectId:f.project,name:'new-a.txt',file:file.descriptor}),b=f.run('document.create',{projectId:f.project,name:'new-b.txt',file:file.descriptor});
  assert.equal(doc(f,a).number,'ACL-N-010');assert.equal(doc(f,b).number,'ACL-N-011');assert.equal(project(f).numbering.nextSequence,12);
  const before=structuredClone(f.state);assert.throws(()=>f.run('document.create',{projectId:f.project,name:'new-a.txt',file:file.descriptor}));assert.deepEqual(f.state,before);
  assert.throws(()=>f.run('document.update',{id:a,number:'MANUAL'}),/controlled/);
  assert.throws(()=>f.run('project.numbering',{id:f.project,numbering:{...project(f).numbering,nextSequence:1}}),/backwards/);
});
test('default numbering skips manual collisions, including recycled documents',async()=>{
  const f=await fixture();await f.add('manual.txt',{number:'ACL-00001'});const file=await prepareFile(new Blob(['next']));
  const id=f.run('document.create',{projectId:f.project,name:'next.txt',file:file.descriptor});assert.equal(doc(f,id).number,'ACL-00002');
  assert.throws(()=>f.run('document.update',{id,number:'acl-00001'}),/already exists/);
});
test('invalid placeholders and missing numbering metadata are rejected safely',()=>{
  const p={code:'P',fields:[]};for(const pattern of ['{project}', '{seq:3}-{seq:4}', '{seq:3}-{unknown}', '../{seq:2}', '{seq:2'])assert.throws(()=>normalizeNumbering(p,{pattern,nextSequence:1,allowManual:false}));
  assert.throws(()=>formatDocumentNumber({...p,numbering:{pattern:'{meta:missing}-{seq:3}'}},{metadata:{}},1),/missing/);
});
test('used numbering metadata fields cannot be silently removed',async()=>{
  const f=await fixture();f.run('project.numbering',{id:f.project,numbering:{pattern:'{meta:zone}-{seq:3}',allowManual:true,nextSequence:1}});
  assert.throws(()=>f.run('project.fields',{id:f.project,fields:[]}),/Unknown numbering placeholder/);
});
test('author cannot change project standards or route templates without management authority',async()=>{
  const f=await fixture();f.grant('project',f.project,'user:'+f.author,['read','write']);
  assert.throws(()=>f.run('project.numbering',{id:f.project,numbering:{pattern:'{seq:3}',nextSequence:1,allowManual:true}},f.author),/permission|permitted|action|role/i);
  assert.throws(()=>f.run('reviewTemplate.save',{projectId:f.project,name:'Escalation',stages:[stage(['u-admin'])],separationOfDuties:false},f.author));
});
test('bulk metadata edits commit exactly one revision and one audit event',async()=>{
  const f=await fixture(),b=await f.add('second.txt'),prior=structuredClone(f.state);
  const out=f.run('document.bulkUpdate',batch(f,[[f.doc,{title:'One'}],[b,{title:'Two'}]]));
  assert.deepEqual(out.updated,[f.doc,b]);assert.equal(f.state.revision,prior.revision+1);assert.equal(f.state.audit.length,prior.audit.length+1);assert.equal(doc(f,b).title,'Two');
});
test('bulk failure rolls back earlier edits and does not mutate input',async()=>{
  const f=await fixture(),b=await f.add('second.txt');f.run('document.checkout',{id:b});f.run('user.create',{name:'Other',email:'another@example.test',role:'author'});grantReview(f);
  const before=structuredClone(f.state);assert.throws(()=>f.run('document.bulkUpdate',batch(f,[[f.doc,{title:'Must roll back'}],[b,{title:'Locked'}]]),f.author),/checked out/);assert.deepEqual(f.state,before);
});
test('bulk rejects stale previews, duplicate IDs, forged patches and cross-project items',async()=>{
  const f=await fixture(),p=batch(f,[[f.doc,{title:'New'}]]);f.run('document.update',{id:f.doc,title:'Elsewhere'});assert.throws(()=>f.run('document.bulkUpdate',p),/changed since/);
  assert.throws(()=>f.run('document.bulkUpdate',batch(f,[[f.doc,{title:'A'}],[f.doc,{title:'B'}]])),/Duplicate/);
  assert.throws(()=>f.run('document.bulkUpdate',batch(f,[[f.doc,{legalHold:false}]])),/security/);
  assert.throws(()=>f.run('document.bulkUpdate',batch(f,[[f.hidden,{title:'No'}]])),/one project/);
});
test('one denied document blocks the entire bulk transaction',async()=>{
  const f=await fixture(),b=await f.add('second.txt');grantReview(f);f.grant('document',b,'user:'+f.author,[],['write']);const before=structuredClone(f.state);
  assert.throws(()=>f.run('document.bulkUpdate',batch(f,[[f.doc,{title:'No'}],[b,{title:'No'}]]),f.author));assert.deepEqual(f.state,before);
});
test('CSV round-trip is Unicode-safe and preserves dangerous formula prefixes as data',async()=>{
  const f=await fixture();f.run('document.update',{id:f.doc,title:'=SUM(1,2)',description:"'quoted\nŁódź, detail \"A\"",tags:['a,b','中文']});
  const source=metadataRegisterCSV(f.state,f.project,[f.doc]);assert.ok(source.includes("'=SUM"));const parsed=parseRegisterCSV(source);assert.equal(parsed.rows[0].title,'=SUM(1,2)');assert.equal(parsed.rows[0].description,doc(f).description);
  assert.equal(previewMetadataRegister(f.state,f.project,source).changes.length,0);
  const altered=source.replace("'=SUM(1,2)",'Changed, correctly');const preview=previewMetadataRegister(f.state,f.project,altered);f.run('document.bulkUpdate',preview.payload);assert.equal(doc(f).title,'Changed, correctly');
});
test('CSV rejects malformed quotes, duplicate headers, protected changes and stale exports',async()=>{
  for(const source of ['a,a\nx,y','a\n"unterminated','a\n"x"trailing','a,b\nx'])assert.throws(()=>parseRegisterCSV(source));
  const f=await fixture(),source=metadataRegisterCSV(f.state,f.project,[f.doc]);assert.throws(()=>previewMetadataRegister(f.state,f.project,source.replace(doc(f).number,'CHANGED')),/read-only/);
  f.run('document.update',{id:f.doc,title:'Changed'});assert.throws(()=>previewMetadataRegister(f.state,f.project,source),/changed since export/);
});
test('baseline captures transitive dependencies, original metadata and immutable revisions',async()=>{
  const f=await fixture(),b=await f.add('b.txt'),c=await f.add('c.txt');f.run('document.references',{id:f.doc,references:[b]});f.run('document.references',{id:b,references:[c]});
  const id=baseline(f),frozen=structuredClone(f.state.baselines[0]);assert.deepEqual(frozen.documents.map(s=>s.documentId),[f.doc,b,c]);
  await checkin(f);f.run('document.update',{id:f.doc,title:'Renamed context'});assert.deepEqual(f.state.baselines.find(b=>b.id===id),frozen);
  const diff=compareBaselines(frozen,liveBaseline(f.state,frozen));assert.equal(diff.find(x=>x.documentId===f.doc).status,'Content changed');assert.ok(diff.find(x=>x.documentId===f.doc).changedFields.includes('title'));
});
test('baseline comparison distinguishes metadata, added and removed dependencies',async()=>{
  const f=await fixture(),b=await f.add('b.txt'),c=await f.add('c.txt');f.run('document.references',{id:f.doc,references:[b]});baseline(f);const frozen=f.state.baselines[0];
  f.run('document.references',{id:f.doc,references:[c]});f.run('document.update',{id:f.doc,description:'Changed metadata'});
  const diff=compareBaselines(frozen,liveBaseline(f.state,frozen));assert.equal(diff.find(x=>x.documentId===b).status,'Removed');assert.equal(diff.find(x=>x.documentId===c).status,'Added');assert.equal(diff.find(x=>x.documentId===f.doc).status,'Metadata changed');
});
test('baseline with recycled root compares as removed rather than silently retaining it',async()=>{
  const f=await fixture();baseline(f);f.run('document.delete',{id:f.doc});assert.equal(compareBaselines(f.state.baselines[0],liveBaseline(f.state,f.state.baselines[0]))[0].status,'Removed');
});
test('baseline creation rejects checkouts and denied dependencies transactionally',async()=>{
  const f=await fixture(),b=await f.add('b.txt');f.run('document.references',{id:f.doc,references:[b]});grantReview(f);f.grant('document',b,'user:'+f.author,[],['read']);
  assert.throws(()=>f.run('baseline.create',{projectId:f.project,name:'Unauthorized',includeReferences:true,documentIds:[f.doc]},f.author));
  f.run('document.checkout',{id:f.doc});assert.throws(()=>baseline(f),/checkout/);assert.equal(f.state.baselines.length,0);
});
test('baseline projections do not leak hidden dependency snapshots or their names',async()=>{
  const f=await fixture(),b=await f.add('secret-dependency.txt');f.run('document.references',{id:f.doc,references:[b]});baseline(f);grantReview(f);
  assert.equal(projectWorkspace(f.state,f.viewer).baselines.length,1);f.grant('document',b,'user:'+f.viewer,[],['read']);
  const view=projectWorkspace(f.state,f.viewer);assert.equal(view.baselines.length,0);assert.ok(!JSON.stringify(view).includes('secret-dependency.txt'));
});
test('baseline export verifies original bytes, current access and corruption',async()=>{
  const f=await fixture();baseline(f);const original=doc(f).versions[0];await checkin(f);const engine=await makeEngine(f.state,f.files),result=await exportBaselineArchive(f.state,f.state.baselines[0],engine.repository,'u-admin');
  assert.equal(result.manifest.baseline.documents[0].hash,original.hash);assert.equal(new DataView(await result.zip.arrayBuffer()).getUint32(0,true),0x04034b50);
  engine.repository.files.set(original.hash,new Blob(['corrupt']));await assert.rejects(()=>exportBaselineArchive(f.state,f.state.baselines[0],engine.repository,'u-admin'),/verification/);
  grantReview(f);f.grant('document',f.doc,'user:'+f.viewer,[],['download']);await assert.rejects(()=>exportBaselineArchive(f.state,f.state.baselines[0],engine.repository,f.viewer),/Download permission/);
});
test('baseline archive rejects oversized exports and cancelled transfers',async()=>{
  const f=await fixture();baseline(f);const engine=await makeEngine(f.state,f.files);
  await assert.rejects(()=>exportBaselineArchive(f.state,f.state.baselines[0],engine.repository,'u-admin',{maxBytes:1}),/limit/);
  const controller=new AbortController();controller.abort();await assert.rejects(()=>exportBaselineArchive(f.state,f.state.baselines[0],engine.repository,'u-admin',{signal:controller.signal}));
});
test('baseline-backed transmittal keeps old revisions instead of taking latest content',async()=>{
  const f=await fixture(),id=baseline(f),original=doc(f).versions[0].id;await checkin(f);
  const transmit=f.run('transmittal.create',{projectId:f.project,baselineId:id,title:'Frozen issue',recipients:['external@example.test']});const t=f.state.transmittals.find(t=>t.id===transmit);
  assert.equal(t.baselineId,id);assert.equal(t.documents[0].versionId,original);f.run('transmittal.issue',{id:transmit});assert.equal(f.state.transmittals[0].status,'Issued');
});
test('baseline-backed transmittal cannot bypass download/share permissions',async()=>{
  const f=await fixture(),id=baseline(f);grantReview(f);f.grant('document',f.doc,'user:'+f.manager,[],['download']);
  assert.throws(()=>f.run('transmittal.create',{projectId:f.project,baselineId:id,title:'No',recipients:['external@example.test']},f.manager));
});
test('baseline backup validation rejects tampered pinned hashes and missing closure',async()=>{
  const f=await fixture(),b=await f.add('b.txt');f.run('document.references',{id:f.doc,references:[b]});baseline(f);const bad=structuredClone(f.state);bad.baselines[0].documents[0].hash='0'.repeat(64);assert.throws(()=>validateWorkspace(bad),/Broken baseline/);
  const broken=structuredClone(f.state);broken.baselines[0].documents.pop();assert.throws(()=>validateWorkspace(broken),/closure/);
});
test('sequential approval does not permit future-stage or repeated decisions',async()=>{
  const f=await fixture();grantReview(f);const id=routed(f);assert.deepEqual(pendingReviewers(f.state.reviews[0]),[f.reviewer]);
  assert.throws(()=>decision(f,id,f.manager,'stage-2'),/stage changed/);decision(f,id,f.reviewer);assert.deepEqual(pendingReviewers(f.state.reviews[0]),[f.manager]);
  assert.throws(()=>decision(f,id,f.reviewer),/stage changed/);decision(f,id,f.manager,'stage-2');assert.equal(f.state.reviews[0].status,'Approved');
});
test('quorum approval advances a stage without counting future or duplicate reviewers',async()=>{
  const f=await fixture();grantReview(f);const id=routed(f,{stages:[stage([f.reviewer,f.manager], 'Parallel check',1),stage(['u-admin'],'Release',1)]});
  decision(f,id,f.reviewer);assert.equal(f.state.reviews[0].currentStage,1);assert.throws(()=>decision(f,id,f.manager),/stage changed/);decision(f,id,'u-admin','stage-2');assert.equal(f.state.reviews[0].status,'Approved');
});
test('the same reviewer can independently decide at multiple stages',async()=>{
  const f=await fixture();grantReview(f);const id=routed(f,{stages:[stage([f.reviewer]),stage([f.reviewer],'Final')]});decision(f,id,f.reviewer);decision(f,id,f.reviewer,'stage-2');assert.equal(f.state.reviews[0].decisions.length,2);
});
test('changes requested stops route progression and preserves evidence',async()=>{
  const f=await fixture();grantReview(f);const id=routed(f);decision(f,id,f.reviewer,'stage-1','Changes requested');assert.equal(f.state.reviews[0].stages[1].status,'Pending');assert.throws(()=>decision(f,id,f.manager,'stage-2'),/closed/);assert.equal(f.state.reviews[0].decisions[0].comment,'Checked against the frozen source.');
});
test('review decisions reject changed files, metadata and held checkouts',async()=>{
  for(const change of ['content','metadata','checkout']){const f=await fixture();grantReview(f);const id=routed(f);if(change==='content')await checkin(f);else if(change==='metadata')f.run('document.update',{id:f.doc,title:'Changed'});else f.run('document.checkout',{id:f.doc});assert.equal(reviewIsCurrent(f.state,f.state.reviews[0]),false);assert.throws(()=>decision(f,id,f.reviewer),/changed metadata|newer revision/);}
});
test('publication does not reuse an approval after metadata changes',async()=>{
  const f=await fixture();grantReview(f);const id=routed(f);decision(f,id,f.reviewer);decision(f,id,f.manager,'stage-2');f.run('document.transition',{id:f.doc,to:'Shared'});f.run('document.update',{id:f.doc,title:'Unreviewed title'});assert.throws(()=>f.run('document.transition',{id:f.doc,to:'Published'}),/exact revision/);
});
test('unchanged routed approvals pass the existing publication gate',async()=>{
  const f=await fixture();grantReview(f);const id=routed(f);decision(f,id,f.reviewer);decision(f,id,f.manager,'stage-2');f.run('document.transition',{id:f.doc,to:'Shared'});f.run('document.transition',{id:f.doc,to:'Published'});assert.equal(doc(f).state,'Published');
});
test('separation of duties excludes initiators and revision authors',async()=>{
  const f=await fixture();grantReview(f);assert.throws(()=>routed(f,{stages:[stage(['u-admin'])],separationOfDuties:true}),/Separation of duties/);
  const id=routed(f,{separationOfDuties:true});assert.ok(id);assert.throws(()=>f.run('review.reassign',{id,stageId:'stage-1',from:f.reviewer,to:'u-admin',reason:'No'}),/separation of duties/i);
});
test('permission revocation blocks a previously assigned reviewer',async()=>{
  const f=await fixture();grantReview(f);const id=routed(f);f.grant('document',f.doc,'user:'+f.reviewer,[],['review']);assert.throws(()=>decision(f,id,f.reviewer));assert.equal(f.state.reviews[0].decisions.length,0);
});
test('manager reassignment records a reason and cannot rewrite a recorded vote',async()=>{
  const f=await fixture();grantReview(f);const id=routed(f,{stages:[stage([f.reviewer,f.manager],'Check',2)]});decision(f,id,f.reviewer);
  assert.throws(()=>f.run('review.reassign',{id,stageId:'stage-1',from:f.reviewer,to:'u-admin',reason:'Cannot erase'}),/recorded decision/);
  f.run('review.reassign',{id,stageId:'stage-1',from:f.manager,to:'u-admin',reason:'Covering planned absence'});decision(f,id,'u-admin');assert.equal(f.state.reviews[0].status,'Approved');assert.equal(f.state.reviews[0].reassignments[0].reason,'Covering planned absence');
});
test('template changes do not rewrite existing route definitions',async()=>{
  const f=await fixture();grantReview(f);const template=f.run('reviewTemplate.save',{projectId:f.project,name:'Standard route',stages:[stage([f.reviewer])],separationOfDuties:true});
  const id=f.run('review.create',{projectId:f.project,templateId:template,title:'From template',documentIds:[f.doc]});f.run('reviewTemplate.save',{id:template,projectId:f.project,name:'Changed route',stages:[stage([f.manager])],separationOfDuties:false});
  assert.deepEqual(f.state.reviews.find(r=>r.id===id).stages[0].assignees,[f.reviewer]);f.run('reviewTemplate.remove',{id:template});assert.equal(f.state.reviews[0].stages.length,1);
});
test('tampered route approvals and duplicate votes are rejected on backup validation',async()=>{
  const f=await fixture();grantReview(f);routed(f);const bad=structuredClone(f.state);bad.reviews[0].status='Approved';assert.throws(()=>validateWorkspace(bad),/Unfinished/);
  decision(f,f.state.reviews[0].id,f.reviewer);const duplicate=structuredClone(f.state);duplicate.reviews[0].decisions.push({...duplicate.reviews[0].decisions[0]});assert.throws(()=>validateWorkspace(duplicate),/duplicate stage decision/);
});
test('ASCII DXF discovery finds xrefs, raster images and underlays, not ordinary blocks',()=>{
  const result=scanReferences('sheet.dxf','0\nSECTION\n2\nBLOCKS\n0\nBLOCK\n2\nSITE\n70\n4\n1\n../refs/site.dxf\n0\nBLOCK\n2\nNORMAL\n70\n0\n1\nnot-a-reference\n0\nIMAGEDEF\n1\nmap.png\n0\nPDFDEFINITION\n1\nreport.pdf\n0\nEOF\n');
  assert.deepEqual(result.findings.map(f=>f.path),['../refs/site.dxf','map.png','report.pdf']);assert.throws(()=>scanReferences('a.dwg','binary'),/supports/);assert.throws(()=>scanReferences('a.dxf','0\nBLOCK\n1'),/complete/);
});
test('SVG discovery respects href precedence, ignores fragments and refuses entities',()=>{
  const result=scanReferences('drawing.svg',`<svg><image href="map.png" xlink:href="wrong.png"/><use href="symbols.svg#A"/><use href="#local"/><image href="data:image/png;base64,AAA"/><image href="A&amp;B.png"/></svg>`);
  assert.deepEqual(result.findings.map(f=>f.path),['map.png','symbols.svg#A','A&B.png']);assert.throws(()=>scanReferences('drawing.svg','<!DOCTYPE svg SYSTEM "file:///etc/passwd"><svg/>'),/DTDs/);
});
test('reference resolver uses project paths and leaves filename guesses or network references unbound',async()=>{
  const f=await fixture(),b=await f.add('texture.png');const scan=scanReferences('drawing.svg','<svg><image href="texture.png"/><image href="https://remote.example/texture.png"/><image href="../../../../outside.png"/></svg>');
  const resolved=resolveReferenceFindings(f.state,f.doc,scan);assert.equal(resolved[0].documentId,b);assert.equal(resolved[1].status,'External / manual');assert.equal(resolved[2].status,'Outside project');
  f.run('document.move',{id:b,folderId:null});const changed=resolveReferenceFindings(f.state,f.doc,scan);assert.equal(changed[0].status,'Suggested filename');assert.equal(changed[0].documentId,null);
});
test('reference scans cannot be applied against a changed source revision',async()=>{
  const f=await fixture(),old=currentVersion(doc(f)).id,b=await f.add('b.txt');await checkin(f);assert.throws(()=>f.run('document.references',{id:f.doc,baseVersionId:old,references:[b]}),/changed after reference/);
});

test('last available number commits, then exhaustion rejects without consuming a revision',async()=>{
 const f=await fixture();f.run('project.numbering',{id:f.project,numbering:{pattern:'{seq:9}',nextSequence:999999999,allowManual:false}});const file=await prepareFile(new Blob(['last']));
 const id=f.run('document.create',{projectId:f.project,name:'last.txt',file:file.descriptor});assert.equal(doc(f,id).number,'999999999');const prior=structuredClone(f.state);
 assert.throws(()=>f.run('document.create',{projectId:f.project,name:'overflow.txt',file:file.descriptor}),/exhausted/);assert.deepEqual(f.state,prior);
});
test('required defaults do not silently repair legacy records at review or publication gates',async()=>{
 const f=await fixture();f.run('project.fields',{id:f.project,fields:[{key:'required_code',label:'Required code',type:'text',required:true,defaultValue:'NEW'}]});
 assert.throws(()=>f.run('document.transition',{id:f.doc,to:'Shared'}),/Required code is required/);grantReview(f);assert.throws(()=>routed(f),/Required code is required/);
 f.run('document.update',{id:f.doc,metadata:{}});assert.equal(doc(f).metadata.required_code,'NEW');assert.ok(routed(f));
});
test('strict bulk values reject lossy coercion and overlong text, tags or dates',async()=>{
 const f=await fixture();for(const patch of [{title:{x:1}},{description:'x'.repeat(4001)},{tags:[true]},{tags:['x'.repeat(61)]},{tags:Array(31).fill('a')},{dueDate:'2026-09-22T12:00:00Z'}])assert.throws(()=>f.run('document.bulkUpdate',batch(f,[[f.doc,patch]])));
});
test('cancelled routed review remains valid evidence and rejects any later vote',async()=>{
 const f=await fixture();grantReview(f);const id=routed(f);decision(f,id,f.reviewer);f.run('review.cancel',{id});assert.equal(validateWorkspace(f.state),true);assert.throws(()=>decision(f,id,f.manager,'stage-2'),/closed/);assert.equal(f.state.reviews[0].decisions.length,1);
});
test('new baseline and route records survive an authoritative checked backup round trip',async()=>{
 const f=await fixture();grantReview(f);baseline(f);const id=routed(f);decision(f,id,f.reviewer);const engine=await makeEngine(f.state,f.files),backup=await exportBackup(engine.repository,f.state),restored=await verifyBackup(JSON.parse(JSON.stringify(backup)));
 assert.deepEqual(restored.state.baselines,f.state.baselines);assert.deepEqual(restored.state.reviews,f.state.reviews);assert.equal(validateWorkspace(restored.state),true);assert.equal(restored.files.size,f.files.size);
});
test('legacy v0.3 state without optional collections continues to open and can add a baseline',async()=>{
 const f=await fixture();delete f.state.baselines;delete f.state.reviewTemplates;delete project(f).nextDocumentSequence;assert.equal(validateWorkspace(f.state),true);baseline(f);assert.equal(f.state.baselines.length,1);
});
test('document-only sharing does not reveal full-project standards, templates or baselines',async()=>{
 const f=await fixture();grantReview(f);baseline(f);f.run('reviewTemplate.save',{projectId:f.project,name:'Secret project route',stages:[stage([f.reviewer])],separationOfDuties:false});
 f.run('access.remove',{scope:'project',resourceId:f.project});f.grant('document',f.doc,'user:'+f.viewer,['read','download']);const view=projectWorkspace(f.state,f.viewer);
 assert.equal(view.documents.length,1);assert.equal(view.baselines.length,0);assert.equal(view.reviewTemplates.length,0);assert.equal(view.projects[0].name,'Shared documents');assert.equal(view.projects[0].numbering,undefined);
});
test('all review-stage rejection positions preserve previous decisions and block later stages',async()=>{
 for(let i=0;i<3;i++){const f=await fixture();grantReview(f);const id=routed(f,{stages:[stage(['u-admin'],'One'),stage(['u-admin'],'Two'),stage(['u-admin'],'Three')]});for(let j=0;j<i;j++)decision(f,id,'u-admin',`stage-${j+1}`);decision(f,id,'u-admin',`stage-${i+1}`,'Changes requested');assert.equal(validateWorkspace(f.state),true);assert.equal(f.state.reviews[0].decisions.length,i+1);assert.equal(f.state.reviews[0].status,'Changes requested');}
});
test('routed review backups cannot remove pinned context to fall back to legacy approval semantics',async()=>{
 const f=await fixture();grantReview(f);routed(f);const bad=structuredClone(f.state);delete bad.reviews[0].documents[0].context;assert.throws(()=>validateWorkspace(bad),/pinned metadata/);
});
test('baseline contexts reject forged non-scalar metadata and unknown references',async()=>{
 const f=await fixture();baseline(f);for(const key of ['metadata','references']){const bad=structuredClone(f.state);bad.baselines[0].documents[0].context[key]=key==='metadata'?{zone:{nested:true}}:['missing-document'];assert.throws(()=>validateWorkspace(bad));}
});
test('malformed repeated SVG openings remain bounded and do not discover scripted references',()=>{
 assert.equal(scanReferences('bad.svg','<image '.repeat(100000)).findings.length,0);
 assert.equal(scanReferences('scripted.svg','<script>'.repeat(100000)+'<image href="private.txt"/>').findings.length,0);
 assert.equal(scanReferences('comments.svg','<!-- <image href="bad"/> -->'+'<image href="valid.svg"/>').findings[0].path,'valid.svg');
});
