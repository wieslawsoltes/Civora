import { canAccess, createAccessContext, projectWorkspace } from '../access/index.js';
/** Framework-independent Explorer views, safe queries, selection and navigation.
 * Queries are declarative metadata queries, never code or regular expressions.
 * Stored views and shortcuts do not confer access to their results.
 */
const fail=(message,code='VALIDATION')=>{const e=new Error(message);e.code=code;throw e;};
const check=(ok,message,code)=>{if(!ok)fail(message,code);};
const text=(v,max,label='Text')=>{check(typeof v==='string'&&v.length<=max&&!/[\x00-\x08\x0b\x0c\x0e-\x1f]/.test(v),`${label} is invalid or too long.`);return v.trim();};
const clone=x=>structuredClone(x);
const isoDate=value=>{if(typeof value!=='string'||!/^\d{4}-\d{2}-\d{2}(?:T\d{2}:\d{2}:\d{2}(?:\.\d{3})?Z)?$/.test(value)||Number.isNaN(Date.parse(value)))return false;return new Date(value).toISOString().slice(0,10)===value.slice(0,10);};

export const EXPLORER_LIMITS=Object.freeze({views:2000,viewsPerUser:100,bookmarks:10000,bookmarksPerUser:200,filters:20,columns:30,pageSize:500,batch:100});
export const EXPLORER_COLUMNS=Object.freeze([
 {key:'name',label:'File name',width:250},{key:'number',label:'Document number',width:170},
 {key:'title',label:'Description',width:250},{key:'state',label:'Workflow state',width:160},
 {key:'revision',label:'Version',width:90},{key:'discipline',label:'Discipline',width:130},
 {key:'checkedOutBy',label:'Checked out by',width:150},{key:'modifiedAt',label:'Modified',width:150},
 {key:'modifiedBy',label:'Modified by',width:140},{key:'filetype',label:'Type',width:85},
 {key:'size',label:'Size (bytes)',width:110},{key:'folder',label:'Folder',width:220},
 {key:'dueDate',label:'Due date',width:130},{key:'tags',label:'Tags',width:160}
]);
const keys=new Set(EXPLORER_COLUMNS.map(c=>c.key));
const validKey=k=>typeof k==='string'&&(keys.has(k)||/^metadata\.[a-z][a-z0-9_]{0,59}$/.test(k)&&!['constructor','prototype','__proto__'].includes(k.slice(9)));
export const FILTER_OPERATORS=Object.freeze(['contains','notContains','eq','ne','startsWith','empty','notEmpty','gt','gte','lt','lte']);
export function explorerColumns(project){return [...EXPLORER_COLUMNS.map(clone),...(project?.fields||[]).map(f=>({key:`metadata.${f.key}`,label:f.label,width:150,type:f.type}))];}
export function defaultExplorerView(projectId='',folderId=null){return {projectId,folderId,includeSubfolders:true,rootOnly:false,query:'',match:'all',filters:[],columns:['name','number','state','revision','discipline','modifiedAt'],widths:{},sort:[{key:'name',direction:'asc'}],groupBy:'',density:'compact',pageSize:100,columnFilters:{},quickFilters:{state:'',discipline:''}};}
export function normalizeExplorerView(input={}){
 check(input&&typeof input==='object'&&!Array.isArray(input),'Invalid Explorer view.');
 const v={...defaultExplorerView(),...input};
 const projectId=text(v.projectId,120,'Project identifier'),folderId=v.folderId?text(v.folderId,120,'Folder identifier'):null;
 check(typeof v.includeSubfolders==='boolean'&&typeof v.rootOnly==='boolean','Choose a folder traversal mode.');
 check(['all','any'].includes(v.match),'Invalid filter match mode.');
 check(Array.isArray(v.filters)&&v.filters.length<=EXPLORER_LIMITS.filters,'A view supports at most 20 conditions.');
 const filters=v.filters.map(f=>{
  check(f&&validKey(f.key)&&FILTER_OPERATORS.includes(f.op),'Invalid Explorer condition.');
  if(['empty','notEmpty'].includes(f.op))return {key:f.key,op:f.op};
  check(['string','number','boolean'].includes(typeof f.value)&&!(typeof f.value==='number'&&!Number.isFinite(f.value)),'A condition needs a finite literal value.');
  if(typeof f.value==='string')text(f.value,500,'Condition value');
  if(['gt','gte','lt','lte'].includes(f.op))check(String(f.value).trim()!==''&&(Number.isFinite(Number(f.value))||isoDate(f.value)),'Range filters need a number or ISO date.');
  return {key:f.key,op:f.op,value:f.value};
 });
 check(Array.isArray(v.columns)&&v.columns.length>0&&v.columns.length<=EXPLORER_LIMITS.columns&&v.columns.every(validKey)&&new Set(v.columns).size===v.columns.length,'Choose 1–30 distinct columns.');
 check(v.columns.includes('name'),'The file-name column is required.');
 check(v.widths&&typeof v.widths==='object'&&!Array.isArray(v.widths)&&Object.keys(v.widths).length<=100,'Invalid column widths.');
 const widths={};for(const[k,width]of Object.entries(v.widths)){check(validKey(k)&&Number.isFinite(width)&&width>=64&&width<=900,'Column widths must be 64–900 pixels.');widths[k]=Math.round(width);}
 check(Array.isArray(v.sort)&&v.sort.length>0&&v.sort.length<=3&&v.sort.every(s=>validKey(s.key)&&['asc','desc'].includes(s.direction))&&new Set(v.sort.map(s=>s.key)).size===v.sort.length,'Choose 1–3 distinct sort columns.');
 check(!v.groupBy||validKey(v.groupBy),'Invalid grouping column.');
 check(['compact','standard','comfortable'].includes(v.density),'Invalid row density.');
 check([50,100,250,500].includes(v.pageSize),'Choose 50, 100, 250 or 500 rows per page.');
 check(v.columnFilters&&typeof v.columnFilters==='object'&&!Array.isArray(v.columnFilters)&&Object.keys(v.columnFilters).length<=30,'Invalid saved column filters.');const columnFilters={};for(const [key,value] of Object.entries(v.columnFilters)){check(validKey(key),'Invalid column filter.');columnFilters[key]=text(value,500,'Column filter');}
 check(v.quickFilters&&typeof v.quickFilters==='object'&&!Array.isArray(v.quickFilters)&&Object.keys(v.quickFilters).every(k=>['state','discipline'].includes(k)),'Invalid quick filters.');const quickFilters={state:text(v.quickFilters.state??'',100,'State filter'),discipline:text(v.quickFilters.discipline??'',100,'Discipline filter')};

 return {projectId,folderId,includeSubfolders:v.includeSubfolders,rootOnly:v.rootOnly,query:text(v.query,1000,'Query'),match:v.match,filters,columns:[...v.columns],widths,sort:v.sort.map(s=>({key:s.key,direction:s.direction})),groupBy:v.groupBy||'',density:v.density,pageSize:v.pageSize,columnFilters,quickFilters};
}
export function folderPath(state,folderId){const map=new Map(state.folders.map(f=>[f.id,f])),out=[],seen=new Set();let id=folderId;while(id){check(!seen.has(id),'Folder cycle.');seen.add(id);const f=map.get(id);if(!f)break;out.unshift(f.name);id=f.parentId;}return out.join(' / ');}
export function explorerValue(state,doc,key){
 const version=doc.versions.at(-1),name=id=>state.users.find(u=>u.id===id)?.name||'';
 if(key.startsWith('metadata.'))return Object.hasOwn(doc.metadata||{},key.slice(9))?doc.metadata[key.slice(9)]:'';
 switch(key){case'revision':return version.label;case'filetype':return doc.name.includes('.')?doc.name.split('.').pop().toUpperCase():'';case'size':return version.size;case'folder':return folderPath(state,doc.folderId)||'Project root';case'modifiedBy':return name(doc.modifiedBy);case'checkedOutBy':return name(doc.checkedOutBy);case'tags':return doc.tags.join(', ');default:return doc[key]??'';}
}
function matches(value,f){
 const raw=String(value??''),a=raw.toLocaleLowerCase('en'),b=String(f.value??'').toLocaleLowerCase('en');
 switch(f.op){case'empty':return raw==='';case'notEmpty':return raw!=='';case'contains':return a.includes(b);case'notContains':return !a.includes(b);case'eq':return a===b;case'ne':return a!==b;case'startsWith':return a.startsWith(b);default:{if(raw.trim()==='')return false;let x,y;if(Number.isFinite(Number(f.value))){x=Number(raw);y=Number(f.value);}else{x=Date.parse(raw);y=Date.parse(f.value);}if(!Number.isFinite(x)||!Number.isFinite(y))return false;return f.op==='gt'?x>y:f.op==='gte'?x>=y:f.op==='lt'?x<y:x<=y;}}
}
export function explorerCan(state,userId,permission,scope,id){
 if(state.projection?.filtered){if(state.projection.userId!==userId)return false;if(scope==='document')return !!state.documents.find(d=>d.id===id)?.permissions?.includes(permission);if(scope==='project')return !!state.projection.projectPermissions?.[id]?.includes(permission);if(scope==='folder'){const f=state.folders.find(f=>f.id===id);return !!f?.permissions?.includes(permission);}return false;}
 return canAccess(state,userId,permission,scope,id);
}
/** Access filtering precedes filtering, facets, grouping, counts and pagination. */
export function queryExplorer(state,userId,input={},options={}){
 check(options&&typeof options==='object'&&!Array.isArray(options),'Invalid query options.');
 const v=normalizeExplorerView(input),user=state.users.find(u=>u.id===userId);check(user?.active,'Your membership is disabled.','FORBIDDEN');if(!state.projection?.filtered&&user.role!=='admin')state=projectWorkspace(state,userId);
 check(state.projects.some(p=>p.id===v.projectId),'Project not available.','NOT_FOUND');
 if(v.folderId)check(state.folders.some(f=>f.id===v.folderId&&f.projectId===v.projectId),'Folder not available.','NOT_FOUND');
 const access=state.projection?.filtered?null:createAccessContext(state,userId),allowed=id=>access?access.can('read','document',id):explorerCan(state,userId,'read','document',id);
 const folderIds=new Set(v.folderId?[v.folderId]:[]);if(v.folderId&&v.includeSubfolders){const children=new Map();for(const f of state.folders){const a=children.get(f.parentId)||[];a.push(f.id);children.set(f.parentId,a);}const queue=[v.folderId];for(let i=0;i<queue.length;i++)for(const id of children.get(queue[i])||[])if(!folderIds.has(id)){folderIds.add(id);queue.push(id);}}
 const filters=options.columnFilters||v.columnFilters;check(filters&&typeof filters==='object'&&!Array.isArray(filters)&&Object.keys(filters).length<=30,'Invalid column filters.');for(const[k,val]of Object.entries(filters)){check(validKey(k),'Invalid column filter.');text(val,500,'Column filter');}
 const tokens=v.query.toLocaleLowerCase('en').split(/\s+/).filter(Boolean),values=new Map(),val=(d,k)=>{let m=values.get(d.id);if(!m){m=new Map();values.set(d.id,m);}if(!m.has(k))m.set(k,explorerValue(state,d,k));return m.get(k);};
 const items=state.documents.filter(d=>{
  if(d.deletedAt||d.projectId!==v.projectId||!allowed(d.id))return false;
  if(v.folderId&&!folderIds.has(d.folderId)||!v.folderId&&(v.rootOnly||!v.includeSubfolders)&&d.folderId)return false;
  if(v.quickFilters.state&&d.state!==v.quickFilters.state||v.quickFilters.discipline&&d.discipline!==v.quickFilters.discipline)return false;
  if(tokens.length){const content=[d.name,d.title,d.number,d.description,d.state,d.discipline,...d.tags,...Object.values(d.metadata||{})].join(' ').toLocaleLowerCase('en');if(!tokens.every(t=>content.includes(t)))return false;}
  if(v.filters.length&&!(v.match==='any'?v.filters.some(f=>matches(val(d,f.key),f)):v.filters.every(f=>matches(val(d,f.key),f))))return false;
  return Object.entries(filters).every(([k,value])=>String(val(d,k)).toLocaleLowerCase('en').includes(value.toLocaleLowerCase('en')));
 });
 const collator=new Intl.Collator('en',{numeric:true,sensitivity:'base'}),compare=(a,b,key,direction='asc')=>{const x=val(a,key),y=val(b,key);if(x===''||y==='')return x===y?0:x===''?1:-1;return (key==='size'||key.startsWith('metadata.')&&['number','integer'].includes(state.projects.find(p=>p.id===v.projectId)?.fields.find(f=>f.key===key.slice(9))?.type)?Number(x)-Number(y):collator.compare(String(x),String(y)))*(direction==='desc'?-1:1);};
 items.sort((a,b)=>{let c=v.groupBy?compare(a,b,v.groupBy):0;for(const s of v.sort){if(c)break;c=compare(a,b,s.key,s.direction);}return c||a.id.localeCompare(b.id);});
 const groups=[];if(v.groupBy){const map=new Map();for(const d of items){const key=String(val(d,v.groupBy));if(!map.has(key)){const g={key,count:0};groups.push(g);map.set(key,g);}map.get(key).count++;}}
 const offset=options.offset??0,limit=options.limit??v.pageSize;check(Number.isSafeInteger(offset)&&offset>=0&&Number.isSafeInteger(limit)&&limit>=1&&limit<=EXPLORER_LIMITS.pageSize,'Invalid Explorer page.');
 return {total:items.length,offset,limit,items:items.slice(offset,offset+limit),groups,ids:items.map(d=>d.id)};
}
export function visibleExplorerViews(state,userId){return (state.explorerViews||[]).filter(v=>(v.scope==='project'||v.userId===userId)&&explorerCan(state,userId,'read','project',v.projectId)&&(!v.config.folderId||explorerCan(state,userId,'read','folder',v.config.folderId)));}
export function visibleExplorerBookmarks(state,userId){return (state.explorerBookmarks||[]).filter(b=>b.userId===userId&&explorerCan(state,userId,'read',b.scope,b.resourceId)&&!(b.scope==='document'&&state.documents.find(d=>d.id===b.resourceId)?.deletedAt));}
function resource(state,scope,id){return state[{project:'projects',folder:'folders',document:'documents'}[scope]]?.find(x=>x.id===id);}
export function applyExplorerCommand(state,command,user,now){
 const p=command.payload||{},type=command.type;
 if(type==='explorerView.save'){
  const existing=p.id?(state.explorerViews||[]).find(v=>v.id===p.id):null;
  if(p.id)check(existing,'Saved view not found.','NOT_FOUND');
  const config=normalizeExplorerView(p.config);check(state.projects.some(v=>v.id===config.projectId),'Project not found.','NOT_FOUND');
  check(['personal','project'].includes(p.scope),'Choose personal or project visibility.');
  if(existing){check(existing.projectId===config.projectId&&existing.scope===p.scope,'A saved view cannot change project or visibility.');check(p.expectedVersion===existing.version,'The saved view changed. Reload before saving.','CONFLICT');check(existing.scope!=='personal'||existing.userId===user.id,'This personal view belongs to another account.','FORBIDDEN');}
  check(explorerCan(state,user.id,p.scope==='project'?'manage':'read','project',config.projectId),'Access to this project is required.','FORBIDDEN');
  if(p.scope==='project')check(['admin','manager'].includes(user.role),'Only a project manager or administrator can publish a shared view.','FORBIDDEN');
  if(config.folderId)check(state.folders.some(f=>f.id===config.folderId&&f.projectId===config.projectId)&&explorerCan(state,user.id,'read','folder',config.folderId),'Folder access is required.','FORBIDDEN');
  const name=text(p.name,100,'View name');check(name,'A view name is required.');
  check(!(state.explorerViews||[]).some(v=>v.id!==existing?.id&&v.projectId===config.projectId&&v.scope===p.scope&&(v.scope==='project'||v.userId===user.id)&&v.name.toLowerCase()===name.toLowerCase()),'A view with this name already exists.');
  const item={id:existing?.id||'view-'+crypto.randomUUID(),userId:existing?.userId||user.id,projectId:config.projectId,scope:p.scope,name,config,version:(existing?.version||0)+1,createdAt:existing?.createdAt||now,modifiedAt:now};
  state.explorerViews=(state.explorerViews||[]).filter(v=>v.id!==item.id);state.explorerViews.push(item);
  return {result:item.id,targetId:item.id,summary:`${existing?'Updated':'Saved'} ${p.scope} Explorer view ${name}`};
 }
 if(type==='explorerView.remove'){
  const v=(state.explorerViews||[]).find(v=>v.id===p.id);check(v,'Saved view not found.','NOT_FOUND');
  check(p.expectedVersion===v.version,'The saved view changed. Reload before removing.','CONFLICT');
  check(v.scope==='personal'?v.userId===user.id: ['admin','manager'].includes(user.role)&&explorerCan(state,user.id,'manage','project',v.projectId),'You cannot remove this view.','FORBIDDEN');
  state.explorerViews=state.explorerViews.filter(x=>x.id!==v.id);return {result:v.id,targetId:v.id,summary:`Removed Explorer view ${v.name}`};
 }
 if(type==='explorerBookmark.toggle'){
  check(['project','folder','document'].includes(p.scope),'Invalid shortcut target.');
  const existing=(state.explorerBookmarks||[]).find(b=>b.userId===user.id&&b.scope===p.scope&&b.resourceId===p.resourceId);
  if(existing){state.explorerBookmarks=state.explorerBookmarks.filter(b=>b.id!==existing.id);return {result:false,targetId:existing.id,summary:'Unpinned an Explorer shortcut'};}
  const r=resource(state,p.scope,p.resourceId);check(r&&!r.deletedAt&&explorerCan(state,user.id,'read',p.scope,p.resourceId),'Shortcut target unavailable.','FORBIDDEN');
  state.explorerBookmarks||=[];const b={id:'bookmark-'+crypto.randomUUID(),userId:user.id,scope:p.scope,resourceId:p.resourceId,createdAt:now};state.explorerBookmarks.push(b);return {result:true,targetId:b.id,summary:'Pinned an Explorer shortcut'};
 }
 return null;
}
export function validateExplorerState(state){
 const seen=new Set(),counts=new Map(),views=state.explorerViews||[],bookmarks=state.explorerBookmarks||[];
 check(state.explorerViews===undefined||Array.isArray(state.explorerViews),'Invalid Explorer views.');check(state.explorerBookmarks===undefined||Array.isArray(state.explorerBookmarks),'Invalid Explorer shortcuts.');
 check(views.length<=EXPLORER_LIMITS.views&&bookmarks.length<=EXPLORER_LIMITS.bookmarks,'Explorer collection limit exceeded.');
 const id=(v)=>{check(v&&typeof v.id==='string'&&v.id.length>0&&v.id.length<=120&&!seen.has(v.id),'Invalid or duplicate Explorer identifier.');seen.add(v.id);check(state.users.some(u=>u.id===v.userId),'Invalid Explorer owner.');};
 const count=(key,limit)=>{counts.set(key,(counts.get(key)||0)+1);check(counts.get(key)<=limit,'Personal Explorer collection limit exceeded.');};
 for(const v of views){id(v);check(['personal','project'].includes(v.scope),'Invalid view scope.');text(v.name,100,'View name');check(v.name.trim(),'A view needs a name.');const config=normalizeExplorerView(v.config);check(v.projectId===config.projectId&&state.projects.some(p=>p.id===v.projectId),'Invalid view project.');if(config.folderId)check(state.folders.some(f=>f.id===config.folderId&&f.projectId===v.projectId),'Invalid saved view folder.');check(Number.isSafeInteger(v.version)&&v.version>0&&Number.isFinite(Date.parse(v.createdAt))&&Number.isFinite(Date.parse(v.modifiedAt)),'Invalid saved view revision.');count('v:'+v.userId,EXPLORER_LIMITS.viewsPerUser);}
 const names=new Set();for(const v of views){const key=JSON.stringify([v.projectId,v.scope,v.scope==='personal'?v.userId:'',v.name.toLowerCase()]);check(!names.has(key),'Duplicate saved view name.');names.add(key);}
 const targets=new Set();for(const b of bookmarks){id(b);check(['project','folder','document'].includes(b.scope)&&!!resource(state,b.scope,b.resourceId),'Invalid shortcut target.');check(Number.isFinite(Date.parse(b.createdAt)),'Invalid shortcut date.');const key=b.userId+':'+b.scope+':'+b.resourceId;check(!targets.has(key),'Duplicate Explorer shortcut.');targets.add(key);count('b:'+b.userId,EXPLORER_LIMITS.bookmarksPerUser);}
 return true;
}
/** Side-effect-free selection model used by mouse and keyboard paths. */
export function explorerSelection(ids,selection,id,{toggle=false,range=false,anchor=null}={}){
 check(Array.isArray(ids)&&ids.includes(id),'Selection target is not in this result.');const next=new Set(selection);
 if(range&&ids.includes(anchor)){if(!toggle)next.clear();const a=ids.indexOf(anchor),b=ids.indexOf(id);ids.slice(Math.min(a,b),Math.max(a,b)+1).forEach(x=>next.add(x));return {selection:next,anchor};}
 if(toggle){next.has(id)?next.delete(id):next.add(id);}else{next.clear();next.add(id);}return {selection:next,anchor:id};
}
export class ExplorerHistory{
 constructor(limit=80){check(Number.isInteger(limit)&&limit>=2&&limit<=500,'Invalid navigation-history limit.');this.limit=limit;this.items=[];this.index=-1;}
 visit(location){const item=clone(location);if(JSON.stringify(this.current)===JSON.stringify(item))return this.current;this.items=this.items.slice(0,this.index+1);this.items.push(item);if(this.items.length>this.limit)this.items.shift();this.index=this.items.length-1;return this.current;}
 get current(){return this.index>=0?clone(this.items[this.index]):null;}get canBack(){return this.index>0;}get canForward(){return this.index+1<this.items.length;}
 back(){if(this.canBack)this.index--;return this.current;}forward(){if(this.canForward)this.index++;return this.current;}
}
export function explorerLink(state,{projectId,folderId='',documentId=''}={}){const params=new URLSearchParams({workspace:state.id,project:projectId||''});if(folderId)params.set('folder',folderId);if(documentId)params.set('document',documentId);return '#documents?'+params.toString();}
export function resolveExplorerLink(state,userId,hash){
 check(typeof hash==='string'&&hash.length<=1500,'Invalid workspace link.');const [route,query]=hash.replace(/^#/,'').split('?');check(route==='documents','This is not an Explorer link.');const p=new URLSearchParams(query);check(!p.get('workspace')||p.get('workspace')===state.id,'This link belongs to another workspace.','NOT_FOUND');
 const projectId=p.get('project'),folderId=p.get('folder')||null,documentId=p.get('document')||null;
 check(state.projects.some(x=>x.id===projectId),'Project unavailable.','NOT_FOUND');
 if(documentId){const d=state.documents.find(d=>d.id===documentId);check(d&&!d.deletedAt&&d.projectId===projectId&&explorerCan(state,userId,'read','document',d.id),'Document unavailable.','NOT_FOUND');return {projectId,folderId:d.folderId,documentId};}
 if(folderId)check(state.folders.some(f=>f.id===folderId&&f.projectId===projectId)&&explorerCan(state,userId,'read','folder',folderId),'Folder unavailable.','NOT_FOUND');
 if(folderId)return {projectId,folderId,documentId:null};
 check(explorerCan(state,userId,'read','project',projectId),'Project unavailable.','NOT_FOUND');return {projectId,folderId,documentId:null};
}

/** Browser-local presentation settings. These never change workspace data or permissions. */
export function defaultExplorerLayout() {
 return {treeWidth:258,previewSize:246,previewWidth:360,previewPosition:'bottom',treeVisible:true,ribbonVisible:true,columnFilters:false,commandStyle:'standard',navigationRail:false,rowLines:true,fileDescriptions:false};
}
export function normalizeExplorerLayout(input={}) {
 const base=defaultExplorerLayout(),source=input&&typeof input==='object'&&!Array.isArray(input)?input:{},out={...base};
 for(const [key,min,max] of [['treeWidth',190,480],['previewSize',160,600],['previewWidth',260,650]]) {
  if(typeof source[key]==='number'&&Number.isFinite(source[key]))out[key]=Math.round(Math.max(min,Math.min(max,source[key])));
 }
 for(const key of ['treeVisible','ribbonVisible','columnFilters','navigationRail','rowLines','fileDescriptions'])if(typeof source[key]==='boolean')out[key]=source[key];
 if(['bottom','right','hidden'].includes(source.previewPosition))out.previewPosition=source.previewPosition;
 if(['standard','ribbon'].includes(source.commandStyle))out.commandStyle=source.commandStyle;
 return out;
}
export function explorerPresentationPreset(name,current={}) {
 check(['explorer','ribbon','review'].includes(name),'Unknown Explorer presentation preset.');
 const out=normalizeExplorerLayout(current);
 if(name==='explorer')Object.assign(out,{commandStyle:'standard',navigationRail:false,rowLines:true,fileDescriptions:false,previewPosition:'bottom',ribbonVisible:true,treeVisible:true});
 if(name==='ribbon')Object.assign(out,{commandStyle:'ribbon',navigationRail:true,rowLines:false,fileDescriptions:true,previewPosition:'bottom',ribbonVisible:true,treeVisible:true});
 if(name==='review')Object.assign(out,{commandStyle:'standard',navigationRail:false,rowLines:true,fileDescriptions:false,previewPosition:'right',previewWidth:420,ribbonVisible:true,treeVisible:true});
 return out;
}
/** A presentation-only detail register; saved views keep their original columns. */
export function explorerDetailView(projectId='',folderId=null) {
 return normalizeExplorerView({...defaultExplorerView(projectId,folderId),columns:['name','title','number','state','revision','modifiedAt'],widths:{name:310,title:245,number:160,state:145,revision:75,modifiedAt:145},density:'compact'});
}

/** Versioned, browser-only presentation migration. Never modifies workspace data.
 * Historical preferences had no appearance schema and can restore a pre-redesign
 * ribbon/rail. Migrate only their chrome once; preserve queries and pane sizes.
 */
export const EXPLORER_PREFERENCE_SCHEMA = 1;
export function migrateExplorerPreferences(input, projectId='') {
 const source=input&&typeof input==='object'&&!Array.isArray(input)?input:{};
 const current=source.schema===EXPLORER_PREFERENCE_SCHEMA;
 const layout=normalizeExplorerLayout(source.layout);
 if(!current)Object.assign(layout,{commandStyle:'standard',navigationRail:false,rowLines:true,fileDescriptions:false});
 let config;try{config=normalizeExplorerView(source.config||explorerDetailView(projectId));}catch{config=explorerDetailView(projectId);}
 const strings=(value,limit)=>Array.isArray(value)?[...new Set(value.filter(x=>typeof x==='string'&&x.length<=500))].slice(0,limit):[];
 return {schema:EXPLORER_PREFERENCE_SCHEMA,layout,config,expanded:Array.isArray(source.expanded)?strings(source.expanded,1000):['project:'+projectId],recents:strings(source.recents,30)};
}
