// Uses only the independently importable bundles. Run after npm run build.
import assert from 'node:assert/strict';
import {createEmptyWorkspace,previewDocumentRename} from '../dist/lib/civora-core.js';
import {MemoryRepository,WorkspaceEngine} from '../dist/lib/civora-storage.js';
import {suggestRenames,planDocumentRename} from '../dist/lib/civora-document-rename.js';
import {readVerifiedRevision,decodeComparisonText,compareLines,comparisonReport} from '../dist/lib/civora-comparison.js';
const repository=await new MemoryRepository().open(),engine=new WorkspaceEngine(repository,'u-admin');
try{
 await engine.initialize(createEmptyWorkspace(),new Map());
 const project=await engine.run('project.create',{name:'Independent workbench example',code:'WB'});
 const id=await engine.addFile(new File(['Scope\nKeep this requirement\nEnd\n'],'Notes.txt',{type:'text/plain'}),{projectId:project});
 await engine.run('document.checkout',{id});await engine.checkin(new File(['Scope\nNew requirement\nKeep this requirement\nEnd\n'],'Notes.txt',{type:'text/plain'}),{id,revision:'P02',comment:'Add one requirement'});
 const original=structuredClone(engine.state.documents.find(d=>d.id===id));
 const originals=await Promise.all(original.versions.map(v=>readVerifiedRevision(v,hash=>repository.blob(hash))));
 const [a,b]=await Promise.all(originals.map(decodeComparisonText)),diff=compareLines(a.text,b.text);
 assert.equal(diff.inserted,1);assert.equal(diff.deleted,0);
 const report=comparisonReport({document:original,baseline:original.versions[0],target:original.versions[1],result:diff,decoding:[{encoding:a.encoding,bom:a.bom},{encoding:b.encoding,bom:b.bom}]});
 assert.equal(report.verified,true);assert.equal(report.comparison.complete,true);
 const proposed=suggestRenames([original],{pattern:'ISSUED-{seq:3}-{name}'})[0];
 const payload={projectId:project,baseRevision:engine.state.revision,reason:'Align issued filenames',items:[{id,versionId:original.versions.at(-1).id,folderId:original.folderId,expectedName:original.name,name:proposed.name}]};
 assert.equal(planDocumentRename(engine.state,engine.actorId,payload).rows.length,1);
 const preview=previewDocumentRename(engine.state,engine.actorId,payload),before=engine.state.revision;
 await engine.run('document.bulkRename',preview.payload);
 const renamed=engine.state.documents.find(d=>d.id===id);
 assert.equal(renamed.name,'ISSUED-001-Notes.txt');assert.deepEqual(renamed.versions,original.versions);assert.equal(engine.state.revision,before+1);
 console.log(JSON.stringify({modules:'comparison, document-rename',inserted:diff.inserted,deleted:diff.deleted,hashesVerified:true,renamed:renamed.name,oneTransaction:true,originalRevisionsUnchanged:true},null,2));
}finally{engine.close();}
