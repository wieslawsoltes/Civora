/** Declarative workflow automation. No executable expressions, network, DOM, or timers.
 * Commands and the server scheduler use these same transactional primitives.
 */
import { canAccess, createAccessContext, notificationVisible } from '../access/index.js';
import { validateMetadata, pendingReviewers, currentReviewStage, reviewIsCurrent } from '../document-control/index.js';

export const AUTOMATION_LIMITS = Object.freeze({ rules:1000, rulesPerProject:40, conditions:32, depth:4, subscriptions:10000, subscriptionsPerUser:100, notifications:50000, notificationsPerUser:1000, ledger:100000, tickItems:200 });
export const CONDITION_OPERATORS = ['eq','ne','in','notIn','contains','startsWith','gt','gte','lt','lte','exists','missing'];
export const WATCH_EVENTS = ['document.created','document.revised','document.updated','document.moved','document.state','document.recycled','document.restored','comment.added','review.started','review.decision','review.assigned','review.cancelled','issue.created','issue.updated','delivery.issued'];
export const NOTICE_EVENTS = [...WATCH_EVENTS,'review.reminder','review.overdue','review.escalated','review.escalation-blocked','issue.reminder','issue.overdue','document.reminder','document.overdue'];
const collections = {document:'documents',review:'reviews',issue:'issues',transmittal:'transmittals'};
const check=(ok,message,code='VALIDATION')=>{if(!ok){const error=new Error(message);error.code=code;throw error;}};
const plain=value=>!!value&&typeof value==='object'&&!Array.isArray(value)&&(Object.getPrototypeOf(value)===Object.prototype||Object.getPrototypeOf(value)===null);
const id=prefix=>`${prefix}-${crypto.randomUUID()}`;
const text=(v,label,max=200)=>{check(typeof v==='string'&&v.trim().length>0&&v.length<=max,`${label} must contain 1–${max} characters.`);return v.trim();};
const scalar=v=>typeof v==='string'&&v.length<=500||typeof v==='number'&&Number.isFinite(v)||typeof v==='boolean';
const bool=(v,otherwise=false)=>{if(v===undefined)return otherwise;check(typeof v==='boolean','Expected a boolean.');return v;};
const integer=(v,min,max,label)=>{check(Number.isSafeInteger(v)&&v>=min&&v<=max,`${label} must be an integer from ${min} to ${max}.`);return v;};
const timestamp=value=>typeof value==='string'&&/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$/.test(value)&&!Number.isNaN(Date.parse(value))&&new Date(value).toISOString()===value;
function keys(object,allowed){check(plain(object),'Expected a plain object.');check(Object.keys(object).every(k=>allowed.includes(k)),'Unknown or unsafe configuration property.');}
function uniqueStrings(value,max,label,allowEmpty=true){check(Array.isArray(value)&&value.length<=max&&(allowEmpty||value.length>0)&&value.every(v=>typeof v==='string'&&v.length>0&&v.length<=120)&&new Set(value).size===value.length,`Invalid ${label}.`);return [...value];}
function projectOf(state,projectId){const p=state.projects.find(p=>p.id===projectId);check(p,'Project not found.','NOT_FOUND');return p;}
function fieldType(project,field){
  if(field.startsWith('metadata.')){const key=field.slice(9),f=project.fields.find(f=>f.key===key);check(f,'Unknown metadata field in workflow condition.');return ['number','integer'].includes(f.type)?'number':f.type==='boolean'?'boolean':'string';}
  check(['name','number','title','discipline','state','dueDate','tags','referenceCount','actorRole'].includes(field),'Unsupported workflow condition field.');
  return field==='referenceCount'?'number':field==='tags'?'array':'string';
}
/** Normalization both bounds complexity and validates primitive types; no coercive comparisons. */
export function normalizeCondition(input,project){
  let count=0;
  function visit(node,depth){
    check(++count<=AUTOMATION_LIMITS.conditions&&depth<=AUTOMATION_LIMITS.depth,'Workflow condition is too complex.');
    check(plain(node),'Invalid workflow condition.');
    if(Object.hasOwn(node,'all')||Object.hasOwn(node,'any')){
      const op=Object.hasOwn(node,'all')?'all':'any';keys(node,[op]);check(Array.isArray(node[op])&&node[op].length<=16&&(op==='all'||node[op].length>0),'Invalid condition group.');return {[op]:node[op].map(n=>visit(n,depth+1))};
    }
    keys(node,['field','op','value','valueType']);const field=text(node.field,'Condition field',100),type=fieldType(project,field),op=node.op;check(CONDITION_OPERATORS.includes(op),'Unsupported condition operator.');check(!Object.hasOwn(node,'valueType')||node.valueType===type,'Condition field type changed; update its workflow rule.');
    if(['exists','missing'].includes(op)){check(!Object.hasOwn(node,'value'),'Existence conditions do not take a value.');return {field,op,valueType:type};}
    if(['gt','gte','lt','lte'].includes(op))check(type==='number','Ordered comparisons require numeric fields.');
    if(['contains','startsWith'].includes(op))check(type==='string'||type==='array'&&op==='contains','This operator requires text or tags.');
    check(type!=='array'||op==='contains','Tags support contains, exists, or missing.');
    const validate=v=>{check(scalar(v)&&typeof v===(type==='array'?'string':type),'Condition value does not match its field type.');return v;};
    const value=['in','notIn'].includes(op)?(check(Array.isArray(node.value)&&node.value.length>0&&node.value.length<=30,'Use 1–30 values.'),node.value.map(validate)):validate(node.value);
    return {field,op,valueType:type,value};
  }
  return visit(input??{all:[]},0);
}
export function evaluateCondition(condition,document,actor){
  if(condition.all)return condition.all.every(c=>evaluateCondition(c,document,actor));
  if(condition.any)return condition.any.some(c=>evaluateCondition(c,document,actor));
  const {field,op,value}=condition;
  let actual=field.startsWith('metadata.')?(Object.hasOwn(document.metadata||{},field.slice(9))?document.metadata[field.slice(9)]:undefined):field==='actorRole'?actor?.role:field==='referenceCount'?document.references.length:document[field];
  // Governed metadata is serialized as canonical strings in Civora. Interpret only
  // schema-normalized numeric/boolean fields; never coerce arbitrary text or blanks.
  if(field.startsWith('metadata.')&&typeof actual==='string'){
    if(condition.valueType==='number'&&/^[+-]?(?:\d+(?:\.\d*)?|\.\d+)(?:[eE][+-]?\d+)?$/.test(actual)&&Number.isFinite(Number(actual)))actual=Number(actual);
    if(condition.valueType==='boolean'&&['true','false'].includes(actual))actual=actual==='true';
  }
  const exists=actual!==undefined&&actual!==null&&actual!==''&&(!Array.isArray(actual)||actual.length>0);
  if(op==='exists')return exists;if(op==='missing')return !exists;
  // Missing values never satisfy negative comparisons accidentally.
  if(!exists)return false;
  if(op==='eq')return actual===value;if(op==='ne')return typeof actual===typeof value&&actual!==value;
  if(op==='in')return value.includes(actual);if(op==='notIn')return value.every(v=>typeof v===typeof actual)&&!value.includes(actual);
  if(op==='contains')return (typeof actual==='string'||Array.isArray(actual))&&actual.includes(value);
  if(op==='startsWith')return typeof actual==='string'&&actual.startsWith(value);
  if(typeof actual!=='number'||!Number.isFinite(actual)||typeof value!=='number')return false;
  return op==='gt'?actual>value:op==='gte'?actual>=value:op==='lt'?actual<value:op==='lte'?actual<=value:false;
}
export function normalizeWorkflowRule(state,input){
  keys(input,['id','projectId','name','enabled','from','to','priority','when','require','message','requireReason','metadata','addTags','createdBy','createdAt','modifiedAt']);
  const project=projectOf(state,input.projectId),flowIds=new Set([project.workflowId,...state.documents.filter(d=>d.projectId===project.id).map(d=>d.workflowId)]),states=new Set(state.workflows.filter(w=>flowIds.has(w.id)).flatMap(w=>w.states));
  const from=input.from||'*',to=input.to||'*';check((from==='*'||states.has(from))&&(to==='*'||states.has(to)),'Rule state is not in a project workflow.');
  const metadata=structuredClone(input.metadata??{});keys(metadata,project.fields.map(f=>f.key));
  for(const [key,value]of Object.entries(metadata)){
    // Validate assignments independently of unrelated required fields.
    const field=project.fields.find(f=>f.key===key);metadata[key]=validateMetadata({...project,fields:[{...field,required:false}]},{[key]:value},{defaults:false})[key];
  }
  const addTags=uniqueStrings(input.addTags??[],20,'rule tags').map(t=>text(t,'Tag',60));
  return {projectId:project.id,name:text(input.name,'Rule name',120),enabled:bool(input.enabled,true),from,to,priority:integer(input.priority??100,0,1000,'Priority'),when:normalizeCondition(input.when,project),require:normalizeCondition(input.require,project),message:text(input.message||'Document does not meet this transition policy.','Rule message',500),requireReason:bool(input.requireReason),metadata:structuredClone(metadata),addTags};
}
/** Read-only explanation. All predicates use the same pre-transition snapshot.
 * Assignments use priority then stable identifier order, and are validated together.
 */
export function evaluateWorkflowRules(state,document,actor,to,reason=''){
  const matched=(state.workflowRules||[]).filter(r=>r.enabled&&r.projectId===document.projectId&&(r.from==='*'||r.from===document.state)&&(r.to==='*'||r.to===to)&&evaluateCondition(r.when,document,actor)).sort((a,b)=>a.priority-b.priority||(a.id<b.id?-1:a.id>b.id?1:0));
  const metadata=structuredClone(document.metadata),tags=[...document.tags],errors=[];
  for(const rule of matched){if(!evaluateCondition(rule.require,document,actor))errors.push(`${rule.name}: ${rule.message}`);if(rule.requireReason&&(typeof reason!=='string'||!reason.trim()))errors.push(`${rule.name}: enter a transition reason.`);Object.assign(metadata,rule.metadata);for(const tag of rule.addTags)if(!tags.includes(tag))tags.push(tag);}
  check(tags.length<=30,'Workflow rules would exceed 30 document tags.');
  return {matches:matched.map(r=>({id:r.id,name:r.name,priority:r.priority})),metadata,tags,hasAssignments:matched.some(r=>Object.keys(r.metadata).length||r.addTags.length),errors};
}
export function normalizeAutomationPolicy(state,input){
  keys(input,['projectId','enabled','reminderHours','escalationHours','escalationMode','delegateId','notifyUserIds','includeIssues','includeDocuments','id','createdBy','createdAt','modifiedAt','version']);
  projectOf(state,input.projectId);const mode=input.escalationMode||'notify';check(['notify','delegate'].includes(mode),'Choose notification or delegation escalation.');
  const delegateId=input.delegateId||'';check(mode!=='delegate'||state.users.some(u=>u.id===delegateId),'Choose a delegation reviewer.');check(!delegateId||state.users.some(u=>u.id===delegateId),'Unknown delegate.');
  const notifyUserIds=uniqueStrings(input.notifyUserIds||[],20,'notification recipients');check(notifyUserIds.every(id=>state.users.some(u=>u.id===id)),'Unknown notification recipient.');
  return {projectId:input.projectId,enabled:bool(input.enabled,true),reminderHours:integer(input.reminderHours??24,0,720,'Reminder lead hours'),escalationHours:integer(input.escalationHours??24,0,720,'Escalation delay hours'),escalationMode:mode,delegateId,notifyUserIds,includeIssues:bool(input.includeIssues,true),includeDocuments:bool(input.includeDocuments,false)};
}
export function normalizeSubscription(state,input){
  keys(input,['id','scope','resourceId','events','recursive','enabled','userId','createdAt']);
  check(['project','folder','document'].includes(input.scope),'Choose project, folder, or document scope.');
  check(state[input.scope+'s'].some(x=>x.id===input.resourceId),'Subscription target not found.','NOT_FOUND');
  const events=uniqueStrings(input.events, WATCH_EVENTS.length,'watch events',false);check(events.every(e=>WATCH_EVENTS.includes(e)),'Unsupported watch event.');
  return {scope:input.scope,resourceId:input.resourceId,events,recursive:bool(input.recursive,true),enabled:bool(input.enabled,true)};
}
function eventRecord(state,resourceType,resourceId,event,at,by){
  const resource=state[collections[resourceType]]?.find(x=>x.id===resourceId);if(!resource)return null;
  return {event,resourceType,resourceId,projectId:resource.projectId,documentIds:resourceType==='document'?[resource.id]:resource.documents?.map(s=>s.documentId)|| (resource.documentId?[resource.documentId]:[]),at,by};
}
function matchesSubscription(state,subscription,event){
  if(!subscription.enabled||!subscription.events.includes(event.event))return false;
  if(subscription.scope==='project')return subscription.resourceId===event.projectId;
  if(subscription.scope==='document')return event.documentIds.includes(subscription.resourceId);
  const parents=new Map(state.folders.map(f=>[f.id,f.parentId]));
  return event.documentIds.some(id=>{let folder=state.documents.find(d=>d.id===id)?.folderId;const seen=new Set();while(folder&&!seen.has(folder)){if(folder===subscription.resourceId)return true;if(!subscription.recursive)return false;seen.add(folder);folder=parents.get(folder);}return false;});
}
function trimNotifications(state){
  const records=state.notifications||[],counts=new Map(),retained=[];
  // Bounded inbox history: retain the newest 1,000 records per recipient.
  for(let i=records.length-1;i>=0&&retained.length<AUTOMATION_LIMITS.notifications;i--){const n=records[i],count=counts.get(n.userId)||0;if(count<AUTOMATION_LIMITS.notificationsPerUser){retained.push(n);counts.set(n.userId,count+1);}}
  state.notifications=retained.reverse();
}
function deliver(state,event,recipients,key){
  if(!event)return 0;state.notifications||=[];let added=0;
  for(const userId of new Set(recipients)){
    const notice={...event,userId};
    if(!notificationVisible(state,notice,userId)||state.notifications.some(n=>n.userId===userId&&n.key===key))continue;
    state.notifications.push({...notice,id:id('notice'),key,readAt:null,snoozedUntil:null});added++;
  }
  trimNotifications(state);return added;
}
export function publishCommandNotifications(previous,state,command,result,actorId,now){
  const p=command.payload||{},type=command.type;let specs=[];
  const map={'document.create':'document.created','document.checkin':'document.revised','document.restoreVersion':'document.revised','document.update':'document.updated','document.references':'document.updated','document.move':'document.moved','document.transition':'document.state','document.delete':'document.recycled','document.restore':'document.restored'};
  if(map[type])specs.push(['document',type==='document.create'?result:p.id||p.documentId,map[type],[]]);
  if(type==='document.bulkRename')for(const item of result.renamed)specs.push(['document',item.id,'document.updated',[]]);
  if(type==='document.bulkCopy')for(const item of result.copied)specs.push(['document',item.id,'document.created',[]]);
  if(type==='document.bulkMove')for(const item of p.items)specs.push(['document',item.id,'document.moved',[]]);
  if(type==='document.bulkUpdate')for(const update of p.updates)specs.push(['document',update.id,'document.updated',[]]);
  if(type==='comment.add')specs.push(['document',p.id||p.documentId,'comment.added',[]]);
  if(type.startsWith('review.')&&['review.create','review.decide','review.reassign','review.cancel'].includes(type)){
    const r=state.reviews.find(r=>r.id===(type==='review.create'?result:p.id)),old=previous.reviews.find(x=>x.id===r.id);
    specs.push(['review',r.id,type==='review.create'?'review.started':type==='review.decide'?'review.decision':type==='review.cancel'?'review.cancelled':'review.assigned',[r.createdBy]]);
    if(r.status==='In review'&&(type==='review.create'||type==='review.reassign'||old?.currentStage!==r.currentStage))specs.push(['review',r.id,'review.assigned',pendingReviewers(r)]);
  }
  if(type==='issue.create'||type==='issue.update'){const r=state.issues.find(i=>i.id===(type==='issue.create'?result:p.id));specs.push(['issue',r.id,type==='issue.create'?'issue.created':'issue.updated',[r.assignee,r.createdBy]]);}
  if(type==='transmittal.issue')specs.push(['transmittal',p.id,'delivery.issued',[]]);
  for(const [kind,target,event,direct]of specs){const record=eventRecord(state,kind,target,event,now,actorId);if(!record)continue;const recipients=[...direct,...(state.subscriptions||[]).filter(s=>matchesSubscription(state,s,record)||(event==='document.moved'&&matchesSubscription(previous,s,record))).map(s=>s.userId)];deliver(state,record,recipients,`command:${state.revision}:${event}:${target}`);}
}
function policyOwner(state,policy){const user=state.users.find(u=>u.id===policy.createdBy);return user?.active&&['admin','manager'].includes(user.role)&&canAccess(state,user.id,'manage','project',policy.projectId)?user:null;}
function deadlineISO(date){return date?`${date}T23:59:59.999Z`:null;}
export function automationDueItems(state,now=new Date().toISOString(),projectId=null){
  check(timestamp(now),'Use an exact UTC timestamp.');const time=Date.parse(now),items=[];
  for(const policy of state.automationPolicies||[]){if(!policy.enabled||(projectId&&policy.projectId!==projectId))continue;
    const add=(kind,resource,date)=>{const due=deadlineISO(date);if(!due)return;const stage=kind==='review'?currentReviewStage(resource):null;
      const base=`${policy.version}:${kind}:${resource.id}:${stage?.id||'legacy'}:${date}`;
      if(time>=Date.parse(due)-policy.reminderHours*3600000&&time<=Date.parse(due))items.push({key:base+':reminder',policy,kind,resourceId:resource.id,stageId:stage?.id||null,due,event:kind+'.reminder'});
      if(time>Date.parse(due))items.push({key:base+':overdue',policy,kind,resourceId:resource.id,stageId:stage?.id||null,due,event:kind+'.overdue'});
      if(kind==='review'&&time>=Date.parse(due)+policy.escalationHours*3600000+1)items.push({key:base+':escalation',policy,kind,resourceId:resource.id,stageId:stage?.id||null,due,event:'review.escalated'});
    };
    for(const r of state.reviews)if(r.projectId===policy.projectId&&r.status==='In review')add('review',r,currentReviewStage(r)?.dueDate||r.dueDate);
    if(policy.includeIssues)for(const issue of state.issues)if(issue.projectId===policy.projectId&&!['Resolved','Closed'].includes(issue.status))add('issue',issue,issue.dueDate);
    if(policy.includeDocuments)for(const d of state.documents)if(d.projectId===policy.projectId&&!d.deletedAt&&!['Published','Archived'].includes(d.state))add('document',d,d.dueDate);
  }
  const done=new Set((state.automationLedger||[]).map(e=>e.key));return items.filter(x=>!done.has(x.key)).sort((a,b)=>a.due.localeCompare(b.due)||a.key.localeCompare(b.key));
}
function delegateReview(state,review,policy,owner,now){
  const stage=currentReviewStage(review);check(stage,'Automatic delegation requires a staged review.','LEGACY');
  const replacement=state.users.find(u=>u.id===policy.delegateId),pending=pendingReviewers(review);
  check(pending.length===1,'Delegation only replaces a single remaining voter; it never reduces quorum.','QUORUM');
  const from=pending[0];check(from!==replacement?.id&&!stage.assignees.includes(replacement?.id),'The configured delegate is already assigned.','ALREADY_ASSIGNED');
  check(replacement?.active&&['admin','manager','reviewer'].includes(replacement.role),'The configured delegate is inactive or cannot review.','DELEGATE');
  check(canAccess(state,replacement.id,'review','project',review.projectId)&&review.documents.every(s=>canAccess(state,replacement.id,'review','document',s.documentId)),'The delegate lacks current review access.','ACCESS');
  check(review.documents.every(s=>canAccess(state,owner.id,'read','document',s.documentId)),'Policy owner cannot access every document.','ACCESS');
  if(review.separationOfDuties)check(replacement.id!==review.createdBy&&review.documents.every(s=>state.documents.find(d=>d.id===s.documentId).versions.find(v=>v.id===s.versionId).createdBy!==replacement.id),'Delegation violates separation of duties.','SEPARATION');
  stage.assignees=stage.assignees.map(u=>u===from?replacement.id:u);review.assignees=[...new Set(review.stages.flatMap(s=>s.assignees))];review.reassignments.push({by:owner.id,at:now,stageId:stage.id,from,to:replacement.id,reason:'Automatic overdue delegation under project policy '+policy.id,automatic:true});
  return replacement.id;
}
/** Mutates only a private transaction copy. Called by core wrapper/server, not untrusted HTTP commands. */
export function runScheduledAutomation(state,now,{projectId=null}={}){
  const items=automationDueItems(state,now,projectId).slice(0,AUTOMATION_LIMITS.tickItems),outcomes=[];
  state.automationLedger||=[];
  for(const item of items){
    check(state.automationLedger.length<AUTOMATION_LIMITS.ledger,'Automation ledger is full; export and maintain the workspace before continuing.');
    const {policy,kind,resourceId}=item,owner=policyOwner(state,policy),resource=state[collections[kind]].find(x=>x.id===resourceId);let status='sent',code='',delegatedTo=null;
    const event=eventRecord(state,kind,resourceId,item.event,now,policy.createdBy);
    if(!owner){status='blocked';code='OWNER_ACCESS';}
    else if(!notificationVisible(state,{...event,userId:owner.id},owner.id)){status='blocked';code='OWNER_ACCESS';}
    else if(kind==='review'&&!reviewIsCurrent(state,resource)){status='blocked';code='STALE_REVIEW';}
    else if(item.event==='review.escalated'&&policy.escalationMode==='delegate'){
      try{delegatedTo=delegateReview(state,resource,policy,owner,now);status='delegated';}catch(error){status='blocked';code=error.code||'VALIDATION';}
    }
    let recipients=[];
    if(owner&&status!=='blocked')recipients=kind==='review'?[...pendingReviewers(resource),resource.createdBy,...(item.event==='review.escalated'?policy.notifyUserIds:[])]:kind==='issue'?[resource.assignee,resource.createdBy]:[resource.createdBy];
    // A blocked escalation is visible to its still-authorized policy owner only.
    if(status==='blocked'&&owner&&item.event==='review.escalated'){event.event='review.escalation-blocked';recipients=[owner.id];}
    const delivered=deliver(state,event,recipients,'scheduled:'+item.key);
    const entry={id:id('automation'),key:item.key,projectId:policy.projectId,policyId:policy.id,resourceType:kind,resourceId,stageId:item.stageId,event:item.event,status,code,at:now,by:policy.createdBy,delivered,delegatedTo};
    state.automationLedger.push(entry);outcomes.push(entry);
  }
  return outcomes;
}
export function applyAutomationCommand(state,command,user,now){
  const p=command.payload||{},type=command.type;let result=null,summary='',targetId=p.id||p.projectId||p.resourceId||'';
  if(type==='workflowRule.save'){
    check(['admin','manager'].includes(user.role),'A manager role is required.','FORBIDDEN');const normal=normalizeWorkflowRule(state,p),old=(state.workflowRules||[]).find(r=>r.id===p.id);check(!p.id||old,'Rule not found.','NOT_FOUND');check(!old||old.projectId===normal.projectId,'A rule cannot move between projects.');
    state.workflowRules||=[];check(old||state.workflowRules.length<AUTOMATION_LIMITS.rules&&state.workflowRules.filter(r=>r.projectId===normal.projectId).length<AUTOMATION_LIMITS.rulesPerProject,'Workflow rule limit reached.');
    const record={...normal,id:old?.id||id('rule'),createdBy:old?.createdBy||user.id,createdAt:old?.createdAt||now,modifiedAt:now};state.workflowRules=state.workflowRules.filter(r=>r.id!==record.id);state.workflowRules.push(record);result=targetId=record.id;summary=`Saved workflow rule ${record.name}`;
  }else if(type==='workflowRule.delete'){
    const rule=(state.workflowRules||[]).find(r=>r.id===p.id);check(rule,'Rule not found.','NOT_FOUND');state.workflowRules=state.workflowRules.filter(r=>r.id!==p.id);summary=`Removed workflow rule ${rule.name}`;
  }else if(type==='automation.configure'){
    check(['admin','manager'].includes(user.role),'A manager role is required.','FORBIDDEN');const normal=normalizeAutomationPolicy(state,p),old=(state.automationPolicies||[]).find(r=>r.projectId===normal.projectId);
    if(normal.escalationMode==='delegate'){const delegate=state.users.find(u=>u.id===normal.delegateId);check(delegate?.active&&['admin','manager','reviewer'].includes(delegate.role),'Choose an active reviewer as delegate.');}
    const record={...normal,id:old?.id||id('policy'),createdBy:user.id,createdAt:old?.createdAt||now,modifiedAt:now,version:id('policyver')};state.automationPolicies=(state.automationPolicies||[]).filter(r=>r.projectId!==normal.projectId);state.automationPolicies.push(record);result=targetId=record.id;summary='Configured project reminders and overdue escalation';
  }else if(type==='automation.run'){
    check(['admin','manager'].includes(user.role),'A manager role is required.','FORBIDDEN');projectOf(state,p.projectId);result=runScheduledAutomation(state,now,{projectId:p.projectId});summary=`Reconciled ${result.length} scheduled workflow events`;
  }else if(type==='subscription.save'){
    const normal=normalizeSubscription(state,p);check(canAccess(state,user.id,'read',normal.scope,normal.resourceId),'Read access is required to watch this resource.','FORBIDDEN');
    const existing=(state.subscriptions||[]).find(s=>s.userId===user.id&&s.scope===normal.scope&&s.resourceId===normal.resourceId);check(!p.id||existing?.id===p.id,'Subscription not found.','NOT_FOUND');
    state.subscriptions||=[];check(existing||state.subscriptions.length<AUTOMATION_LIMITS.subscriptions&&state.subscriptions.filter(s=>s.userId===user.id).length<AUTOMATION_LIMITS.subscriptionsPerUser,'Watch subscription limit reached.');const record={...normal,id:existing?.id||id('watch'),userId:user.id,createdAt:existing?.createdAt||now};state.subscriptions=state.subscriptions.filter(s=>s.id!==record.id);state.subscriptions.push(record);result=targetId=record.id;summary='Updated personal change subscription';
  }else if(type==='subscription.delete'){
    const old=(state.subscriptions||[]).find(s=>s.id===p.id);check(old?.userId===user.id,'Subscription not found.','NOT_FOUND');state.subscriptions=state.subscriptions.filter(s=>s.id!==old.id);summary='Removed personal change subscription';
  }else if(type==='notification.update'){
    const ids=uniqueStrings(p.ids,200,'notification selection',false);check(['read','unread','snooze','unsnooze'].includes(p.action),'Unsupported notification action.');
    if(p.action==='snooze')check(timestamp(p.until)&&Date.parse(p.until)>Date.parse(now)&&Date.parse(p.until)<=Date.parse(now)+30*86400000,'Snooze must be in the next 30 days.');
    for(const id of ids){const n=(state.notifications||[]).find(n=>n.id===id);check(n?.userId===user.id&&notificationVisible(state,n,user.id),'Notification not found.','NOT_FOUND');if(p.action==='read')n.readAt=now;if(p.action==='unread')n.readAt=null;if(p.action==='snooze')n.snoozedUntil=p.until;if(p.action==='unsnooze')n.snoozedUntil=null;}
    result=ids.length;summary=`Updated ${ids.length} personal notifications`;
  }else return null;
  return {result,summary,targetId};
}
export function validateAutomationState(state){
  const definitions={workflowRules:AUTOMATION_LIMITS.rules,automationPolicies:2000,subscriptions:AUTOMATION_LIMITS.subscriptions,notifications:AUTOMATION_LIMITS.notifications,automationLedger:AUTOMATION_LIMITS.ledger},users=new Set(state.users.map(u=>u.id)),projects=new Set(state.projects.map(p=>p.id));
  for(const [name,limit]of Object.entries(definitions)){const items=state[name]===undefined?[]:state[name];check(Array.isArray(items)&&items.length<=limit,`Invalid ${name} collection.`);const ids=new Set();for(const item of items){check(plain(item)&&typeof item.id==='string'&&item.id.length>0&&item.id.length<=120&&!ids.has(item.id),`Invalid ${name} identifier.`);ids.add(item.id);}}
  const ruleCounts=new Map();for(const r of state.workflowRules||[]){normalizeWorkflowRule(state,r);check(users.has(r.createdBy)&&timestamp(r.createdAt)&&timestamp(r.modifiedAt),'Invalid rule authorship.');ruleCounts.set(r.projectId,(ruleCounts.get(r.projectId)||0)+1);check(ruleCounts.get(r.projectId)<=AUTOMATION_LIMITS.rulesPerProject,'Too many project rules.');}
  const policies=new Set();for(const p of state.automationPolicies||[]){normalizeAutomationPolicy(state,p);check(!policies.has(p.projectId)&&users.has(p.createdBy)&&timestamp(p.createdAt)&&timestamp(p.modifiedAt)&&typeof p.version==='string'&&p.version.length>0&&p.version.length<=120,'Invalid automation policy.');policies.add(p.projectId);}
  const watched=new Set(),counts=new Map();for(const s of state.subscriptions||[]){normalizeSubscription(state,s);const key=s.userId+':'+s.scope+':'+s.resourceId;check(users.has(s.userId)&&timestamp(s.createdAt)&&!watched.has(key),'Invalid or duplicate subscription.');watched.add(key);counts.set(s.userId,(counts.get(s.userId)||0)+1);check(counts.get(s.userId)<=AUTOMATION_LIMITS.subscriptionsPerUser,'Too many personal subscriptions.');}
  const deliveries=new Set(),noticeCounts=new Map();for(const n of state.notifications||[]){keys(n,['id','event','resourceType','resourceId','projectId','documentIds','at','by','userId','key','readAt','snoozedUntil']);noticeCounts.set(n.userId,(noticeCounts.get(n.userId)||0)+1);check(noticeCounts.get(n.userId)<=AUTOMATION_LIMITS.notificationsPerUser,'Too many personal notifications.');const resource=state[collections[n.resourceType]]?.find(r=>r.id===n.resourceId);check(resource&&resource.projectId===n.projectId&&NOTICE_EVENTS.includes(n.event)&&projects.has(n.projectId)&&users.has(n.userId)&&users.has(n.by)&&timestamp(n.at)&&typeof n.key==='string'&&n.key.length<=1000&&(n.readAt===null||timestamp(n.readAt))&&(n.snoozedUntil===null||timestamp(n.snoozedUntil)),'Invalid notification.');uniqueStrings(n.documentIds,1000,'notification documents');check(n.documentIds.every(id=>state.documents.some(d=>d.id===id&&d.projectId===n.projectId)),'Invalid notification resource.');const key=n.userId+':'+n.key;check(!deliveries.has(key),'Duplicate notification delivery.');deliveries.add(key);}
  const ledgerKeys=new Set();for(const entry of state.automationLedger||[]){keys(entry,['id','key','projectId','policyId','resourceType','resourceId','stageId','event','status','code','at','by','delivered','delegatedTo']);check(projects.has(entry.projectId)&&users.has(entry.by)&&timestamp(entry.at)&&typeof entry.key==='string'&&entry.key.length<=1000&&!ledgerKeys.has(entry.key)&&['sent','delegated','blocked'].includes(entry.status)&&typeof entry.code==='string'&&NOTICE_EVENTS.includes(entry.event)&&state[collections[entry.resourceType]]?.some(r=>r.id===entry.resourceId&&r.projectId===entry.projectId)&&Number.isSafeInteger(entry.delivered)&&entry.delivered>=0&&(!entry.delegatedTo||users.has(entry.delegatedTo)),'Invalid automation ledger.');ledgerKeys.add(entry.key);}
  return true;
}
