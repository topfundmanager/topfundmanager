import { assert, uuid, MailError, hashString } from './security.js';
import { replyPayload, gmailCapabilities } from './gmail.js';
export class EmailService {
 constructor(store,workspace,user) { assert(workspace,503,'Email workspace is not configured.');this.store=store;this.workspace=workspace;this.user=user.toLowerCase(); }
 scope(extra={}) {return {workspace_id:`eq.${this.workspace}`,...extra};}
 async grant(mailboxId,permission='can_read') {
  assert(uuid(mailboxId),404,'Mailbox unavailable.');
  const grant=await this.store.one('email_grants',this.scope({mailbox_id:`eq.${mailboxId}`,user_email:`eq.${this.user}`}));
  assert(grant?.[permission],403,'Mailbox permission required.');return grant;
 }
 async mailbox(id,permission='can_read') {
  await this.grant(id,permission);
  const m=await this.store.one('email_mailboxes',this.scope({id:`eq.${id}`})); assert(m,404,'Mailbox unavailable.');return m;
 }
 async mailboxes() {
  const grants=await this.store.query('email_grants',this.scope({user_email:`eq.${this.user}`}));
  const items=[];
  for(const g of grants) {
   if(!g.can_read&&!g.can_manage&&!g.can_send)continue;
   const m=await this.store.one('email_mailboxes',this.scope({id:`eq.${g.mailbox_id}`,select:'id,address,status,issue,last_sync_at,watch_expires_at,imported_since,import_cursor'}));
   if(m) items.push({...m,importing:!!m.import_cursor,import_cursor:undefined,permissions:{read:g.can_read,send:g.can_send,manage:g.can_manage}});
  }
  return {mailboxes:items,capabilities:gmailCapabilities};
 }
 async conversations({mailbox,cursor}) {
  const {mailboxes}=await this.mailboxes();const ids=mailboxes.filter(m=>m.permissions.read && (!mailbox||m.id===mailbox)).map(m=>m.id);
  if(mailbox) await this.grant(mailbox);
  if(!ids.length)return {conversations:[],next:null};
  const params=this.scope({mailbox_id:`in.(${ids.join(',')})`,select:'id,mailbox_id,subject,snippet,updated_at,in_inbox',order:'updated_at.desc,id.desc',limit:26});
  if(cursor) {
   let c;try{c=JSON.parse(atob(cursor));}catch{throw new MailError(400,'Invalid page cursor.');}
   assert(uuid(c.id)&&typeof c.date==='string'&&/^\d{4}-\d\d-\d\dT[\d:.]+(?:Z|\+00:00)$/.test(c.date));
   params.or=`(updated_at.lt.${c.date},and(updated_at.eq.${c.date},id.lt.${c.id}))`;
  }
  const rows=await this.store.query('email_conversations',params);const more=rows.length>25,items=rows.slice(0,25),last=items.at(-1);
  return {conversations:items,next:more?btoa(JSON.stringify({id:last.id,date:last.updated_at})):null};
 }
 async conversation(id) {
  assert(uuid(id),404,'Conversation unavailable.');
  const c=await this.store.one('email_conversations',this.scope({id:`eq.${id}`})); assert(c,404,'Conversation unavailable.');
  const mailbox=await this.mailbox(c.mailbox_id);
  return {conversation:c,mailbox};
 }
 async messages(id) {
  const {conversation,mailbox}=await this.conversation(id);
  const rows=await this.store.query('email_messages',this.scope({mailbox_id:`eq.${mailbox.id}`,conversation_id:`eq.${id}`,order:'data->>date.asc',limit:201}));
  assert(rows.length<=200,409,'Large conversation: open in Gmail to read all messages.');
  const draft=await this.store.one('email_drafts',this.scope({mailbox_id:`eq.${mailbox.id}`,conversation_id:`eq.${id}`,user_email:`eq.${this.user}`}));
  const messages=rows.map(r=>({id:r.id,...r.data,providerId:undefined,threadId:undefined,attachments:r.data.attachments.map(a=>({id:a.id,name:a.name,size:a.size,mimeType:a.mimeType}))}));
  return {conversation:{id:conversation.id,subject:conversation.subject,mailbox_id:mailbox.id},messages,draft:draft?.data||null};
 }
 async parent(id,parentId) {
  const c=await this.conversation(id);await this.grant(c.mailbox.id,'can_send');
  assert(uuid(parentId),400);
  const p=await this.store.one('email_messages',this.scope({id:`eq.${parentId}`,mailbox_id:`eq.${c.mailbox.id}`,conversation_id:`eq.${id}`}));assert(p,404,'Reply target unavailable.');
  return {...c,parent:p.data};
 }
 async prepare(input) {
  assert(uuid(input.clientId),400,'A client operation identifier is required.');
  const {mailbox,parent}=await this.parent(input.conversationId,input.parentId);
  assert(mailbox.status==='connected',409,'Reconnect this mailbox before sending.');
  const operationIdentity=await hashString(JSON.stringify([this.workspace,mailbox.id,this.user,input.clientId]));
  return {mailbox,payload:replyPayload(mailbox,parent,input.mode,input.body,operationIdentity)};
 }
 async submit(input) {
  const {mailbox,payload}=await this.prepare(input);
  assert(input.reviewed===true,400,'Review sender and recipients first.');
  // Compare exactly what the UI reviewed; sender and threading are resolved only on the server.
  assert(JSON.stringify(input.review)===JSON.stringify({from:payload.from,to:payload.to,cc:payload.cc,subject:payload.subject}),409,'Recipients changed; review again.');
  const op=await this.store.rpc('email_submit',{p_workspace:this.workspace,p_mailbox:mailbox.id,p_user:this.user,p_client:input.clientId,p_payload:payload});
  return {operation:{id:op.id,state:op.state,issue:op.issue}};
 }
 async draft(input) {
  const {mailbox}=await this.conversation(input.conversationId);await this.grant(mailbox.id,'can_send');
  assert(typeof input.body==='string'&&input.body.length<=64000&&uuid(input.clientId)&&uuid(input.parentId)&&['reply','replyAll'].includes(input.mode));
  await this.store.upsert('email_drafts',{workspace_id:this.workspace,mailbox_id:mailbox.id,conversation_id:input.conversationId,user_email:this.user,data:{body:input.body,parentId:input.parentId,mode:input.mode,clientId:input.clientId},updated_at:new Date().toISOString()},'workspace_id,mailbox_id,conversation_id,user_email');
  return {saved:true};
 }
 async operation(id,clientId,mailbox) {
  if(!id){assert(uuid(clientId)&&uuid(mailbox),404,'Operation unavailable.');await this.grant(mailbox);}
  else assert(uuid(id),404);
  const op=await this.store.one('email_operations',this.scope({...(id?{id:`eq.${id}`}:{client_id:`eq.${clientId}`,mailbox_id:`eq.${mailbox}`}),user_email:`eq.${this.user}`,select:'id,mailbox_id,state,issue'}));assert(op,404,'Operation unavailable.');await this.grant(op.mailbox_id);return {operation:op};
 }
}
