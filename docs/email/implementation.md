# Email implementation map

Prepared October 21, 2026 on `codex/seo-publish-to-sites`. Existing untracked inquiry-summary endpoint, SQL migration, Worker and Wrangler configuration were preserved. Local configuration confirms Cloudflare Pages/Functions, server-side Supabase REST service-role access, Resend login/form notifications, and secure Strict session cookies backed by `forms_sessions`. No production account configuration was inspected or changed. Glass's Request reference was read; no Glass files were changed.

| Boundary | Files | Responsibility |
| --- | --- | --- |
| Gmail | `lib/email/gmail.js`, `oauth.js`, `security.js` | OAuth/PKCE, signed Google identity, encrypted credentials, normalized MIME, history/watch, reply MIME and acceptance reconciliation |
| Application | `lib/email/service.js`, `jobs.js` | Explicit read/send/manage grants, server-resolved reply identity, drafts, immutable submissions, durable execution |
| Persistence | `lib/email/persistence.js`, `supabase/migrations/202610210001_email.sql` | Workspace/mailbox scope, transactions, job leases, mailbox locks, fencing, dedupe, audit and login hardening |
| Cloudflare | `functions/api/email/[[path]].js`, `workers/email-cron.js`, `wrangler.email.toml` | Authenticated dashboard transport, authenticated Pub/Sub receipt, separate scheduled Worker |
| Dashboard | `dashboard.html`, `forms/email.js`, `forms/email.css`, tab selection in `forms/forms.js` | Mailbox health/filter, keyset pagination, plain-text conversations, attachments, drafts and reviewed replies |

No automatic read, archive or label writes. Conversation feeds include imported incoming and sent conversations; the Inbox badge reflects cached Gmail INBOX labels. History captures messages sent in Gmail itself. Conversation identities remain separate across mailboxes, even for identical provider thread IDs. Website association is intentionally absent and can later be many-to-many.

## Schema

All email data includes `workspace_id`; relational keys bind it to the mailbox. `email_mailboxes` contains encrypted offline credentials and synchronization state. `email_grants` explicitly assigns independent read/send/manage powers to dashboard email identities. `email_conversations`, `email_messages` and `email_drafts` hold application UUIDs and provider identifiers internally. `email_operations` stores immutable payloads and `queued`, `sending`, `sent`, `failed`, `uncertain` state. `email_jobs` owns claims, leases and bounded retries. `email_audit` identifies the actor and operation without bodies or tokens. `email_oauth_states` is single use, expiring and bound to a live initiating session plus callback browser cookie. `email_rate_limits` bounds access. Browser Supabase roles cannot read these tables or execute the RPCs.

Only the service-role backend can submit operations; it uses the application permission service on every route and rechecks send/manage permissions inside transactional RPCs. Service-role credentials therefore remain privileged and must not be distributed to browsers or other callers.

## HTTP contract

All responses use `Cache-Control: no-store`. IDs supplied by the dashboard are application UUIDs. Auth is the existing HttpOnly dashboard session plus the current admin allowlist. Mutations require exact configured Origin, JSON and `X-Email-CSRF: 1`; this custom header plus same-origin policy is the CSRF defense. No cross-origin CORS access is enabled.

| Method/path under `/api/email` | Contract |
| --- | --- |
| GET `mailboxes` | Permitted mailbox summaries, independent permissions and provider capabilities; no credentials |
| GET `conversations?mailbox=&cursor=` | 25 conversations, opaque keyset next cursor; restricted to explicit read grants |
| GET `messages?conversation=` | Ordered messages, safe plain text, attachment metadata and this user's draft; at most 200 messages, otherwise open Gmail |
| GET `attachment?message=&part=` | Rechecks mailbox read access, fetches bytes on demand, attachment download headers, 10 MiB maximum |
| PUT `drafts` | `{conversationId,parentId,clientId,mode,body}` scoped to the signed-in user; preserved after failures |
| POST `review` | Same reply input; returns server-computed `{from,to,cc,subject}`. `mode` is `reply` or `replyAll`; recipients honor Reply-To and exclude the sending mailbox |
| POST `reply` | Reply input plus `reviewed:true, review:{from,to,cc,subject}`; persists immutable operation and job, returns 202 `{operation:{id,state,issue}}` |
| GET `operations?id=` | Current actor's authorized operation; alternatively `?clientId=&mailbox=` recovers a lost submission response |
| POST `connect` | `{mailboxId}` requires manage; returns Google consent URL and sets separate Lax callback cookie |
| POST `disconnect` | `{mailboxId}` requires manage; pauses mailbox, cancels queued sends, schedules watch stop and credential erasure |
| GET `oauth/callback` | Single-use state/browser/session binding, PKCE exchange, signed issuer/audience/expiry/nonce/hd/email/subject checks and Gmail primary profile check; does not require the Strict dashboard cookie |
| POST `notifications` | Google-signed JWT with exact audience, verified service email and numeric subject; exact expected subscription; persist/coalesce job before acknowledgment |

The mailbox is provisioned by an administrator in Supabase before connect. An ordinary dashboard user cannot claim an arbitrary Google account. Initial aliases and Groups are rejected. Manage does not implicitly confer read or send; sending also requires read access to the parent message.

## Execution

The scheduled Worker runs each minute, schedules reconciliation and daily watch renewal, and processes up to five jobs within a bounded run. A claim leases one mailbox job for four minutes, uses row locks and SKIP LOCKED, and serializes all job kinds per mailbox. Provider calls have 15–20 second timeouts; one adapter run has a 140-second budget. Sync/watch/stop failures retry up to eight times with exponential backoff capped at one hour. Auth failures mark the mailbox as requiring reconnect. Queue health must be monitored; increase execution frequency/capacity only after quota and load validation.

Signals never set checkpoints. Initial import defaults to 30 days (configurable 1–90), twenty messages/page; fixed window start, anchor and page cursor persist between jobs. No attachments are predownloaded. Gmail history pages fetch twenty changed messages per job and persist the remainder of bulk changes/deletions in a resumable cursor; expired history restarts controlled import. A completed import prunes cached messages absent from its covered window; older cached data outside that window is a retained snapshot. Messages, deletes, continuation and checkpoint commit in a single fenced RPC. Duplicate and out-of-order signals cannot regress history. Watch renewal does not replace synchronization checkpoints.

A send crosses a database boundary before calling Gmail. Definite provider rejection fails; timeout, throttle, connection loss or a crashed sender becomes uncertain. Reconciliation searches Sent for a stable RFC Message-ID and checks sender and SENT label. Absence is not proof of rejection; uncertain operations are never automatically resent. A recovered acceptance is marked sent and imported through synchronization. `sent` means Gmail acceptance, not recipient delivery. Automatic sending has no Resend idempotency assumption.

## Verification

Run `npm test` for mocked service/provider/security and SEO regression tests. The optional PostgreSQL and browser suites explicitly skip unless configured; their activation commands and isolated database requirements are in operations.md. Real Google authorization, Pub/Sub transport and message exchange remain activation checks. No production-ready or inbox-delivery claim is made from mocks.
