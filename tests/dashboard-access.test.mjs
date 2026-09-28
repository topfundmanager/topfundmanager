import assert from 'node:assert/strict';
import test from 'node:test';

import {
  onRequestDelete as deleteAccess,
  onRequestGet as getAccess,
  onRequestPut as putAccess,
} from '../functions/api/forms/access.js';
import { onRequestPost as requestCode } from '../functions/api/forms/login.js';
import { onRequestGet as getMe } from '../functions/api/forms/me.js';
import { onRequestGet as getSeo, onRequestPut as putSeo } from '../functions/api/forms/seo.js';
import { onRequestPost as publishSeo } from '../functions/api/forms/seo/publish.js';
import { onRequestGet as getSites } from '../functions/api/forms/sites.js';
import { onRequestGet as getSubmissions } from '../functions/api/forms/submissions.js';
import { hashString } from '../functions/api/forms/utils.js';

const OWNER = 'owner@example.com';
const env = {
  SUPABASE_URL: 'https://example.supabase.co',
  SUPABASE_SERVICE_ROLE_KEY: 'test-key',
  RESEND_API_KEY: 'test-resend',
  FORMS_ADMIN_EMAILS: OWNER,
};

const json = (value, status = 200) => new Response(JSON.stringify(value), {
  status,
  headers: { 'Content-Type': 'application/json' },
});

// A small in-memory stand-in for the Supabase REST tables the dashboard uses.
const createDatabase = ({ users = [], missingAccessTable = false } = {}) => {
  const db = {
    sites: [
      { site_id: 'jccaring', site_name: 'JC Caring' },
      { site_id: 'nocostnurse', site_name: 'No Cost Nurse' },
      { site_id: 'topfundmanager', site_name: 'Top Fund Manager' },
    ],
    users: users.map((user) => ({ all_sites: false, site_ids: [], ...user })),
    sessions: [],
    profiles: [
      { site_id: 'jccaring', revision: 1 },
      { site_id: 'nocostnurse', revision: 1 },
    ],
    queries: [],
    emails: [],
  };

  const eq = (params, key) => params.get(key)?.replace(/^eq\./, '');

  globalThis.fetch = async (url, init = {}) => {
    const parsed = new URL(url);
    const method = init.method || 'GET';
    const params = parsed.searchParams;
    const body = init.body ? JSON.parse(init.body) : null;
    db.queries.push(`${method} ${parsed.pathname}?${params.toString()}`);

    if (parsed.hostname === 'api.resend.com') {
      db.emails.push(body);
      return json({ id: 'email-id' });
    }

    switch (parsed.pathname) {
      case '/rest/v1/forms_sessions': {
        if (method === 'GET') return json(db.sessions.filter((s) => s.token_hash === eq(params, 'token_hash')));
        if (method === 'DELETE') {
          const email = eq(params, 'email');
          db.sessions = db.sessions.filter((s) => s.email !== email);
        }
        return new Response(null, { status: 204 });
      }
      case '/rest/v1/forms_admin_users': {
        if (missingAccessTable) {
          return json({ code: 'PGRST205', message: "Could not find the table 'public.forms_admin_users' in the schema cache" }, 404);
        }
        const email = eq(params, 'email');
        if (method === 'GET') return json(email ? db.users.filter((u) => u.email === email) : db.users);
        if (method === 'POST') {
          const row = { created_at: '2026-09-28T12:00:00Z', ...body };
          db.users.push(row);
          return json([row], 201);
        }
        if (method === 'PATCH') {
          const row = db.users.find((u) => u.email === email);
          Object.assign(row, body);
          return json([row]);
        }
        if (method === 'DELETE') {
          const removed = db.users.filter((u) => u.email === email);
          db.users = db.users.filter((u) => u.email !== email);
          return json(removed);
        }
        break;
      }
      case '/rest/v1/forms_sites':
        return json(db.sites);
      case '/rest/v1/forms_submissions':
        return json([]);
      case '/rest/v1/forms_auth_codes':
        return new Response(null, { status: 201 });
      case '/rest/v1/site_seo_profiles':
        if (method === 'GET') return json(db.profiles);
        return json([{ ...body }]);
      default:
        break;
    }
    throw new Error(`Unexpected request: ${method} ${url}`);
  };

  db.signIn = async (email) => {
    db.sessions.push({
      id: `session-${email}`,
      email,
      token_hash: await hashString(`session:${email}`),
      expires_at: '2099-01-01T00:00:00Z',
    });
  };

  return db;
};

const request = (path, { email, method = 'GET', body } = {}) => new Request(`https://topfundmanager.com${path}`, {
  method,
  headers: {
    'Content-Type': 'application/json',
    ...(email ? { Cookie: `tfm_forms_session=${encodeURIComponent(email)}` } : {}),
  },
  body: body ? JSON.stringify(body) : undefined,
});

const call = async (handler, path, options) => {
  const response = await handler({ request: request(path, options), env });
  return { status: response.status, body: await response.json() };
};

const withDatabase = (options, run) => async () => {
  const originalFetch = globalThis.fetch;
  try {
    await run(createDatabase(options));
  } finally {
    globalThis.fetch = originalFetch;
  }
};

test('only configured owners and dashboard users receive sign-in codes', withDatabase({
  users: [{ email: 'member@example.com', role: 'member', site_ids: ['nocostnurse'] }],
}, async (db) => {
  const send = (email) => call(requestCode, '/api/forms/login', { method: 'POST', body: { email } });

  assert.equal((await send(OWNER)).status, 200);
  assert.equal((await send('Member@Example.com')).status, 200);
  assert.equal((await send('stranger@example.com')).status, 403);
  assert.deepEqual(db.emails.map((email) => email.to), [OWNER, 'member@example.com']);
}));

test('a missing access table leaves configured owners able to sign in', withDatabase({ missingAccessTable: true }, async () => {
  const send = (email) => call(requestCode, '/api/forms/login', { method: 'POST', body: { email } });

  assert.equal((await send(OWNER)).status, 200);
  assert.equal((await send('member@example.com')).status, 403);
}));

test('members only see the sites, submissions, and SEO profiles they were given', withDatabase({
  users: [{ email: 'member@example.com', role: 'member', site_ids: ['nocostnurse'] }],
}, async (db) => {
  const email = 'member@example.com';
  await db.signIn(email);

  const me = await call(getMe, '/api/forms/me', { email });
  assert.equal(me.body.role, 'member');
  assert.equal(me.body.canManageAccess, false);
  assert.deepEqual(me.body.siteIds, ['nocostnurse']);

  const sites = await call(getSites, '/api/forms/sites', { email });
  assert.deepEqual(sites.body.sites.map((site) => site.site_id), ['nocostnurse']);

  await call(getSubmissions, '/api/forms/submissions', { email });
  assert.match(db.queries.at(-1), /site_id=in\.%28%22nocostnurse%22%29|site_id=in\.\("nocostnurse"\)/);

  assert.equal((await call(getSubmissions, '/api/forms/submissions?siteId=jccaring', { email })).status, 403);
  assert.equal((await call(getSubmissions, '/api/forms/submissions?siteId=nocostnurse', { email })).status, 200);

  const seo = await call(getSeo, '/api/forms/seo', { email });
  assert.deepEqual(seo.body.profiles.map((profile) => profile.site_id), ['nocostnurse']);

  const writesBefore = db.queries.filter((query) => query.startsWith('POST /rest/v1/site_seo_profiles')).length;
  const save = await call(putSeo, '/api/forms/seo', {
    email, method: 'PUT', body: { siteId: 'jccaring', profile: { seo_title: 'Not yours' } },
  });
  assert.equal(save.status, 403);
  assert.equal(db.queries.filter((query) => query.startsWith('POST /rest/v1/site_seo_profiles')).length, writesBefore);

  const publish = await call(publishSeo, '/api/forms/seo/publish', {
    email, method: 'POST', body: { siteId: 'jccaring', revision: 1 },
  });
  assert.equal(publish.status, 403);
}));

test('a member with no sites sees no submissions', withDatabase({
  users: [{ email: 'empty@example.com', role: 'member', site_ids: [] }],
}, async (db) => {
  await db.signIn('empty@example.com');
  const result = await call(getSubmissions, '/api/forms/submissions', { email: 'empty@example.com' });

  assert.deepEqual(result.body.submissions, []);
  assert.ok(!db.queries.some((query) => query.includes('/rest/v1/forms_submissions')));
}));

test('only owners can manage access', withDatabase({
  users: [{ email: 'member@example.com', role: 'member', site_ids: ['nocostnurse'] }],
}, async (db) => {
  await db.signIn('member@example.com');
  await db.signIn(OWNER);

  assert.equal((await call(getAccess, '/api/forms/access', { email: 'member@example.com' })).status, 403);
  assert.equal((await call(putAccess, '/api/forms/access', {
    email: 'member@example.com', method: 'PUT', body: { email: 'member@example.com', role: 'owner' },
  })).status, 403);

  const list = await call(getAccess, '/api/forms/access', { email: OWNER });
  assert.equal(list.status, 200);
  assert.deepEqual(list.body.configuredOwners, [OWNER]);
  assert.deepEqual(list.body.users.map((user) => user.email), ['member@example.com']);
  assert.equal(list.body.sites.length, 3);
}));

test('owners add, update, and remove people, and removal signs them out', withDatabase({}, async (db) => {
  await db.signIn(OWNER);
  const save = (body) => call(putAccess, '/api/forms/access', { email: OWNER, method: 'PUT', body });

  const added = await save({ email: 'JCCaringServices@gmail.com', role: 'member', siteIds: ['jccaring', 'nocostnurse'] });
  assert.equal(added.status, 200);
  assert.equal(added.body.created, true);
  assert.deepEqual(db.users[0], {
    created_at: '2026-09-28T12:00:00Z',
    email: 'jccaringservices@gmail.com',
    role: 'member',
    all_sites: false,
    site_ids: ['jccaring', 'nocostnurse'],
    updated_by: OWNER,
    updated_at: db.users[0].updated_at,
    created_by: OWNER,
  });

  const updated = await save({ email: 'jccaringservices@gmail.com', role: 'member', allSites: true, siteIds: [] });
  assert.equal(updated.body.created, false);
  assert.equal(db.users[0].all_sites, true);
  assert.deepEqual(db.users[0].site_ids, []);
  assert.equal(db.users[0].created_by, OWNER);

  await db.signIn('jccaringservices@gmail.com');
  assert.equal((await call(getMe, '/api/forms/me', { email: 'jccaringservices@gmail.com' })).status, 200);

  const removed = await call(deleteAccess, '/api/forms/access?email=jccaringservices%40gmail.com', { email: OWNER, method: 'DELETE' });
  assert.equal(removed.status, 200);
  assert.equal(db.users.length, 0);
  assert.equal(db.sessions.some((session) => session.email === 'jccaringservices@gmail.com'), false);
  assert.equal((await call(getMe, '/api/forms/me', { email: 'jccaringservices@gmail.com' })).status, 401);
}));

test('access changes are validated and owners cannot lock themselves out', withDatabase({
  users: [{ email: 'second-owner@example.com', role: 'owner', all_sites: true }],
}, async (db) => {
  await db.signIn(OWNER);
  await db.signIn('second-owner@example.com');
  const save = (actor, body) => call(putAccess, '/api/forms/access', { email: actor, method: 'PUT', body });

  assert.equal((await save(OWNER, { email: 'not-an-email', role: 'member', allSites: true })).status, 400);
  assert.equal((await save(OWNER, { email: 'new@example.com', role: 'admin', allSites: true })).status, 400);
  assert.equal((await save(OWNER, { email: 'new@example.com', role: 'member', siteIds: ['unknown-site'] })).status, 400);
  assert.equal((await save(OWNER, { email: 'new@example.com', role: 'member', siteIds: [] })).status, 400);
  assert.equal((await save(OWNER, { email: OWNER, role: 'member', allSites: true })).status, 400);

  const selfDemotion = await save('second-owner@example.com', { email: 'second-owner@example.com', role: 'member', allSites: true });
  assert.equal(selfDemotion.status, 400);
  const selfRemoval = await call(deleteAccess, '/api/forms/access?email=second-owner%40example.com', {
    email: 'second-owner@example.com', method: 'DELETE',
  });
  assert.equal(selfRemoval.status, 400);

  const promoted = await save(OWNER, { email: 'new@example.com', role: 'owner', siteIds: ['jccaring'] });
  assert.equal(promoted.status, 200);
  assert.equal(db.users.find((user) => user.email === 'new@example.com').all_sites, true);
  assert.deepEqual(db.users.find((user) => user.email === 'new@example.com').site_ids, []);

  const missing = await call(deleteAccess, '/api/forms/access?email=nobody%40example.com', { email: OWNER, method: 'DELETE' });
  assert.equal(missing.status, 404);
}));

test('the access list explains a missing table instead of failing silently', withDatabase({ missingAccessTable: true }, async (db) => {
  await db.signIn(OWNER);
  const result = await call(getAccess, '/api/forms/access', { email: OWNER });

  assert.equal(result.status, 500);
  assert.match(result.body.error, /202609280001_forms_admin_users\.sql/);
}));
