import { errorResponse, jsonResponse, requireSession, supabaseFetchJson } from './utils.js';

export async function onRequestGet({ request, env }) {
  try {
    const session = await requireSession(request, env);
    if (!session) {
      return errorResponse(401, 'Unauthorized');
    }

    const sites = await supabaseFetchJson(env, '/rest/v1/forms_sites?select=site_id,site_name,allowed_origins&order=site_id.asc');

    return jsonResponse({ success: true, sites });
  } catch (error) {
    return errorResponse(500, error.message || 'Unable to load sites.');
  }
}
