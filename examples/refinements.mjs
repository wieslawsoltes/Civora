// Run after npm run build. Also runs from the standalone libraries ZIP.
import assert from 'node:assert/strict';
import {createEmptyWorkspace,previewDocumentCopy} from '../dist/lib/civora-core.js';
import {MemoryRepository,WorkspaceEngine} from '../dist/lib/civora-storage.js';
import {planDocumentCopy,verifyCopyContent,suggestCopyNames} from '../dist/lib/civora-document-copy.js';
import {navigationSearch} from '../dist/lib/civora-navigation.js';
const repository=await new MemoryRepository().open(),engine=new WorkspaceEngine(repository,'u-admin');
try {
 await engine.initialize(createEmptyWorkspace(),new Map());
 const project=await engine.run('project.create',{name:'Independent refinement example',code:'REUSE'});
 const target=await engine.run('folder.create',{projectId:project,name:'Alternative design'});
 const first=await engine.addFile(new File(['Exact original drawing bytes\n'],'Drawing.txt',{type:'text/plain'}),{projectId:project,title:'Library source'});
 const second=await engine.addFile(new File(['Original schedule bytes\n'],'Schedule.txt',{type:'text/plain'}),{projectId:project});
 await engine.run('document.references',{id:first,references:[second]});
 const originals=structuredClone(engine.state.documents),revision=engine.state.revision;
 const input={projectId:project,folderId:target,baseRevision:revision,reason:'Develop a controlled alternative',copyMetadata:true,copyTags:true,referenceMode:'selected',items:originals.map(d=>({id:d.id,versionId:d.versions.at(-1).id,name:d.name}))};
 assert.equal(planDocumentCopy(engine.state,engine.actorId,input).items.length,2);
 const verified=await verifyCopyContent(engine.state,engine.actorId,input,id=>repository.blob(id));
 const preview=previewDocumentCopy(engine.state,engine.actorId,input);
 assert.equal(engine.state.revision,revision);
 const result=await engine.run('document.bulkCopy',preview.payload);
 assert.equal(engine.state.revision,revision+1);
 const destination=engine.state.documents.find(d=>d.id===result.copied[0].id);
 assert.equal(destination.references[0],result.copied[1].id);
 assert.deepEqual(engine.state.documents.slice(0,2),originals);
 assert.equal(await(await repository.blob(destination.versions[0].blobId)).text(),'Exact original drawing bytes\n');
 const found=navigationSearch(engine.state,engine.actorId,{projectId:project,query:'Drawing',kind:'document'});
 assert.equal(found.total,2);
 assert.deepEqual(suggestCopyNames(['Drawing.txt'],['Drawing.txt']),['Drawing - copy.txt']);
 console.log(JSON.stringify({copied:result.copied.length,verifiedBytes:verified.bytes,oneRevision:true,sourceUnchanged:true,remappedReference:true,searchMatches:found.total,modules:'document-copy, navigation'},null,2));
}finally{engine.close();}
