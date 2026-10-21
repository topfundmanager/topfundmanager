# Email setup and operations

This release is implemented and tested locally with mock Google APIs and an isolated PostgreSQL database. It has NOT been deployed, connected to real Gmail, or tested by sending real mail. The production Pages/Supabase configuration and backups still require an authorized operator's verification. Keep both email feature flags off until setup and acceptance are complete. Apply no production migration or configuration from this document without authorization.

## Client inputs still needed

- Actual primary mailbox inventory; aliases and Groups listed separately.
- Per-dashboard-user read, send and manage assignments, including who can authorize each actual mailbox.
- Workspace administrator and organization ownership confirmation; the canonical signed `hd` value.
- Client-owned Google Cloud project within that organization; OAuth owner/approvers.
- Retention/deletion policy and backup requirements. Until chosen, cached content/drafts and audit history are retained without automatic deletion; attachments are not retained locally.
- Approved test mailboxes and external recipients. No real sending is authorized by this implementation handoff.

## Infrastructure and activation order

1. Back up Supabase. Verify the current deployment's existing login, forms and SEO schema before changes. Review additive migration `supabase/migrations/202610210001_email.sql` in staging first. It adds email tables/RPCs and atomically bounded login-code verification; login and verify routes must be deployed with this migration. Do not execute or overwrite the unrelated untracked inquiry-summary migration/configuration.
2. In a client-owned Google Cloud project under the Workspace organization, enable Gmail API and Pub/Sub. Configure an **Internal** OAuth audience where eligible. Verify Google Workspace API controls permit the client/scopes. Create a Web OAuth client and register the exact HTTPS callback `https://<dashboard-host>/api/email/oauth/callback`. No wildcard, alternate-origin or open redirect. Do not introduce domain-wide delegation, service-account mailbox impersonation, or customer MX/DNS changes.
3. Gmail access scopes are only `gmail.readonly` and `gmail.send`. `openid` and `email` are additional identity scopes used to cryptographically validate the Google account and its Workspace `hd` claim, rather than trusting the email suffix. No `gmail.modify`, settings/send-as, Drive or Admin SDK scopes. This release accepts only the assigned primary account; aliases and Groups are not connectable mailboxes. Restricted/sensitive scope policy, Internal eligibility and any applicable Google verification/security assessment requirements must be reviewed for the actual deployment.
4. Create Pub/Sub topic `projects/<project>/topics/<topic>` in the same Google project as the OAuth Gmail client. Grant publisher on that topic to `gmail-api-push@system.gserviceaccount.com`; account for organization domain restrictions if needed. Create a push subscription with endpoint `https://<dashboard-host>/api/email/notifications`. Enable authenticated push with a dedicated service account, configure an exact audience, and record the service account's verified email AND numeric unique ID (`sub`). Grant the Pub/Sub service agent token-creation permissions required by Google's authenticated-push documentation. Use the full expected subscription resource name in configuration. Configure retry/dead-letter behavior and alerts for delivery failures. No public unauthenticated push fallback.
5. Install the environment values below independently on **Pages** and the **email scheduled Worker**. The Worker is separate because Pages Functions do not handle cron triggers. Deploy it using `wrangler.email.toml`, not the existing inquiry-summary config. Production enablement remains an explicit operator action. Both runtimes need the same Supabase, Google and token encryption values. Use separate staging Google credentials and database; do not let previews share production sending credentials.
6. Provision one mailbox row per actual primary mailbox and explicit grants via a reviewed Supabase administrative transaction. `EMAIL_WORKSPACE_ID` is an installation identifier, not a website ID. No grants are inferred from the dashboard admin allowlist. Example with placeholders only:

   ```sql
   begin;
   insert into public.email_mailboxes(workspace_id,address)
     values ('<installation-id>','<primary-mailbox>');
   insert into public.email_grants(workspace_id,mailbox_id,user_email,can_read,can_send,can_manage)
     select workspace_id,id,'<dashboard-user>',true,true,true
     from public.email_mailboxes
     where workspace_id='<installation-id>' and address='<primary-mailbox>';
   commit;
   ```

   Email strings must be lowercase. Provision every assignment deliberately; remove grants promptly when access changes. The dashboard user must also remain in `FORMS_ADMIN_EMAILS`. Recheck the intended installation and mailbox before granting access.
7. In staging, enable Pages email routes and connect each actual account individually through Email → Mailbox connections. The user with manage permission initiates OAuth and authorizes the assigned mailbox. Wrong-account authorization is rejected and consumes state; restart from Connect. The callback uses an expiring HttpOnly **Lax** cookie distinct from the existing Strict session cookie; it also requires the original live Supabase session record. OAuth does not create a dashboard session.
8. Enable the email Worker in staging. It runs every minute, resumes bounded imports, renews watches once per day, and reconciles for missed/delayed notifications. Ensure queued jobs drain and watches renew before enabling production. Initial import defaults to the previous 30 days (1–90 configurable); pagination is resumable. Following an expired checkpoint, the covered cache window is reimported and absent messages in that window are removed. Older cached content outside it is a retained snapshot. There is no full archive download by default.
9. With separate authorization for the test accounts/recipients, verify actual incoming mail and attachment bytes, reply and reply-all, primary sending address, Gmail Sent appearance/thread placement, messages sent directly from Gmail, Pub/Sub authentication/retry, expired-history recovery, revoked access, reconnect, mobile behavior, and unchanged Submissions/SEO. Acceptance is Gmail API acceptance only; verify real recipient delivery independently. Record evidence without bodies/tokens. Only then consider production activation.

Google references reviewed October 21, 2026: [OAuth web server flow](https://developers.google.com/identity/protocols/oauth2/web-server), [OpenID Connect](https://developers.google.com/identity/openid-connect/openid-connect), [Gmail scopes](https://developers.google.com/workspace/gmail/api/auth/scopes), [push notifications](https://developers.google.com/workspace/gmail/api/guides/push), [authenticated Pub/Sub push](https://docs.cloud.google.com/pubsub/docs/authenticate-push-subscriptions), [Gmail synchronization](https://developers.google.com/workspace/gmail/api/guides/sync), [threading](https://developers.google.com/workspace/gmail/api/guides/threads), [sending](https://developers.google.com/workspace/gmail/api/guides/sending). Google recommends renewing watches daily; history checkpoint expiry requires resynchronization. Recheck these requirements when activating.

## Environment variables: names and purposes only

| Name | Purpose / runtime |
| --- | --- |
| `EMAIL_ENABLED` | Pages gate; literal `true` to expose email routes. Absent/off by default |
| `EMAIL_WORKER_ENABLED` | Scheduled Worker send/sync gate; literal `true`. Defaults false in Wrangler template |
| `EMAIL_WORKSPACE_ID` | Same stable installation scope in both runtimes and database grants |
| `EMAIL_APP_ORIGIN` | Exact HTTPS dashboard origin, no trailing slash; Pages origin/CSRF checks and OAuth callback |
| `EMAIL_GOOGLE_CLIENT_ID` | Client-owned Internal Web OAuth client ID; both runtimes |
| `EMAIL_GOOGLE_CLIENT_SECRET` | OAuth secret, server only; both runtimes |
| `EMAIL_GOOGLE_HOSTED_DOMAIN` | Exact expected signed Workspace `hd` identity value, verified with organization admin; Pages |
| `EMAIL_TOKEN_KEY` | Base64url 32 random bytes for AES-256-GCM. Store separately as runtime secret, not in Supabase; same value in both runtimes |
| `EMAIL_IMPORT_DAYS` | Initial history window, 1–90 days, default 30; Worker |
| `EMAIL_PUBSUB_TOPIC` | Full topic resource, same Google project as Gmail OAuth client; Worker watch setup |
| `EMAIL_PUBSUB_AUDIENCE` | Exact configured push JWT audience; Pages |
| `EMAIL_PUBSUB_SERVICE_ACCOUNT` | Expected authenticated push service email; Pages |
| `EMAIL_PUBSUB_SERVICE_SUBJECT` | Expected numeric Google service-account unique ID/JWT sub; Pages |
| `EMAIL_PUBSUB_SUBSCRIPTION` | Full expected subscription resource name; Pages |
| `SUPABASE_URL` | Existing project URL; both runtimes |
| `SUPABASE_SERVICE_ROLE_KEY` | Existing server-only privileged REST key; both runtimes |
| `FORMS_ADMIN_EMAILS` | Existing dashboard sign-in allowlist; Pages, rechecked by every email session route and OAuth callback |
| `FORMS_SESSION_COOKIE` | Existing cookie name; default `tfm_forms_session`; Pages |
| `FORMS_CODE_TTL_MINUTES` / `FORMS_SESSION_TTL_HOURS` | Existing login code/session lifetimes; Pages |
| `RESEND_API_KEY` / `FORMS_FROM_EMAIL` / `FROM_EMAIL` | Existing login-code and form notification transport; Pages. Gmail replies do not use Resend |

Use Cloudflare runtime secrets or ignored `.dev.vars`, never committed values. Database backups alone cannot decrypt refresh tokens without the separately protected key. Key rotation requires pausing the Worker and reencrypting credentials using the old/new keys with the same installation/mailbox binding; do not simply replace the key. Avoid requesting OAuth scopes beyond this list without a reviewed reason.

## Monitoring and recovery

The UI shows connection status, last completed sync, imported-since date, watch expiry and safe actionable issues. Admin operators must also monitor `email_jobs` (failed/expired leases/queue age), `email_operations` (uncertain/sending), watch expiration, Pub/Sub dead-letter backlog and cron failures. Mail bodies, refresh/access tokens and raw provider responses must never be logged. Dashboard requests are limited to 120/user/minute, attachment downloads 20/user/minute, sends 30/mailbox/hour and 20 recipients/operation. Larger conversations (>200 cached messages), attachments (>10 MiB), or missing threading headers are handled in Gmail. This is correspondence, not bulk sending.

- **Missed or duplicate push:** signed notifications are coalesced into durable sync work; cron reconciliation remains the fallback. Check subscription audience/email/sub/resource, project topic IAM, watch expiry, and Worker/database health. Notification history IDs never advance the database checkpoint.
- **Provider outage or throttling:** sync/watch/stop jobs retry at most eight attempts with exponential backoff (cap one hour). Auth failures pause the connection with an actionable issue. Fix cause, reconnect or enqueue a fresh sync/watch job via service-only `email_enqueue`; do not alter checkpoint values manually.
- **Expired cursor/history:** controlled resumable reimport; do not clear the entire cache or fetch the full archive by hand. Keep the fixed import window visible to users. Missing notifications are not a reason to resend outgoing operations.
- **Failed reply:** draft remains in the user's account. A definite rejection allows a new reviewed operation; unchanged submissions retain their client UUID. On a lost dashboard response the UI looks up that same operation and blocks editing until resolved.
- **Uncertain reply:** worker searches Gmail Sent by the stored RFC Message-ID. It never automatically sends that operation again. After bounded retries, an operator checks Gmail Sent and provider message headers. To schedule another reconciliation, insert a **send-kind job referencing the same uncertain operation**, with a fresh job dedupe key; do not change operation state to queued or mint a replacement send UUID. If confirmed accepted, reconcile to sent with the actual provider ID and audit the operator decision. Absence from search is not proof of failure. Seek a human decision before a replacement message.
- **Reconnect:** current dashboard manage user authorizes the exact primary account again. Active job lease must finish/expire before connection changes. Stable Google subject is checked. Generation changes fence older sync completions; queued sends are canceled, not resumed; uncertain sends stay uncertain for reconciliation. Grants and cached conversations survive.
- **Disconnect:** server immediately marks disconnected, rejects sending and stops scheduling sync. A durable stop job cancels the Gmail watch and erases the stored refresh credential after success (or already-revoked authorization). Pending sync/sends are canceled. Inspect failed stop jobs; revoke app access from the Google account/Workspace administrator if watch stop cannot succeed. Disconnect does not delete cached content or grants. Google may deliver in-flight signals, which cannot restart a disconnected mailbox.

## Retention, deletion and backup/restore

No automatic content-retention choice is inferred. Cached messages, drafts, operations, dedupe receipts and audit records persist until a separately authorized administrative deletion; the client must decide policy before release. No incoming attachment bytes are stored: downloads retrieve from Gmail on demand and can become unavailable after provider deletion. If retained attachments are added later, use private storage and authorized downloads with their own policy. Rate buckets expire after one day, OAuth state after ten minutes (scheduled cleanup); ordinary logs contain only safe operational messages.

For an authorized full mailbox deletion: pause the Worker; stop/revoke the watch and credential; reconcile all sending/uncertain operations; back up required audit evidence; verify installation and mailbox; delete exactly that `email_mailboxes` row in an admin transaction. Foreign keys cascade its grants, conversations, messages, drafts, operations, jobs and states. Audit rows intentionally remain as metadata without content until a separate approved audit-retention decision. Database operators must not substitute email-domain matches for exact scoped identifiers. Gmail's own messages are not deleted by cache deletion.

Backups must cover all email tables, grants and outgoing states, plus existing dashboard sessions if appropriate. Protect token keys separately; test both database restore and credential recovery. On every restore drill, omit Google send/OAuth credentials and set `EMAIL_WORKER_ENABLED=false` before any process starts. A database restore must never replay an outgoing queue. For real recovery, leave Worker paused, retain audit/dedupe records, mark old `queued`/`sending` operations uncertain in an audited administrative transaction, and reconcile against actual Gmail Sent before enabling background processing. Watch subscriptions must be re-established deliberately. Test a private restore before asserting production backup coverage.

## Deployment and rollback

Staging first: apply additive SQL, deploy Pages code and disabled email Worker, set separate secrets/flags, provision grants, then activate only approved mailboxes. No deploy/migration/sending was done by the implementation task. Existing Resend notification/login settings and SEO publication behavior stay in place. The migration also hardens existing login: five code guesses, atomic one-time consumption and bounded issuance (five/email/hour, fifteen/IP/hour), with safe client errors.

Rollback: set `EMAIL_WORKER_ENABLED=false` first, then disable Pages `EMAIL_ENABLED`. Pause the trigger if needed and account for any already-running provider call. Retain tables, operations and credentials for controlled reconciliation; never run a destructive down migration or replay jobs from backup. Roll back email UI/transport if desired, but retain the hardened login routes together with their additive RPCs. Do not revert to the previous unbounded code-verification path. Google watch stop/revoke is separate from disabling local code. Do not change production MX, Resend keys or the inquiry-summary Worker.

## Reproduce verification

- `npm test` runs provider/application mocks and the existing SEO suite. PostgreSQL/browser suites skip explicitly until their variables are supplied.
- Database integration: create a fresh **local-only** `tfm_email_test` database with superuser test access and roles `anon`, `authenticated`, `service_role` (`bypassrls`). Set `EMAIL_TEST_DATABASE_URL` to that localhost database and run `node --test tests/email/database.test.mjs`. The suite intentionally **drops/rebuilds public in that dedicated database** and refuses any nonlocal host or differently named database. Do not point it at production/staging data. It verifies real concurrent submissions/claims, fencing, crash recovery, OAuth state atomicity, login limits and RPC privileges.
- Browser integration: install/use Playwright and Chromium, set `EMAIL_PLAYWRIGHT_MODULES` to the absolute node_modules directory containing Playwright; optionally set `EMAIL_CHROME_BIN` to installed Chrome. Run `node --test tests/email/browser.test.mjs`. All API calls are intercepted mocks; it checks 390px mobile overflow, sender/recipient review, failed draft preservation, uncertain submission lock, inert message content and Submissions/SEO switching. Screenshots go to `/tmp/tfm-email-mobile.png` and `/tmp/tfm-email-desktop.png`.
- Build: `WRANGLER_LOG_PATH=/tmp/tfm-email-wrangler.log npx wrangler pages functions build --outdir /tmp/tfm-email-functions`; `WRANGLER_LOG_PATH=/tmp/tfm-email-worker.log npx wrangler deploy --config wrangler.email.toml --dry-run --outdir /tmp/tfm-email-worker`. These compile locally and do not deploy.
