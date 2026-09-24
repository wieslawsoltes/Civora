/** Tiny deterministic bundler for this repository's named ES modules.
 * No eval(), new Function(), dependency downloads, or package manager are required.
 * This deliberately supports only the module syntax used in Civora, and rejects
 * external or unsupported imports instead of silently emitting a broken bundle.
 */
import { readFile, writeFile, mkdir, rename } from 'node:fs/promises';
import { resolve, relative, dirname, posix } from 'node:path';
import { ROOT } from './static.mjs';
import { createHash } from 'node:crypto';
const sha256=value=>createHash('sha256').update(value).digest('hex');
const version=JSON.parse(await readFile(resolve(ROOT,'package.json'),'utf8')).version;
async function writeAtomic(path,value){const temp=path+'.build-'+process.pid;await writeFile(temp,value);await rename(temp,path);}
const moduleKey=path=>relative(ROOT,path).replaceAll('\\','/');
async function bundle(entry,{library=false}={}){
  const modules=new Map(),visiting=new Set();
  async function visit(path){if(modules.has(path))return;if(visiting.has(path))throw new Error('Cyclic module dependency: '+path);visiting.add(path);let text=await readFile(path,'utf8');const imports=[...text.matchAll(/import\s*\{([\s\S]*?)\}\s*from\s*['"]([^'"]+)['"];?/g)];
    for(const match of imports){if(!match[2].startsWith('.'))throw new Error('External import in browser bundle.');const target=resolve(dirname(path),match[2]);await visit(target);const names=match[1].split(',').map(s=>s.trim().replace(/\s+as\s+/,': ')).filter(Boolean).join(', ');text=text.replace(match[0],`const { ${names} } = __modules[${JSON.stringify(moduleKey(target))}];`);}
    if(/^\s*import\s/m.test(text))throw new Error('Unsupported import syntax in '+path);
    const exports=[...text.matchAll(/\bexport\s+(?:async\s+)?(?:function|class|const|let)\s+([A-Za-z_$][\w$]*)/g)].map(m=>m[1]);
    text=text.replace(/\bexport\s+(?=(?:async\s+)?(?:function|class|const|let)\b)/g,'');
    modules.set(path,{text,exports});visiting.delete(path);
  }
  const full=resolve(ROOT,entry);await visit(full);let output=`// Civora ${version} — independently authored. MIT license.\nconst __modules = Object.create(null);\n`;
  for(const[path,item]of modules)output+=`\n__modules[${JSON.stringify(moduleKey(path))}] = (() => {\n${item.text}\nreturn { ${item.exports.join(', ')} };\n})();\n`;
  if(library)output+=`\nexport const { ${modules.get(full).exports.join(', ')} } = __modules[${JSON.stringify(moduleKey(full))}];\n`;
  return output;
}
await mkdir(resolve(ROOT,'dist/lib'),{recursive:true});
// Both deployed entry points are atomic documents. Editing the template or any
// module requires npm run build; no route can load a stale CSS/module fragment.
const source=await readFile(resolve(ROOT,'app/shell.html'),'utf8'),css=await readFile(resolve(ROOT,'app/styles.css'),'utf8');
const rawScript=await bundle('app/main.js');
const portalSource=await readFile(resolve(ROOT,'app/portal-shell.html'),'utf8'),portalScript=await bundle('app/portal.js');
const manifest=await readFile(resolve(ROOT,'manifest.webmanifest'),'utf8'),favicon=await readFile(resolve(ROOT,'app/favicon.svg'),'utf8');
const workerSource=await readFile(resolve(ROOT,'scripts/service-worker.template.js'),'utf8');
const build=sha256(JSON.stringify([version,source,css,rawScript,portalSource,portalScript,manifest,favicon,workerSource])).slice(0,20);
const script=rawScript.replaceAll('__CIVORA_BUILD_ID__',build);
function appHTML(singleFile){
 let text=source.replace(/<link[^>]*(?:stylesheet|manifest|icon)[^>]*>/g,'').replace(/<script type="module" src="\.\/app\/main.js"><\/script>/,()=>`<script type="module">globalThis.__CIVORA_SINGLE_FILE__ = ${singleFile};\n${script.replaceAll('</script','<\\/script')}<\/script>`);
 return text.replace('</head>',`<meta name="civora-build" content="${build}"><meta name="civora-version" content="${version}">${singleFile?'':'<link rel="icon" href="./app/favicon.svg" type="image/svg+xml"><link rel="manifest" href="./manifest.webmanifest">'}<style>${css}</style>\n</head>`);
}
const html=appHTML(true),deployedHTML=appHTML(false);
await writeAtomic(resolve(ROOT,'dist/civora.html'),html);
await writeAtomic(resolve(ROOT,'index.html'),deployedHTML);
const portalHTML=portalSource.replace(/<link[^>]*(?:stylesheet|icon)[^>]*>/g,'').replace(/<script type="module" src="\.\/app\/portal.js"><\/script>/,()=>`<script type="module">${portalScript.replaceAll('</script','<\\/script')}</script>`).replace('</head>',`<meta name="civora-build" content="${build}"><style>${css}</style></head>`);
await writeAtomic(resolve(ROOT,'dist/portal.html'),portalHTML);
await writeAtomic(resolve(ROOT,'portal.html'),portalHTML);
for(const name of ['core','storage','connectors','controls','viewer','access','engineering','renditions','sync','model-viewer','filesystem','document-control','automation','explorer','document-sets','interactions','document-copy','navigation','document-rename','comparison']){
  const text=await bundle(`packages/${name}/index.js`,{library:true});await writeFile(resolve(ROOT,`dist/lib/civora-${name}.js`),text);
}
await writeFile(resolve(ROOT,'dist/lib/civora-archive.js'),await bundle('packages/storage/archive.js',{library:true}));
for(const [name,entry] of [['folder-workspace','repository'],['working-copies','working-copies'],['local-text','text'],['folder-drop','drop']]) await writeFile(resolve(ROOT,`dist/lib/civora-${name}.js`),await bundle(`packages/filesystem/${entry}.js`,{library:true}));
for(const [name,entry] of [['editable-register','register'],['baseline-archive','archive'],['reference-discovery','references']]) await writeFile(resolve(ROOT,`dist/lib/civora-${name}.js`),await bundle(`packages/document-control/${entry}.js`,{library:true}));
await writeFile(resolve(ROOT,'dist/lib/civora-document-set-archive.js'),await bundle('packages/document-sets/archive.js',{library:true}));
const modules=['app/mobile.js','app/document-sets.js','packages/interactions/index.js','packages/document-sets/index.js','packages/document-sets/archive.js','app/explorer.js','packages/explorer/index.js','app/automation.js','packages/automation/index.js','app/document-control.js','packages/document-control/index.js','packages/document-control/register.js','packages/document-control/archive.js','packages/document-control/references.js','packages/filesystem/drop.js','app/local.js','packages/filesystem/index.js','packages/filesystem/repository.js','packages/filesystem/working-copies.js','packages/filesystem/text.js','app/features.js','packages/access/index.js','packages/engineering/index.js','packages/model-viewer/index.js','packages/renditions/index.js','packages/sync/index.js','app/main.js','app/seed.js','app/seed-models.js','app/styles.css','app/favicon.svg','packages/core/index.js','packages/storage/index.js','packages/storage/archive.js','packages/connectors/index.js','packages/viewer/index.js','packages/controls/index.js'];
const assets=[];
for(const path of ['index.html','manifest.webmanifest','app/favicon.svg'])assets.push({path:'./'+path,sha256:sha256(await readFile(resolve(ROOT,path)))});
const template=await readFile(resolve(ROOT,'scripts/service-worker.template.js'),'utf8');
const sw=template.replace('__BUILD_JSON__',JSON.stringify(build)).replace('__ASSETS_JSON__',JSON.stringify(assets)).replace('__LEGACY_ASSETS_JSON__',JSON.stringify(['./','./index.html','./manifest.webmanifest',...modules.map(m=>'./'+m)]));
await writeAtomic(resolve(ROOT,'sw.js'),sw);
await writeAtomic(resolve(ROOT,'release.json'),JSON.stringify({format:'civora-release',version,build})+'\n');
console.log(`Built Civora ${version} / ${build}: atomic index.html, dist/civora.html (${Math.round(Buffer.byteLength(html)/1024)} KiB), recipient entries, twenty-nine libraries and scoped offline shell.`);
