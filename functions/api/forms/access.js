import {
  errorResponse,
  getAdminEmails,
  jsonResponse,
  normalizeEmail,
  requireSession,
  supabaseFetchJson,
} from './utils.js';

const EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const USER_FIELDS = 'email,role,all_sites,site_ids,created_by,created_at,updated_by,updated_at';
const MISSING_TABLE_MESSAGE = 'The access table is missing. Apply supabase/migrations/202609280001_forms_admin_users.sql, then reload.';

const requireOwner = async (request, env) => {
  const session = await requireSession(request, env);
  if (!session) return { response: errorResponse(401, 'Unauthorized') };
  if (session.access.role !== 'owner') {
    return { response: errorResponse(403, 'Only owners can manage dashboard access.') };
  }
  return { session };
};

const cleanEmail = (value) => {
  const email = typeof value === 'string' ? normalizeEmail(value) : '';
  if (!email || email.length > 254 || !EMAIL_PATTERN.test(email)) {
    throw new Error('Enter a valid email address.');
  }
  return email;
};

const toUser = (row) => ({
  email: row.email,
  role: row.role,
  allSites: row.role === 'owner' || row.all_sites === true,
  siteIds: row.site_ids || [],
  createdBy: row.created_by,
  createdAt: row.created_at,
  updatedBy: row.updated_by,
  updatedAt: row.updated_at,
});

const loadSites = (env) => supabaseFetchJson(env, '/rest/v1/forms_sites?select=site_id,site_name&order=site_id.asc');

const findUser = async (env, email) => {
  const rows = await supabaseFetchJson(
    env,
    `/rest/v1/forms_admin_users?select=${USER_FIELDS}&email=eq.${encodeURIComponent(email)}&limit=1`
  );
  return rows?.[0] || null;
};

const isMissingTable = (message) => /42P01|PGRST205|forms_admin_users[^]*(does not exist|schema cache)|find the table 'public\.forms_admin_users'/.test(message);

const failure = (error, fallback) => {
  const message = error.message || fallback;
  if (isMissingTable(message)) return errorResponse(500, MISSING_TABLE_MESSAGE);
  return errorResponse(message.startsWith('Supabase error:') ? 500 : 400, message);
};

export async function onRequestGet({ request, env }) {
  try {
    const { session, response } = await requireOwner(request, env);
    if (response) return response;

    const [rows, sites] = await Promise.all([
      supabaseFetchJson(env, `/rest/v1/forms_admin_users?select=${USER_FIELDS}&order=email.asc`),
      loadSites(env),
    ]);

    return jsonResponse({
      success: true,
      currentEmail: session.email,
      configuredOwners: getAdminEmails(env),
      users: (rows || []).map(toUser),
      sites: sites || [],
    }, 200, { 'Cache-Control': 'no-store' });
  } catch (error) {
    return failure(error, 'Unable to load dashboard access.');
  }
}

export async function onRequestPut({ request, env }) {
  try {
    const { session, response } = await requireOwner(request, env);
    if (response) return response;

    const body = await request.json().catch(() => ({}));
    const email = cleanEmail(body.email);
    const role = ['owner', 'member'].includes(body.role) ? body.role : null;
    if (!role) {
      return errorResponse(400, 'Choose Owner or Member.');
    }
    if (getAdminEmails(env).includes(email)) {
      return errorResponse(400, 'This email is an owner through FORMS_ADMIN_EMAILS in Cloudflare. Change it there.');
    }
    if (email === session.email && role !== 'owner') {
      return errorResponse(400, 'You cannot remove your own owner access.');
    }

    const allSites = role === 'owner' || body.allSites === true;
    let siteIds = [];
    if (!allSites) {
      if (!Array.isArray(body.siteIds) || body.siteIds.length > 100) {
        return errorResponse(400, 'Choose the sites this person can see.');
      }
      const known = new Set((await loadSites(env) || []).map((site) => site.site_id));
      siteIds = [...new Set(body.siteIds.map((id) => String(id).trim()))];
      const unknown = siteIds.filter((id) => !known.has(id));
      if (unknown.length) {
        return errorResponse(400, `Unknown site: ${unknown.join(', ')}.`);
      }
      if (!siteIds.length) {
        return errorResponse(400, 'Choose at least one site, or All sites.');
      }
    }

    const now = new Date().toISOString();
    const changes = { role, all_sites: allSites, site_ids: siteIds, updated_by: session.email, updated_at: now };
    const existing = await findUser(env, email);
    const saved = existing
      ? await supabaseFetchJson(env, `/rest/v1/forms_admin_users?email=eq.${encodeURIComponent(email)}`, {
        method: 'PATCH',
        headers: { Prefer: 'return=representation' },
        body: JSON.stringify(changes),
      })
      : await supabaseFetchJson(env, '/rest/v1/forms_admin_users', {
        method: 'POST',
        headers: { Prefer: 'return=representation' },
        body: JSON.stringify({ email, ...changes, created_by: session.email }),
      });

    return jsonResponse({ success: true, created: !existing, user: toUser(saved?.[0] || { email, ...changes }) });
  } catch (error) {
    return failure(error, 'Unable to save dashboard access.');
  }
}

export async function onRequestDelete({ request, env }) {
  try {
    const { session, response } = await requireOwner(request, env);
    if (response) return response;

    const email = cleanEmail(new URL(request.url).searchParams.get('email'));
    if (email === session.email) {
      return errorResponse(400, 'You cannot remove yourself.');
    }
    if (getAdminEmails(env).includes(email)) {
      return errorResponse(400, 'This email is an owner through FORMS_ADMIN_EMAILS in Cloudflare. Remove it there.');
    }

    const removed = await supabaseFetchJson(env, `/rest/v1/forms_admin_users?email=eq.${encodeURIComponent(email)}`, {
      method: 'DELETE',
      headers: { Prefer: 'return=representation' },
    });
    if (!removed?.length) {
      return errorResponse(404, 'That email does not have dashboard access.');
    }

    // End any open sessions right away instead of waiting for them to expire.
    await supabaseFetchJson(env, `/rest/v1/forms_sessions?email=eq.${encodeURIComponent(email)}`, {
      method: 'DELETE',
      headers: { Prefer: 'return=minimal' },
    });

    return jsonResponse({ success: true, removed: email });
  } catch (error) {
    return failure(error, 'Unable to remove dashboard access.');
  }
}
