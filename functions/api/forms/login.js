import {
  buildCodeEmail,
  errorResponse,
  generateCode,
  getRequestMeta,
  isAllowedAdmin,
  jsonResponse,
  normalizeEmail,
  sendResendEmail,
  supabaseFetchJson,
  hashString,
} from './utils.js';

export async function onRequestPost({ request, env }) {
  try {
    const body = await request.json();
    const email = normalizeEmail(body?.email);

    if (!email) {
      return errorResponse(400, 'Email is required.');
    }

    if (!isAllowedAdmin(email, env)) {
      return errorResponse(403, 'Email is not authorized.');
    }

    const code = generateCode();
    const challengeId = crypto.randomUUID();
    const expiresMinutes = Number.parseInt(env.FORMS_CODE_TTL_MINUTES || '10', 10);
    const expiresAt = new Date(Date.now() + expiresMinutes * 60 * 1000).toISOString();
    const { ip, userAgent } = getRequestMeta(request);

    const codeHash = await hashString(`code:${code}:${email}:${challengeId}`);

    const issued = await supabaseFetchJson(env, '/rest/v1/rpc/forms_issue_code', {
      method: 'POST', body: JSON.stringify({p_id:challengeId,p_email:email,p_hash:codeHash,p_expires:expiresAt,p_ip:ip,p_agent:userAgent}),
    });
    if (!issued) return errorResponse(429, 'Too many login codes requested. Try again later.');

    const fromEmail = env.FORMS_FROM_EMAIL || env.FROM_EMAIL || 'noreply@updates.topfundmanager.com';
    const subject = 'Your Forms Admin Code';
    const html = buildCodeEmail({ code, expiresMinutes, ip, userAgent });

    await sendResendEmail(env, {
      from: fromEmail,
      to: email,
      subject,
      html,
      replyTo: fromEmail,
    });

    return jsonResponse({
      success: true,
      challengeId,
      expiresInMinutes: expiresMinutes,
    });
  } catch (error) {
    return errorResponse(500, 'Unable to send code.');
  }
}
