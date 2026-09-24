// Run after npm run build. Uses only independently bundled libraries, no app shell.
import assert from 'node:assert/strict';
import {createEmptyWorkspace,previewDocumentTransition,applyScheduledAutomation} from '../dist/lib/civora-core.js';
import {MemoryRepository,WorkspaceEngine} from '../dist/lib/civora-storage.js';
import {normalizeCondition,evaluateCondition,automationDueItems} from '../dist/lib/civora-automation.js';
const repository=await new MemoryRepository().open(),engine=new WorkspaceEngine(repository,'u-admin');
try{
 await engine.initialize(createEmptyWorkspace(),new Map());
 const projectId=await engine.run('project.create',{name:'Independent automation example',code:'AUTO'});
 const documentId=await engine.addFile(new File(['Original engineering note\n'],'note.txt',{type:'text/plain'}),{projectId,tags:['Checked']});
 await engine.run('workflowRule.save',{projectId,name:'Checked coordination',to:'Shared',require:{field:'tags',op:'contains',value:'Checked'},requireReason:true,metadata:{zone:'QA'},addTags:['Coordinated']});
 await engine.run('subscription.save',{scope:'document',resourceId:documentId,events:['document.state']});
 const revision=engine.state.revision,preview=previewDocumentTransition(engine.state,engine.actorId,{id:documentId,to:'Shared',reason:'Library verification'});
 assert.equal(engine.state.revision,revision);assert.equal(preview.metadata.zone,'QA');
 await engine.run('document.transition',{id:documentId,to:'Shared',reason:'Library verification',baseRevision:preview.sourceRevision});
 assert.equal(engine.state.notifications.length,1);
 const condition=normalizeCondition({field:'tags',op:'contains',value:'Coordinated'},engine.state.projects[0]);assert.ok(evaluateCondition(condition,engine.state.documents[0],engine.state.users[0]));
 await engine.run('automation.configure',{projectId,enabled:true,reminderHours:24,escalationHours:48,escalationMode:'notify',includeIssues:true});
 await engine.run('issue.create',{projectId,title:'Review the interface schedule',assignee:'u-admin',dueDate:'2026-09-20'});
 const clock='2026-09-21T12:00:00.000Z';assert.equal(automationDueItems(engine.state,clock).length,1);
 const out=applyScheduledAutomation(engine.state,clock);assert.equal(out.result.length,1);assert.equal(applyScheduledAutomation(out.state,clock).changed,false);
 // The reducer's result must be persisted by a real repository/server CAS transaction.
 // This example demonstrates the pure output; it does not install a scheduler.
 console.log(JSON.stringify({state:engine.state.documents[0].state,tags:engine.state.documents[0].tags,previewMutatedState:false,deadlineOutcomes:out.result.map(x=>x.event),idleTickChanges:false,modules:'core, storage, automation'},null,2));
}finally{engine.close();}
