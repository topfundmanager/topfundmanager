import test from 'node:test';
import assert from 'node:assert/strict';
import { EmailService } from '../../lib/email/service.js';
import { GmailAdapter, addresses, normalizeMessage, replyPayload, rawReply, htmlToText } from '../../lib/email/gmail.js';
import { encode,decode,text,utf8,seal,unseal,validateMailboxIdentity,mutationGuard,verifyGoogleJwt } from '../../lib/email/security.js';
import { initiateOAuth,finishOAuth } from '../../lib/email/oauth.js';
import { runJob } from '../../lib/email/jobs.js';
import { onRequest } from '../../functions/api/email/[[path]].js';
const a='11111111-1111-4111-8111-111111111111',b='22222222-2222-4222-8222-222222222222',c='33333333-3333-4333-8333-333333333333',d='44444444-4444-4444-8444-444444444444';
const env={EMAIL_WORKSPACE_ID:'test',EMAIL_APP_ORIGIN:'https://example.test',EMAIL_GOOGLE_HOSTED_DOMAIN:'example.com',EMAIL_GOOGLE_CLIENT_ID:'client',EMAIL_GOOGLE_CLIENT_SECRET:'mock',EMAIL_TOKEN_KEY:encode(new Uint8Array(32).fill(9)),FORMS_ADMIN_EMAILS:'reader@example.com',EMAIL_WORKER_ENABLED:'true'};
const mailbox={id:a,workspace_id:'test',address:'one@example.com',status:'connected',generation:1,credential:'encrypted'};
const parent={threadId:'gmail-thread',subject:'A résumé',from:['sender@example.org'],to:['one@example.com','colleague@example.org'],cc:['other@example.org','sender@example.org'],replyTo:['reply@example.org'],messageId:'<original@example.org>',references:'<root@example.org>',body:'Hello',attachments:[]};
class Store {
 constructor(rows={}){this.rows=rows;this.calls=[];}
 async query(table,params) {
  this.calls.push({table,params});return (this.rows[table]||[]).filter(row=>Object.entries(params).every(([k,v])=>!String(v).startsWith('eq.')||String(row[k])===v.slice(3)));
 }
 async one(table,params){return (await this.query(table,params))[0];}
 async write(table,data){(this.rows[table]||=[]).push(data);return [data];}
 async upsert(table,data){return this.write(table,data);}
 async rpc(name,data){this.calls.push({name,data});return true;}
}
const granted=()=>new Store({email_mailboxes:[mailbox,{...mailbox,id:b,address:'two@example.com'}],email_grants:[{workspace_id:'test',mailbox_id:a,user_email:'reader@example.com',can_read:true,can_send:true,can_manage:true},{workspace_id:'test',mailbox_id:b,user_email:'other@example.com',can_read:true}],email_conversations:[{id:c,workspace_id:'test',mailbox_id:a},{id:d,workspace_id:'test',mailbox_id:b}],email_messages:[{id:d,workspace_id:'test',mailbox_id:a,conversation_id:c,data:parent}]});
test('two mailbox grants restrict combined list and deny cross mailbox, user, and workspace reads',async()=>{
 const store=granted(),service=new EmailService(store,'test','reader@example.com');
 assert.deepEqual((await service.mailboxes()).mailboxes.map(m=>m.id),[a]);
 await service.conversations({});assert.equal(store.calls.at(-1).params.mailbox_id,`in.(${a})`);
 await assert.rejects(service.messages(d),/permission/);await assert.rejects(service.mailbox(b),/permission/);
 await assert.rejects(new EmailService(store,'test','intruder@example.com').messages(c),/permission/);
 await assert.rejects(new EmailService(store,'other-workspace','reader@example.com').messages(c),/unavailable/);
});
test('send requires read and send; client cannot choose sender or a foreign parent',async()=>{
 const store=granted(),service=new EmailService(store,'test','reader@example.com');
 const input={conversationId:c,parentId:d,clientId:a,body:'Reply',mode:'replyAll',from:'attacker@example.com'};
 const prepared=await service.prepare(input);assert.equal(prepared.payload.from,mailbox.address);
 await assert.rejects(service.prepare({...input,parentId:b}),/unavailable/);
 store.rows.email_grants[0].can_send=false;await assert.rejects(service.prepare(input),/permission/);
});
test('recipient review is checked server-side and operation persisted via atomic submission',async()=>{
 const store=granted(),service=new EmailService(store,'test','reader@example.com'),input={conversationId:c,parentId:d,clientId:a,body:'Reply',mode:'replyAll'};
 const {payload}=await service.prepare(input),review={from:payload.from,to:payload.to,cc:payload.cc,subject:payload.subject};
 await assert.rejects(service.submit({...input,reviewed:true,review:{...review,from:'fake@example.org'}}),/changed/);
 store.rpc=async(name,args)=>{assert.equal(name,'email_submit');assert.equal(args.p_payload.from,mailbox.address);return{id:a,state:'queued'};};
 assert.equal((await service.submit({...input,reviewed:true,review})).operation.state,'queued');
});
test('Reply-To, reply-all exclusions and Gmail thread headers are preserved',()=>{
 const p=replyPayload(mailbox,parent,'replyAll','Body é',a);assert.deepEqual(p.to,['reply@example.org']);assert.deepEqual(p.cc,['colleague@example.org','other@example.org','sender@example.org']);
 const raw=text(decode(rawReply(p)));assert.match(raw,/In-Reply-To: <original@example.org>/);assert.match(raw,/References: <root@example.org> <original@example.org>/);assert.match(raw,/Content-Transfer-Encoding: base64/);assert.equal(p.threadId,'gmail-thread');
 assert.deepEqual(replyPayload(mailbox,{...parent,from:[mailbox.address],to:['recipient@example.org']},'reply','Reply',a).to,['recipient@example.org']);
 assert.throws(()=>replyPayload(mailbox,{...parent,subject:'x\r\nBcc: bad@example.org'},'reply','Reply',a),/header/);
 assert.throws(()=>replyPayload(mailbox,{...parent,messageId:''},'reply','Reply',a),/threading/);
 assert.deepEqual(addresses('"Person, Name" <p@example.org>, q@example.org'),['p@example.org','q@example.org']);
});
test('message normalization extracts lazy attachments and converts hostile HTML to inert text',()=>{
 const normalized=normalizeMessage({id:'id',threadId:'thread',internalDate:'1700000000000',labelIds:['INBOX'],payload:{headers:[{name:'From',value:'Person <p@example.org>'}],parts:[{mimeType:'text/html',body:{data:encode(utf8('<script>alert(1)</script><img src="https://track"><p>Hello <b>friend</b></p>'))}},{partId:'2',filename:'invoice.pdf',mimeType:'application/pdf',body:{attachmentId:'provider-attachment',size:123}}]}});
 assert.match(normalized.body,/Hello friend/);assert.doesNotMatch(normalized.body,/<img|<script|alert/);assert.equal(normalized.attachments[0].providerId,'provider-attachment');assert.equal(normalized.inInbox,true);
 assert.equal(htmlToText('&lt;img src=x onerror=alert(1)&gt;'),'<img src=x onerror=alert(1)>'); // Always textContent, never innerHTML.
});
test('token encryption is randomized and bound to workspace/mailbox',async()=>{
 const ciphertext=await seal({refreshToken:'secret'},env,'test:one');assert.doesNotMatch(ciphertext,/secret/);assert.notEqual(ciphertext,await seal({refreshToken:'secret'},env,'test:one'));
 assert.equal((await unseal(ciphertext,env,'test:one')).refreshToken,'secret');await assert.rejects(unseal(ciphertext,env,'test:two'));
});
test('Workspace signed hd, verified email, nonce, primary identity and stable subject are all required',()=>{
 const claims={email_verified:true,hd:'example.com',email:mailbox.address,nonce:'n',sub:'google-1'};validateMailboxIdentity(claims,mailbox,env,'n');
 for(const changed of [{hd:'evil.org'},{email_verified:false},{nonce:'wrong'},{email:'two@example.com'}])assert.throws(()=>validateMailboxIdentity({...claims,...changed},mailbox,env,'n'));
 assert.throws(()=>validateMailboxIdentity(claims,{...mailbox,google_subject:'google-2'},env,'n'));
});
test('dashboard mutations require exact configured origin and a CSRF header',()=>{
 const make=(origin,csrf='1')=>new Request('https://example.test/api/email/reply',{method:'POST',headers:{origin,'x-email-csrf':csrf,'content-type':'application/json'},body:'{}'});
 mutationGuard(make('https://example.test'),env);assert.throws(()=>mutationGuard(make('https://evil.org'),env));assert.throws(()=>mutationGuard(make('https://example.test',''),env));
});
test('OAuth uses PKCE, offline access and a separate Lax cookie; state replay, expiry and wrong browser fail',async()=>{
 const store=granted(),service=new EmailService(store,'test','reader@example.com');
 const start=await initiateOAuth(service,{id:c},a,env),url=new URL(start.url);assert.equal(url.searchParams.get('code_challenge_method'),'S256');assert.match(start.cookie,/SameSite=Lax/);assert.equal(url.searchParams.get('access_type'),'offline');
 let saved=store.rows.email_oauth_states[0],used=false,expired=false;
 store.rpc=async(name,args)=>{assert.equal(name,'email_take_state');if(used||expired||args.p_hash!==saved.state_hash||args.p_browser!==saved.browser_hash)return[];used=true;return[saved];};
 const callback=cookie=>new Request(`https://example.test/api/email/oauth/callback?state=${url.searchParams.get('state')}&code=code`,{headers:{cookie}});
 await assert.rejects(finishOAuth(callback('tfm_email_oauth=wrong'),store,env,{serviceFactory:(...a)=>new EmailService(...a)}),/expired/);assert.equal(used,false);
 expired=true;await assert.rejects(finishOAuth(callback(start.cookie),store,env,{serviceFactory:(...a)=>new EmailService(...a)}),/expired/);expired=false;
 // Wrong account consumes the state but cannot connect.
 await assert.rejects(finishOAuth(callback(start.cookie),store,env,{serviceFactory:(...a)=>new EmailService(...a),fetcher:async()=>Response.json({id_token:'mock'}),verify:async()=>({email_verified:true,hd:'example.com',email:'wrong@example.com',nonce:url.searchParams.get('nonce'),sub:'g'})}),/primary/);
 assert(used);await assert.rejects(finishOAuth(callback(start.cookie),store,env,{serviceFactory:(...a)=>new EmailService(...a)}),/expired/);
});
function adapterFor(m,responses,calls=[]) {
 return new GmailAdapter(env,m,{credentials:async()=>({refreshToken:'mock'}),fetcher:async(url,init)=>{calls.push({url,init});if(url.includes('oauth2'))return Response.json({access_token:'mock'});const item=responses.shift();if(item instanceof Error)throw item;return Response.json(item?.data||item||{}, {status:item?.status||200});}});
}
test('bounded initial import captures history before import and resumes pages without checkpoint advance',async()=>{
 const calls=[],provider=adapterFor({...mailbox,checkpoint:null},[{historyId:'100'},{messages:[],nextPageToken:'p2'}],calls);
 const r=await provider.sync();assert.equal(r.checkpoint,null);assert.equal(r.anchor,'100');assert.equal(JSON.parse(r.cursor).page,'p2');assert.match(calls.at(-1).url,/after/);
 const nextProvider=adapterFor({...mailbox,checkpoint:null,import_anchor:r.anchor,import_cursor:r.cursor,import_after:r.after},[{messages:[]}]);const next=await nextProvider.sync();assert.equal(next.checkpoint,'100');assert.equal(next.continue,true);
});
test('expired Gmail history starts controlled window resync and ignores notification history as a checkpoint',async()=>{
 const result=await adapterFor({...mailbox,checkpoint:'10'},[{status:404}]).sync();assert.equal(result.checkpoint,null);assert.equal(result.continue,true);assert.match(result.issue,/expired/);
 const history=await adapterFor({...mailbox,checkpoint:'20'},[{history:[],historyId:'100',nextPageToken:'next'}]).sync();assert.equal(history.checkpoint,'20');assert.equal(JSON.parse(history.cursor).mode,'history');
});
function jobStore(kind,state='queued') {
 const s=new Store({email_mailboxes:[mailbox],email_operations:[{id:c,workspace_id:'test',mailbox_id:a,user_email:'reader@example.com',state,payload:replyPayload(mailbox,parent,'reply','Hello',a)}]});
 const job={id:b,workspace_id:'test',mailbox_id:a,kind,lease_id:c,operation_id:c,attempts:1};let finish;
 s.rpc=async(name,args)=>{s.calls.push({name,args});if(name==='email_claim')return[job];if(name==='email_begin_send')return true;if(name==='email_finish'){finish=args.p_result;return true;}};
 return {s,job,get result(){return finish;}};
}
test('ambiguous Gmail acceptance becomes uncertain and reconciliation never resends',async()=>{
 const fixture=jobStore('send');let sends=0;await runJob(fixture.s,env,{adapter:()=>({prepareSend:async()=>{},send:async()=>{sends++;throw new Error('timeout');}})});
 assert.equal(fixture.result.sendState,'uncertain');assert.equal(fixture.result.retry,true);
 const retry=jobStore('send','uncertain');await runJob(retry.s,env,{adapter:()=>({reconcile:async()=>null,send:async()=>{sends++;}})});assert.equal(retry.result.sendState,'uncertain');assert.equal(sends,1);
 const accepted=jobStore('send','uncertain');await runJob(accepted.s,env,{adapter:()=>({reconcile:async()=>'gmail-sent-id'})});assert.equal(accepted.result.sendState,'sent');
});
test('definitive rejection fails, permission fence prevents sending, and paused worker claims nothing',async()=>{
 const f=jobStore('send');await runJob(f.s,env,{adapter:()=>({prepareSend:async()=>{},send:async()=>{throw Object.assign(new Error(),{status:400});}})});assert.equal(f.result.sendState,'failed');
 const denied=jobStore('send');const orig=denied.s.rpc;denied.s.rpc=(name,args)=>name==='email_begin_send'?false:orig(name,args);await runJob(denied.s,env,{adapter:()=>({prepareSend:async()=>{},send:async()=>assert.fail('must not send')})});
 const paused=jobStore('sync');await runJob(paused.s,{...env,EMAIL_WORKER_ENABLED:'false'});assert.equal(paused.s.calls.length,0);
});
let jwtKey,jwk;
async function signed(claims) {
 if(!jwtKey){jwtKey=await crypto.subtle.generateKey({name:'RSASSA-PKCS1-v1_5',modulusLength:2048,publicExponent:new Uint8Array([1,0,1]),hash:'SHA-256'},true,['sign','verify']);jwk={...await crypto.subtle.exportKey('jwk',jwtKey.publicKey),kid:'test-key'};}
 const head=encode(utf8(JSON.stringify({alg:'RS256',kid:'test-key'}))),body=encode(utf8(JSON.stringify({iss:'https://accounts.google.com',aud:'push-audience',sub:'service-subject',email_verified:true,email:'push@example.iam.gserviceaccount.com',iat:Math.floor(Date.now()/1000),exp:Math.floor(Date.now()/1000)+600,...claims})));
 return `${head}.${body}.${encode(new Uint8Array(await crypto.subtle.sign('RSASSA-PKCS1-v1_5',jwtKey.privateKey,utf8(`${head}.${body}`))))}`;
}
test('Google JWT signature, issuer, audience and expiry are verified',async()=>{
 const token=await signed({});const options={fetcher:async()=>Response.json({keys:[jwk]})};
 assert.equal((await verifyGoogleJwt(token,'push-audience',options)).sub,'service-subject');
 await assert.rejects(verifyGoogleJwt(token,'wrong',options));await assert.rejects(verifyGoogleJwt(await signed({exp:1}),'push-audience',options));await assert.rejects(verifyGoogleJwt(token.slice(0,-8)+'AAAAAAAA','push-audience',options));
});
test('authenticated duplicate/out-of-order Pub/Sub signals persist before acknowledgment; storage failure is retryable',async()=>{
 const original=globalThis.fetch;const queued=[];let fail=false;
 const pushEnv={...env,EMAIL_ENABLED:'true',SUPABASE_URL:'https://db.test',SUPABASE_SERVICE_ROLE_KEY:'mock',EMAIL_PUBSUB_AUDIENCE:'push-audience',EMAIL_PUBSUB_SERVICE_ACCOUNT:'push@example.iam.gserviceaccount.com',EMAIL_PUBSUB_SERVICE_SUBJECT:'service-subject',EMAIL_PUBSUB_SUBSCRIPTION:'projects/test/subscriptions/mail'};
 const token=await signed({});globalThis.fetch=async(url,init)=>{if(url.includes('/certs'))return Response.json({keys:[jwk]});if(url.includes('email_mailboxes'))return Response.json([mailbox]);if(url.includes('email_enqueue')){if(fail)return Response.json({}, {status:503});queued.push(JSON.parse(init.body));return Response.json(null);}throw new Error('Unexpected network');};
 try {
  for(const [id,history] of [['signal1','200'],['signal1','200'],['signal0','100']]) {
   const req=new Request('https://example.test/api/email/notifications',{method:'POST',headers:{authorization:`Bearer ${token}`},body:JSON.stringify({subscription:pushEnv.EMAIL_PUBSUB_SUBSCRIPTION,message:{messageId:id,data:encode(utf8(JSON.stringify({emailAddress:mailbox.address,historyId:history})))}})});
   assert.equal((await onRequest({request:req,env:pushEnv})).status,200);
  }
  assert.equal(queued.length,3);assert(queued.every(v=>!('checkpoint' in v)));
  fail=true;const req=new Request('https://example.test/api/email/notifications',{method:'POST',headers:{authorization:`Bearer ${token}`},body:JSON.stringify({subscription:pushEnv.EMAIL_PUBSUB_SUBSCRIPTION,message:{messageId:'failure',data:encode(utf8(JSON.stringify({emailAddress:mailbox.address,historyId:'400'})))}})});assert.equal((await onRequest({request:req,env:pushEnv})).status,503);
  assert.equal((await onRequest({request:new Request('https://example.test/api/email/notifications',{method:'POST'}),env:pushEnv})).status,401);
 }finally{globalThis.fetch=original;}
});
test('attachment route denies a valid dashboard user without mailbox read permission before calling Gmail',async()=>{
 const original=globalThis.fetch;let gmailCalled=false;
 globalThis.fetch=async(url,init={})=>{if(url.includes('google')){gmailCalled=true;throw new Error();}if(url.includes('forms_sessions'))return Response.json(init.method==='PATCH'?null:[{id:c,email:'reader@example.com'}]);if(url.includes('email_rate'))return Response.json(true);if(url.includes('email_messages'))return Response.json([{id:d,workspace_id:'test',mailbox_id:b,data:{attachments:[]}}]);if(url.includes('email_grants'))return Response.json([]);throw new Error('Unexpected network');};
 try{const r=await onRequest({request:new Request(`https://example.test/api/email/attachment?message=${d}&part=2`,{headers:{cookie:'tfm_forms_session=valid'}}),env:{...env,EMAIL_ENABLED:'true',SUPABASE_URL:'https://db.test',SUPABASE_SERVICE_ROLE_KEY:'mock'}});assert.equal(r.status,403);assert.equal(gmailCalled,false);}finally{globalThis.fetch=original;}
});
test('bulk Gmail history changes resume in bounded chunks and advance checkpoint only after the last chunk',async()=>{
 const message=id=>({id,threadId:'thread',internalDate:'1700000000000',payload:{headers:[],mimeType:'text/plain',body:{data:encode(utf8('Body'))}}});
 const ids=Array.from({length:23},(_,i)=>`message${i}`),deleted=Array.from({length:105},(_,i)=>`deleted${i}`);
 const page={historyId:'200',history:[{messagesAdded:ids.map(id=>({message:{id}})),messagesDeleted:deleted.map(id=>({message:{id}}))}]};
 const first=await adapterFor({...mailbox,checkpoint:'100'},[page,...ids.slice(0,20).map(message)]).sync();
 assert.equal(first.checkpoint,'100');assert.equal(first.messages.length,20);assert.equal(first.deleted.length,100);assert.equal(JSON.parse(first.cursor).pending.length,3);
 const calls=[];const second=await adapterFor({...mailbox,checkpoint:first.checkpoint,import_cursor:first.cursor,import_after:first.after},ids.slice(20).map(message),calls).sync();
 assert.equal(second.checkpoint,'200');assert.equal(second.messages.length,3);assert.equal(second.deleted.length,5);assert.equal(second.cursor,null);assert.equal(calls.filter(c=>c.url.includes('/history?')).length,0);
});
test('a next history page is fetched after an empty pending chunk and its messages are not skipped',async()=>{
 const cursor=JSON.stringify({mode:'history',page:'next',pending:[],pendingDeleted:[],targetHistory:'200'});
 const normalized={id:'second-page',threadId:'t',internalDate:'1700000000000',payload:{headers:[]}};
 const result=await adapterFor({...mailbox,checkpoint:'100',import_cursor:cursor},[{historyId:'300',history:[{messagesAdded:[{message:{id:'second-page'}}]}]},normalized]).sync();
 assert.equal(result.messages.length,1);assert.equal(result.checkpoint,'300');
});
test('RFC send identity is stable per scoped operation and differs across users sharing a mailbox',async()=>{
 const store=granted(),input={conversationId:c,parentId:d,clientId:a,body:'Reply',mode:'reply'};
 store.rows.email_grants.push({...store.rows.email_grants[0],user_email:'second@example.com'});
 const service=new EmailService(store,'test','reader@example.com');
 const first=await service.prepare(input),duplicate=await service.prepare(input),other=await new EmailService(store,'test','second@example.com').prepare(input);
 assert.equal(first.payload.messageId,duplicate.payload.messageId);assert.notEqual(first.payload.messageId,other.payload.messageId);
});
