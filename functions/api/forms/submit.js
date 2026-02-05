import {
  buildCorsHeaders,
  errorResponse,
  getAllowedOrigins,
  getRequestMeta,
  jsonResponse,
  supabaseFetchJson,
} from './utils.js';

export async function onRequestOptions({ request }) {
  const origin = request.headers.get('origin') || '*';
  return new Response(null, {
    status: 204,
    headers: {
      'Access-Control-Allow-Origin': origin,
      'Access-Control-Allow-Methods': 'POST, OPTIONS',
      'Access-Control-Allow-Headers': 'Content-Type, X-Forms-Site-Key',
      'Access-Control-Max-Age': '86400',
      Vary: 'Origin',
    },
  });
}

export async function onRequestPost({ request, env }) {
  const initialOrigin = request.headers.get('origin') || '';
  let corsHeaders = initialOrigin
    ? { 'Access-Control-Allow-Origin': initialOrigin, Vary: 'Origin' }
    : {};

  try {
    const body = await request.json();
    const siteId = String(body?.siteId || '').trim();
    const formId = body?.formId ? String(body.formId).trim() : null;
    const data = body?.data;
    const meta = body?.meta || {};

    if (!siteId || !data) {
      return errorResponse(400, 'siteId and data are required.', corsHeaders);
    }

    const sites = await supabaseFetchJson(
      env,
      `/rest/v1/forms_sites?select=site_id,site_key,allowed_origins&site_id=eq.${encodeURIComponent(siteId)}&limit=1`
    );

    const site = sites?.[0];
    if (!site) {
      return errorResponse(401, 'Invalid site.', corsHeaders);
    }

    const allowedOrigins = getAllowedOrigins(site);
    const { origin, referrer, ip, userAgent } = getRequestMeta(request);
    corsHeaders = buildCorsHeaders(origin, allowedOrigins);

    const siteKey = request.headers.get('x-forms-site-key');
    if (!siteKey || siteKey !== site.site_key) {
      return errorResponse(401, 'Invalid site key.', corsHeaders);
    }

    if (allowedOrigins.length > 0 && origin && !allowedOrigins.includes(origin)) {
      return errorResponse(403, 'Origin not allowed.', corsHeaders);
    }

    await supabaseFetchJson(env, '/rest/v1/forms_submissions', {
      method: 'POST',
      headers: { Prefer: 'return=minimal' },
      body: JSON.stringify({
        site_id: siteId,
        form_id: formId,
        data,
        origin,
        ip,
        user_agent: userAgent,
        page_url: meta.pageUrl || null,
        referrer: meta.referrer || referrer || null,
      }),
    });

    return jsonResponse({ success: true }, 200, corsHeaders);
  } catch (error) {
    return errorResponse(500, error.message || 'Unable to accept submission.', corsHeaders);
  }
}
