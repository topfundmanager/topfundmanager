import {
  buildSessionCookie,
  errorResponse,
  generateToken,
  getRequestMeta,
  jsonResponse,
  normalizeEmail,
  isAllowedAdmin,
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

    if (!isAllowedAdmin(email, env)) return errorResponse(403, 'Email is not authorized.');
    if (!/^[0-9a-f-]{36}$/i.test(challengeId) || !/^\d{6}$/.test(code)) return errorResponse(401, 'Invalid or expired code.');
    const now = new Date().toISOString();
    const codeHash = await hashString(`code:${code}:${email}:${challengeId}`);
    const consumed = await supabaseFetchJson(env, '/rest/v1/rpc/forms_consume_code', {
      method: 'POST', body: JSON.stringify({ p_id: challengeId, p_email: email, p_hash: codeHash }),
    });
    if (!consumed) return errorResponse(401, 'Invalid or expired code.');

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
    return errorResponse(500, 'Unable to verify code.');
  }
}
