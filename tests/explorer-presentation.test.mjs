import test from 'node:test';
import assert from 'node:assert/strict';
import {defaultExplorerLayout,normalizeExplorerLayout,explorerPresentationPreset,explorerDetailView,normalizeExplorerView,defaultExplorerView} from '../packages/explorer/index.js';

test('Explorer presentation defaults use standard tools, no rail, and a bottom preview',()=>{
 const x=defaultExplorerLayout();assert.equal(x.commandStyle,'standard');assert.equal(x.navigationRail,false);assert.equal(x.previewPosition,'bottom');assert.equal(x.rowLines,true);assert.equal(x.fileDescriptions,false);
});
test('Each layout is independent and normalization does not mutate its input',()=>{
 const a=defaultExplorerLayout(),b=defaultExplorerLayout();a.treeWidth=999;assert.equal(b.treeWidth,258);
 const source={treeWidth:330,commandStyle:'ribbon',extra:{secret:1}},snapshot=structuredClone(source);normalizeExplorerLayout(source);assert.deepEqual(source,snapshot);
});
test('Legacy layout dimensions and visibility survive the presentation upgrade',()=>{
 const old={treeWidth:291,previewSize:340,previewWidth:460,previewPosition:'right',treeVisible:false,ribbonVisible:false,columnFilters:true};const x=normalizeExplorerLayout(old);
 for(const [key,value]of Object.entries(old))assert.equal(x[key],value);assert.equal(x.commandStyle,'standard');assert.equal(x.navigationRail,false);
});
test('Malformed preference roots and untrusted keys cannot affect presentation settings',()=>{
 for(const root of [null,undefined,[],true,1,'bad'])assert.deepEqual(normalizeExplorerLayout(root),defaultExplorerLayout());
 const x=normalizeExplorerLayout(JSON.parse('{"__proto__":{"polluted":true},"constructor":{},"commandStyle":"<script>","previewPosition":"outside","treeVisible":"false"}'));
 assert.deepEqual(x,defaultExplorerLayout());assert.equal({}.polluted,undefined);
});
test('Presentation size values are finite, clamped and rounded; strings are not coerced',()=>{
 assert.deepEqual(normalizeExplorerLayout({treeWidth:190.8,previewSize:2000,previewWidth:-1}),{...defaultExplorerLayout(),treeWidth:191,previewSize:600,previewWidth:260});
 assert.deepEqual(normalizeExplorerLayout({treeWidth:Infinity,previewSize:NaN,previewWidth:'500'}),defaultExplorerLayout());
});
test('Only explicit booleans enable browser-local visibility and detail preferences',()=>{
 for(const key of ['treeVisible','ribbonVisible','columnFilters','navigationRail','rowLines','fileDescriptions']){
  for(const value of [null,'yes',0,1,[],{}])assert.equal(normalizeExplorerLayout({[key]:value})[key],defaultExplorerLayout()[key]);
  assert.equal(normalizeExplorerLayout({[key]:false})[key],false);assert.equal(normalizeExplorerLayout({[key]:true})[key],true);
 }
});
test('Explorer and ribbon presets preserve independent splitter widths',()=>{
 const source={...defaultExplorerLayout(),treeWidth:321,previewSize:309,columnFilters:true};
 const ribbon=explorerPresentationPreset('ribbon',source);assert.equal(ribbon.commandStyle,'ribbon');assert.equal(ribbon.navigationRail,true);assert.equal(ribbon.fileDescriptions,true);assert.equal(ribbon.treeWidth,321);assert.equal(ribbon.columnFilters,true);
 const original=explorerPresentationPreset('explorer',ribbon);assert.equal(original.commandStyle,'standard');assert.equal(original.previewSize,309);assert.equal(original.previewPosition,'bottom');assert.equal(original.navigationRail,false);assert.equal(source.commandStyle,'standard');
});
test('Review preset docks a usable inspector and rejects unknown preset names',()=>{
 const x=explorerPresentationPreset('review');assert.equal(x.previewPosition,'right');assert.equal(x.previewWidth,420);assert.equal(x.navigationRail,false);
 assert.throws(()=>explorerPresentationPreset('arbitrary'),/Unknown/);
});
test('Detailed presentation views retain the pure query contract and do not change saved defaults',()=>{
 const before=defaultExplorerView('p','f'),x=explorerDetailView('p','f');assert.deepEqual(normalizeExplorerView(x),x);assert.equal(x.columns[0],'name');assert.ok(x.columns.includes('title'));assert.equal(x.projectId,'p');assert.equal(x.folderId,'f');assert.equal(x.density,'compact');assert.deepEqual(defaultExplorerView('p','f'),before);
 const other=explorerDetailView('p');x.columns.push('size');x.widths.name=500;assert.equal(other.widths.name,310);assert.ok(!other.columns.includes('size'));
});
test('Presentation normalization is idempotent over bounded and malformed combinations',()=>{
 for(let i=0;i<400;i++){
  const x=normalizeExplorerLayout({treeWidth:i*7-200,previewSize:i*4,previewWidth:i*9,commandStyle:i%2?'ribbon':'standard',rowLines:!!(i%3),navigationRail:!!(i%2)});
  assert.deepEqual(normalizeExplorerLayout(x),x);assert.ok(x.treeWidth>=190&&x.treeWidth<=480);assert.ok(x.previewWidth>=260&&x.previewWidth<=650);assert.ok(x.previewSize>=160&&x.previewSize<=600);
 }
});
