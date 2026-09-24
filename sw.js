/* Civora atomic offline shell. Generated hashes bind the complete HTML, CSS and
 * JavaScript to one build. No API, files, credentials or recipient pages cached. */
const BUILD="aabbc95539a3e15e8131";
const ASSETS=[{"path":"./index.html","sha256":"494d2476af6884a04ac0bbdfd3291462380f0027c950aa183705d6255e746f28"},{"path":"./manifest.webmanifest","sha256":"41c64fbe5c37ee44a5133beda94f8ad077902956534f24aea1418f10c88640cf"},{"path":"./app/favicon.svg","sha256":"2719c9fd28a7c92a25902678ae959e89a383f19585ffc64bf18297510faf63da"}];
const LEGACY_ASSETS=["./","./index.html","./manifest.webmanifest","./app/mobile.js","./app/document-sets.js","./packages/interactions/index.js","./packages/document-sets/index.js","./packages/document-sets/archive.js","./app/explorer.js","./packages/explorer/index.js","./app/automation.js","./packages/automation/index.js","./app/document-control.js","./packages/document-control/index.js","./packages/document-control/register.js","./packages/document-control/archive.js","./packages/document-control/references.js","./packages/filesystem/drop.js","./app/local.js","./packages/filesystem/index.js","./packages/filesystem/repository.js","./packages/filesystem/working-copies.js","./packages/filesystem/text.js","./app/features.js","./packages/access/index.js","./packages/engineering/index.js","./packages/model-viewer/index.js","./packages/renditions/index.js","./packages/sync/index.js","./app/main.js","./app/seed.js","./app/seed-models.js","./app/styles.css","./app/favicon.svg","./packages/core/index.js","./packages/storage/index.js","./packages/storage/archive.js","./packages/connectors/index.js","./packages/viewer/index.js","./packages/controls/index.js"];
const SCOPE=self.registration.scope;
const PREFIX='civora-shell:'+encodeURIComponent(SCOPE)+':';
const CACHE=PREFIX+BUILD;
const href=path=>new URL(path,SCOPE).href;
const digest=async bytes=>[...new Uint8Array(await crypto.subtle.digest('SHA-256',bytes))].map(x=>x.toString(16).padStart(2,'0')).join('');
async function verified(path,expected){
 const response=await fetch(new Request(href(path),{cache:'no-store',credentials:'same-origin',redirect:'error'}));
 if(!response.ok||response.redirected)throw new Error('Offline shell download failed.');
 const bytes=await response.clone().arrayBuffer();if(await digest(bytes)!==expected)throw new Error('Offline shell is from an incomplete deployment.');
 return response;
}
self.addEventListener('install',event=>event.waitUntil((async()=>{
 // Complete all downloads before opening a cache. A failed/incomplete deployment
 // cannot replace the last usable shell. Activation is safe: no code hot-swap.
 const responses=await Promise.all(ASSETS.map(async asset=>[href(asset.path),await verified(asset.path,asset.sha256)]));
 const cache=await caches.open(CACHE);await Promise.all(responses.map(([url,response])=>cache.put(url,response)));
 await self.skipWaiting();
})()));
self.addEventListener('activate',event=>event.waitUntil((async()=>{
 const ownLegacy=new Set(LEGACY_ASSETS.map(href));
 for(const key of await caches.keys()){
  if(key.startsWith(PREFIX)&&key!==CACHE)await caches.delete(key);
  else if(/^civora-shell-v\d/.test(key)){
   // Older builds shared a cache name across paths. Remove only this app's exact
   // asset URLs; never delete another installed app's cache or browser database.
   const legacy=await caches.open(key);
   for(const request of await legacy.keys())if(ownLegacy.has(request.url))await legacy.delete(request);
   if(!(await legacy.keys()).length)await caches.delete(key);
  }
 }
 await self.clients.claim();
})()));
self.addEventListener('fetch',event=>{
 const request=event.request,url=new URL(request.url);
 if(request.method!=='GET'||url.origin!==new URL(SCOPE).origin||url.search)return;
 const path=url.href;
 const isShell=path===SCOPE||path===href('./index.html');
 const asset=ASSETS.find(a=>href(a.path)===path);
 if(!isShell&&!asset)return;
 event.respondWith((async()=>{
  const cache=await caches.open(CACHE);
  if(!isShell){const saved=await cache.match(path);if(saved)return saved;return fetch(request);}
  try{
   const response=await fetch(new Request(request,{cache:'no-store'}));
   // Serve successful online navigations fresh. Only store bytes belonging to
   // this exact build; a future build installs into its own cache.
   if(response.ok&&!response.redirected){const bytes=await response.clone().arrayBuffer();const entry=ASSETS.find(a=>a.path==='./index.html');
    if(await digest(bytes)===entry.sha256)await cache.put(href('./index.html'),response.clone());
   }
   // Authentication errors and server error pages must not be masked by a cache.
   return response;
  }catch{
   // Cache-specific lookup: never search older releases or another app's cache.
   return await cache.match(href('./index.html'))||Response.error();
  }
 })());
});
