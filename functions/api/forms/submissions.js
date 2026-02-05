import { errorResponse, jsonResponse, requireSession, supabaseFetchJson } from './utils.js';

export async function onRequestGet({ request, env }) {
  try {
    const session = await requireSession(request, env);
    if (!session) {
      return errorResponse(401, 'Unauthorized');
    }

    const url = new URL(request.url);
    const limitParam = url.searchParams.get('limit') || '50';
    const siteId = url.searchParams.get('siteId');
    const limit = Math.min(Math.max(Number.parseInt(limitParam, 10) || 50, 1), 200);

    let query = `/rest/v1/forms_submissions?select=id,site_id,form_id,submitted_at,origin,ip,page_url,referrer,data&order=submitted_at.desc&limit=${limit}`;

    if (siteId) {
      query += `&site_id=eq.${encodeURIComponent(siteId)}`;
    }

    const submissions = await supabaseFetchJson(env, query);

    return jsonResponse({ success: true, submissions });
  } catch (error) {
    return errorResponse(500, error.message || 'Unable to load submissions.');
  }
}
