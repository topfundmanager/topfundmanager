import { assert, encode, decode, utf8, text, unseal } from './security.js';
export const gmailCapabilities=Object.freeze({reply:true,replyAll:true,incomingAttachments:true,sendAttachments:false,compose:false,forward:false,deliveryConfirmation:false,sendIdempotency:false,readStateMutation:false});
export const gmailScopes=['openid','email','https://www.googleapis.com/auth/gmail.readonly','https://www.googleapis.com/auth/gmail.send'];
export class ProviderError extends Error {
 constructor(status) { super('Gmail request failed.'); this.status=status; }
}
export function addresses(value='') {
 // Split on commas outside quoted names and angle brackets; never interpret a display name as a sender.
 const chunks=value.match(/(?:[^,"<]|"(?:[^"\\]|\\.)*"|<[^>]*>)+/g)||[];
 return [...new Set(chunks.map(v=>{const angle=v.match(/<([^<>]+)>/);return (angle?angle[1]:v).trim().toLowerCase();}).filter(v=>/^[a-z0-9.!#$%&'*+/=?^_`{|}~-]+@[a-z0-9.-]+\.[a-z]{2,}$/i.test(v)))];
}
export function htmlToText(html='') {
 // This is intentionally plain text, never a sanitized HTML fragment to insert into a DOM.
 return html.replace(/<(script|style|iframe|object)\b[^>]*>[\s\S]*?<\/\1\s*>/gi,'').replace(/<(br|\/p|\/div)\b[^>]*>/gi,'\n').replace(/<[^>]*>/g,'').replace(/&nbsp;/gi,' ').replace(/&lt;/gi,'<').replace(/&gt;/gi,'>').replace(/&amp;/gi,'&');
}
export function normalizeMessage(message) {
 const headers={}; for(const h of message.payload?.headers||[]) headers[h.name.toLowerCase()]=h.value;
 let plain='',html='',truncated=false; const attachments=[];
 function visit(part) {
  if(part.filename && part.body?.attachmentId) attachments.push({id:part.partId,providerId:part.body.attachmentId,name:part.filename,size:part.body.size,mimeType:part.mimeType});
  else if(part.body?.data) {
   if(part.body.data.length>1400000) truncated=true;
   else if(['text/plain','text/html'].includes(part.mimeType)) {
    const contentType=part.headers?.find(h=>h.name.toLowerCase()==='content-type')?.value||'';
    const charset=contentType.match(/charset=["']?([^\s;"']+)/i)?.[1]||'utf-8';
    let decoder;try{decoder=new TextDecoder(charset);}catch{decoder=new TextDecoder();}
    const body=decoder.decode(decode(part.body.data));
    if(part.mimeType==='text/plain')plain+=body;else html+=body;
   }
  }
  for(const child of part.parts||[]) visit(child);
 }
 visit(message.payload||{});
 return {providerId:message.id,threadId:message.threadId,subject:headers.subject||'(No subject)',snippet:message.snippet||'',date:new Date(Number(message.internalDate)).toISOString(),from:addresses(headers.from),to:addresses(headers.to),cc:addresses(headers.cc),replyTo:addresses(headers['reply-to']),messageId:headers['message-id']||'',references:headers.references||'',body:(plain||htmlToText(html)||'[Body unavailable; open in Gmail.]').slice(0,1000000),truncated,inInbox:(message.labelIds||[]).includes('INBOX'),sent:(message.labelIds||[]).includes('SENT'),attachments};
}
const safeHeader=value=>{assert(typeof value==='string' && !/[\r\n\0]/.test(value),400,'Invalid message header.');return value;};
export function replyPayload(mailbox,parent,mode,body,clientId) {
 assert(['reply','replyAll'].includes(mode) && typeof body==='string' && body.trim().length>0 && utf8(body).length<=64000,400,'Reply must contain 1–64,000 bytes.');
 const own=mailbox.address;
 // Replying to one's own sent mail addresses its original recipients.
 const primary=parent.from.includes(own)?parent.to:(parent.replyTo.length?parent.replyTo:parent.from);
 const to=[...new Set(primary)].filter(a=>a!==own);
 const cc=mode==='replyAll'?[...new Set([...parent.to,...parent.cc])].filter(a=>a!==own&&!to.includes(a)):[];
 assert(to.length>0 && to.length+cc.length<=20,400,'Reply requires 1–20 recipients.');
 assert(/^<[^\s<>]+@[^\s<>]+>$/.test(parent.messageId),400,'This message lacks a valid threading header; reply in Gmail.');
 const refs=[...(parent.references.match(/<[^\s<>]+@[^\s<>]+>/g)||[]),parent.messageId].slice(-30).join(' ');
 return {from:own,to,cc,subject:safeHeader(parent.subject),body,threadId:parent.threadId,inReplyTo:safeHeader(parent.messageId),references:refs,messageId:`<tfm.${clientId}@${own.split('@')[1]}>`};
}
export function rawReply(payload) {
 const subject=`=?UTF-8?B?${btoa(Array.from(utf8(payload.subject),v=>String.fromCharCode(v)).join(''))}?=`;
 const lines=[`From: ${safeHeader(payload.from)}`,`To: ${payload.to.map(safeHeader).join(', ')}`,`Cc: ${payload.cc.map(safeHeader).join(', ')}`,`Subject: ${subject}`,`Message-ID: ${safeHeader(payload.messageId)}`,`In-Reply-To: ${safeHeader(payload.inReplyTo)}`,`References: ${safeHeader(payload.references)}`,'MIME-Version: 1.0','Content-Type: text/plain; charset=UTF-8','Content-Transfer-Encoding: base64','',btoa(Array.from(utf8(payload.body),v=>String.fromCharCode(v)).join('')).match(/.{1,76}/g).join('\r\n')];
 return encode(utf8(lines.join('\r\n')));
}
export class GmailAdapter {
 constructor(env,mailbox,{fetcher=fetch,credentials=unseal}={}) {this.env=env;this.mailbox=mailbox;this.fetcher=fetcher;this.credentials=credentials;this.deadline=Date.now()+140000;}
 async token() {
  if(this.accessToken) return this.accessToken;
  const {refreshToken}=await this.credentials(this.mailbox.credential,this.env,`${this.mailbox.workspace_id}:${this.mailbox.id}`);
  const r=await this.fetcher('https://oauth2.googleapis.com/token',{method:'POST',body:new URLSearchParams({client_id:this.env.EMAIL_GOOGLE_CLIENT_ID,client_secret:this.env.EMAIL_GOOGLE_CLIENT_SECRET,refresh_token:refreshToken,grant_type:'refresh_token'}),signal:AbortSignal.timeout(15000)});
  if(!r.ok) throw new ProviderError(r.status===400?401:r.status);
  this.accessToken=(await r.json()).access_token; return this.accessToken;
 }
 async call(path,init={}) {
  assert(Date.now()<this.deadline-1000,503,'Background work time limit reached.');
  const token=await this.token();
  const r=await this.fetcher(`https://gmail.googleapis.com/gmail/v1/users/me/${path}`,{...init,headers:{Authorization:`Bearer ${token}`,'Content-Type':'application/json'},signal:AbortSignal.timeout(Math.max(1,Math.min(20000,this.deadline-Date.now())))});
  if(!r.ok) throw new ProviderError(r.status);
  return r.status===204?{}:r.json();
 }
 async sync() {
  const m=this.mailbox, cursor=m.import_cursor?JSON.parse(m.import_cursor):null;
  const initial=!m.checkpoint || cursor?.mode==='import';
  const anchor=initial?(m.import_anchor||(await this.call('profile')).historyId):null;
  const days=Math.max(1,Math.min(90,Number(this.env.EMAIL_IMPORT_DAYS)||30));
  const after=m.import_after||new Date(Date.now()-days*86400000).toISOString();
  const params=new URLSearchParams({maxResults:'20'});
  if(cursor?.page) params.set('pageToken',cursor.page);
  const resuming=!!(cursor?.pending?.length || cursor?.pendingDeleted?.length);
  let page;
  if(initial) { params.set('q',`after:${Math.floor(new Date(after).getTime()/1000)} -in:trash -in:spam`);try{page=await this.call(`messages?${params}`);}catch(e){if(e.status===400&&cursor?.page)return {checkpoint:null,cursor:null,anchor:null,after,continue:true,issue:'Import cursor expired; restarting bounded import.'};throw e;} }
  else if(resuming) {
   page={nextPageToken:cursor.page,historyId:cursor.targetHistory};
  } else {
   params.set('startHistoryId',m.checkpoint);
   try {page=await this.call(`history?${params}`);} catch(e) {
    if(e.status===404 || (e.status===400 && cursor?.page)) return {checkpoint:null,cursor:null,anchor:null,after,continue:true,issue:'History expired; reimporting the configured window. Older cached messages may be stale.'};
    throw e;
   }
  }
  const ids=initial?(page.messages||[]).map(v=>v.id):resuming?(cursor.pending||[]):[...new Set((page.history||[]).flatMap(h=>[...(h.messagesAdded||[]),...(h.labelsAdded||[]),...(h.labelsRemoved||[])].map(v=>v.message.id)))];
  const deleteIds=initial?[]:resuming?(cursor.pendingDeleted||[]):[...new Set((page.history||[]).flatMap(h=>(h.messagesDeleted||[]).map(v=>v.message.id)))];
  // Gmail can place a bulk label change in one history record. Persist its remainder
  // before acknowledging progress rather than restarting import or skipping changes.
  const pending=ids.slice(20),pendingDeleted=deleteIds.slice(100),deleted=deleteIds.slice(0,100);
  const messages=[];
  for(const id of ids.slice(0,20)) {
   try {messages.push(normalizeMessage(await this.call(`messages/${encodeURIComponent(id)}?format=full`)));}
   catch(e) {if(e.status===404) deleted.push(id);else throw e;}
  }
  const more=!!page.nextPageToken || pending.length>0 || pendingDeleted.length>0;
  const nextCursor=more?JSON.stringify({mode:initial?'import':'history',page:page.nextPageToken,pending,pendingDeleted,targetHistory:page.historyId}):null;
  return {messages,deleted,...(initial?{importVersion:anchor,importComplete:!more}:{}),checkpoint:initial?(more?null:anchor):(more?m.checkpoint:page.historyId),cursor:nextCursor,anchor:more?anchor:null,after,continue:more || initial};
 }
 async watch() {const r=await this.call('watch',{method:'POST',body:JSON.stringify({topicName:this.env.EMAIL_PUBSUB_TOPIC})});return {watchExpires:new Date(Number(r.expiration)).toISOString()};}
 async stop() { await this.call('stop',{method:'POST',body:'{}'}); }
 async prepareSend() {await this.token();}
 async send(payload) {return this.call('messages/send',{method:'POST',body:JSON.stringify({threadId:payload.threadId,raw:rawReply(payload)})});}
 async reconcile(payload) {
  const result=await this.call(`messages?${new URLSearchParams({q:`in:sent rfc822msgid:${payload.messageId}`,maxResults:'10'})}`);
  for(const hit of result.messages||[]) {
   const msg=normalizeMessage(await this.call(`messages/${hit.id}?format=full`));
   if(msg.messageId===payload.messageId && msg.from.includes(payload.from) && msg.sent) return msg.providerId;
  }
  return null;
 }
 async attachment(messageId,attachmentId) {return this.call(`messages/${encodeURIComponent(messageId)}/attachments/${encodeURIComponent(attachmentId)}`);}
}
