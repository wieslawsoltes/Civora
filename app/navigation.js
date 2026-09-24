import { navigationSearch } from '../packages/navigation/index.js';
import { fetchJSON } from '../packages/storage/index.js';
import { escapeHTML as e, icon, fileBadge, openDialog, toast } from '../packages/controls/index.js';
/** One universal switcher. It never writes a command without its normal dialog. */
export function createQuickSwitcher(ctx){
  let dialog=null,controller=null,serial=0,timer=null,identity='',selected=0,rows=[],snapshot='',engine=null,busy=false;
  const identityOf=()=>{const E=ctx.getEngine(),S=ctx.getState();return JSON.stringify([E.repository.kind,E.repository.base||E.repository.identity||'',S.id,S.createdAt||'',E.actorId]);};
  function close(){serial++;clearTimeout(timer);controller?.abort();controller=null;const old=dialog;dialog=null;engine?.removeEventListener('change',refresh);engine=null;rows=[];busy=false;old?.close();old?.remove();}
  function invalidate(){serial++;controller?.abort();busy=true;dialog?.querySelector('#command-results')?.setAttribute('aria-busy','true');dialog?.querySelector('#command-query')?.removeAttribute('aria-activedescendant');}
  function active(){return !!dialog?.open;}
  function setActive(index){
    selected=rows.length?Math.max(0,Math.min(rows.length-1,index)):0;
    const input=dialog?.querySelector('#command-query');
    dialog?.querySelectorAll('[data-quick-index]').forEach((el,i)=>{el.classList.toggle('active',i===selected);el.setAttribute('aria-selected',String(i===selected));});
    if(rows.length)input?.setAttribute('aria-activedescendant','quick-result-'+selected);else input?.removeAttribute('aria-activedescendant');
    dialog?.querySelector('#quick-result-'+selected)?.scrollIntoView({block:'nearest'});
  }
  function commands(){return ctx.commands().filter(c=>c.enabled!==false).map(({id,label,detail,glyph})=>({id,label,detail,glyph}));}
  async function update(){
    if(!active())return;if(identity!==identityOf()){close();return;}
    busy=true;const ticket=++serial,E=ctx.getEngine(),state=ctx.getState(),revision=state.revision,input=dialog.querySelector('#command-query');
    const options={query:input.value,projectId:ctx.getUI().projectId,scope:dialog.querySelector('[name=quick-scope]').value,kind:dialog.dataset.kind||'all',recents:ctx.recents().slice(0,30),limit:60};
    const status=dialog.querySelector('[data-quick-status]'),results=dialog.querySelector('#command-results');status.textContent='Searching readable metadata…';results.setAttribute('aria-busy','true');
    try{
      let output;
      if(E.repository.kind==='server'){
        controller?.abort();controller=new AbortController();
        const response=await fetchJSON((E.repository.base||'/api')+'/explorer/quick-search',{method:'POST',body:JSON.stringify({expectedRevision:revision,...options,kind:options.kind==='command'?'all':options.kind}),signal:controller.signal});
        if(ticket!==serial||!active()||identity!==identityOf()||E!==ctx.getEngine()||ctx.getState().revision!==revision)return;
        if(response.revision!==revision||response.query!==options.query||response.scope!==options.scope||!Array.isArray(response.items)||!response.counts)throw new Error('Search response does not match the current request. Refresh to retry.');
        // Local command registry is not accepted from the network.
        const local=navigationSearch(state,E.actorId,{...options,kind:'command',query:options.query.startsWith('>')?options.query:'>'+options.query,commands:commands()});
        output=options.kind==='command'||options.query.startsWith('>')?local:{...response,items:[...response.items,...(options.kind==='all'?local.items.slice(0,8):[])].slice(0,60),counts:{...response.counts,command:local.counts.command},total:response.total+(options.kind==='all'?local.total:0)};
      }else output=navigationSearch(state,E.actorId,{...options,commands:commands()});
      if(ticket!==serial||!active()||identity!==identityOf()||E!==ctx.getEngine()||ctx.getState().revision!==revision)return;
      busy=false;const previous=rows[selected];rows=output.items;
      results.innerHTML=rows.map((r,i)=>`<div id="quick-result-${i}" role="option" aria-selected="false" class="quick-result command-result" data-quick-index="${i}" ${r.kind==='document'?`data-search-result="${e(r.id)}"`:''}>${r.kind==='document'?fileBadge(r.label):`<span class="quick-result-icon">${icon(r.kind==='folder'?'folder':r.kind==='view'?'star':r.glyph||'grid',19)}</span>`}<span class="grow"><strong>${e(r.label)}</strong><small>${e(r.detail)}</small></span><span class="quick-result-kind">${r.recent?'Recent':r.kind==='view'?'Saved view':r.kind==='command'?'Command':r.kind==='folder'?'Folder':e(r.revision)}</span>${icon('chevron',13)}</div>`).join('')||`<div class="quick-empty">${icon('search',28)}<strong>No matching results</strong><span>Try another name, another project scope, or use &gt; for commands.</span></div>`;
      dialog.querySelectorAll('[data-quick-kind]').forEach(button=>{const k=button.dataset.quickKind,count=k==='all'?Object.values(output.counts).reduce((n,v)=>n+v,0):output.counts[k];button.querySelector('small').textContent=String(count);button.setAttribute('aria-pressed',String(k===options.kind));});
      results.setAttribute('aria-busy','false');status.textContent=`${rows.length} shown · ${output.total} readable matches · metadata only`;
      setActive(Math.max(0,rows.findIndex(r=>r.id===previous?.id&&r.kind===previous?.kind)));
    }catch(error){if(ticket!==serial||!active()||error.name==='AbortError')return;busy=false;rows=[];results.setAttribute('aria-busy','false');results.innerHTML='<div class="quick-empty">Search unavailable. Use Refresh to retry.</div>';status.textContent=error.message;input.removeAttribute('aria-activedescendant');}
  }
  async function execute(index){
    if(busy)return;const item=rows[index];if(!item||identity!==identityOf()){close();return;}
    try{
      // Re-run the query at selection time: stale permission-filtered results do not grant access.
      if(item.kind==='command'){const command=ctx.commands().find(c=>c.id===item.id&&c.enabled!==false);if(!command)throw new Error('This command is no longer available.');close();await command.run();return;}
      // Direct resolution is guarded by Explorer's current scoped address resolver.
      close();await ctx.openResult(item);
    }catch(error){toast(error.message,'error');}
  }
  function refresh(){if(!active())return;if(identity!==identityOf()){close();return;}const next=JSON.stringify([ctx.getState().revision,ctx.getUI().projectId,ctx.getUI().route,[...ctx.getUI().selection]]);if(next!==snapshot){snapshot=next;invalidate();clearTimeout(timer);timer=setTimeout(update,30);}}
  function open(initial=''){
    if(active()){dialog.querySelector('#command-query').focus();return dialog;}
    if(document.querySelector('dialog[open]')){toast('Finish or close the current dialog before opening Quick switcher.','error');return null;}
    document.querySelectorAll('.quick-switcher:not([open])').forEach(el=>el.remove());
    identity=identityOf();engine=ctx.getEngine();const openingEngine=engine;let openingDialog; snapshot='';
    dialog=openingDialog=openDialog({title:'Go to anything',subtitle:'Find documents, jump to folders, or run a workspace command.',wide:true,body:`<div class="quick-search-box">${icon('search',22)}<input id="command-query" type="text" role="combobox" aria-label="Find documents, folders and commands" aria-autocomplete="list" aria-expanded="true" aria-controls="command-results" maxlength="240" autocomplete="off" placeholder="Type a name, a number, or > for commands" value="${e(initial)}"><kbd>Esc</kbd></div><div class="quick-search-tools"><div class="quick-search-kinds" aria-label="Result category">${[['all','All'],['document','Documents'],['folder','Folders'],['command','Commands'],['view','Views']].map(([kind,label])=>`<button type="button" data-quick-kind="${kind}" aria-pressed="${kind==='all'}">${label}<small>0</small></button>`).join('')}</div><select name="quick-scope" aria-label="Search scope"><option value="project">Current project</option><option value="workspace">All readable projects</option></select></div><div id="command-results" class="command-results quick-results" role="listbox" aria-label="Navigation results"></div><div class="quick-search-footer"><span data-quick-status role="status"></span><button type="button" class="btn small" data-quick-refresh>${icon('refresh',13)}Refresh</button></div><div class="quick-key-help"><span><kbd>↑</kbd><kbd>↓</kbd> choose</span><span><kbd>Enter</kbd> open</span><span><kbd>&gt;</kbd> commands</span><span>Permission-filtered · no file-content indexing</span></div>`,onClose(){if(dialog!==openingDialog)return;serial++;clearTimeout(timer);controller?.abort();openingEngine.removeEventListener('change',refresh);engine=null;dialog=null;rows=[];busy=false;}});
    dialog.classList.add('quick-switcher');dialog.dataset.kind='all';
    const input=dialog.querySelector('#command-query');input.addEventListener('input',()=>{invalidate();clearTimeout(timer);timer=setTimeout(update,100);});
    input.addEventListener('keydown',event=>{if(event.isComposing)return;if(['ArrowDown','ArrowUp'].includes(event.key)){event.preventDefault();setActive(selected+(event.key==='ArrowDown'?1:-1));}else if((event.ctrlKey||event.metaKey)&&['Home','End'].includes(event.key)){event.preventDefault();setActive(event.key==='Home'?0:rows.length-1);}else if(event.key==='Enter'){event.preventDefault();execute(selected);}});
    dialog.querySelector('[name=quick-scope]').addEventListener('change',update);
    dialog.addEventListener('click',event=>{const row=event.target.closest('[data-quick-index]'),kind=event.target.closest('[data-quick-kind]');if(row)execute(Number(row.dataset.quickIndex));else if(kind){dialog.dataset.kind=kind.dataset.quickKind;update();input.focus();}else if(event.target.closest('[data-quick-refresh]'))update();});
    engine.addEventListener('change',refresh);update();input.focus();return dialog;
  }
  return {open,close,refresh,get isOpen(){return active();}};
}
