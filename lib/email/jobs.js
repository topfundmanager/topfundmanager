import { GmailAdapter } from './gmail.js';
export async function runJob(store,env,{adapter=(m)=>new GmailAdapter(env,m)}={}) {
 if(env.EMAIL_WORKER_ENABLED!=='true') return {paused:true};
 const [job]=await store.rpc('email_claim',{p_workspace:env.EMAIL_WORKSPACE_ID});if(!job)return {idle:true};
 const m=await store.one('email_mailboxes',{id:`eq.${job.mailbox_id}`,workspace_id:`eq.${job.workspace_id}`});
 let result={},operation;
 const provider=adapter(m);
 try {
  if(job.kind==='sync') result=await provider.sync();
  if(job.kind==='watch') result=await provider.watch();
  if(job.kind==='stop') {try{await provider.stop();}catch(e){if(e.status!==401)throw e;}result={stopped:true};}
  if(job.kind==='send') {
   const op=operation=await store.one('email_operations',{id:`eq.${job.operation_id}`,workspace_id:`eq.${job.workspace_id}`,mailbox_id:`eq.${m.id}`});
   if(op.state==='uncertain'||op.state==='sending') {
    const found=await provider.reconcile(op.payload);
    result=found?{sendState:'sent',providerId:found}:{sendState:'uncertain',issue:'Acceptance could not be confirmed. Check Gmail Sent; do not resubmit.',retry:job.attempts<8,failed:job.attempts>=8};
   } else if(op.state==='queued') {
    // Acquire/refresh credentials before the irreversible boundary. After it, any transport ambiguity is uncertain.
    await provider.prepareSend();
    const begin=await store.rpc('email_begin_send',{p_job:job.id,p_lease:job.lease_id,p_generation:m.generation});
    if(begin) {
     try {const sent=await provider.send(op.payload);if(!sent.id)throw new Error('Missing provider acceptance identifier.');result={sendState:'sent',providerId:sent.id};}
     catch(e) {
      const rejected=e.status>=400&&e.status<500&&![408,429].includes(e.status);
      result={sendState:rejected?'failed':'uncertain',issue:rejected?'Gmail rejected the reply. Review connection and draft.':'Gmail acceptance is unknown. Reconciliation required.',retry:!rejected,failed:rejected};
     }
    }
   }
  }
 } catch(e) {
  const auth=e.status===401||e.status===403;
  result={...(job.kind==='send'&&operation?.state==='queued'&&(auth||job.attempts>=8)?{sendState:'failed'}:{}),authFailure:auth,retry:!auth,failed:auth||job.attempts>=8,issue:auth?'Reconnect mailbox or check Workspace API policy.':'Synchronization interrupted. Check provider availability and background job status.'};
 }
 const committed=await store.rpc('email_finish',{p_job:job.id,p_lease:job.lease_id,p_generation:m.generation,p_result:result});
 return {processed:true,committed};
}
export async function scheduledMail(store,env,dependencies) {
 if(env.EMAIL_WORKER_ENABLED!=='true')return {paused:true};
 await store.rpc('email_schedule',{p_workspace:env.EMAIL_WORKSPACE_ID});
 const started=Date.now();let result;
 for(let i=0;i<5 && Date.now()-started<120000;i++){result=await runJob(store,env,dependencies);if(result.idle)break;}
 return result;
}
