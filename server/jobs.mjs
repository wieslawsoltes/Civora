import { Worker } from 'node:worker_threads';
import { spawn } from 'node:child_process';
import { mkdir, readFile, writeFile, rename, stat, rm, mkdtemp } from 'node:fs/promises';
import { join, isAbsolute } from 'node:path';
import { createHash } from 'node:crypto';
import { createAccessContext } from '../packages/access/index.js';
import { validateModel, modelStats } from '../packages/engineering/index.js';
export async function createJobRunner({ops,store,dataDir,configFile}){
 const directory=join(dataDir,'renditions');await mkdir(directory,{recursive:true,mode:0o700});let converters=[];
 if(configFile){converters=JSON.parse(await readFile(configFile,'utf8'));if(!Array.isArray(converters))throw new Error('Converter config must be an array.');for(const c of converters)if(!Array.isArray(c.extensions)||!c.extensions.every(e=>/^[a-z0-9]+$/.test(e))||!['pdf','svg','mesh'].includes(c.format)||!isAbsolute(c.executable)||!Array.isArray(c.args)||c.args.some(a=>typeof a!=='string'))throw new Error('Invalid converter registration.');}
 let running=false,closed=false,activeWorker=null,activeProcess=null;
 const supported=(name,format)=>{const ext=name.split('.').at(-1).toLowerCase();return converters.some(c=>c.extensions.includes(ext)&&c.format===format)||(format==='mesh'&&['obj','stl','glb','ifc','json'].includes(ext))||(format==='svg'&&ext==='dxf')||(format==='pdf'&&['pdf','dxf','txt','md','csv','json','xml','log','yaml','yml','html','js','css'].includes(ext));};
 async function native(converter,blob,job){const tmp=await mkdtemp(join(directory,'work-')),input=join(tmp,'input.'+job.input.name.split('.').at(-1)),extension=job.input.format==='mesh'?'json':job.input.format,output=join(tmp,'output.'+extension);try{await writeFile(input,new Uint8Array(await blob.arrayBuffer()),{mode:0o600});if(closed)throw new Error('Rendition runner is stopping.');await new Promise((resolve,reject)=>{const args=converter.args.map(a=>a.replaceAll('{input}',input).replaceAll('{output}',output)),child=spawn(converter.executable,args,{shell:false,cwd:tmp,env:{PATH:process.env.PATH,HOME:tmp,LANG:'C.UTF-8'},stdio:['ignore','ignore','pipe']});activeProcess=child;let errors='';child.stderr.on('data',d=>{if(errors.length<4000)errors+=d.toString();});const timer=setTimeout(()=>{child.kill('SIGKILL');reject(new Error('Native converter timed out.'));},60000);child.on('error',e=>{clearTimeout(timer);reject(e);});child.on('exit',code=>{clearTimeout(timer);activeProcess=null;code===0?resolve():reject(new Error('Native converter failed: '+errors.slice(0,1000)));});});const size=(await stat(output)).size;if(size>50*1024*1024)throw new Error('Converter output exceeds 50 MiB.');const bytes=await readFile(output);let stats,warnings=['External converter output. Native-application fidelity has not been certified.'];if(extension==='json'){const model=JSON.parse(bytes.toString());validateModel(model);stats=modelStats(model);warnings.push(...model.warnings||[]);}if(extension==='pdf'&&!bytes.subarray(0,5).equals(Buffer.from('%PDF-')))throw new Error('Converter did not produce a PDF.');return{bytes,mime:extension==='json'?'application/json':extension==='pdf'?'application/pdf':'image/svg+xml',extension,warnings,stats};}finally{await rm(tmp,{recursive:true,force:true});}}
 async function builtin(blob, job) {
   const bytes = await blob.arrayBuffer();
   if (closed) throw new Error('Rendition runner is stopping.');
   return new Promise((resolve, reject) => {
     const worker = new Worker(new URL('./render-worker.mjs', import.meta.url), {
       workerData: {bytes, mime: blob.type, name: job.input.name, options: job.input},
       transferList: [bytes],
       resourceLimits: {maxOldGenerationSizeMb: 256, maxYoungGenerationSizeMb: 32}
     });
     activeWorker = worker;
     let settled = false;
     const finish = (error, result) => {
       if (settled) return;
       settled = true;
       clearTimeout(timer);
       if (activeWorker === worker) activeWorker = null;
       error ? reject(error) : resolve(result);
     };
     const timer = setTimeout(() => {
       finish(new Error('Rendition worker timed out.'));
       worker.terminate();
     }, 60000);
     worker.once('message', result => {
       finish(result.error ? new Error(result.error) : null, result);
       worker.terminate();
     });
     worker.once('error', error => finish(error));
     // terminate() may exit with code 0 before the worker posts any message.
     // Always settle an unfinished promise, including that early-start race.
     worker.once('exit', () => finish(new Error('Rendition worker exited before returning a result.')));
   });
 }
 async function tick(){if(running||closed)return;running=true;try{const job=ops.claim();if(!job)return;try{const state=await store.read(),d=state.documents.find(d=>d.id===job.input.documentId),v=d?.versions.find(v=>v.id===job.input.versionId);if(!v||v.hash!==job.input.hash)throw new Error('Pinned source revision is missing.');const blob=await store.blob(v.blobId);if(!blob)throw new Error('Source content is missing.');if(closed)return;const converter=converters.find(c=>c.extensions.includes(job.input.name.split('.').at(-1).toLowerCase())&&c.format===job.input.format),r=converter?await native(converter,blob,job):await builtin(blob,job);if(closed)return;if(ops.job(job.id)?.status!=='running')return;const bytes=Buffer.from(r.bytes),hash=createHash('sha256').update(bytes).digest('hex'),path=join(directory,job.id+'.bin'),temp=path+'.tmp';await writeFile(temp,bytes,{mode:0o600});await rename(temp,path);ops.finish(job.id,{hash,size:bytes.length,mime:r.mime,extension:r.extension,warnings:r.warnings,stats:r.stats});ops.event('rendition.completed',job.owner,{jobId:job.id,sourceHash:v.hash,outputHash:hash});}catch(e){ops.fail(job.id,e.message);ops.event('rendition.failed','system',{jobId:job.id,error:e.message.slice(0,400)});}}finally{running=false;}}
 const interval=setInterval(tick,400);interval.unref();
 function enqueue(document,version,format,owner){if(!supported(document.name,format)){const e=new Error('No built-in or configured renderer supports this conversion.');e.code='VALIDATION';throw e;}return ops.enqueue('rendition',{documentId:document.id,projectId:document.projectId,versionId:version.id,hash:version.hash,revision:version.label,name:document.name,format,rendererVersion:'0.2.0'},owner);}
 function automatic(document,owner){const ext=document.name.split('.').at(-1).toLowerCase(),format=['obj','stl','glb','ifc'].includes(ext)?'mesh':'pdf';if(supported(document.name,format))enqueue(document,document.versions.at(-1),format,owner);}
 function allowed(job,state,user){const a=createAccessContext(state,user);return job&&a.can('download','document',job.input.documentId);}
 return{enqueue,automatic,allowed,supported,tick,async output(id){return readFile(join(directory,id+'.bin'));},capabilities:()=>({builtin:{pdf:['DXF 2D subset','text','PDF pass-through'],svg:['DXF 2D subset'],mesh:['OBJ','STL','GLB static','IFC subset']},external:converters.map(c=>({extensions:c.extensions,format:c.format})),isolated:'Built-in JavaScript uses bounded worker threads. External tools are timeout-limited subprocesses; OS/container isolation is the operator’s responsibility.'}),async close(){closed=true;clearInterval(interval);await activeWorker?.terminate();activeProcess?.kill('SIGKILL');while(running)await new Promise(r=>setTimeout(r,10));}};
}
