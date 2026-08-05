import { supabaseFetchJson } from '../../forms/utils.js';

const TEXT_HEADERS = {
  'Content-Type': 'text/plain; charset=utf-8',
  'Access-Control-Allow-Origin': '*',
  'Cache-Control': 'public, max-age=300, stale-while-revalidate=3600',
};

export async function onRequestGet({ env, params }) {
  try {
    const siteId = String(params?.siteId || '').trim();
    if (!/^[a-z0-9][a-z0-9_-]{1,63}$/.test(siteId)) {
      return new Response('Invalid site ID.\n', { status: 400, headers: TEXT_HEADERS });
    }

    const profiles = await supabaseFetchJson(
      env,
      `/rest/v1/site_seo_profiles?select=site_url,ai_crawler_policy&site_id=eq.${encodeURIComponent(siteId)}&management_status=eq.ready&limit=1`
    );
    if (!profiles?.length) {
      return new Response('SEO profile not found.\n', { status: 404, headers: TEXT_HEADERS });
    }

    const profile = profiles[0];
    const policy = profile.ai_crawler_policy || {};
    const blocks = ['User-agent: *', policy.default === 'disallow' ? 'Disallow: /' : 'Allow: /'];

    Object.entries(policy).forEach(([crawler, directive]) => {
      if (crawler === 'default') return;
      blocks.push('', `User-agent: ${crawler}`, directive === 'disallow' ? 'Disallow: /' : 'Allow: /');
    });

    const siteUrl = String(profile.site_url || '').replace(/\/$/, '');
    if (siteUrl) blocks.push('', `Sitemap: ${siteUrl}/sitemap.xml`);

    return new Response(`${blocks.join('\n')}\n`, { status: 200, headers: TEXT_HEADERS });
  } catch {
    return new Response('Unable to load SEO profile.\n', { status: 500, headers: TEXT_HEADERS });
  }
}
