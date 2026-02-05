import {
  clearSessionCookie,
  errorResponse,
  getSessionCookieName,
  jsonResponse,
  parseCookies,
  supabaseFetchJson,
  hashString,
} from './utils.js';

export async function onRequestPost({ request, env }) {
  try {
    const cookies = parseCookies(request.headers.get('cookie') || '');
    const token = cookies[getSessionCookieName(env)];

    if (token) {
      const tokenHash = await hashString(`session:${token}`);
      await supabaseFetchJson(env, `/rest/v1/forms_sessions?token_hash=eq.${encodeURIComponent(tokenHash)}`, {
        method: 'DELETE',
        headers: { Prefer: 'return=minimal' },
      });
    }

    return jsonResponse(
      { success: true },
      200,
      {
        'Set-Cookie': clearSessionCookie(env),
      }
    );
  } catch (error) {
    return errorResponse(500, error.message || 'Unable to log out.');
  }
}
