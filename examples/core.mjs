// node examples/core.mjs
import { createEmptyWorkspace, applyCommand, searchDocuments } from '../dist/lib/civora-core.js';
import { prepareFile, MemoryRepository, WorkspaceEngine } from '../dist/lib/civora-storage.js';
let state=createEmptyWorkspace();
const project=applyCommand(state,{type:'project.create',payload:{code:'EX',name:'Example project'}},'u-admin');
state=project.state;
const repository=await new MemoryRepository().open();
const engine=new WorkspaceEngine(repository,'u-admin');
await engine.initialize(state,new Map());
await engine.addFile(new File(['Original content\n'],'example.txt',{type:'text/plain'}),{projectId:project.result,number:'EX-001',title:'Standalone engine example',revision:'P01'});
console.log(searchDocuments(engine.state,{query:'type:txt'}).map(d=>({name:d.name,title:d.title,state:d.state})));
engine.close();
