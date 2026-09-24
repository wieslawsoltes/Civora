import test from 'node:test';
import assert from 'node:assert/strict';
import { fixture } from './support.mjs';
import { applyCommand, applyScheduledAutomation, previewDocumentTransition, validateWorkspace } from '../packages/core/index.js';
import { projectWorkspace, notificationVisible } from '../packages/access/index.js';
import { normalizeCondition, evaluateCondition, evaluateWorkflowRules, automationDueItems, WATCH_EVENTS } from '../packages/automation/index.js';
import { createAutomationRunner } from '../server/automation.mjs';
const AT='2026-09-22T12:00:00.000Z',DUE='2026-09-22',AFTER='2026-09-23T01:00:00.000Z';
async function setup(){const f=await fixture();f.run=(type,payload={},actor='u-admin',now=AT)=>{const out=applyCommand(f.state,{type,payload},actor,{now});f.state=out.state;return out.result;};f.run('access.set',{scope:'project',resourceId:f.project,inherit:true,entries:[{principal:'*',allow:['read','download','write','review','publish','share','manage'],deny:[]}]});f.rule=(extra={})=>f.run('workflowRule.save',{projectId:f.project,name:'Controlled transition',to:'Shared',...extra});f.policy=(extra={})=>f.run('automation.configure',{projectId:f.project,enabled:true,reminderHours:24,escalationHours:0,...extra});f.review=(extra={})=>f.run('review.create',{projectId:f.project,title:'Safety review',documentIds:[f.doc],dueDate:DUE,stages:[{name:'Check',assignees:[f.reviewer],quorum:1,dueDate:DUE}],...extra});f.tick=(now=AFTER)=>{const output=applyScheduledAutomation(f.state,now);f.state=output.state;return output;};return f;}
const code=(expected)=>error=>error.code===expected;

test('condition language has strict numeric, boolean, string, membership and missing semantics',async()=>{
 const f=await setup();f.run('project.fields',{id:f.project,fields:[{key:'level',label:'Level',type:'integer',required:false},{key:'checked',label:'Checked',type:'boolean',required:false}]});
 const p=f.state.projects[0],d={...f.state.documents[0],metadata:{level:3,checked:false},tags:['checked']};
 for(const [condition,expected]of [[{field:'metadata.level',op:'gte',value:2},true],[{field:'metadata.level',op:'lt',value:3},false],[{field:'metadata.checked',op:'eq',value:false},true],[{field:'metadata.checked',op:'exists'},true],[{field:'tags',op:'contains',value:'checked'},true],[{field:'discipline',op:'in',value:['General']},true],[{field:'actorRole',op:'eq',value:'manager'},true]])assert.equal(evaluateCondition(normalizeCondition(condition,p),d,{role:'manager'}),expected);
 delete d.metadata.level;assert.equal(evaluateCondition(normalizeCondition({field:'metadata.level',op:'ne',value:3},p),d),false);
 assert.throws(()=>normalizeCondition({field:'metadata.level',op:'eq',value:'3'},p),/type/);
 assert.throws(()=>normalizeCondition({field:'title',op:'gt',value:'a'},p),/numeric/);
});
test('AND/OR conditions are bounded and reject scripts, unknown keys, prototypes and regular expressions',async()=>{
 const f=await setup(),p=f.state.projects[0];const n=normalizeCondition({all:[{any:[{field:'title',op:'exists'},{field:'name',op:'eq',value:'x'}]}]},p);assert.ok(evaluateCondition(n,f.state.documents[0],{}));
 for(const bad of [{script:'process.exit()'},{field:'name',op:'regex',value:'.*'},JSON.parse('{"__proto__":{"admin":true}}'),{field:'metadata.constructor',op:'exists'},{all:[],any:[]},{field:'name',op:'exists',value:true}])assert.throws(()=>normalizeCondition(bad,p));
 let tooDeep={field:'name',op:'exists'};for(let i=0;i<7;i++)tooDeep={all:[tooDeep]};assert.throws(()=>normalizeCondition(tooDeep,p),/complex/);
 assert.throws(()=>normalizeCondition({all:Array.from({length:16},()=>({all:Array.from({length:3},()=>({field:'name',op:'exists'}))}))},p),/complex/);
});
test('matching transition guards and mandatory reasons reject atomically',async()=>{
 const f=await setup();f.rule({require:{field:'tags',op:'contains',value:'checked'},requireReason:true,message:'Technical check tag is required.'});const before=structuredClone(f.state);
 assert.throws(()=>f.run('document.transition',{id:f.doc,to:'Shared'}),/check tag/);assert.deepEqual(f.state,before);
 f.run('document.update',{id:f.doc,tags:['checked']});assert.throws(()=>f.run('document.transition',{id:f.doc,to:'Shared'}),/reason/);f.run('document.transition',{id:f.doc,to:'Shared',reason:'Checked against source'});assert.equal(f.state.documents[0].state,'Shared');
});
test('nonmatching, disabled and different-project rules do not gate a transition',async()=>{
 const f=await setup();f.rule({when:{field:'discipline',op:'eq',value:'Structures'},require:{field:'tags',op:'contains',value:'never'}});f.rule({name:'Disabled',enabled:false,require:{field:'tags',op:'contains',value:'never'}});f.run('workflowRule.save',{projectId:f.other,name:'Private policy',requireReason:true});f.run('document.transition',{id:f.doc,to:'Shared'});assert.equal(f.state.documents[0].state,'Shared');
});
test('ordered metadata/tag actions evaluate the original snapshot, then commit together',async()=>{
 const f=await setup();f.rule({name:'First',priority:10,metadata:{zone:'A'},addTags:['checked']});f.rule({name:'Second',priority:20,when:{field:'metadata.zone',op:'eq',value:'A'},metadata:{zone:'B'}});f.rule({name:'Last',priority:30,metadata:{originator:'QA'}});
 f.run('document.transition',{id:f.doc,to:'Shared'});assert.deepEqual(f.state.documents[0].metadata,{zone:'A',originator:'QA'});assert.deepEqual(f.state.documents[0].tags,['checked']);
});
test('unknown metadata assignments and invalid schema modifications fail closed',async()=>{
 const f=await setup();assert.throws(()=>f.rule({metadata:{hidden:'x'}}),/property/);f.rule({require:{field:'metadata.zone',op:'exists'}});assert.throws(()=>f.run('project.fields',{id:f.project,fields:[]}),/metadata field/);
});
test('workflow-rule save/delete is scoped to a manager with current manage permission',async()=>{
 const f=await setup();assert.throws(()=>f.run('workflowRule.save',{projectId:f.project,name:'No'},f.author),code('FORBIDDEN'));const id=f.run('workflowRule.save',{projectId:f.project,name:'Manager policy'},f.manager);assert.throws(()=>f.run('workflowRule.save',{id,projectId:f.other,name:'Cannot move'},f.manager),code('FORBIDDEN'));
 f.run('workflowRule.delete',{id},f.manager);assert.equal(f.state.workflowRules.length,0);
});
test('workflow assignment cannot bypass write permission via publication rights',async()=>{
 const f=await setup();f.rule({metadata:{zone:'QA'}});f.run('access.set',{scope:'document',resourceId:f.doc,inherit:true,entries:[{principal:'user:'+f.manager,allow:[],deny:['write']}]});assert.throws(()=>f.run('document.transition',{id:f.doc,to:'Shared'},f.manager),code('FORBIDDEN'));
});
test('rule assignments cannot reuse a review of different metadata at publication',async()=>{
 const f=await setup(),r=f.review();f.run('review.decide',{id:r,stageId:'stage-1',decision:'Approved',comment:'Reviewed'},f.reviewer);f.run('document.transition',{id:f.doc,to:'Shared'});f.rule({name:'Unsafe publication rewrite',to:'Published',metadata:{zone:'Unreviewed'}});const before=structuredClone(f.state);assert.throws(()=>f.run('document.transition',{id:f.doc,to:'Published'}),/exact revision/);assert.deepEqual(f.state,before);
});
test('transition preview executes every real gate but does not mutate state or dispatch notifications',async()=>{
 const f=await setup();f.rule({metadata:{zone:'Reviewed'},requireReason:true});const before=structuredClone(f.state);assert.throws(()=>previewDocumentTransition(f.state,'u-admin',{id:f.doc,to:'Shared'}),/reason/);const preview=previewDocumentTransition(f.state,'u-admin',{id:f.doc,to:'Shared',reason:'Ready'});assert.equal(preview.metadata.zone,'Reviewed');assert.equal(preview.sourceRevision,f.state.revision);assert.deepEqual(f.state,before);
});
test('subscription scopes deduplicate and enforce current read access',async()=>{
 const f=await setup();const save={scope:'document',resourceId:f.doc,events:['document.updated']};const id=f.run('subscription.save',save,f.viewer);assert.equal(f.run('subscription.save',{...save,id,events:['document.state']},f.viewer),id);assert.equal(f.state.subscriptions.length,1);
 assert.throws(()=>f.run('subscription.save',{...save,resourceId:f.hidden},f.viewer),code('FORBIDDEN'));assert.throws(()=>f.run('subscription.save',{...save,events:['eval']},f.viewer));assert.throws(()=>f.run('subscription.delete',{id},f.author),code('NOT_FOUND'));
});
test('document/folder/project watch matches deliver only one event per recipient',async()=>{
 const f=await setup();for(const[scope,resourceId]of[['project',f.project],['folder',f.folder],['document',f.doc]])f.run('subscription.save',{scope,resourceId,events:['document.updated']},f.viewer);
 f.run('document.update',{id:f.doc,title:'Updated'});const notices=f.state.notifications.filter(n=>n.userId===f.viewer);assert.equal(notices.length,1);assert.equal(notices[0].event,'document.updated');assert.equal(notices[0].resourceId,f.doc);assert.ok(!JSON.stringify(notices).includes('Updated'));
});
test('folder watches distinguish recursive and direct children',async()=>{
 const f=await setup(),other=await f.add('nested.txt',{folderId:f.subfolder});f.run('subscription.save',{scope:'folder',resourceId:f.folder,events:['document.updated'],recursive:false},f.viewer);f.run('document.update',{id:other,title:'Nested'});assert.equal(f.state.notifications.filter(n=>n.userId===f.viewer).length,0);
 f.run('subscription.save',{scope:'folder',resourceId:f.folder,events:['document.updated'],recursive:true},f.viewer);f.run('document.update',{id:other,title:'Nested 2'});assert.equal(f.state.notifications.filter(n=>n.userId===f.viewer).length,1);
});
test('deleting an empty watched folder removes its subscriptions atomically',async()=>{
 const f=await setup();f.run('subscription.save',{scope:'folder',resourceId:f.subfolder,events:['document.updated']},f.viewer);f.run('folder.delete',{id:f.subfolder});assert.equal(f.state.subscriptions.length,0);validateWorkspace(f.state);
});
test('permission revocation suppresses old and future notifications and subscriptions',async()=>{
 const f=await setup();f.run('subscription.save',{scope:'document',resourceId:f.doc,events:['document.updated']},f.viewer);f.run('document.update',{id:f.doc,title:'Visible'});const n=f.state.notifications[0];assert.ok(notificationVisible(f.state,n,f.viewer));f.run('access.set',{scope:'document',resourceId:f.doc,inherit:true,entries:[{principal:'user:'+f.viewer,allow:[],deny:['read']}]});assert.equal(notificationVisible(f.state,n,f.viewer),false);f.run('document.update',{id:f.doc,title:'Secret'});const view=projectWorkspace(f.state,f.viewer);assert.equal(view.notifications.length,0);assert.equal(view.subscriptions.length,0);assert.equal(f.state.notifications.length,1);assert.throws(()=>f.run('notification.update',{ids:[n.id],action:'read'},f.viewer));
});
test('notification read, unread, snooze and unsnooze require ownership, even for administrators',async()=>{
 const f=await setup();f.run('subscription.save',{scope:'document',resourceId:f.doc,events:['document.updated']},f.viewer);f.run('document.update',{id:f.doc,title:'Visible'});const n=f.state.notifications[0];assert.throws(()=>f.run('notification.update',{ids:[n.id],action:'read'}),code('NOT_FOUND'));f.run('notification.update',{ids:[n.id],action:'read'},f.viewer);assert.equal(f.state.notifications[0].readAt,AT);f.run('notification.update',{ids:[n.id],action:'unread'},f.viewer);assert.equal(f.state.notifications[0].readAt,null);
 f.run('notification.update',{ids:[n.id],action:'snooze',until:AFTER},f.viewer);assert.equal(f.state.notifications[0].snoozedUntil,AFTER);assert.throws(()=>f.run('notification.update',{ids:[n.id],action:'snooze',until:AT},f.viewer),/30 days/);f.run('notification.update',{ids:[n.id],action:'unsnooze'},f.viewer);assert.equal(f.state.notifications[0].snoozedUntil,null);
});
test('bulk notification updates are atomic when any record is unauthorized',async()=>{
 const f=await setup();for(const u of[f.viewer,f.author])f.run('subscription.save',{scope:'document',resourceId:f.doc,events:['document.updated']},u);f.run('document.update',{id:f.doc,title:'All'});const before=structuredClone(f.state);assert.throws(()=>f.run('notification.update',{ids:f.state.notifications.map(n=>n.id),action:'read'},f.viewer));assert.deepEqual(f.state,before);
});
test('review assignments notify only the active stage and new stage activation',async()=>{
 const f=await setup();const r=f.review({stages:[{name:'Check',assignees:[f.reviewer],quorum:1},{name:'Approve',assignees:[f.manager],quorum:1}]});assert.equal(f.state.notifications.filter(n=>n.event==='review.assigned'&&n.userId===f.manager).length,0);assert.equal(f.state.notifications.filter(n=>n.event==='review.assigned'&&n.userId===f.reviewer).length,1);
 f.run('review.decide',{id:r,stageId:'stage-1',decision:'Approved',comment:'Checked'},f.reviewer);assert.equal(f.state.notifications.filter(n=>n.event==='review.assigned'&&n.userId===f.manager).length,1);
});
test('review notifications hide denied historical dependency references',async()=>{
 const f=await setup(),ref=await f.add('ref.txt');f.run('document.references',{id:f.doc,references:[ref]});const r=f.review();assert.ok(projectWorkspace(f.state,f.reviewer).notifications.some(n=>n.resourceId===r));f.run('access.set',{scope:'document',resourceId:ref,inherit:true,entries:[{principal:'user:'+f.reviewer,allow:[],deny:['read']}]});assert.ok(!projectWorkspace(f.state,f.reviewer).notifications.some(n=>n.resourceId===r));
});
test('rules, policies and ledger do not leak into nonmanager projections',async()=>{
 const f=await setup();f.rule({name:'Internal administrative name'});f.policy();f.review();f.tick();const view=projectWorkspace(f.state,f.viewer);assert.equal(view.workflowRules.length,0);assert.equal(view.automationPolicies.length,0);assert.equal(view.automationLedger.length,0);assert.ok(!JSON.stringify(view).includes('Internal administrative name'));
});
test('deadline reconciliation treats date-only deadlines as end-of-day UTC',async()=>{
 const f=await setup();f.policy();f.review();assert.equal(automationDueItems(f.state,'2026-09-21T00:00:00.000Z').length,0);const due=automationDueItems(f.state,AT);assert.ok(due.every(x=>x.event==='review.reminder'));assert.equal(due[0].due,'2026-09-22T23:59:59.999Z');assert.ok(automationDueItems(f.state,'2026-09-22T23:59:59.999Z').every(x=>x.event==='review.reminder'));assert.throws(()=>automationDueItems(f.state,'2026-09-22'),/timestamp/);
});
test('reminder and overdue receipts are durable and idle ticks leave revisions untouched',async()=>{
 const f=await setup();f.policy();f.review();const a=f.tick(AT);assert.ok(a.changed);assert.equal(a.result[0].event,'review.reminder');const revision=f.state.revision,count=f.state.notifications.length;assert.equal(f.tick(AT).changed,false);assert.equal(f.state.revision,revision);assert.equal(f.state.notifications.length,count);
 const b=f.tick();assert.deepEqual(new Set(b.result.map(r=>r.event)),new Set(['review.overdue','review.escalated']));const rehydrated=JSON.parse(JSON.stringify(f.state));assert.equal(applyScheduledAutomation(rehydrated,AFTER).changed,false);
});
test('unattended single-voter delegation preserves quorum and does not record an approval',async()=>{
 const f=await setup();f.policy({escalationMode:'delegate',delegateId:f.manager});const r=f.review(),out=f.tick();const review=f.state.reviews.find(x=>x.id===r);assert.deepEqual(review.stages[0].assignees,[f.manager]);assert.equal(review.stages[0].quorum,1);assert.equal(review.status,'In review');assert.equal(review.decisions.length,0);assert.equal(review.reassignments[0].from,f.reviewer);assert.ok(review.reassignments[0].automatic);assert.ok(out.result.some(x=>x.status==='delegated'));assert.throws(()=>f.run('review.decide',{id:r,stageId:'stage-1',decision:'Approved',comment:'Former assignee'},f.reviewer),code('FORBIDDEN'));
 f.run('review.decide',{id:r,stageId:'stage-1',decision:'Approved',comment:'Actual human decision'},f.manager);assert.equal(f.state.reviews[0].status,'Approved');
});
test('delegation never replaces multiple pending voters or reduces quorum',async()=>{
 const f=await setup();f.policy({escalationMode:'delegate',delegateId:'u-admin'});f.review({stages:[{name:'Two people',assignees:[f.reviewer,f.manager],quorum:2,dueDate:DUE}]});const out=f.tick();assert.equal(out.result.find(x=>x.event==='review.escalated').code,'QUORUM');assert.deepEqual(f.state.reviews[0].stages[0].assignees,[f.reviewer,f.manager]);assert.equal(f.state.reviews[0].stages[0].quorum,2);
});
test('single remaining voter delegation preserves the existing approved decision',async()=>{
 const f=await setup();f.policy({escalationMode:'delegate',delegateId:'u-admin'});const r=f.review({stages:[{name:'Two',assignees:[f.reviewer,f.manager],quorum:2,dueDate:DUE}]});f.run('review.decide',{id:r,stageId:'stage-1',decision:'Approved',comment:'Checked'},f.reviewer);const decision=structuredClone(f.state.reviews[0].decisions[0]);f.tick();assert.deepEqual(f.state.reviews[0].decisions,[decision]);assert.deepEqual(f.state.reviews[0].stages[0].assignees,[f.reviewer,'u-admin']);assert.equal(f.state.reviews[0].status,'In review');
});
test('delegation honors separation of duties and writes a blocked outcome',async()=>{
 const f=await setup();f.policy({escalationMode:'delegate',delegateId:'u-admin'});f.review({separationOfDuties:true});const out=f.tick();assert.equal(out.result.find(x=>x.event==='review.escalated').code,'SEPARATION');assert.deepEqual(f.state.reviews[0].stages[0].assignees,[f.reviewer]);assert.ok(f.state.notifications.some(n=>n.event==='review.escalation-blocked'&&n.userId==='u-admin'));
});
test('policy owner revocation blocks automatic actions without acquiring system privileges',async()=>{
 const f=await setup();f.run('automation.configure',{projectId:f.project,escalationHours:0,escalationMode:'delegate',delegateId:'u-admin'},f.manager);f.review();f.run('access.set',{scope:'project',resourceId:f.project,inherit:true,entries:[{principal:'user:'+f.manager,allow:[],deny:['manage']},{principal:'user:'+f.reviewer,allow:['read','review'],deny:[]}]});const out=f.tick();assert.ok(out.result.every(x=>x.status==='blocked'&&x.code==='OWNER_ACCESS'));assert.deepEqual(f.state.reviews[0].stages[0].assignees,[f.reviewer]);
});
test('inactive delegate and document ACL revocation block escalation',async()=>{
 for(const mode of ['inactive','denied']){const f=await setup();f.policy({escalationMode:'delegate',delegateId:f.manager});f.review();if(mode==='inactive')f.run('user.update',{id:f.manager,active:false});else f.run('access.set',{scope:'document',resourceId:f.doc,inherit:true,entries:[{principal:'user:'+f.manager,allow:[],deny:['review']}]});const out=f.tick();assert.equal(out.result.find(x=>x.event==='review.escalated').status,'blocked');assert.deepEqual(f.state.reviews[0].stages[0].assignees,[f.reviewer]);}
});
test('stale review metadata cannot trigger reassignment or misleading reviewer reminders',async()=>{
 const f=await setup();f.policy({escalationMode:'delegate',delegateId:f.manager});f.review();f.run('document.update',{id:f.doc,title:'New unreviewed metadata'});const out=f.tick();assert.ok(out.result.every(x=>x.code==='STALE_REVIEW'));assert.equal(f.state.notifications.filter(n=>n.event==='review.overdue').length,0);assert.deepEqual(f.state.reviews[0].stages[0].assignees,[f.reviewer]);
});
test('completed, cancelled and disabled-policy reviews are not scheduled',async()=>{
 const f=await setup();f.policy();const r=f.review();f.run('review.cancel',{id:r});assert.equal(f.tick().changed,false);f.review();f.policy({enabled:false});assert.equal(f.tick().changed,false);
});
test('legacy review supports reminders but never automatic reassignment',async()=>{
 const f=await setup();f.policy({escalationMode:'delegate',delegateId:f.manager});f.run('review.create',{projectId:f.project,title:'Legacy',documentIds:[f.doc],assignees:[f.reviewer],dueDate:DUE});const out=f.tick();assert.equal(out.result.find(x=>x.event==='review.escalated').code,'LEGACY');assert.deepEqual(f.state.reviews[0].assignees,[f.reviewer]);
});
test('issue and document reminders use current ownership and exclude closed/published records',async()=>{
 const f=await setup();f.policy({includeDocuments:true,includeIssues:true});const i=f.run('issue.create',{projectId:f.project,documentId:f.doc,title:'Resolve',dueDate:DUE,assignee:f.author});f.run('document.update',{id:f.doc,dueDate:DUE});const out=f.tick(AT);assert.equal(out.result.length,2);assert.ok(f.state.notifications.some(n=>n.event==='issue.reminder'&&n.userId===f.author));f.run('issue.update',{id:i,status:'Closed'});assert.ok(automationDueItems(f.state,AFTER).every(x=>x.kind!=='issue'));
});
test('manual reconciliation cannot accept a caller-supplied future clock or another project',async()=>{
 const f=await setup();f.policy();f.review();const out=f.run('automation.run',{projectId:f.project,now:'2099-01-01T00:00:00.000Z'},f.manager,AT);assert.ok(out.every(x=>x.event==='review.reminder'));assert.throws(()=>f.run('automation.run',{projectId:f.other},f.manager),code('FORBIDDEN'));assert.throws(()=>f.run('automation.tick',{}),/Unknown/);
});
test('duplicate deduplication keys and broken notice references fail backup validation',async()=>{
 const f=await setup();f.policy();f.review();f.tick();const state=structuredClone(f.state);state.automationLedger.push({...state.automationLedger[0],id:'duplicate'});assert.throws(()=>validateWorkspace(state),/ledger/);const bad=structuredClone(f.state);bad.notifications[0].resourceId='not-a-document';assert.throws(()=>validateWorkspace(bad),/notification/);
});
test('server runner persists once, retries real CAS conflicts and coalesces concurrent ticks',async()=>{
 const f=await setup();f.policy();f.review();let state=structuredClone(f.state),saves=0,commits=0,conflicts=0;
 const store={async read(){await new Promise(r=>setTimeout(r,2));return structuredClone(state);},async save(next,rev){saves++;if(!conflicts++){const error=new Error('CAS conflict');error.code='CONFLICT';throw error;}assert.equal(rev,state.revision);state=structuredClone(next);}};
 const runner=createAutomationRunner({store,start:false,clock:()=>AFTER,onCommit:()=>commits++});const out=await Promise.all([runner.reconcile(),runner.reconcile(),runner.reconcile()]);assert.ok(out.every(o=>o.changed));assert.equal(saves,2);assert.equal(commits,1);assert.equal(runner.status().conflicts,1);assert.equal((await runner.reconcile()).changed,false);await runner.close();assert.equal((await runner.reconcile()).changed,false);
});
test('runner failures are observable, retriable and shutdown awaits an in-flight commit',async()=>{
 const f=await setup();f.policy();f.review();let fail=true,state=structuredClone(f.state),saved=false;const store={async read(){if(fail)throw new Error('Disk unavailable');return state;},async save(next){await new Promise(r=>setTimeout(r,15));state=next;saved=true;}};
 const runner=createAutomationRunner({store,start:false,clock:()=>AFTER});await assert.rejects(runner.reconcile(),/Disk/);assert.match(runner.status().lastError,/Disk/);fail=false;const pending=runner.reconcile();await runner.close();await pending;assert.ok(saved);assert.equal(runner.status().lastError,null);
});
test('runner configuration is bounded and disabled runners make no writes',async()=>{
 assert.throws(()=>createAutomationRunner({intervalMs:0}),/interval/);let reads=0;const runner=createAutomationRunner({enabled:false,store:{read(){reads++;}}});assert.equal((await runner.reconcile()).changed,false);assert.equal(reads,0);await runner.close();
});

test('numeric and boolean rules evaluate canonical string metadata written by real commands',async()=>{
 const f=await setup();f.run('project.fields',{id:f.project,fields:[{key:'level',label:'Level',type:'integer',required:false},{key:'ready',label:'Ready',type:'boolean',required:false}]});f.run('document.update',{id:f.doc,metadata:{level:4,ready:false}});assert.equal(f.state.documents[0].metadata.level,'4');assert.equal(f.state.documents[0].metadata.ready,'false');
 f.rule({require:{all:[{field:'metadata.level',op:'gte',value:3},{field:'metadata.ready',op:'eq',value:true}]}});assert.throws(()=>f.run('document.transition',{id:f.doc,to:'Shared'}),/transition policy/);f.run('document.update',{id:f.doc,metadata:{level:4,ready:true}});f.run('document.transition',{id:f.doc,to:'Shared'});assert.equal(f.state.documents[0].state,'Shared');
});
test('changing a referenced field type invalidates its rule instead of coercing values',async()=>{
 const f=await setup();f.rule({require:{field:'metadata.zone',op:'eq',value:'3'}});assert.throws(()=>f.run('project.fields',{id:f.project,fields:[{key:'zone',label:'Zone',type:'number',required:false}]}),/type changed|field type/);
});
test('assignment values are stored in the canonical metadata representation',async()=>{
 const f=await setup();f.run('project.fields',{id:f.project,fields:[{key:'count',label:'Count',type:'integer',required:false},{key:'ready',label:'Ready',type:'boolean',required:false}]});f.rule({metadata:{count:2,ready:false}});f.run('document.transition',{id:f.doc,to:'Shared'});assert.deepEqual(f.state.documents[0].metadata,{zone:'',originator:'',count:'2',ready:'false'});
});
test('a fresh HTTP revision cannot bypass a stale transition-preview revision',async()=>{
 const f=await setup(),preview=previewDocumentTransition(f.state,'u-admin',{id:f.doc,to:'Shared'});f.run('document.update',{id:f.doc,title:'Changed after preview'});assert.throws(()=>f.run('document.transition',{id:f.doc,to:'Shared',baseRevision:preview.sourceRevision}),code('CONFLICT'));
});

test('workspace imports cannot replace optional collections with non-arrays',async()=>{
 const f=await setup();for(const name of ['workflowRules','automationPolicies','subscriptions','notifications','automationLedger'])for(const value of [null,false,0,'']){const state=structuredClone(f.state);state[name]=value;assert.throws(()=>validateWorkspace(state),/collection/);}
 const legacy=structuredClone(f.state);for(const name of ['workflowRules','automationPolicies','subscriptions','notifications','automationLedger'])delete legacy[name];validateWorkspace(legacy);
});
test('notification and execution records reject extraneous payload or embedded content',async()=>{
 const f=await setup();f.policy();f.review();f.tick();for(const name of ['notifications','automationLedger']){const state=structuredClone(f.state);state[name][0].privateContent='must never be delivered';assert.throws(()=>validateWorkspace(state),/configuration property/);}
});
test('invalid UTC calendar timestamps are not silently normalized in an imported notification',async()=>{
 const f=await setup();f.review();const state=structuredClone(f.state);state.notifications[0].at='2026-02-30T00:00:00.000Z';assert.throws(()=>validateWorkspace(state),/notification/);assert.throws(()=>f.tick('2026-02-30T00:00:00.000Z'),/UTC timestamp/);
});
test('the inbox retains the newest 1000 records without deleting deadline receipts',async()=>{
 const f=await setup();f.policy();f.review();f.tick();const receiptCount=f.state.automationLedger.length;
 f.run('subscription.save',{scope:'document',resourceId:f.doc,events:['document.updated']},f.viewer);f.run('document.update',{id:f.doc,title:'A watched change'});const n=f.state.notifications.find(n=>n.userId===f.viewer);
 f.state.notifications=f.state.notifications.filter(n=>n.userId!==f.viewer);for(let i=0;i<1000;i++)f.state.notifications.push({...n,id:'notice-limit-'+i,key:'limit:'+i});validateWorkspace(f.state);
 f.run('document.update',{id:f.doc,title:'Newest visible change'});const notices=f.state.notifications.filter(n=>n.userId===f.viewer);assert.equal(notices.length,1000);assert.equal(notices.some(n=>n.id==='notice-limit-0'),false);assert.equal(notices.at(-1).resourceId,f.doc);assert.equal(f.state.automationLedger.length,receiptCount);
 const overflow=structuredClone(f.state);overflow.notifications.push({...n,id:'overflow',key:'overflow'});assert.throws(()=>validateWorkspace(overflow),/Too many personal/);
});
test('one bounded scan commits at most 200 receipts and the next scan resumes without duplication',async()=>{
 const f=await setup();f.policy();for(let i=0;i<101;i++)f.review({title:'Queued deadline '+i});let out=f.tick();assert.equal(out.result.length,200);out=f.tick();assert.equal(out.result.length,2);assert.equal(new Set(f.state.automationLedger.map(r=>r.key)).size,202);assert.equal(f.tick().changed,false);
});

test('equal-priority rules use locale-independent identifier order',async()=>{
 const f=await setup(),a=f.rule({name:'Uppercase id',priority:10,metadata:{zone:'First'}}),b=f.rule({name:'Lowercase id',priority:10,metadata:{zone:'Last'}});f.state.workflowRules.find(r=>r.id===a).id='rule-Z';f.state.workflowRules.find(r=>r.id===b).id='rule-a';
 f.run('document.transition',{id:f.doc,to:'Shared'});assert.equal(f.state.documents[0].metadata.zone,'Last');
});
test('a reviewer decision winning the CAS race prevents a stale scheduled delegation',async()=>{
 const f=await setup();f.policy({escalationMode:'delegate',delegateId:f.manager});const review=f.review();let state=structuredClone(f.state),raced=false,commits=0;
 const store={async read(){return structuredClone(state);},async save(next,revision){if(!raced){raced=true;state=applyCommand(state,{type:'review.decide',payload:{id:review,stageId:'stage-1',decision:'Approved',comment:'Decision won the concurrent race'}},f.reviewer,{now:AFTER}).state;const e=new Error('Real concurrent revision');e.code='CONFLICT';throw e;}assert.equal(revision,state.revision);state=structuredClone(next);}};
 const runner=createAutomationRunner({store,start:false,clock:()=>AFTER,onCommit:()=>commits++});try{const out=await runner.reconcile();assert.equal(out.changed,false);assert.equal(state.reviews[0].status,'Approved');assert.equal(state.reviews[0].reassignments.length,0);assert.equal(state.automationLedger.length,0);assert.equal(commits,0);assert.equal(runner.status().conflicts,1);}finally{await runner.close();}
});
test('authority revoked during a CAS race is rechecked before any delegated write',async()=>{
 const f=await setup();f.run('automation.configure',{projectId:f.project,enabled:true,reminderHours:24,escalationHours:0,escalationMode:'delegate',delegateId:'u-admin'},f.manager);f.review();let state=structuredClone(f.state),raced=false;
 const store={async read(){return structuredClone(state);},async save(next,revision){if(!raced){raced=true;state=applyCommand(state,{type:'access.set',payload:{scope:'project',resourceId:f.project,inherit:true,entries:[{principal:'user:'+f.manager,allow:[],deny:['manage']}]}},'u-admin',{now:AFTER}).state;const e=new Error('Authority changed');e.code='CONFLICT';throw e;}assert.equal(revision,state.revision);state=structuredClone(next);}};
 const runner=createAutomationRunner({store,start:false,clock:()=>AFTER});try{const out=await runner.reconcile();assert.ok(out.result.every(r=>r.status==='blocked'&&r.code==='OWNER_ACCESS'));assert.deepEqual(state.reviews[0].stages[0].assignees,[f.reviewer]);assert.equal(state.reviews[0].reassignments.length,0);}finally{await runner.close();}
});
