import test from 'node:test';
import assert from 'node:assert/strict';
import {spawn} from 'node:child_process';
import {readFile} from 'node:fs/promises';
const connection=process.env.EMAIL_TEST_DATABASE_URL;
function sql(source) {
 return new Promise((resolve,reject)=>{
  const p=spawn('psql',['-X','-qAt','-v','ON_ERROR_STOP=1','--dbname',connection],{stdio:['pipe','pipe','pipe']});let out='',err='';p.stdout.on('data',d=>out+=d);p.stderr.on('data',d=>err+=d);p.on('error',reject);p.on('close',code=>code?reject(new Error(err)):resolve(out.trim()));p.stdin.end(source);
 });
}
const m='11111111-1111-4111-8111-111111111111',client='22222222-2222-4222-8222-222222222222';
const submit=`select (email_submit('test','${m}','reader@example.com','${client}','{"body":"immutable"}')).id;`;
async function fixture(){await sql(`delete from email_mailboxes; delete from email_audit; insert into email_mailboxes(id,workspace_id,address,status,generation) values('${m}','test','one@example.com','connected',1);insert into email_grants values('test','${m}','reader@example.com',true,true,true);`);}
test('PostgreSQL transactional email contracts', {skip:!connection},async t=>{
 const url=new URL(connection);assert(['localhost','127.0.0.1'].includes(url.hostname)&&url.pathname==='/tfm_email_test','Only an explicitly named isolated local tfm_email_test database is allowed.');
 await sql(`drop schema if exists public cascade;create schema public;grant usage on schema public to service_role,anon,authenticated;create schema if not exists auth;create or replace function auth.role() returns text language sql as $$select current_user::text$$;`);
 await sql(await readFile(new URL('../../supabase/migrations/202606170001_forms_portal_primary_schema.sql',import.meta.url),'utf8'));
 await sql(await readFile(new URL('../../supabase/migrations/202610210001_email.sql',import.meta.url),'utf8'));
 await t.test('simultaneous duplicate send submissions create one immutable operation, job and audit event',async()=>{
  await fixture();const ids=await Promise.all([sql(submit),sql(submit)]);assert.equal(ids[0],ids[1]);assert.equal(await sql('select count(*) from email_operations;'),'1');assert.equal(await sql('select count(*) from email_jobs;'),'1');assert.equal(await sql("select count(*) from email_audit where action='send_queued';"),'1');
  await assert.rejects(sql(submit.replace('immutable','changed')),/immutable/);
  await assert.rejects(sql("update email_operations set payload='{}';"),/immutable/);
  await assert.rejects(sql(submit.replace('reader@example.com','intruder@example.com')),/Permission denied/);
 });
 await t.test('simultaneous job claims serialize per mailbox',async()=>{
  await fixture();await sql(submit);await sql(`select email_enqueue('test','${m}','sync','notification1');`);
  const claims=await Promise.all([sql("select id from email_claim('test');"),sql("select id from email_claim('test');")]);assert.equal(claims.filter(Boolean).length,1);assert.equal(await sql("select count(*) from email_jobs where state='running';"),'1');
 });
 await t.test('checkpoint and deduplicated messages commit together; stale lease and generation cannot commit',async()=>{
  await fixture();await sql(`select email_enqueue('test','${m}','sync','signal');`);
  const job=JSON.parse(await sql("select row_to_json(j) from email_claim('test') j;"));
  const data={messages:[{threadId:'thread',providerId:'message',subject:'Hello',snippet:'Hello',date:'2026-10-20T12:00:00Z',inInbox:true,body:'Text',attachments:[]},{threadId:'thread',providerId:'message',subject:'Hello',snippet:'Hello',date:'2026-10-20T12:00:00Z',inInbox:true,body:'Text',attachments:[]}],checkpoint:'200',cursor:null};
  const finish=(lease,generation)=>sql(`select email_finish('${job.id}','${lease}',${generation},'${JSON.stringify(data)}');`);
  assert.equal(await finish(client,1),'f');assert.equal(await finish(job.lease_id,0),'f');assert.equal(await sql("select coalesce(checkpoint,'null') from email_mailboxes;"),'null');
  assert.equal(await finish(job.lease_id,1),'t');assert.equal(await sql('select checkpoint from email_mailboxes;'),'200');assert.equal(await sql('select count(*) from email_messages;'),'1');assert.equal(await finish(job.lease_id,1),'f');
 });
 await t.test('resync prunes missing cache only on completed import; mailbox provider identities stay separate',async()=>{
  await fixture();await sql(`select email_enqueue('test','${m}','sync','initial');`);
  const msg=(id)=>({threadId:'shared-thread-id',providerId:id,subject:'Subject',snippet:'Preview',date:'2026-10-20T12:00:00Z',inInbox:true,body:'Body',attachments:[]});
  const commit=async(data)=>{const job=JSON.parse(await sql("select row_to_json(j) from email_claim('test') j;"));assert.equal(await sql(`select email_finish('${job.id}','${job.lease_id}',1,'${JSON.stringify(data)}');`),'t');};
  await commit({messages:[msg('removed'),msg('retained')],checkpoint:'100'});
  await sql(`select email_enqueue('test','${m}','sync','resync1');`);
  await commit({messages:[msg('retained')],checkpoint:null,anchor:'200',cursor:'page2',after:'2026-10-01T00:00:00Z',importVersion:'200',continue:true});
  assert.equal(await sql('select count(*) from email_messages;'),'2');
  await commit({messages:[],checkpoint:'200',cursor:null,after:'2026-10-01T00:00:00Z',importVersion:'200',importComplete:true});
  assert.equal(await sql('select provider_message_id from email_messages;'),'retained');
  await sql(`insert into email_mailboxes(id,workspace_id,address,status) values('${client}','test','two@example.com','connected');select email_enqueue('test','${client}','sync','other');`);
  const job=JSON.parse(await sql("select row_to_json(j) from email_claim('test') j;"));assert.equal(await sql(`select email_finish('${job.id}','${job.lease_id}',0,'${JSON.stringify({messages:[msg('retained')],checkpoint:'300'})}');`),'t');assert.equal(await sql('select count(*) from email_conversations;'),'2');
 });
 await t.test('expired sender lease becomes uncertain and cannot cross send boundary again',async()=>{
  await fixture();await sql(submit);const job=JSON.parse(await sql("select row_to_json(j) from email_claim('test') j;"));
  assert.equal(await sql(`select email_begin_send('${job.id}','${job.lease_id}',1);`),'t');
  await sql("update email_jobs set lease_until=now()-interval '1 minute';");const reclaimed=JSON.parse(await sql("select row_to_json(j) from email_claim('test') j;"));
  assert.equal(await sql('select state from email_operations;'),'uncertain');assert.equal(await sql(`select email_begin_send('${job.id}','${reclaimed.lease_id}',1);`),'f');assert.equal(await sql(`select email_finish('${job.id}','${job.lease_id}',1,'{"checkpoint":"999"}');`),'f');
 });
 await t.test('duplicate notifications coalesce and expired sync can be reclaimed with a follow-up queued',async()=>{
  await fixture();for(let i=0;i<3;i++)await sql(`select email_enqueue('test','${m}','sync','${i===2?'out-of-order':'duplicate'}');`);assert.equal(await sql('select count(*) from email_jobs;'),'1');
  const job=JSON.parse(await sql("select row_to_json(j) from email_claim('test') j;"));await sql(`select email_enqueue('test','${m}','sync','later');update email_jobs set lease_until=now()-interval '1 minute' where id='${job.id}';`);
  const reclaimed=await sql("select id from email_claim('test');");assert.equal(reclaimed,job.id);assert.equal(await sql("select count(*) from email_jobs where state='running';"),'1');
 });
 await t.test('disconnect cancels queued sends; reconnect changes generation and resets history without changing grants',async()=>{
  await fixture();await sql(submit);await sql(`select email_connection('test','${m}','reader@example.com',null,null);`);assert.equal(await sql('select state from email_operations;'),'failed');assert.equal(await sql('select status from email_mailboxes;'),'disconnected');
  await sql(`select email_connection('test','${m}','reader@example.com','encrypted','google-subject');`);assert.equal(await sql('select generation from email_mailboxes;'),'3');assert.equal(await sql('select count(*) from email_grants;'),'1');
  await assert.rejects(sql(`select email_connection('test','${m}','reader@example.com','encrypted','wrong-subject');`),/Wrong Google account/);
 });
 await t.test('OAuth state is atomically single use, browser bound, expires and requires live initiating session',async()=>{
  await fixture();await sql(`delete from forms_sessions;insert into forms_sessions(id,email,token_hash,expires_at) values('${client}','reader@example.com','token',now()+interval '1 hour');insert into email_oauth_states values('hash','test','${m}','${client}','reader@example.com','browser','encrypted',now()+interval '10 minutes');`);
  assert.equal(await sql("select count(*) from email_take_state('hash','wrong');"),'0');const results=await Promise.all([sql("select count(*) from email_take_state('hash','browser');"),sql("select count(*) from email_take_state('hash','browser');")]);assert.deepEqual(results.sort(),['0','1']);
  await sql(`insert into email_oauth_states values('expired','test','${m}','${client}','reader@example.com','browser','encrypted',now()-interval '1 second');`);assert.equal(await sql("select count(*) from email_take_state('expired','browser');"),'0');
 });
 await t.test('login code guesses are bounded and successful code consumption is atomic',async()=>{
  await sql(`delete from forms_auth_codes;insert into forms_auth_codes(id,email,code_hash,expires_at) values('${client}','reader@example.com','right',now()+interval '10 minutes');`);
  for(let i=0;i<5;i++)assert.equal(await sql(`select forms_consume_code('${client}','reader@example.com','wrong');`),'f');assert.equal(await sql(`select forms_consume_code('${client}','reader@example.com','right');`),'f');
  await sql('update forms_auth_codes set attempts=0;');const results=await Promise.all([sql(`select forms_consume_code('${client}','reader@example.com','right');`),sql(`select forms_consume_code('${client}','reader@example.com','right');`)]);assert.deepEqual(results.sort(),['f','t']);
 });
 await t.test('browser roles cannot execute service RPCs or read mail storage',async()=>{
  await assert.rejects(sql('set role authenticated;select * from email_messages;'),/permission denied/);await assert.rejects(sql("set role anon;select * from email_claim('test');"),/permission denied/);
  assert.equal(await sql("set role service_role;select count(*) from email_grants;"),'1');
 });
});
