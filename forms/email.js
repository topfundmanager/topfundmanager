(() => {
 const $=id=>document.getElementById(id);
 const node=(tag,value,className)=>{const n=document.createElement(tag);if(value!==undefined)n.textContent=value;if(className)n.className=className;return n;};
 const alert=message=>{$('email-alert').textContent=message;};
 let mailboxes=[],next=null,loading=false,selected=null,activeDraft=null,saveTimer,revision=0;
 async function api(path,method='GET',body) {
  const r=await fetch(`/api/email/${path}`,{method,credentials:'same-origin',headers:{'Content-Type':'application/json','X-Email-CSRF':'1'},...(body?{body:JSON.stringify(body)}:{})});
  const data=await r.json();if(!r.ok)throw new Error(data.error||'Email unavailable.');return data;
 }
 const button=(label,action)=>{const b=node('button',label);b.type='button';b.addEventListener('click',async()=>{b.disabled=true;try{await action();}catch(e){alert(e.message);}finally{b.disabled=false;}});return b;};
 const mailboxLabel=id=>mailboxes.find(m=>m.id===id)?.address||'Mailbox';
 async function saveDraft() {
  if(!activeDraft)return;clearTimeout(saveTimer);
  const data={...activeDraft};await api('drafts','PUT',data);
 }
 async function loadMailboxes() {
  ({mailboxes}=await api('mailboxes'));
  const filter=$('email-filter'),value=filter.value;filter.replaceChildren(node('option','All permitted mailboxes'));filter.firstChild.value='';
  const health=$('email-health');health.replaceChildren();
  for(const m of mailboxes) {
   if(m.permissions.read){const o=node('option',m.address);o.value=m.id;filter.append(o);}
   const row=node('div',undefined,'email-health-row');row.append(node('span',`${m.address} · ${m.status}${m.importing?' · importing':''}\nLast sync: ${m.last_sync_at?new Date(m.last_sync_at).toLocaleString():'Not yet'}\nImported since: ${m.imported_since?new Date(m.imported_since).toLocaleDateString():'Pending'}\nWatch: ${m.watch_expires_at?new Date(m.watch_expires_at).toLocaleString():'Pending'}${m.issue?'\n'+m.issue:''}`));
   if(m.permissions.manage) {
    row.append(button(m.status==='connected'?'Reconnect':'Connect',async()=>{await saveDraft();const r=await api('connect','POST',{mailboxId:m.id});location.assign(r.url);}));
    if(m.status==='connected')row.append(button('Disconnect',async()=>{if(!confirm(`Disconnect ${m.address}? Sending and synchronization stop. Cached mail remains available to permitted users.`))return;await api('disconnect','POST',{mailboxId:m.id});await loadMailboxes();}));
   }
   health.append(row);
  }
  if(!mailboxes.length)health.append(node('p','No mailbox assignments. Ask an administrator to provision a primary mailbox and explicit read, send, or manage grants.'));
  if([...filter.options].some(o=>o.value===value))filter.value=value;
 }
 async function loadList(append=false) {
  if(loading)return;loading=true;
  try {
   const q=new URLSearchParams();if($('email-filter').value)q.set('mailbox',$('email-filter').value);if(append&&next)q.set('cursor',next);
   const data=await api(`conversations?${q}`);next=data.next;
   if(!append)$('email-list').replaceChildren();
   for(const c of data.conversations){const b=button('',()=>openConversation(c.id));b.className='email-thread';b.dataset.id=c.id;b.append(node('strong',c.subject),node('small',`${mailboxLabel(c.mailbox_id)} · ${new Date(c.updated_at).toLocaleString()}${c.in_inbox?' · Inbox':''}`),node('small',c.snippet));$('email-list').append(b);}
   if(!$('email-list').children.length)$('email-list').append(node('p','No imported conversations yet. Check mailbox connections and synchronization status.'));
   $('email-more').hidden=!next;
  }finally{loading=false;}
 }
 async function openConversation(id) {
  const ticket=++revision;$('email-reader').inert=true;
  try {
  await saveDraft();
  const result=await api(`messages?${new URLSearchParams({conversation:id})}`);if(ticket!==revision)return;
  selected=result.conversation;activeDraft=null;
  for(const b of $('email-list').querySelectorAll('button'))b.setAttribute('aria-current',String(b.dataset.id===id));
  const reader=$('email-reader');reader.replaceChildren(node('h2',selected.subject),node('p',`Mailbox: ${mailboxLabel(selected.mailbox_id)}`));
  for(const msg of result.messages) {
   const article=node('article',undefined,'email-message');article.append(node('strong',msg.from.join(', ')),node('p',`To: ${msg.to.join(', ')}${msg.cc.length?'\nCc: '+msg.cc.join(', '):''}\n${new Date(msg.date).toLocaleString()}`),node('pre',msg.body));
   if(msg.truncated)article.append(node('p','Body truncated. Open Gmail for the full message.'));
   for(const a of msg.attachments){const link=node('a',`${a.name} (${Math.ceil(a.size/1024)} KiB)`);link.href=`/api/email/attachment?${new URLSearchParams({message:msg.id,part:a.id})}`;link.setAttribute('download','');article.append(link);}
   reader.append(article);
  }
  const m=mailboxes.find(m=>m.id===selected.mailbox_id);
  if(!m?.permissions.send || !result.messages.length)return;
  activeDraft=result.draft&&result.draft.body?{...result.draft,conversationId:id}:{conversationId:id,parentId:result.messages.at(-1).id,clientId:crypto.randomUUID(),mode:'reply',body:''};
  const draft=activeDraft;
  const form=node('div',undefined,'email-compose');form.append(node('strong',`Send as ${m.address}`));
  const target=node('select');target.setAttribute('aria-label','Reply to message');for(const msg of result.messages){const o=node('option',`${new Date(msg.date).toLocaleString()} · ${msg.from.join(', ')}`);o.value=msg.id;target.append(o);}target.value=draft.parentId;form.append(target);
  const mode=node('select');mode.setAttribute('aria-label','Reply mode');for(const [v,label] of [['reply','Reply'],['replyAll','Reply all']]){const o=node('option',label);o.value=v;mode.append(o);}mode.value=draft.mode;form.append(mode);
  const area=node('textarea');area.setAttribute('aria-label','Reply body');area.maxLength=64000;area.value=draft.body;form.append(area);
  const status=node('p','Drafts save to your account. Failed replies remain here.');const operationActions=node('div');form.append(status);
  const reviewBox=node('div',undefined,'email-review');reviewBox.hidden=true;
  let pending=false,submitted=false;
  function change(){if(pending)return;if(submitted){draft.clientId=crypto.randomUUID();submitted=false;}draft.body=area.value;draft.mode=mode.value;draft.parentId=target.value;reviewBox.hidden=true;clearTimeout(saveTimer);saveTimer=setTimeout(()=>saveDraft().then(()=>{status.textContent='Draft saved.';}).catch(e=>{status.textContent=`Draft is only in this open page: ${e.message}`;}),600);}
  area.addEventListener('input',change);mode.addEventListener('change',change);target.addEventListener('change',change);
  const lock=value=>{pending=value;area.disabled=value;mode.disabled=value;target.disabled=value;reviewButton.disabled=value;};
  function showOperation(op) {
   operationActions.replaceChildren();reviewBox.hidden=true;
   status.textContent=`Reply ${op.state}.${op.issue?' '+op.issue:''}`;
   if(['queued','sending','uncertain'].includes(op.state)) {
    lock(true);operationActions.append(button('Check send status',async()=>{const r=await api(`operations?${new URLSearchParams({id:op.id})}`);showOperation(r.operation);}));
   } else if(op.state==='sent') {
    lock(false);draft.body='';area.value='';draft.clientId=crypto.randomUUID();submitted=false;saveDraft().catch(e=>alert(e.message));loadList().catch(e=>alert(e.message));
   } else {
    lock(false);submitted=true;operationActions.append(button('Prepare a new attempt',async()=>{draft.clientId=crypto.randomUUID();submitted=false;await saveDraft();status.textContent='New attempt ready. Review before sending.';}));
   }
  }
  const reviewButton=button('Review reply',async()=>{
   await saveDraft();const snapshot={...draft};const data=await api('review','POST',snapshot);
   if(JSON.stringify(snapshot)!==JSON.stringify(draft))return;
   reviewBox.replaceChildren(node('strong','Review before sending'),node('p',`From: ${data.review.from}\nTo: ${data.review.to.join(', ')}\nCc: ${data.review.cc.join(', ')||'None'}\nSubject: ${data.review.subject}`),node('pre',snapshot.body));reviewBox.hidden=false;
   reviewBox.append(button('Send reply',async()=>{
    if(JSON.stringify(snapshot)!==JSON.stringify(draft)){reviewBox.hidden=true;return;}
    lock(true);
    try{const r=await api('reply','POST',{...snapshot,reviewed:true,review:data.review});submitted=true;reviewBox.hidden=true;showOperation(r.operation);}
    catch(e){lock(true);reviewBox.hidden=true;status.textContent=`${e.message} Your draft is preserved. Check submission before any new attempt.`;
     operationActions.append(button('Check submission',async()=>{
      try{const r=await api(`operations?${new URLSearchParams({clientId:snapshot.clientId,mailbox:m.id})}`);showOperation(r.operation);}
      catch(check){if(check.message.includes('Operation unavailable')){lock(false);status.textContent='No persisted operation found. Review and resubmit this unchanged draft with the same identifier.';}else throw check;}
     }));
    }
   }),button('Keep editing',async()=>{reviewBox.hidden=true;}));
  });
  form.append(reviewButton,reviewBox,operationActions);reader.append(form);
  // Resolve previously submitted operations after reload or a lost HTTP response.
  try{const r=await api(`operations?${new URLSearchParams({clientId:draft.clientId,mailbox:m.id})}`);if(activeDraft===draft)showOperation(r.operation);}catch(e){if(!e.message.includes('Operation unavailable'))alert(e.message);}
  } finally {if(ticket===revision)$('email-reader').inert=false;}
 }
 async function refresh(){await saveDraft();alert('Loading email…');await loadMailboxes();await loadList();alert('');}
 window.addEventListener('email-open',()=>refresh().catch(e=>alert(e.message)));
 $('email-refresh').addEventListener('click',()=>refresh().catch(e=>alert(e.message)));
 $('email-filter').addEventListener('change',()=>loadList().catch(e=>alert(e.message)));
 $('email-more').addEventListener('click',()=>loadList(true).catch(e=>alert(e.message)));
 window.addEventListener('beforeunload',e=>{if(activeDraft?.body){e.preventDefault();e.returnValue='';}});
})();
