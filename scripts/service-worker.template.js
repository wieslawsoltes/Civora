/* Civora atomic offline shell. Generated hashes bind the complete HTML, CSS and
 * JavaScript to one build. No API, files, credentials or recipient pages cached. */
const BUILD=__BUILD_JSON__;
const ASSETS=__ASSETS_JSON__;
const LEGACY_ASSETS=__LEGACY_ASSETS_JSON__;
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
