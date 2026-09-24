// Build first. These are independently bundled modules, with no app shell or service.
import assert from 'node:assert/strict';
import {createEmptyWorkspace,currentVersion} from '../dist/lib/civora-core.js';
import {MemoryRepository,WorkspaceEngine} from '../dist/lib/civora-storage.js';
import {resolveDocumentSet,setVersion} from '../dist/lib/civora-document-sets.js';
import {exportDocumentSetArchive} from '../dist/lib/civora-document-set-archive.js';
import {Viewport2D,PointerSession} from '../dist/lib/civora-interactions.js';
const repo=await new MemoryRepository().open(),engine=new WorkspaceEngine(repo,'u-admin');
try {
 await engine.initialize(createEmptyWorkspace(),new Map());
 const projectId=await engine.run('project.create',{name:'Controlled set example',code:'SET'});
 const id=await engine.addFile(new File(['Original design coordination notes\n'],'notes.txt',{type:'text/plain'}),{projectId});
 const source=currentVersion(engine.state.documents.find(d=>d.id===id));
 const setId=await engine.run('set.create',{projectId,name:'Field issue A',members:[{documentId:id,versionId:null}]});
 await engine.run('set.lock',{id:setId,expectedVersion:1,reason:'Approved issue contents'});
 const resolved=resolveDocumentSet(engine.state,engine.actorId,setId);
 assert.equal(resolved.records[0].versionId,source.id);assert.equal(resolved.records[0].binding,'fixed');
 const archive=await exportDocumentSetArchive(()=>engine.state,engine.actorId,setId,repo,{expectedVersion:setVersion(resolved.set)});
 assert.ok(archive.zip.size>source.size);assert.equal(archive.manifest.documents[0].hash,source.hash);
 const view=new Viewport2D({width:390,height:600,contentWidth:1200,contentHeight:800});
 const point=view.point({x:.3,y:.6});view.zoomAt(2,point.x,point.y);assert.ok(Math.abs(view.normalized(point.x,point.y).x-.3)<1e-9);
 const pointers=new PointerSession();pointers.down({pointerId:1,clientX:20,clientY:20});pointers.down({pointerId:2,clientX:40,clientY:20});assert.equal(pointers.up({pointerId:2,clientX:40,clientY:20}).kind,'cancelled');pointers.cancel();
 console.log(JSON.stringify({orderedMembers:resolved.records.length,fixedOriginal:true,zipBytes:archive.zip.size,pinchDoesNotBecomeTap:true,modules:'document-sets, document-set-archive, interactions'},null,2));
}finally{engine.close();}
