const JSON_HEADERS = { 'Content-Type': 'application/json' };

export const jsonResponse = (data, status = 200, headers = {}) => {
  return new Response(JSON.stringify(data), {
    status,
    headers: { ...JSON_HEADERS, ...headers },
  });
};

export const errorResponse = (status, message, headers = {}) => {
  return jsonResponse({ success: false, error: message }, status, headers);
};

export const normalizeEmail = (email) => (email || '').trim().toLowerCase();

export const getAdminEmails = (env) => {
  const raw = env.FORMS_ADMIN_EMAILS || '';
  return raw
    .split(',')
    .map((email) => normalizeEmail(email))
    .filter(Boolean);
};

export const isAllowedAdmin = (email, env) => {
  const allowlist = getAdminEmails(env);
  return allowlist.includes(normalizeEmail(email));
};

export const getSupabaseConfig = (env) => {
  const url = env.SUPABASE_URL;
  const key = env.SUPABASE_SERVICE_ROLE_KEY;

  if (!url || !key) {
    throw new Error('Supabase is not configured.');
  }

  const baseUrl = url.endsWith('/') ? url.slice(0, -1) : url;
  return { baseUrl, key };
};

export const supabaseFetchJson = async (env, path, init = {}) => {
  const { baseUrl, key } = getSupabaseConfig(env);
  const url = `${baseUrl}${path.startsWith('/') ? path : `/${path}`}`;

  const response = await fetch(url, {
    ...init,
    headers: {
      apikey: key,
      Authorization: `Bearer ${key}`,
      'Content-Type': 'application/json',
      ...(init.headers || {}),
    },
  });

  if (!response.ok) {
    const errorText = await response.text();
    throw new Error(`Supabase error: ${errorText}`);
  }

  if (response.status === 204) {
    return null;
  }

  const text = await response.text();
  if (!text) return null;
  return JSON.parse(text);
};

export const hashString = async (value) => {
  const encoder = new TextEncoder();
  const data = encoder.encode(value);
  const digest = await crypto.subtle.digest('SHA-256', data);
  return Array.from(new Uint8Array(digest))
    .map((byte) => byte.toString(16).padStart(2, '0'))
    .join('');
};

const base64Url = (bytes) => {
  let binary = '';
  bytes.forEach((byte) => {
    binary += String.fromCharCode(byte);
  });
  return btoa(binary).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/g, '');
};

export const generateCode = () => {
  const array = new Uint32Array(1);
  crypto.getRandomValues(array);
  const code = (array[0] % 1000000).toString().padStart(6, '0');
  return code;
};

export const generateToken = () => {
  const bytes = new Uint8Array(32);
  crypto.getRandomValues(bytes);
  return base64Url(bytes);
};

export const parseCookies = (header) => {
  const cookies = {};
  if (!header) return cookies;
  header.split(';').forEach((pair) => {
    const [key, ...rest] = pair.trim().split('=');
    if (!key) return;
    cookies[key] = decodeURIComponent(rest.join('='));
  });
  return cookies;
};

export const getRequestMeta = (request) => {
  const headers = request.headers;
  const forwardedFor = headers.get('x-forwarded-for');
  const ip = headers.get('cf-connecting-ip') || (forwardedFor ? forwardedFor.split(',')[0].trim() : '');
  const userAgent = headers.get('user-agent') || '';
  const origin = headers.get('origin') || '';
  const referrer = headers.get('referer') || '';
  return { ip, userAgent, origin, referrer };
};

export const sendResendEmail = async (env, { from, to, subject, html, replyTo }) => {
  const resendApiKey = env.RESEND_API_KEY;
  if (!resendApiKey) {
    throw new Error('Resend API key not configured');
  }

  const response = await fetch('https://api.resend.com/emails', {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${resendApiKey}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      from,
      to,
      subject,
      html,
      reply_to: replyTo,
    }),
  });

  if (!response.ok) {
    const error = await response.text();
    throw new Error(`Resend API error: ${error}`);
  }

  return response.json();
};

export const buildCodeEmail = ({ code, expiresMinutes, ip, userAgent }) => {
  return `
    <h2>Your Forms Admin Code</h2>
    <p>Use the following code to finish signing in:</p>
    <h1 style="letter-spacing: 4px;">${code}</h1>
    <p>This code expires in ${expiresMinutes} minutes.</p>
    <p style="color:#6b7280; font-size: 12px;">Request details: ${ip || 'Unknown IP'} · ${userAgent || 'Unknown device'}</p>
  `;
};

export const getSessionCookieName = (env) => env.FORMS_SESSION_COOKIE || 'tfm_forms_session';

export const buildSessionCookie = (env, token, maxAgeSeconds) => {
  const cookieName = getSessionCookieName(env);
  return `${cookieName}=${token}; HttpOnly; Secure; SameSite=Strict; Path=/; Max-Age=${maxAgeSeconds}`;
};

export const clearSessionCookie = (env) => {
  const cookieName = getSessionCookieName(env);
  return `${cookieName}=; HttpOnly; Secure; SameSite=Strict; Path=/; Max-Age=0`;
};

export const getSessionFromRequest = async (request, env) => {
  const cookies = parseCookies(request.headers.get('cookie') || '');
  const token = cookies[getSessionCookieName(env)];
  if (!token) return null;

  const tokenHash = await hashString(`session:${token}`);
  const now = new Date().toISOString();

  const sessions = await supabaseFetchJson(
    env,
    `/rest/v1/forms_sessions?select=id,email,expires_at&token_hash=eq.${encodeURIComponent(tokenHash)}&expires_at=gt.${encodeURIComponent(now)}&limit=1`
  );

  if (!sessions || sessions.length === 0) {
    return null;
  }

  const session = sessions[0];

  await supabaseFetchJson(env, `/rest/v1/forms_sessions?token_hash=eq.${encodeURIComponent(tokenHash)}`, {
    method: 'PATCH',
    headers: { Prefer: 'return=minimal' },
    body: JSON.stringify({ last_used_at: now }),
  });

  return session;
};

export const requireSession = async (request, env) => {
  const session = await getSessionFromRequest(request, env);
  if (!session) {
    return null;
  }
  return session;
};

export const getAllowedOrigins = (site) => {
  const origins = site?.allowed_origins;
  if (!origins) return [];
  if (Array.isArray(origins)) return origins;
  if (typeof origins === 'string') {
    try {
      const parsed = JSON.parse(origins);
      return Array.isArray(parsed) ? parsed : [];
    } catch {
      return [];
    }
  }
  return [];
};

export const buildCorsHeaders = (origin, allowedOrigins) => {
  const allowAll = !allowedOrigins || allowedOrigins.length === 0;
  const isAllowed = origin && (allowAll || allowedOrigins.includes(origin));
  return {
    'Access-Control-Allow-Origin': isAllowed ? origin : 'null',
    'Access-Control-Allow-Methods': 'POST, OPTIONS',
    'Access-Control-Allow-Headers': 'Content-Type, X-Forms-Site-Key',
    'Access-Control-Max-Age': '86400',
    Vary: 'Origin',
  };
};
