import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, rm, readFile, writeFile, symlink, link, mkdir } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { NodeDirectoryFS } from '../server/local-filesystem.mjs';
import { relativePath, portableName, hashBlob, DirectoryMonitor } from '../packages/filesystem/index.js';
import { DirectoryRepository } from '../packages/filesystem/repository.js';
import { WorkingCopyManager, importTree, exportTree } from '../packages/filesystem/working-copies.js';
import { fixture, makeEngine } from './support.mjs';
import { createEmptyWorkspace } from '../packages/core/index.js';
import { WorkspaceEngine, prepareFile } from '../packages/storage/index.js';
const temp = async t => { const path = await mkdtemp(join(tmpdir(),'civora-local-')); t.after(() => rm(path,{ recursive:true, force:true })); return path; };
const blob = text => new Blob([text]);
function mutex() { let q=Promise.resolve(); return (_key,fn) => { const p=q.then(fn,fn); q=p.catch(()=>{}); return p; }; }

test('portable paths reject traversal, platform aliases and reserved names', () => {
  for (const name of ['../a','/etc/passwd','C:/file','a\\b','a//b','a/../b','NUL.txt','a/COM1','a.','a ','x\0y','.civora-trash/a']) assert.throws(() => relativePath(name), name);
  assert.equal(relativePath('Projekt/Żółć 日本語.dxf'),'Projekt/Żółć 日本語.dxf'); assert.equal(relativePath('',{ empty:true }), ''); assert.equal(portableName('CON.txt'),'_CON.txt');
});
test('node root roundtrips binary/Unicode, detects stale writes, retains overwrite history and restores trash', async t => {
  const fs=await new NodeDirectoryFS(await temp(t)).open(); await fs.mkdir('Zażółć/設計');
  const data=new Blob([Uint8Array.from([0,255,1,128]),'żółć']); const a=await fs.write('Zażółć/設計/a.bin',data,{ createOnly:true });
  assert.deepEqual(await (await fs.read(a.path)).arrayBuffer(),await data.arrayBuffer());
  await assert.rejects(fs.write(a.path,blob('replace'),{ createOnly:true }),{ code:'CONFLICT' });
  await assert.rejects(fs.write(a.path,blob('replace'),{ expectedHash:'0'.repeat(64) }),{ code:'CONFLICT' });
  const b=await fs.write(a.path,blob('replaced'),{ expectedHash:a.hash }); assert.equal(await (await fs.read(a.path)).text(),'replaced');
  const history=await fs.trashList(); assert.equal(history.length,1); assert.equal(history[0].reason,'replace');
  await fs.restoreTrash(history[0].id,'old.bin'); assert.deepEqual(await (await fs.read('old.bin')).arrayBuffer(),await data.arrayBuffer());
  const tr=await fs.trash(a.path,{ expectedHash:b.hash }); await assert.rejects(fs.read(a.path),{ code:'NOT_FOUND' });
  await fs.restoreTrash(tr.id); assert.equal(await (await fs.read(a.path)).text(),'replaced');
  const move=await fs.move(a.path,'new/name.txt',{ expectedHash:b.hash }); assert.equal(move.path,'new/name.txt');
  assert.ok((await fs.list('',{ recursive:true })).some(x=>x.path==='new/name.txt')); assert.ok((await fs.diskInfo()).available>0);
});
test('node scoped files reject symbolic links, hardlinks and read-only mutation',async t=>{
  const path=await temp(t), outside=join(path,'outside'), root=join(path,'root'); await mkdir(root); await writeFile(outside,'private');
  await symlink(outside,join(root,'escape')); await link(outside,join(root,'hard'));
  const fs=await new NodeDirectoryFS(root).open(); for(const p of ['escape','hard']) await assert.rejects(fs.read(p),{ code:'FORBIDDEN' });
  const items=await fs.list(); assert.equal(items.filter(i=>i.kind==='blocked').length,2);
  await assert.rejects(fs.write('../outside',blob('bad'),{ createOnly:true })); assert.equal(await readFile(outside,'utf8'),'private');
  const ro=await new NodeDirectoryFS(root,{ readOnly:true }).open(); await assert.rejects(ro.mkdir('new'),{ code:'FORBIDDEN' }); await assert.rejects(ro.write('x',blob('x'),{ createOnly:true }),{ code:'FORBIDDEN' });
});
test('a changed native file is never overwritten using a previous hash',async t=>{
 const path=await temp(t),fs=await new NodeDirectoryFS(path).open(),first=await fs.write('a.txt',blob('a'),{ createOnly:true });
 await writeFile(join(path,'a.txt'),'b'); await assert.rejects(fs.write('a.txt',blob('lost'),{ expectedHash:first.hash }),{ code:'CONFLICT' }); assert.equal(await readFile(join(path,'a.txt'),'utf8'),'b');
});
test('folder workspace persists original bytes, commits, stale revision checks and integrity after reopen',async t=>{
 const path=await temp(t),fs=await new NodeDirectoryFS(path).open(),f=await fixture(),lock=mutex();
 const repo=await new DirectoryRepository(fs,{ create:true,lock }).open(); await repo.initialize(f.state,f.files);
 const engine=new WorkspaceEngine(repo,'u-admin');await engine.initialize(); const rev=engine.state.revision;
 await engine.run('project.update',{ id:f.project,description:'Saved on real disk' });
 await assert.rejects(repo.commit({type:'project.update',payload:{id:f.project,name:'stale'}},'u-admin',rev),{code:'CONFLICT'});
 const check=await repo.integrity();assert.equal(check.valid,true);assert.equal(check.files,2);assert.equal((await repo.history()).length,2);
 const state=await repo.read(); repo.close();
 const next=await new DirectoryRepository(fs,{lock}).open();assert.deepEqual(await next.read(),state);assert.equal(await (await next.blob(f.state.documents[0].versions[0].hash)).text(),'Original a.txt');next.close();
});
test('folder checkpoint corruption is detected and explicit HEAD recovery verifies original blobs',async t=>{
 const path=await temp(t),fs=await new NodeDirectoryFS(path).open(),f=await fixture(),repo=await new DirectoryRepository(fs,{create:true,lock:mutex()}).open();await repo.initialize(f.state,f.files);const good=repo.currentCommit;
 await writeFile(join(path,'.civora/HEAD.json'),'broken');await assert.rejects(repo.read(),/HEAD is damaged/);
 const damaged=await hashBlob(await fs.read('.civora/HEAD.json'));await repo.recover(good,{expectedHeadHash:damaged});assert.equal((await repo.read()).id,f.state.id);
 const id=f.state.documents[0].versions[0].hash;await writeFile(join(path,'.civora/blobs',id),'tampered');await assert.rejects(repo.integrity(),/SHA-256/);repo.close();
});
test('folder workspace parallel cooperating writers retain compare-and-swap semantics',async t=>{
 const path=await temp(t),fs=await new NodeDirectoryFS(path).open(),f=await fixture(),lock=mutex(),a=await new DirectoryRepository(fs,{create:true,lock}).open();await a.initialize(f.state,f.files);const b=await new DirectoryRepository(fs,{lock}).open();
 const commands=['A','B'].map(name=>({type:'project.update',payload:{id:f.project,name}}));const result=await Promise.allSettled([a.commit(commands[0],'u-admin',f.state.revision),b.commit(commands[1],'u-admin',f.state.revision)]);assert.equal(result.filter(r=>r.status==='fulfilled').length,1);assert.equal(result.find(r=>r.status==='rejected').reason.code,'CONFLICT');a.close();b.close();
});
test('working copy checks out, detects native edits, checks in exact bytes, and reconnects its index',async t=>{
 const path=await temp(t),fs=await new NodeDirectoryFS(path).open(),f=await fixture(),engine=await makeEngine(f.state,f.files),manager=await new WorkingCopyManager(engine,fs).open();
 const link=await manager.materialize(f.doc,{path:'CAD/working.txt'});assert.equal(engine.state.documents.find(d=>d.id===f.doc).checkedOutBy,'u-admin');assert.equal((await manager.scan())[0].status,'unchanged');
 await writeFile(join(path,link.path),'native application output \u03a9');const status=(await manager.scan())[0];assert.equal(status.status,'modified');assert.ok(status.canCheckin);
 await manager.checkin(link.id,{revision:'P02',comment:'External edit',expectedLocalHash:status.localHash});const d=engine.state.documents.find(d=>d.id===f.doc);assert.equal(d.versions.length,2);assert.equal(d.checkedOutBy,null);assert.equal(await (await engine.repository.blob(d.versions.at(-1).hash)).text(),'native application output Ω');
 const fresh=await new WorkingCopyManager(engine,fs).open();assert.equal(fresh.links.length,1);assert.equal((await fresh.scan())[0].status,'unchanged');
 await fresh.untrack(link.id);assert.equal(await readFile(join(path,link.path),'utf8'),'native application output Ω');
});
test('working copies reject remote conflicts and preserve modified bytes during explicit refresh',async t=>{
 const path=await temp(t),fs=await new NodeDirectoryFS(path).open(),f=await fixture(),engine=await makeEngine(f.state,f.files),m=await new WorkingCopyManager(engine,fs).open(),l=await m.materialize(f.doc,{path:'a.txt'});
 await writeFile(join(path,l.path),'local change');await engine.checkin(blob('remote change'),{id:f.doc,revision:'P02',comment:'Changed elsewhere'});
 const s=(await m.scan())[0];assert.equal(s.status,'conflict');await assert.rejects(m.checkin(l.id,{revision:'P03',comment:'no'}),{code:'CONFLICT'});
 await assert.rejects(m.refresh(l.id,{expectedLocalHash:s.localHash}),{code:'CONFLICT'});
 const result=await m.refresh(l.id,{expectedLocalHash:s.localHash,keepModified:true});assert.equal(await readFile(join(path,result.preserved),'utf8'),'local change');assert.equal(await readFile(join(path,l.path),'utf8'),'remote change');
});
test('base-version check-in rejects stale native working-copy revisions at the domain boundary',async()=>{
 const f=await fixture(),e=await makeEngine(f.state,f.files);await e.run('document.checkout',{id:f.doc});const p=await prepareFile(blob('bytes'));
 await assert.rejects(e.run('document.checkin',{id:f.doc,revision:'P02',baseVersionId:'old',file:p.descriptor},p),{code:'CONFLICT'});assert.equal(e.state.documents.find(d=>d.id===f.doc).versions.length,1);
});
test('folder import preserves nesting, reports partial results, and export never clobbers originals',async t=>{
 const f=await fixture(),e=await makeEngine(f.state,f.files),fs=await new NodeDirectoryFS(await temp(t)).open();const report=await importTree(e,[{path:'Building/Level 1/Plan.txt',file:blob('plan')},{path:'Building/Level 2/Data.bin',file:new Blob([new Uint8Array([0,255])])}],{projectId:f.project});assert.equal(report.failed.length,0);assert.equal(report.created.length,2);
 const folders=e.state.folders;assert.ok(folders.some(f=>f.name==='Level 1'&&folders.find(x=>x.id===f.parentId)?.name==='Building'));
 const exported=await exportTree(e,fs,report.created.map(x=>x.documentId));assert.equal(exported.created.length,2);assert.equal((await exportTree(e,fs,report.created.map(x=>x.documentId))).failed.length,2);
 await assert.rejects(importTree(e,[{path:'A.txt',file:blob('1')},{path:'a.txt',file:blob('2')}],{projectId:f.project}),/collisions/);
 const cancelled=await importTree(e,[{path:'no.txt',file:blob('no')}],{projectId:f.project,signal:AbortSignal.abort()});assert.ok(cancelled.cancelled);
});
test('directory monitor reports reconciled changes and stops cleanly',async()=>{let n=0;const m=new DirectoryMonitor(async()=>++n);assert.equal(await m.tick(),1);assert.equal(await m.tick(),2);assert.equal(m.last,2);m.stop();});
test('folder repositories preserve recorded MIME types across real-disk reopen',async t=>{const path=await temp(t),fs=await new NodeDirectoryFS(path).open(),f=await fixture(),repo=await new DirectoryRepository(fs,{create:true,lock:mutex()}).open();await repo.initialize(f.state,f.files);repo.close();const reopen=await new DirectoryRepository(fs,{lock:mutex()}).open();await reopen.read();const v=f.state.documents[0].versions[0];assert.equal((await reopen.blob(v.blobId)).type,v.mime);reopen.close();});
test('native working-copy check-in preserves revision MIME instead of adopting download octet-stream',async t=>{const fs=await new NodeDirectoryFS(await temp(t)).open(),f=await fixture(),e=await makeEngine(f.state,f.files),m=await new WorkingCopyManager(e,fs).open(),link=await m.materialize(f.doc,{path:'a.txt'});const original=e.state.documents.find(d=>d.id===f.doc).versions[0].mime;await fs.write('a.txt',new Blob(['new native text']),{expectedHash:link.baseHash});await m.checkin(link.id,{revision:'P02',expectedLocalHash:await hashBlob(new Blob(['new native text']))});assert.equal(e.state.documents.find(d=>d.id===f.doc).versions.at(-1).mime,original);});
test('folder import restores known media type without transforming original bytes',async()=>{const f=await fixture(),e=await makeEngine(f.state,f.files),svg='<svg xmlns="http://www.w3.org/2000/svg"><rect width="5" height="5"/></svg>',report=await importTree(e,[{path:'Drawing.svg',file:new Blob([svg],{type:'application/octet-stream'})}],{projectId:f.project});const v=e.state.documents.find(d=>d.id===report.created[0].documentId).versions[0];assert.equal(v.mime,'image/svg+xml');assert.equal(await (await e.repository.blob(v.hash)).text(),svg);});

test('independent new workspaces have distinct IDs without altering legacy backups', () => {
  const a=createEmptyWorkspace(),b=createEmptyWorkspace();assert.notEqual(a.id,b.id);assert.match(a.id,/^workspace-/);
});
test('copied legacy workspaces isolate disk working-copy indexes by persistent repository identity',async t=>{
  const root=await temp(t), f=await fixture();f.state.id='civora-workspace';
  await mkdir(join(root,'working'));const working=await new NodeDirectoryFS(join(root,'working')).open();
  const repositories=[];const engines=[];
  for(const name of['A','B']){await mkdir(join(root,name));const disk=await new NodeDirectoryFS(join(root,name)).open(),repo=await new DirectoryRepository(disk,{create:true,lock:mutex()}).open();await repo.initialize(f.state,f.files);repositories.push(repo);const e=new WorkspaceEngine(repo);await e.initialize();engines.push(e);}
  const a=await new WorkingCopyManager(engines[0],working).open(),b=await new WorkingCopyManager(engines[1],working).open();
  const entry=await a.materialize(f.doc,{path:'A/a.txt'});assert.notEqual(a.ledgerPath,b.ledgerPath);assert.equal(b.links.length,0);
  await b.materialize(f.doc,{path:'B/a.txt'});assert.equal((await a.scan()).length,1);assert.equal((await b.scan()).length,1);
  const reopened=await new DirectoryRepository(repositories[0].fs,{lock:mutex()}).open(),engine=new WorkspaceEngine(reopened);await engine.initialize();
  const again=await new WorkingCopyManager(engine,working).open();assert.equal(again.ledgerPath,a.ledgerPath);assert.equal(again.links[0].id,entry.id);
  engines[0].repository=repositories[1];await assert.rejects(a.scan(),{code:'FORBIDDEN'});for(const r of [...repositories,reopened])r.close();
});
test('invalid working-copy path values are rejected without modifying exported bytes',async t=>{
  const fs=await new NodeDirectoryFS(await temp(t)).open(),f=await fixture(),e=await makeEngine(f.state,f.files),m=await new WorkingCopyManager(e,fs).open();await m.materialize(f.doc,{path:'a.txt'});
  const data=JSON.parse(await(await fs.read(m.ledgerPath)).text());data.links[0].path=null;
  await fs.write(m.ledgerPath,new Blob([JSON.stringify(data)]),{expectedHash:m.ledgerHash});await assert.rejects(m.reload(),/Invalid or duplicate/);assert.equal(await(await fs.read('a.txt')).text(),'Original a.txt');
});
