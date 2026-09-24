import { escapeHTML as e, openDialog, toast } from '../packages/controls/index.js';

/** Public shell metadata only. Never reads, clears or migrates document storage. */
export async function readReleaseManifest(fetcher, url) {
 const response=await fetcher(url,{cache:'no-store',credentials:'same-origin',redirect:'error',signal:AbortSignal.timeout(10000),headers:{Accept:'application/json'}});
 if(!response.ok)throw new Error('Update server is unavailable. The running application has not changed.');
 const text=await response.text();if(text.length>4096)throw new Error('Invalid application release metadata.');
 const record=JSON.parse(text);
 if(record?.format!=='civora-release'||!/^\d+\.\d+\.\d+$/.test(record.version)||!/^[a-f0-9]{20}$/.test(record.build))throw new Error('Invalid application release metadata.');
 return {version:record.version,build:record.build};
}
export function classifyRelease(current,remote){
 const a=current.version.split('.').map(Number),b=remote.version.split('.').map(Number);
 let order=0;for(let i=0;i<3;i++){if(a[i]!==b[i]){order=b[i]-a[i];break;}}
 return order<0?'older':remote.build===current.build?'current':'available';
}
export function createAppUpdates({version,build,canReload=()=>true,volatile=()=>false,onStatus=()=>{},env=globalThis}){
 let status={kind:'idle',message:'Application build '+build},registration=null,checking=null,started=false,noticeDismissed='',dialog=null,timer=null;
 const supported=()=>!env.__CIVORA_SINGLE_FILE__&&/^https?:$/.test(env.location?.protocol||'');
 const releaseURL=()=>new URL('./release.json',env.location.href).href;
 const set=value=>{status=value;paint();onStatus();return {...status};};
 function paint(){
  const doc=env.document;if(!doc)return;
  const label=doc.getElementById('app-version-status');if(label){label.dataset.status=status.kind;label.title=`Civora ${version} · ${build}\n${status.message}`;}
  const box=doc.getElementById('app-update-notice');
  if(status.kind!=='available'||noticeDismissed===status.remote?.build){box?.remove();return;}
  if(box)return;
  const notice=doc.createElement('aside');notice.id='app-update-notice';notice.className='app-update-notice';notice.setAttribute('role','status');
  notice.innerHTML=`<strong>A newer Civora interface is available</strong><p>Version ${e(status.remote.version)} is ready. Finish open edits before reloading. Your workspace will not be reset.</p><div class="row"><button class="btn" data-update-later>Later</button><button class="btn primary" data-update-details>Review update</button></div>`;
  notice.querySelector('[data-update-later]').onclick=()=>{noticeDismissed=status.remote.build;notice.remove();};notice.querySelector('[data-update-details]').onclick=show;doc.body.append(notice);
 }
 async function check(){
  if(!supported())return set({kind:'standalone',message:'This is a self-contained file. Open the updated HTML file to change its interface. No site data is cleared.'});
  if(checking)return checking;
  checking=(async()=>{try{
   const remote=await readReleaseManifest(env.fetch.bind(env),releaseURL()),kind=classifyRelease({version,build},remote);
   return set({kind,remote,message:kind==='current'?'This tab is running the deployed build.':kind==='older'?'The server is serving an older release. This tab will not downgrade automatically.':'A newer build is deployed. Review the update before reloading.'});
  }catch(error){return set({kind:'unavailable',message:error.message||'Could not verify updates. The running build is unchanged.'});}finally{checking=null;}})();
  return checking;
 }
 async function reload(){
  if(!supported())throw new Error('Open the updated standalone HTML file. A file cannot update itself.');
  if(volatile())throw new Error('This workspace exists only in memory. Export a backup or connect persistent storage before reloading.');
  if(!canReload())throw new Error('Finish open dialogs, transfers and pending changes before reloading.');
  const latest=await check();if(!['current','available'].includes(latest.kind))throw new Error(latest.message);
  if(!canReload()||volatile())throw new Error('Workspace activity changed. Finish pending work before reloading.');
  // No automatic reload, no localStorage.clear(), no database deletion, no global
  // cache deletion. One self-contained navigation supplies CSS and JS together.
  env.location.reload();return true;
 }
 function show(){
  dialog?.close();dialog=openDialog({title:'Application version & updates',body:`<div class="app-update-status"><strong>Civora ${e(version)}</strong><p>Build <code>${e(build)}</code></p><p data-update-status>${e(status.message)}</p><p>Every workspace uses the same Explorer shell. Layout preferences are separate from documents, permissions and saved searches.</p>${volatile()?'<p><strong>Temporary-memory session:</strong> export a backup or switch to persistent storage before closing or reloading.</p>':''}</div>`,footer:`<button class="btn" data-update-check>Check for updates</button><button class="btn primary" data-update-reload>Reload updated app</button>`});
  const output=dialog.querySelector('[data-update-status]'),reloadButton=dialog.querySelector('[data-update-reload]');reloadButton.disabled=!supported()||volatile();
  dialog.querySelector('[data-update-check]').onclick=async()=>{output.textContent='Checking deployed build…';const result=await check();if(output.isConnected)output.textContent=result.message;};
  reloadButton.onclick=async()=>{dialog.close();try{await reload();}catch(error){toast(error.message,'error');}};
  if(status.kind==='idle')check().then(result=>{if(output.isConnected)output.textContent=result.message;});
  return dialog;
 }
 async function start(){
  if(started)return;started=true;
  if(!supported()){await check();return;}
  const sw=env.navigator?.serviceWorker;
  if(sw){try{registration=await sw.register(new URL('./sw.js',env.location.href).href,{scope:new URL('./',env.location.href).href,updateViaCache:'none'});await registration.update();}catch{/* Network/private mode may prohibit offline-shell installation. The live app remains usable. */}}
  await check();
  const recheck=()=>{if(!env.document?.hidden){check();registration?.update().catch(()=>{});}};
  env.addEventListener?.('online',recheck);env.addEventListener?.('pageshow',recheck);env.addEventListener?.('focus',recheck);
  env.document?.addEventListener('visibilitychange',recheck);
  timer=env.setInterval?.(recheck,120000);timer?.unref?.();
 }
 return {start,check,show,reload,paint,get status(){return {...status};}};
}
