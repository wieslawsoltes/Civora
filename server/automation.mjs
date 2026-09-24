/** Single-node scheduler. Work and deduplication commit together through the existing CAS store.
 * Restart scans deadlines again. Empty ticks do not advance workspace revisions.
 */
import { applyScheduledAutomation } from '../packages/core/index.js';
export function createAutomationRunner({store,onCommit=()=>{},onError=console.error,intervalMs=30000,enabled=true,clock=()=>new Date().toISOString(),start=true}={}){
  if(!Number.isSafeInteger(intervalMs)||intervalMs<250||intervalMs>3600000)throw new Error('Automation interval must be 250–3600000 milliseconds.');
  let closed=false,pending=null,timer=null;
  const status={enabled,intervalMs,lastAttempt:null,lastSuccess:null,lastError:null,commits:0,events:0,conflicts:0};
  async function reconcile(){
    if(closed||!enabled)return {changed:false,result:[]};if(pending)return pending;
    pending=(async()=>{
      status.lastAttempt=clock();
      for(let retry=0;retry<4;retry++){
        const previous=await store.read();if(!previous)return {changed:false,result:[]};
        const output=applyScheduledAutomation(previous,clock());
        if(output.changed){try{await store.save(output.state,previous.revision,new Map());}catch(error){if(error.code==='CONFLICT'){status.conflicts++;continue;}throw error;}
          status.commits++;status.events+=output.result.length;await onCommit(output);
        }
        status.lastSuccess=clock();status.lastError=null;return output;
      }
      const error=new Error('Automation deferred after concurrent workspace changes.');error.code='CONFLICT';throw error;
    })().catch(error=>{status.lastError=error.message;throw error;}).finally(()=>{pending=null;});
    return pending;
  }
  if(start&&enabled){timer=setInterval(()=>reconcile().catch(onError),intervalMs);timer.unref();}
  return {reconcile,status:()=>({...status,running:!!pending,closed}),async close(){closed=true;if(timer)clearInterval(timer);if(pending)await pending.catch(()=>{});}};
}
