import {
  buildSessionCookie,
  errorResponse,
  generateToken,
  getRequestMeta,
  jsonResponse,
  normalizeEmail,
  supabaseFetchJson,
  hashString,
} from './utils.js';

export async function onRequestPost({ request, env }) {
  try {
    const body = await request.json();
    const email = normalizeEmail(body?.email);
    const code = String(body?.code || '').trim();
    const challengeId = String(body?.challengeId || '').trim();

    if (!email || !code || !challengeId) {
      return errorResponse(400, 'Email, code, and challenge ID are required.');
    }

    const now = new Date().toISOString();
    const query = `/rest/v1/forms_auth_codes?select=id,code_hash,expires_at,consumed_at&email=eq.${encodeURIComponent(
      email
    )}&id=eq.${encodeURIComponent(challengeId)}&consumed_at=is.null&expires_at=gt.${encodeURIComponent(now)}&limit=1`;

    const records = await supabaseFetchJson(env, query);
    const record = records?.[0];

    if (!record) {
      return errorResponse(401, 'Invalid or expired code.');
    }

    const codeHash = await hashString(`code:${code}:${email}:${challengeId}`);
    if (codeHash !== record.code_hash) {
      return errorResponse(401, 'Invalid or expired code.');
    }

    await supabaseFetchJson(env, `/rest/v1/forms_auth_codes?id=eq.${encodeURIComponent(challengeId)}`, {
      method: 'PATCH',
      headers: { Prefer: 'return=minimal' },
      body: JSON.stringify({ consumed_at: now }),
    });

    const token = generateToken();
    const tokenHash = await hashString(`session:${token}`);
    const ttlHours = Number.parseInt(env.FORMS_SESSION_TTL_HOURS || '168', 10);
    const expiresAt = new Date(Date.now() + ttlHours * 3600 * 1000).toISOString();
    const maxAgeSeconds = ttlHours * 3600;
    const { ip, userAgent } = getRequestMeta(request);

    await supabaseFetchJson(env, '/rest/v1/forms_sessions', {
      method: 'POST',
      headers: { Prefer: 'return=minimal' },
      body: JSON.stringify({
        email,
        token_hash: tokenHash,
        expires_at: expiresAt,
        ip,
        user_agent: userAgent,
        last_used_at: now,
      }),
    });

    return jsonResponse(
      { success: true },
      200,
      {
        'Set-Cookie': buildSessionCookie(env, token, maxAgeSeconds),
      }
    );
  } catch (error) {
    return errorResponse(500, error.message || 'Unable to verify code.');
  }
}
