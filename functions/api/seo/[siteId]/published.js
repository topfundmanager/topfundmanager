import { errorResponse, jsonResponse } from '../../forms/utils.js';
import { getPublishedProfile, isSiteId, PUBLIC_HEADERS, toPublishedPayload } from '../published-utils.js';

export async function onRequestGet({ env, params }) {
  const siteId = String(params?.siteId || '').trim();
  if (!isSiteId(siteId)) return errorResponse(400, 'Invalid site ID.', PUBLIC_HEADERS);
  try {
    const profile = await getPublishedProfile(env, siteId);
    if (!profile) return errorResponse(404, 'Site has no published SEO profile.', PUBLIC_HEADERS);
    return jsonResponse(toPublishedPayload(profile), 200, {
      ...PUBLIC_HEADERS,
      'X-SEO-Revision': String(profile.revision),
    });
  } catch (error) {
    console.error('Published SEO read failed:', error);
    return errorResponse(500, 'Unable to load published SEO profile.', PUBLIC_HEADERS);
  }
}
