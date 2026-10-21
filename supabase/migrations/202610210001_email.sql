-- Additive; no existing inquiry-summary objects are modified.
create table public.email_mailboxes (
 id uuid primary key default gen_random_uuid(), workspace_id text not null,
 address text not null check(address = lower(address)), provider text not null default 'gmail' check(provider='gmail'),
 google_subject text, status text not null default 'disconnected' check(status in ('connected','disconnected','error')),
 credential text, generation integer not null default 0,
 checkpoint text, import_cursor text, import_anchor text, import_after timestamptz,
 imported_since timestamptz, last_sync_at timestamptz, watch_expires_at timestamptz, watch_renewed_at timestamptz,
 issue text, created_at timestamptz not null default now(),
 unique(workspace_id,address), unique(workspace_id,id)
);
create table public.email_grants (
 workspace_id text not null, mailbox_id uuid not null, user_email text not null check(user_email=lower(user_email)),
 can_read boolean not null default false, can_send boolean not null default false, can_manage boolean not null default false,
 primary key(workspace_id,mailbox_id,user_email),
 foreign key(workspace_id,mailbox_id) references public.email_mailboxes(workspace_id,id) on delete cascade
);
create table public.email_conversations (
 id uuid primary key default gen_random_uuid(), workspace_id text not null, mailbox_id uuid not null,
 provider_thread_id text not null, subject text not null default '', snippet text not null default '',
 updated_at timestamptz not null, in_inbox boolean not null default false,
 unique(workspace_id,mailbox_id,provider_thread_id), unique(workspace_id,mailbox_id,id),
 foreign key(workspace_id,mailbox_id) references public.email_mailboxes(workspace_id,id) on delete cascade
);
create index email_conversations_page on public.email_conversations(workspace_id,updated_at desc,id desc);
create table public.email_messages (
 id uuid primary key default gen_random_uuid(), workspace_id text not null, mailbox_id uuid not null, conversation_id uuid not null,
 provider_message_id text not null, data jsonb not null,
 unique(workspace_id,mailbox_id,provider_message_id),
 foreign key(workspace_id,mailbox_id,conversation_id) references public.email_conversations(workspace_id,mailbox_id,id) on delete cascade
);
create table public.email_drafts (
 workspace_id text not null, mailbox_id uuid not null, conversation_id uuid not null, user_email text not null,
 data jsonb not null, updated_at timestamptz not null default now(),
 primary key(workspace_id,mailbox_id,conversation_id,user_email),
 foreign key(workspace_id,mailbox_id,conversation_id) references public.email_conversations(workspace_id,mailbox_id,id) on delete cascade
);
create table public.email_operations (
 id uuid primary key default gen_random_uuid(), workspace_id text not null, mailbox_id uuid not null, user_email text not null,
 client_id uuid not null, payload jsonb not null, state text not null default 'queued' check(state in ('queued','sending','sent','failed','uncertain')),
 provider_message_id text, issue text, created_at timestamptz not null default now(),
 unique(workspace_id,mailbox_id,user_email,client_id),
 foreign key(workspace_id,mailbox_id) references public.email_mailboxes(workspace_id,id) on delete cascade
);
create table public.email_jobs (
 id uuid primary key default gen_random_uuid(), workspace_id text not null, mailbox_id uuid not null,
 kind text not null check(kind in ('sync','watch','send','stop')), dedupe_key text not null,
 operation_id uuid references public.email_operations(id),
 state text not null default 'queued' check(state in ('queued','running','done','failed')),
 attempts integer not null default 0, available_at timestamptz not null default now(),
 lease_id uuid, lease_until timestamptz, created_at timestamptz not null default now(),
 unique(workspace_id,mailbox_id,kind,dedupe_key),
 foreign key(workspace_id,mailbox_id) references public.email_mailboxes(workspace_id,id) on delete cascade
);
create index email_jobs_ready on public.email_jobs(available_at) where state='queued';
create table public.email_oauth_states (
 state_hash text primary key, workspace_id text not null, mailbox_id uuid not null,
 session_id uuid not null references public.forms_sessions(id) on delete cascade, user_email text not null,
 browser_hash text not null, secret text not null, expires_at timestamptz not null,
 foreign key(workspace_id,mailbox_id) references public.email_mailboxes(workspace_id,id) on delete cascade
);
create table public.email_audit (
 id bigint generated always as identity primary key, workspace_id text not null, mailbox_id uuid not null,
 user_email text, action text not null, operation_id uuid, created_at timestamptz not null default now()
);

-- Only the server service role may use these objects. No browser access, even with a session.
do $$ declare t text; begin
 foreach t in array array['email_mailboxes','email_grants','email_conversations','email_messages','email_drafts','email_operations','email_jobs','email_oauth_states','email_audit'] loop
 execute format('alter table public.%I enable row level security',t);
 execute format('revoke all on public.%I from anon, authenticated',t);
 execute format('grant all on public.%I to service_role',t);
 end loop;
end $$;
grant usage, select on sequence public.email_audit_id_seq to service_role;

create function public.email_enqueue(p_workspace text,p_mailbox uuid,p_kind text,p_key text) returns void
language plpgsql set search_path=public as $$
begin
 perform 1 from email_mailboxes where id=p_mailbox and workspace_id=p_workspace for update;
 insert into email_jobs(workspace_id,mailbox_id,kind,dedupe_key) values(p_workspace,p_mailbox,p_kind,p_key) on conflict do nothing;
end $$;

-- Lock the mailbox first: all workers, reconnects, sends and checkpoints share this lock.
create function public.email_claim(p_workspace text) returns setof public.email_jobs
language plpgsql set search_path=public as $$
declare m email_mailboxes; j email_jobs; token uuid;
begin
 for m in select mb.* from email_mailboxes mb where mb.workspace_id=p_workspace
  order by (select min(jj.created_at) from email_jobs jj where jj.mailbox_id=mb.id and jj.state in ('queued','running')) nulls last
  for update of mb skip locked loop
  if exists(select 1 from email_jobs where mailbox_id=m.id and state='running' and lease_until>now()) then continue; end if;
  -- A crashed sender is ambiguous and can only be reconciled, never automatically resent.
  update email_operations set state='uncertain',issue='Reconcile in Gmail before any new send.'
   where id in (select operation_id from email_jobs where mailbox_id=m.id and kind='send' and state='running' and lease_until<=now()) and state='sending';
  update email_operations set state='failed',issue='Job exhausted before sending; draft retained.' where state='queued' and id in(select operation_id from email_jobs where mailbox_id=m.id and state='running' and lease_until<=now() and attempts>=8);
  delete from email_jobs where mailbox_id=m.id and kind in ('sync','watch','stop') and state='queued' and exists(select 1 from email_jobs running where running.mailbox_id=m.id and running.kind=email_jobs.kind and running.state='running' and running.lease_until<=now());
  update email_jobs set state=case when attempts>=8 then 'failed' else 'queued' end, lease_id=null
   where mailbox_id=m.id and state='running' and lease_until<=now();
  select * into j from email_jobs where mailbox_id=m.id and state='queued' and available_at<=now()
   and (m.status='connected' or kind='stop') order by created_at limit 1 for update;
  if not found then continue; end if;
  token:=gen_random_uuid();
  return query update email_jobs set state='running', attempts=attempts+1,lease_id=token,lease_until=now()+interval '4 minutes' where id=j.id returning *;
  return;
 end loop;
end $$;

create function public.email_submit(p_workspace text,p_mailbox uuid,p_user text,p_client uuid,p_payload jsonb) returns public.email_operations
language plpgsql set search_path=public as $$
declare op email_operations; m email_mailboxes;
begin
 select * into m from email_mailboxes where workspace_id=p_workspace and id=p_mailbox for update;
 if m.status<>'connected' or not exists(select 1 from email_grants where workspace_id=p_workspace and mailbox_id=p_mailbox and user_email=p_user and can_send and can_read) then raise exception 'Permission denied'; end if;
 select * into op from email_operations where workspace_id=p_workspace and mailbox_id=p_mailbox and user_email=p_user and client_id=p_client;
 if found then
  if op.payload<>p_payload then raise exception 'Operation payload is immutable'; end if;
  return op;
 end if;
 if (select count(*) from email_operations where mailbox_id=p_mailbox and created_at>now()-interval '1 hour')>=30 then raise exception 'Hourly mailbox limit reached'; end if;
 insert into email_operations(workspace_id,mailbox_id,user_email,client_id,payload) values(p_workspace,p_mailbox,p_user,p_client,p_payload) returning * into op;
 insert into email_jobs(workspace_id,mailbox_id,kind,dedupe_key,operation_id) values(p_workspace,p_mailbox,'send',op.id::text,op.id);
 insert into email_audit(workspace_id,mailbox_id,user_email,action,operation_id) values(p_workspace,p_mailbox,p_user,'send_queued',op.id);
 return op;
end $$;

-- Checkpoint, messages and job continuation are committed together, fenced by the lease and connection generation.
create function public.email_finish(p_job uuid,p_lease uuid,p_generation integer,p_result jsonb) returns boolean
language plpgsql set search_path=public as $$
declare j email_jobs; m email_mailboxes; item jsonb; c uuid; op email_operations; st text;
begin
 select * into j from email_jobs where id=p_job;
 select * into m from email_mailboxes where id=j.mailbox_id for update;
 select * into j from email_jobs where id=p_job for update;
 if j.state<>'running' or j.lease_id<>p_lease or j.lease_until<=now() or m.generation<>p_generation then return false; end if;
 for item in select value from jsonb_array_elements(coalesce(p_result->'messages','[]')) loop
  insert into email_conversations(workspace_id,mailbox_id,provider_thread_id,subject,snippet,updated_at,in_inbox)
   values(m.workspace_id,m.id,item->>'threadId',item->>'subject',item->>'snippet',(item->>'date')::timestamptz,coalesce((item->>'inInbox')::boolean,false))
   on conflict(workspace_id,mailbox_id,provider_thread_id) do update set
    subject=case when excluded.updated_at>=email_conversations.updated_at then excluded.subject else email_conversations.subject end,
    snippet=case when excluded.updated_at>=email_conversations.updated_at then excluded.snippet else email_conversations.snippet end,
    updated_at=greatest(email_conversations.updated_at,excluded.updated_at)
   returning id into c;
  if p_result ? 'importVersion' then item:=item||jsonb_build_object('importVersion',p_result->>'importVersion'); end if;
  insert into email_messages(workspace_id,mailbox_id,conversation_id,provider_message_id,data) values(m.workspace_id,m.id,c,item->>'providerId',item)
   on conflict(workspace_id,mailbox_id,provider_message_id) do update set data=excluded.data;
 end loop;
 if p_result->>'importComplete'='true' then delete from email_messages where mailbox_id=m.id and (data->>'date')::timestamptz>=(p_result->>'after')::timestamptz and data->>'importVersion' is distinct from p_result->>'importVersion'; end if;
 delete from email_messages where mailbox_id=m.id and provider_message_id in(select jsonb_array_elements_text(coalesce(p_result->'deleted','[]')));
 delete from email_conversations ec where ec.mailbox_id=m.id and not exists(select 1 from email_messages em where em.conversation_id=ec.id);
 update email_conversations ec set in_inbox=exists(select 1 from email_messages em where em.conversation_id=ec.id and (em.data->>'inInbox')::boolean) where ec.mailbox_id=m.id;
 if p_result ? 'checkpoint' then
  update email_mailboxes set checkpoint=p_result->>'checkpoint', import_cursor=p_result->>'cursor',import_anchor=p_result->>'anchor',
   import_after=coalesce((p_result->>'after')::timestamptz,import_after), imported_since=coalesce(imported_since,(p_result->>'after')::timestamptz),
   last_sync_at=case when p_result->>'cursor' is null then now() else last_sync_at end, issue=null where id=m.id;
 end if;
 if p_result->>'stopped'='true' then update email_mailboxes set credential=null,watch_expires_at=null where id=m.id and status='disconnected'; end if;
 if p_result ? 'watchExpires' then update email_mailboxes set watch_expires_at=(p_result->>'watchExpires')::timestamptz,watch_renewed_at=now(),issue=null where id=m.id; end if;
 if p_result ? 'sendState' then
  st:=p_result->>'sendState';
  update email_operations set state=st,provider_message_id=p_result->>'providerId',issue=p_result->>'issue' where id=j.operation_id returning * into op;
  insert into email_audit(workspace_id,mailbox_id,user_email,action,operation_id) values(m.workspace_id,m.id,op.user_email,'send_'||st,op.id);
 end if;
 if p_result->>'authFailure'='true' and m.status='connected' then update email_mailboxes set status='error' where id=m.id; end if;
 if p_result ? 'issue' then update email_mailboxes set issue=p_result->>'issue' where id=m.id; end if;
 if p_result->>'retry'='true' and j.kind in ('sync','watch','stop') then delete from email_jobs where mailbox_id=m.id and kind=j.kind and state='queued'; end if;
 update email_jobs set state=case when p_result->>'retry'='true' and attempts<8 then 'queued' when p_result->>'failed'='true' or p_result->>'retry'='true' then 'failed' else 'done' end,
  available_at=now()+make_interval(secs=>least(3600,30*power(2,attempts)::integer)),lease_id=null,lease_until=null where id=j.id;
 if p_result->>'continue'='true' then perform email_enqueue(m.workspace_id,m.id,'sync',gen_random_uuid()::text); end if;
 return true;
end $$;

-- Establish the irreversible send boundary while holding the same mailbox lock.
create function public.email_begin_send(p_job uuid,p_lease uuid,p_generation integer) returns boolean
language plpgsql set search_path=public as $$
declare j email_jobs; m email_mailboxes; op email_operations;
begin
 select * into j from email_jobs where id=p_job;
 select * into m from email_mailboxes where id=j.mailbox_id for update;
 if m.generation<>p_generation or m.status<>'connected' then return false; end if;
 if not exists(select 1 from email_jobs where id=p_job and lease_id=p_lease and state='running' and lease_until>now()+interval '45 seconds') then return false; end if;
 select * into op from email_operations where id=j.operation_id for update;
 if op.state<>'queued' then return false; end if;
 if not exists(select 1 from email_grants where mailbox_id=m.id and user_email=op.user_email and can_send and can_read) then
  update email_operations set state='failed',issue='Send permission removed.' where id=op.id; return false;
 end if;
 update email_operations set state='sending' where id=op.id; return true;
end $$;

create function public.email_schedule(p_workspace text) returns void language plpgsql set search_path=public as $$
declare m email_mailboxes; begin
 for m in select * from email_mailboxes where workspace_id=p_workspace and status='connected' loop
  perform email_enqueue(p_workspace,m.id,'sync',to_char(now() at time zone 'utc','YYYY-MM-DD-HH24-MI'));
  if m.watch_renewed_at is null or m.watch_renewed_at<now()-interval '1 day' then
   perform email_enqueue(p_workspace,m.id,'watch',to_char(now() at time zone 'utc','YYYY-MM-DD'));
  end if;
 end loop;
 delete from email_oauth_states where expires_at<now();
end $$;

create function public.email_connection(p_workspace text,p_mailbox uuid,p_user text,p_credential text,p_subject text) returns void
language plpgsql set search_path=public as $$
declare m email_mailboxes; begin
 select * into m from email_mailboxes where workspace_id=p_workspace and id=p_mailbox for update;
 if not exists(select 1 from email_grants where mailbox_id=m.id and user_email=p_user and can_manage) then raise exception 'Permission denied'; end if;
 if exists(select 1 from email_jobs where mailbox_id=m.id and state='running' and lease_until>now()) then raise exception 'Mailbox busy; try again shortly'; end if;
 if p_credential is not null and m.google_subject is not null and m.google_subject<>p_subject then raise exception 'Wrong Google account'; end if;
 update email_mailboxes set credential=coalesce(p_credential,credential),google_subject=coalesce(p_subject,google_subject),
  status=case when p_credential is null then 'disconnected' else 'connected' end, generation=generation+1,checkpoint=null,import_cursor=null,import_anchor=null,
  watch_renewed_at=null,issue=null where id=m.id;
 -- Disconnected queued sends must never spring back to life after reconnect.
 update email_operations set state='failed',issue='Connection changed; review draft.' where mailbox_id=m.id and state='queued';
 update email_jobs set state='done' where mailbox_id=m.id and state='queued';
 perform email_enqueue(p_workspace,m.id,case when p_credential is null then 'stop' else 'sync' end,gen_random_uuid()::text);
 insert into email_audit(workspace_id,mailbox_id,user_email,action) values(p_workspace,m.id,p_user,case when p_credential is null then 'disconnect' else 'connect' end);
end $$;

-- Atomically consume state only for the browser that initiated authorization.
create function public.email_take_state(p_hash text,p_browser text) returns setof public.email_oauth_states
language sql set search_path=public as $$
 delete from email_oauth_states s where state_hash=p_hash and browser_hash=p_browser and expires_at>now()
 and exists(select 1 from forms_sessions f where f.id=s.session_id and f.email=s.user_email and f.expires_at>now()) returning s.*;
$$;

-- Login hardening: limited guesses and one successful session per challenge.
alter table public.forms_auth_codes add column if not exists attempts integer not null default 0;
create function public.forms_consume_code(p_id uuid,p_email text,p_hash text) returns boolean
language plpgsql set search_path=public as $$
declare c forms_auth_codes; begin
 select * into c from forms_auth_codes where id=p_id and email=p_email for update;
 if not found or c.consumed_at is not null or c.expires_at<=now() or c.attempts>=5 then return false; end if;
 update forms_auth_codes set attempts=attempts+1,consumed_at=case when code_hash=p_hash then now() else null end where id=c.id;
 return c.code_hash=p_hash;
end $$;

-- PostgreSQL defaults functions to PUBLIC execute: explicitly remove it.
do $$ declare f record; begin
 for f in select oid::regprocedure as signature from pg_proc where pronamespace='public'::regnamespace and (proname like 'email_%' or proname='forms_consume_code') loop
 execute format('revoke all on function %s from public,anon,authenticated',f.signature);
 execute format('grant execute on function %s to service_role',f.signature);
 end loop;
end $$;

create function public.forms_issue_code(p_id uuid,p_email text,p_hash text,p_expires timestamptz,p_ip text,p_agent text) returns boolean
language plpgsql set search_path=public as $$
begin
 perform pg_advisory_xact_lock(hashtextextended('forms-code-issue',0));
 if (select count(*) from forms_auth_codes where email=p_email and created_at>now()-interval '1 hour')>=5
 or (select count(*) from forms_auth_codes where ip=p_ip and created_at>now()-interval '1 hour')>=15 then return false; end if;
 insert into forms_auth_codes(id,email,code_hash,expires_at,ip,user_agent) values(p_id,p_email,p_hash,p_expires,p_ip,p_agent);
 return true;
end $$;
revoke all on function public.forms_issue_code(uuid,text,text,timestamptz,text,text) from public,anon,authenticated;
grant execute on function public.forms_issue_code(uuid,text,text,timestamptz,text,text) to service_role;

-- Coalesce change signals while preserving one follow-up behind a running sync.
create unique index email_jobs_pending_kind on public.email_jobs(workspace_id,mailbox_id,kind) where state='queued' and kind in ('sync','watch','stop');
create table public.email_rate_limits (
 workspace_id text not null, actor text not null, bucket timestamptz not null, requests integer not null,
 primary key(workspace_id,actor,bucket)
);
alter table public.email_rate_limits enable row level security;
revoke all on public.email_rate_limits from anon,authenticated;
grant all on public.email_rate_limits to service_role;
create function public.email_rate(p_workspace text,p_actor text,p_limit integer) returns boolean
language plpgsql set search_path=public as $$
declare n integer; begin
 insert into email_rate_limits values(p_workspace,p_actor,date_trunc('minute',now()),1)
 on conflict(workspace_id,actor,bucket) do update set requests=email_rate_limits.requests+1 returning requests into n;
 delete from email_rate_limits where bucket<now()-interval '1 day';
 return n<=p_limit;
end $$;
revoke all on function public.email_rate(text,text,integer) from public,anon,authenticated;
grant execute on function public.email_rate(text,text,integer) to service_role;

create function public.email_operation_immutable() returns trigger language plpgsql set search_path=public as $$
begin
 if row(new.workspace_id,new.mailbox_id,new.user_email,new.client_id,new.payload) is distinct from row(old.workspace_id,old.mailbox_id,old.user_email,old.client_id,old.payload) then raise exception 'Operation payload is immutable'; end if;
 return new;
end $$;
create trigger email_operation_payload_guard before update on public.email_operations for each row execute function public.email_operation_immutable();
revoke all on function public.email_operation_immutable() from public,anon,authenticated;
