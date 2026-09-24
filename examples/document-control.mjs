// Run after npm run build. This example imports built libraries without the app shell.
import assert from 'node:assert/strict';
import {createEmptyWorkspace} from '../dist/lib/civora-core.js';
import {MemoryRepository,WorkspaceEngine} from '../dist/lib/civora-storage.js';
import {compareBaselines,liveBaseline} from '../dist/lib/civora-document-control.js';
import {metadataRegisterCSV,previewMetadataRegister} from '../dist/lib/civora-editable-register.js';
import {exportBaselineArchive} from '../dist/lib/civora-baseline-archive.js';
import {scanReferences} from '../dist/lib/civora-reference-discovery.js';
const repository=await new MemoryRepository().open(),engine=new WorkspaceEngine(repository,'u-admin');
try{
 await engine.initialize(createEmptyWorkspace(),new Map());
 const projectId=await engine.run('project.create',{name:'Independent library example',code:'LIB'});
 await engine.run('project.numbering',{id:projectId,numbering:{pattern:'{project}-{seq:4}',nextSequence:1,allowManual:false}});
 const documentId=await engine.addFile(new File(['Original file\n'],'example.txt',{type:'text/plain'}),{projectId,revision:'P01'});
 const baselineId=await engine.run('baseline.create',{projectId,name:'Library baseline',documentIds:[documentId],includeReferences:true});
 const baseline=engine.state.baselines.find(b=>b.id===baselineId);
 assert.equal(compareBaselines(baseline,liveBaseline(engine.state,baseline))[0].status,'Unchanged');
 const register=metadataRegisterCSV(engine.state,projectId);assert.equal(previewMetadataRegister(engine.state,projectId,register).changes.length,0);
 const archive=await exportBaselineArchive(engine.state,baseline,repository,'u-admin');assert.ok(archive.zip.size>0);
 assert.equal(scanReferences('model.obj','mtllib material.mtl\n').findings[0].path,'material.mtl');
 console.log(JSON.stringify({number:engine.state.documents[0].number,baselines:engine.state.baselines.length,verifiedZIPBytes:archive.zip.size,modules:'core, storage, document-control, editable-register, baseline-archive, reference-discovery'},null,2));
}finally{engine.close();}
