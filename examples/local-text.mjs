// Exercise two independently bundled modules without the application or browser.
import assert from 'node:assert/strict';
import { localFileBlob, relativePath, hashBlob } from '../dist/lib/civora-filesystem.js';
import { encodeTextFile, decodeTextFile } from '../dist/lib/civora-local-text.js';
const original=encodeTextFile({encoding:'utf-16le',bom:true,newline:'\r\n'},'Zażółć Ω\n工程 😀\n');
const decoded=await decodeTextFile(original);
assert.equal(decoded.encoding,'utf-16le');assert.equal(decoded.bom,true);assert.equal(decoded.newline,'\r\n');
assert.equal(await hashBlob(original),await hashBlob(encodeTextFile(decoded,decoded.text)));
assert.equal(localFileBlob(new Blob(['<svg/>']),'drawing.svg').type,'image/svg+xml');
assert.equal(relativePath('Project/Żółć.txt'),'Project/Żółć.txt');
console.log('Standalone filesystem and local-text bundles: Unicode/BOM/newline/hash checks passed.');
