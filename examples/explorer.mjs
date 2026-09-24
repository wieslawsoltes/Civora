// Run `npm run build` first. No app shell, browser globals, services or npm dependencies.
import assert from 'node:assert/strict';
import {createEmptyWorkspace,previewDocumentMove,currentVersion} from '../dist/lib/civora-core.js';
import {MemoryRepository,WorkspaceEngine} from '../dist/lib/civora-storage.js';
import {defaultExplorerView,queryExplorer,visibleExplorerViews,explorerLink,resolveExplorerLink,defaultExplorerLayout,normalizeExplorerLayout,explorerPresentationPreset,explorerDetailView} from '../dist/lib/civora-explorer.js';
const layout=normalizeExplorerLayout({treeWidth:285,previewPosition:'bottom'});
const review=explorerPresentationPreset('review',layout);
assert.equal(defaultExplorerLayout().commandStyle,'standard');
assert.equal(review.previewPosition,'right');
assert.equal(review.previewWidth,420);
assert.equal(review.treeWidth,285);
assert.equal(explorerDetailView('example').density,'compact');
const repository=await new MemoryRepository().open(),engine=new WorkspaceEngine(repository,'u-admin');
try {
 await engine.initialize(createEmptyWorkspace(),new Map());
 const projectId=await engine.run('project.create',{name:'Explorer library example',code:'EXP'});
 const folderId=await engine.run('folder.create',{projectId,name:'Approved drawing register'});
 const first=await engine.addFile(new File(['Original controlled text\n'],'drawing-2.txt',{type:'text/plain'}),{projectId,title:'Coordination notes',discipline:'Architecture'});
 const second=await engine.addFile(new File(['Another unchanged original\n'],'drawing-10.txt',{type:'text/plain'}),{projectId,title:'Delivery notes',discipline:'Architecture'});
 const config={...defaultExplorerView(projectId),filters:[{key:'filetype',op:'eq',value:'txt'}],columns:['name','title','number','revision','folder'],groupBy:'discipline'};
 await engine.run('explorerView.save',{projectId,name:'Text deliverables',scope:'project',config});
 const result=queryExplorer(engine.state,engine.actorId,config);
 assert.deepEqual(result.items.map(d=>d.id),[first,second]);
 assert.equal(visibleExplorerViews(engine.state,engine.actorId).length,1);
 const before=engine.state.revision,blobId=currentVersion(result.items[0]).blobId;
 const preview=previewDocumentMove(engine.state,engine.actorId,{projectId,folderId,documentIds:[first,second]});
 assert.equal(engine.state.revision,before); // Preview is not a write.
 await engine.run('document.bulkMove',preview.payload);
 assert.equal(engine.state.revision,before+1);
 assert.equal(queryExplorer(engine.state,engine.actorId,{...config,folderId,includeSubfolders:false}).total,2);
 assert.equal(await (await repository.blob(blobId)).text(),'Original controlled text\n');
 const link=explorerLink(engine.state,{projectId,documentId:first});
 assert.equal(resolveExplorerLink(engine.state,engine.actorId,link).folderId,folderId);
 console.log(JSON.stringify({documents:result.total,sharedViews:1,atomicMoveRevisions:1,presentationPreset:review.previewPosition,originalBytesPreserved:true,link,modules:'core, storage, explorer'},null,2));
} finally {engine.close();}
