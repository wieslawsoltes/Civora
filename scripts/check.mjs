import { readdir } from 'node:fs/promises';
import { resolve } from 'node:path';
import { spawnSync } from 'node:child_process';
const root=resolve('.');let checked=0;
async function walk(path){for(const entry of await readdir(path,{withFileTypes:true})){if(['node_modules','.git','data','data-local','test-results'].includes(entry.name))continue;const name=resolve(path,entry.name);if(entry.isDirectory())await walk(name);else if(/\.(mjs|js)$/.test(name)){const result=spawnSync(process.execPath,['--check',name],{encoding:'utf8'});if(result.status!==0)throw new Error(result.stderr);checked++;}}}
await walk(root);console.log(`Syntax checked ${checked} JavaScript modules.`);
