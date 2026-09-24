import { buildPublishedRobots, getPublishedProfile, isSiteId, TEXT_HEADERS } from '../../published-utils.js';

export async function onRequestGet({ env, params }) {
  const siteId = String(params?.siteId || '').trim();
  if (!isSiteId(siteId)) return new Response('Invalid site ID.\n', { status: 400, headers: TEXT_HEADERS });
  try {
    const profile = await getPublishedProfile(env, siteId);
    if (!profile) return new Response('Site has no published SEO profile.\n', { status: 404, headers: TEXT_HEADERS });
    return new Response(buildPublishedRobots(profile), {
      status: 200,
      headers: { ...TEXT_HEADERS, 'X-SEO-Revision': String(profile.revision) },
    });
  } catch (error) {
    console.error('Published robots.txt read failed:', error);
    return new Response('Unable to load published SEO profile.\n', { status: 500, headers: TEXT_HEADERS });
  }
}
