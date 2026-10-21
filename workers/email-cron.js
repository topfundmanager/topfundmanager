import { SupabaseMailStore } from '../lib/email/persistence.js';
import { scheduledMail } from '../lib/email/jobs.js';
export default {
 async scheduled(event,env,ctx) {ctx.waitUntil(scheduledMail(new SupabaseMailStore(env),env).catch(()=>{console.error('Email background run failed; inspect job state.');}));},
 async fetch() {return new Response('Not found',{status:404});}
};
