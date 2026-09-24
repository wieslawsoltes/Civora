/** Build a public, browser-only Pages artifact; never copy server data or configuration. */
import { cp, mkdir, readFile, rm, writeFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { spawnSync } from 'node:child_process';
const root = fileURLToPath(new URL('../', import.meta.url));
const build = spawnSync(process.execPath, ['scripts/build.mjs'], {cwd: root, stdio: 'inherit'});
if (build.error) throw build.error;
if (build.status !== 0) throw new Error(`Application build failed (${build.status}).`);
const output = resolve(root, '_site');
await rm(output, {recursive: true, force: true});
await mkdir(output, {recursive: true});
const files = ['index.html', 'portal.html', 'oauth-callback.html', 'manifest.webmanifest', 'sw.js', 'release.json',
  'app/favicon.svg', 'app/styles.css', 'app/oauth-callback.js', 'examples/reuse.html', 'examples/local-folder.html'];
for (const name of files) {
  await mkdir(resolve(output, name, '..'), {recursive: true});
  await cp(resolve(root, name), resolve(output, name));
}
await cp(resolve(root, 'dist'), resolve(output, 'dist'), {recursive: true});
await mkdir(resolve(output, 'docs'), {recursive: true});
for (const name of ['GITHUB-PAGES', 'WORKBENCH', 'REFINEMENTS', 'LOCAL-SYSTEM', 'WORKFLOW-AUTOMATION',
  'EXPLORER', 'EXPLORER-DESIGN', 'UI-PARITY', 'MOBILE-TOUCH', 'DOCUMENT-SETS', 'COVERAGE']) {
  await cp(resolve(root, `docs/${name}.md`), resolve(output, `docs/${name}.md`));
}
await writeFile(resolve(output, '.nojekyll'), '');
const release = JSON.parse(await readFile(resolve(output, 'release.json'), 'utf8'));
console.log(`Pages artifact: _site/ — Civora ${release.version}, build ${release.build}. Browser-only; no private server files.`);
