/** Real HTTP checks under the /Civora/ prefix; not a browser lifecycle test. */
import assert from 'node:assert/strict';
import {createServer} from 'node:http';
import {readFile, readdir, stat} from 'node:fs/promises';
import {resolve, sep} from 'node:path';
import {fileURLToPath} from 'node:url';
import {createHash} from 'node:crypto';
const root = fileURLToPath(new URL('../_site/', import.meta.url));
const prefix = '/Civora/';
const server = createServer(async (req,res) => {
  try {
    const url = new URL(req.url, 'http://localhost');
    if (!url.pathname.startsWith(prefix)) throw Error('outside mount');
    const rel = decodeURIComponent(url.pathname.slice(prefix.length)) || 'index.html';
    const path = resolve(root, rel);
    if (!path.startsWith(root.endsWith(sep) ? root : root + sep)) throw Error('outside root');
    const info = await stat(path); if (!info.isFile()) throw Error('not a file');
    res.writeHead(200); res.end(await readFile(path));
  } catch {res.writeHead(404);res.end('Not found');}
});
await new Promise(r => server.listen(0,'127.0.0.1',r));
const base=`http://127.0.0.1:${server.address().port}${prefix}`;
let checks=0;
try {
  for (const file of ['','index.html','portal.html','manifest.webmanifest','sw.js','release.json','oauth-callback.html',
    'app/favicon.svg','app/styles.css','app/oauth-callback.js','dist/civora.html','examples/reuse.html','examples/local-folder.html','docs/GITHUB-PAGES.md',
    ... (await readdir(resolve(root,'dist/lib'))).map(n=>'dist/lib/'+n)]) {
    const r=await fetch(base+file); assert.equal(r.status,200,file);assert.ok((await r.arrayBuffer()).byteLength,file);checks++;
  }
  for (const file of ['server/index.mjs','.env','.env.example','data/workspace.sqlite','data-local/workspace.sqlite',
    'tests/core.test.mjs','package.json','.git/config','test-results/static-http.json']) {
    const r=await fetch(base+file);assert.equal(r.status,404,file);await r.arrayBuffer();checks++;
  }
  const manifest=JSON.parse(await readFile(resolve(root,'manifest.webmanifest'),'utf8'));
  assert.equal(new URL(manifest.start_url,base).pathname,prefix);checks++;
  const html=await readFile(resolve(root,'index.html'),'utf8');
  assert.ok(html.includes('globalThis.__CIVORA_SINGLE_FILE__ = false;'));checks++;
  assert.ok(!html.includes('src="/app/'));checks++;
  const release=JSON.parse(await readFile(resolve(root,'release.json'),'utf8'));
  assert.ok(html.includes(`content="${release.build}"`));checks++;
  const sw=await readFile(resolve(root,'sw.js'),'utf8');
  const digest=createHash('sha256').update(await readFile(resolve(root,'index.html'))).digest('hex');
  assert.ok(sw.includes(digest));checks++;
  assert.equal(await readFile(resolve(root,'.nojekyll'),'utf8'),'');checks++;
  console.log(`${checks} Pages HTTP/build checks passed under /Civora/.`);
} finally {server.closeAllConnections();await new Promise(r=>server.close(r));}
