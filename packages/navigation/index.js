/** Bounded, permission-projected navigation search. No document content is indexed. */
import { projectWorkspace } from '../access/index.js';
import { explorerCan, folderPath, visibleExplorerViews } from '../explorer/index.js';
import { searchDocuments } from '../core/index.js';
export const NAVIGATION_LIMITS = Object.freeze({query:240,results:80,commands:100,recents:30});
const check=(ok,message)=>{if(!ok){const error=new Error(message);error.code='VALIDATION';throw error;}};
export const normalizeNavigationText = value => String(value??'').normalize('NFKD').replace(/[\u0300-\u036f]/g,'').toLocaleLowerCase().trim();
function score(label,detail,query){
  if(!query)return 1;
  const title=normalizeNavigationText(label),all=title+' '+normalizeNavigationText(detail),tokens=query.split(/\s+/).filter(Boolean);
  if(!tokens.every(t=>all.includes(t)))return -1;
  return title===query?1000:title.startsWith(query)?800:title.includes(query)?600:tokens.every(t=>title.includes(t))?400:100;
}
/** commands are inert presentation descriptors from the application's own registry. */
export function navigationSearch(state,actorId,{query='',projectId='',scope='project',kind='all',limit=60,recents=[],commands=[]}={}){
  check(typeof query==='string'&&query.length<=NAVIGATION_LIMITS.query,'Search is limited to 240 characters.');
  check(['project','workspace'].includes(scope)&&['all','document','folder','command','view'].includes(kind),'Invalid navigation scope or category.');
  check(Number.isSafeInteger(limit)&&limit>=1&&limit<=NAVIGATION_LIMITS.results,'Choose 1–80 navigation results.');
  check(typeof projectId==='string'&&Array.isArray(recents)&&recents.length<=30&&recents.every(id=>typeof id==='string'&&id.length<=120),'Invalid navigation context.');
  check(Array.isArray(commands)&&commands.length<=NAVIGATION_LIMITS.commands&&commands.every(c=>c&&typeof c.id==='string'&&typeof c.label==='string'&&c.id.length<=120&&c.label.length<=200&&(c.detail===undefined||(typeof c.detail==='string'&&c.detail.length<=500))&&(c.glyph===undefined||(typeof c.glyph==='string'&&c.glyph.length<=40))),'Invalid command descriptors.');
  const user=state.users.find(u=>u.id===actorId);
  check(user?.active&&(!state.projection?.filtered||state.projection.userId===actorId),'The navigation account is unavailable.');
  const view=state.projection?.filtered?state:projectWorkspace(state,actorId);
  const q=normalizeNavigationText(query),commandMode=q.startsWith('>'),needle=commandMode?q.slice(1).trim():q;
  const category=commandMode?'command':kind,items=[],byProject=new Map(view.projects.map(p=>[p.id,p])),recent=new Map(recents.map((id,i)=>[id,30-i]));
  const inScope=id=>scope==='workspace'||!projectId||id===projectId;
  const subtitle=(projectId,folderId)=>[byProject.get(projectId)?.code,folderId?folderPath(view,folderId):'Project root'].filter(Boolean).join(' / ');
  if(!commandMode){
    // Preserve the existing quoted/qualified document-search grammar.
    let found=searchDocuments(view,{projectId:scope==='project'?projectId:'',query});
    if(query&&!/[:"]/.test(query)){
      const seen=new Set(found.map(d=>d.id));
      for(const d of view.documents)if(!d.deletedAt&&inScope(d.projectId)&&!seen.has(d.id)&&score(d.name,[d.title,d.number,...d.tags,...Object.values(d.metadata)].join(' '),needle)>=0)found.push(d);
    }
    for(const d of found){const detail=subtitle(d.projectId,d.folderId),rank=score(d.name,[d.title,d.number,detail].join(' '),needle);items.push({kind:'document',id:d.id,projectId:d.projectId,folderId:d.folderId,label:d.name,detail:d.title+' · '+detail,number:d.number,state:d.state,revision:d.versions.at(-1).label,score:query?Math.max(rank,50):200+(recent.get(d.id)||0),recent:recent.has(d.id)});}
    for(const folder of view.folders){if(!inScope(folder.projectId)||!explorerCan(view,actorId,'read','folder',folder.id))continue;const detail=subtitle(folder.projectId,folder.parentId),rank=score(folder.name,detail,needle);if(rank>=0)items.push({kind:'folder',id:folder.id,projectId:folder.projectId,folderId:folder.id,label:folder.name,detail,score:query?rank:90});}
    for(const item of visibleExplorerViews(view,actorId)){if(!inScope(item.projectId))continue;const detail=(item.scope==='project'?'Shared view':'Personal view')+' · '+(byProject.get(item.projectId)?.code||''),rank=score(item.name,detail,needle);if(rank>=0)items.push({kind:'view',id:item.id,projectId:item.projectId,folderId:item.config.folderId,label:item.name,detail,score:query?rank:80});}
  }
  for(const c of commands){const rank=score(c.label,c.detail,needle);if(rank>=0)items.push({kind:'command',id:c.id,label:c.label,detail:c.detail||'Workspace command',glyph:c.glyph||'grid',score:needle?rank:100});}
  const counts={document:0,folder:0,view:0,command:0};items.forEach(i=>counts[i.kind]++);
  let matches=items.filter(i=>category==='all'||i.kind===category).sort((a,b)=>b.score-a.score||a.label.localeCompare(b.label,undefined,{numeric:true})||a.id.localeCompare(b.id));
  if(!query&&category==='all'){const use={document:0,folder:0,view:0,command:0};matches=matches.filter(i=>++use[i.kind]<=(i.kind==='document'?8:5));}
  const total=category==='all'?Object.values(counts).reduce((n,v)=>n+v,0):counts[category];
  return {items:matches.slice(0,limit).map(({score,...item})=>item),counts,total,limited:total>Math.min(matches.length,limit),query,kind:category,scope};
}
