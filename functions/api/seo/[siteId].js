import { errorResponse, jsonResponse, supabaseFetchJson } from '../forms/utils.js';

const PUBLIC_HEADERS = {
  'Access-Control-Allow-Origin': '*',
  'Cache-Control': 'public, max-age=300, stale-while-revalidate=3600',
};

export async function onRequestGet({ env, params }) {
  try {
    const siteId = String(params?.siteId || '').trim();
    if (!/^[a-z0-9][a-z0-9_-]{1,63}$/.test(siteId)) {
      return errorResponse(400, 'Invalid site ID.', PUBLIC_HEADERS);
    }

    const profiles = await supabaseFetchJson(
      env,
      `/rest/v1/site_seo_profiles?select=*&site_id=eq.${encodeURIComponent(siteId)}&management_status=eq.ready&limit=1`
    );
    if (!profiles?.length) {
      return errorResponse(404, 'SEO profile not found.', PUBLIC_HEADERS);
    }

    const profile = profiles[0];
    return jsonResponse({
      siteId: profile.site_id,
      revision: profile.revision,
      updatedAt: profile.updated_at,
      siteUrl: profile.site_url,
      seo: {
        title: profile.seo_title,
        description: profile.meta_description,
        canonical: profile.canonical_url,
        robots: profile.robots_directive,
        language: profile.language_code,
      },
      social: {
        openGraph: {
          title: profile.og_title,
          description: profile.og_description,
          image: profile.og_image_url,
        },
        twitter: {
          card: profile.twitter_card,
          title: profile.twitter_title,
          description: profile.twitter_description,
          image: profile.twitter_image_url,
        },
      },
      entity: {
        type: profile.entity_type,
        name: profile.entity_name,
        description: profile.entity_description,
        audience: profile.audience,
        services: profile.services,
        serviceAreas: profile.service_areas,
        searchTopics: profile.search_topics,
        sameAs: profile.same_as,
        faqs: profile.faqs,
      },
      structuredData: profile.structured_data,
      aiDiscovery: {
        summary: profile.llms_summary,
        keyFacts: profile.llms_key_facts,
        crawlerPolicy: profile.ai_crawler_policy,
      },
    }, 200, PUBLIC_HEADERS);
  } catch (error) {
    return errorResponse(500, error.message || 'Unable to load SEO profile.', PUBLIC_HEADERS);
  }
}
