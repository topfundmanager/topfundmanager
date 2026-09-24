import { errorResponse, jsonResponse, requireSession, supabaseFetchJson } from '../utils.js';

const LIVE_PAGES = Object.freeze({
  ghicontractors: 'https://ghicontractors.com/',
  jccaring: 'https://jccaring.com/',
  nocostnurse: 'https://nocostnurse.com/',
  theregurus: 'https://theregurus.com/',
  topfundmanager: 'https://topfundmanager.com/',
  topfundinjury: 'https://topfundinjury.com/en',
});

const noStore = { 'Cache-Control': 'private, no-store' };

const publicationStatus = (profile) => ({
  siteId: profile.site_id,
  revision: profile.published_revision,
  publishedAt: profile.published_at,
  publishedBy: profile.published_by,
  liveVerified: profile.live_verified_revision === profile.published_revision &&
    Boolean(profile.live_verified_at),
  liveVerifiedAt: profile.live_verified_at,
  liveError: profile.live_verification_error,
  liveUrl: LIVE_PAGES[profile.site_id],
});

const getProfile = async (env, siteId) => {
  const rows = await supabaseFetchJson(
    env,
    `/rest/v1/site_seo_profiles?select=site_id,site_url,canonical_url,management_status,revision,published_revision,published_at,published_by,live_verified_revision,live_verified_at,live_verification_error&site_id=eq.${encodeURIComponent(siteId)}&limit=1`
  );
  return rows?.[0] || null;
};

const verifyLive = async (env, siteId, revision) => {
  let liveError = null;
  let liveVerifiedAt = null;
  try {
    const response = await fetch(LIVE_PAGES[siteId], {
      headers: { Accept: 'text/html' },
      redirect: 'follow',
      signal: AbortSignal.timeout(8000),
    });
    const finalUrl = new URL(response.url || LIVE_PAGES[siteId]);
    const expectedHost = new URL(LIVE_PAGES[siteId]).hostname;
    if (finalUrl.hostname !== expectedHost && finalUrl.hostname !== `www.${expectedHost}`) {
      throw new Error('The site redirected to an unexpected domain.');
    }
    if (!response.ok || !(response.headers.get('content-type') || '').includes('text/html')) {
      throw new Error(`The live homepage returned HTTP ${response.status}.`);
    }
    const html = await response.text();
    const marker = html.match(/<meta\b[^>]*\bname=["']seo-publication-revision["'][^>]*>/i)?.[0];
    const liveRevision = marker?.match(/\bcontent=["'](\d+)["']/i)?.[1];
    if (liveRevision !== String(revision)) {
      throw new Error('The live homepage does not yet serve this published revision.');
    }
    liveVerifiedAt = new Date().toISOString();
  } catch (error) {
    liveError = String(error.message || error).slice(0, 300);
  }

  try {
    await supabaseFetchJson(
      env,
      `/rest/v1/site_seo_profiles?site_id=eq.${encodeURIComponent(siteId)}&published_revision=eq.${revision}`,
      {
        method: 'PATCH',
        headers: { Prefer: 'return=minimal' },
        body: JSON.stringify({
          live_verified_revision: liveVerifiedAt ? revision : null,
          live_verified_at: liveVerifiedAt,
          live_verification_error: liveError,
        }),
      }
    );
  } catch (error) {
    console.error('Could not save live SEO verification:', error);
  }
  return { liveVerified: Boolean(liveVerifiedAt), liveVerifiedAt, liveError };
};

export async function onRequestPost({ request, env }) {
  try {
    const session = await requireSession(request, env);
    if (!session) return errorResponse(401, 'Unauthorized', noStore);
    const body = await request.json().catch(() => ({}));
    const siteId = typeof body.siteId === 'string' ? body.siteId.trim() : '';
    if (!Object.hasOwn(LIVE_PAGES, siteId)) {
      return errorResponse(400, 'This site has no configured SEO publisher.', noStore);
    }
    const action = body.action || 'publish';
    if (!['publish', 'verify'].includes(action)) {
      return errorResponse(400, 'Invalid publication action.', noStore);
    }
    const profile = await getProfile(env, siteId);
    if (!profile) return errorResponse(404, 'SEO profile not found.', noStore);

    if (action === 'publish') {
      const requestedRevision = Number(body.revision);
      if (!Number.isSafeInteger(requestedRevision) || requestedRevision !== profile.revision) {
        return errorResponse(409, 'The profile changed. Reload it before publishing.', noStore);
      }
      if (profile.management_status !== 'ready') {
        return errorResponse(400, 'Set this profile to Ready for site deployment before publishing.', noStore);
      }
      const allowedHost = new URL(LIVE_PAGES[siteId]).hostname;
      const allowedHosts = new Set([allowedHost, `www.${allowedHost}`]);
      if (![profile.site_url, profile.canonical_url].every((value) => {
        try {
          const url = new URL(value);
          return url.protocol === 'https:' && allowedHosts.has(url.hostname);
        } catch { return false; }
      })) {
        return errorResponse(400, 'Site and canonical URLs must use HTTPS on the connected domain.', noStore);
      }
      const result = await supabaseFetchJson(env, '/rest/v1/rpc/publish_site_seo', {
        method: 'POST',
        body: JSON.stringify({
          p_site_id: siteId,
          p_revision: requestedRevision,
          p_actor: session.email,
        }),
      });
      profile.published_at = result?.[0]?.published_at || new Date().toISOString();
    } else if (!profile.published_revision) {
      return errorResponse(409, 'Publish a profile before checking the live site.', noStore);
    }

    const revision = action === 'publish' ? profile.revision : profile.published_revision;
    const verification = await verifyLive(env, siteId, revision);
    return jsonResponse({
      success: true,
      publication: {
        ...publicationStatus({
          ...profile,
          published_revision: revision,
          published_at: profile.published_at,
          published_by: action === 'publish' ? session.email : profile.published_by,
          live_verified_revision: verification.liveVerified ? revision : null,
          live_verified_at: verification.liveVerifiedAt,
          live_verification_error: verification.liveError,
        }),
      },
    }, 200, noStore);
  } catch (error) {
    console.error('SEO publish failed:', error);
    return errorResponse(500, 'Unable to publish or verify SEO.', noStore);
  }
}
