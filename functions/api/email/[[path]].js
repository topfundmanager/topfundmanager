import { requireSession, isAllowedAdmin } from '../forms/utils.js';
import { SupabaseMailStore } from '../../../lib/email/persistence.js';
import { EmailService } from '../../../lib/email/service.js';
import { GmailAdapter } from '../../../lib/email/gmail.js';
import { initiateOAuth, finishOAuth, oauthCookie } from '../../../lib/email/oauth.js';
import { assert, MailError, mutationGuard, limitedJson, verifyGoogleJwt, decode, text, uuid } from '../../../lib/email/security.js';
const response=(data,status=200,headers={})=>new Response(JSON.stringify(data),{status,headers:{'Content-Type':'application/json','Cache-Control':'no-store','X-Content-Type-Options':'nosniff',...headers}});
export async function onRequest({request,env}) {
 const path=new URL(request.url).pathname.replace(/^\/api\/email\/?/,'').replace(/\/$/,'');
 const store=new SupabaseMailStore(env);
 try {
  assert(env.EMAIL_ENABLED==='true',503,'Email is not enabled. Contact the dashboard administrator.');
  if(path==='notifications' && request.method==='POST') {
   const bearer=request.headers.get('authorization')||'';assert(bearer.startsWith('Bearer '),401,'Authentication required.');
   assert(env.EMAIL_PUBSUB_AUDIENCE&&env.EMAIL_PUBSUB_SERVICE_ACCOUNT&&env.EMAIL_PUBSUB_SERVICE_SUBJECT&&env.EMAIL_PUBSUB_SUBSCRIPTION,503,'Notification authentication is not configured.');
   const c=await verifyGoogleJwt(bearer.slice(7),env.EMAIL_PUBSUB_AUDIENCE);
   assert(c.email_verified===true&&c.email===env.EMAIL_PUBSUB_SERVICE_ACCOUNT&&c.sub===env.EMAIL_PUBSUB_SERVICE_SUBJECT,403,'Unexpected notification identity.');
   const envelope=await limitedJson(request,20000);
   assert(envelope.subscription===env.EMAIL_PUBSUB_SUBSCRIPTION&&typeof envelope.message?.messageId==='string'&&envelope.message.messageId.length<200,400);
   const change=JSON.parse(text(decode(envelope.message.data)));
   assert(typeof change.emailAddress==='string'&&/^\d+$/.test(change.historyId),400);
   const m=await store.one('email_mailboxes',{workspace_id:`eq.${env.EMAIL_WORKSPACE_ID}`,address:`eq.${change.emailAddress.toLowerCase()}`,status:'eq.connected'});
   // Never create or infer mailbox ownership from a notification.
   if(m) await store.rpc('email_enqueue',{p_workspace:env.EMAIL_WORKSPACE_ID,p_mailbox:m.id,p_kind:'sync',p_key:`pubsub:${envelope.message.messageId}`});
   return response({accepted:true});
  }
  if(path==='oauth/callback'&&request.method==='GET') {
   await finishOAuth(request,store,env,{serviceFactory:(...args)=>new EmailService(...args)});
   return new Response(null,{status:303,headers:{Location:`${env.EMAIL_APP_ORIGIN}/dashboard.html#email`,'Set-Cookie':oauthCookie('',0),'Cache-Control':'no-store','Referrer-Policy':'no-referrer'}});
  }
  const session=await requireSession(request,env);
  assert(session&&isAllowedAdmin(session.email,env),401,'Sign in to the dashboard.');
  assert(await store.rpc('email_rate',{p_workspace:env.EMAIL_WORKSPACE_ID,p_actor:session.email,p_limit:120}),429,'Email request limit reached. Try again in a minute.');
  const service=new EmailService(store,env.EMAIL_WORKSPACE_ID,session.email);
  const url=new URL(request.url);
  if(request.method==='GET') {
   if(path==='mailboxes') return response(await service.mailboxes());
   if(path==='conversations') return response(await service.conversations({mailbox:url.searchParams.get('mailbox'),cursor:url.searchParams.get('cursor')}));
   if(path==='messages') return response(await service.messages(url.searchParams.get('conversation')));
   if(path==='operations') return response(await service.operation(url.searchParams.get('id'),url.searchParams.get('clientId'),url.searchParams.get('mailbox')));
   if(path==='attachment') {
    assert(await store.rpc('email_rate',{p_workspace:env.EMAIL_WORKSPACE_ID,p_actor:`attachment:${session.email}`,p_limit:20}),429,'Download limit reached. Try again in a minute.');
    const id=url.searchParams.get('message');assert(uuid(id),404);
    const msg=await store.one('email_messages',service.scope({id:`eq.${id}`}));assert(msg,404,'Attachment unavailable.');
    const m=await service.mailbox(msg.mailbox_id);assert(m.status==='connected',409,'Reconnect to download this attachment.');
    const a=msg.data.attachments.find(a=>a.id===url.searchParams.get('part'));assert(a,404,'Attachment unavailable.');
    assert(a.size<=10*1024*1024,413,'Attachment exceeds 10 MiB. Download it in Gmail.');
    const result=await new GmailAdapter(env,m).attachment(msg.provider_message_id,a.providerId);
    assert(result.data.length<=14*1024*1024,413,'Attachment too large.');const bytes=decode(result.data);assert(bytes.length<=10*1024*1024,413);
    return new Response(bytes,{headers:{'Content-Type':'application/octet-stream','Content-Disposition':`attachment; filename="attachment"; filename*=UTF-8''${encodeURIComponent(a.name).replace(/['()*]/g,c=>'%'+c.charCodeAt(0).toString(16))}`,'Cache-Control':'no-store','X-Content-Type-Options':'nosniff','Content-Security-Policy':"default-src 'none'; sandbox"}});
   }
  }
  mutationGuard(request,env);const input=await limitedJson(request);
  if(path==='drafts'&&request.method==='PUT')return response(await service.draft(input));
  if(path==='review'&&request.method==='POST') {
   const {payload}=await service.prepare(input);return response({review:{from:payload.from,to:payload.to,cc:payload.cc,subject:payload.subject}});
  }
  if(path==='reply'&&request.method==='POST')return response(await service.submit(input),202);
  if(path==='connect'&&request.method==='POST') {
   const result=await initiateOAuth(service,session,input.mailboxId,env);return response({url:result.url},200,{'Set-Cookie':result.cookie});
  }
  if(path==='disconnect'&&request.method==='POST') {
   const m=await service.mailbox(input.mailboxId,'can_manage');
   await store.rpc('email_connection',{p_workspace:service.workspace,p_mailbox:m.id,p_user:service.user,p_credential:null,p_subject:null});
   return response({disconnected:true});
  }
  return response({error:'Route unavailable.'},404);
 } catch(e) {
  return response({error:e instanceof MailError?e.message:'Email operation could not complete. Retry shortly; check connection and configuration if it persists.'},e instanceof MailError?e.status:503);
 }
}
