import { parentPort, workerData } from 'node:worker_threads';
import { renderRendition } from '../packages/renditions/index.js';
try{const r=await renderRendition(new Blob([workerData.bytes],{type:workerData.mime}),workerData.name,workerData.options);const bytes=await r.blob.arrayBuffer();parentPort.postMessage({bytes,mime:r.blob.type,extension:r.extension,warnings:r.warnings,stats:r.stats},[bytes]);}catch(e){parentPort.postMessage({error:e.message});}
