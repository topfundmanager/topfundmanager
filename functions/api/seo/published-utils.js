import { supabaseFetchJson } from '../forms/utils.js';

export const PUBLIC_HEADERS = {
  'Access-Control-Allow-Origin': '*',
  'Cache-Control': 'no-store, no-cache, must-revalidate',
  'CDN-Cache-Control': 'no-store',
  'Cloudflare-CDN-Cache-Control': 'no-store',
};

export const TEXT_HEADERS = {
  ...PUBLIC_HEADERS,
  'Content-Type': 'text/plain; charset=utf-8',
};

export const isSiteId = (siteId) => /^[a-z0-9][a-z0-9_-]{1,63}$/.test(siteId);

export const getPublishedProfile = async (env, siteId) => {
  const rows = await supabaseFetchJson(
    env,
    `/rest/v1/site_seo_profiles?select=published_snapshot,published_revision,published_at&site_id=eq.${encodeURIComponent(siteId)}&limit=1`
  );
  const row = rows?.[0];
  if (!row?.published_snapshot || !row.published_revision) return null;
  return {
    ...row.published_snapshot,
    revision: row.published_revision,
    published_at: row.published_at,
  };
};

export const toPublishedPayload = (profile) => ({
  siteId: profile.site_id,
  revision: profile.revision,
  publishedAt: profile.published_at,
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
});

const safeText = (value) => String(value || '').replace(/[\u0000-\u001f\u007f]/g, ' ').trim();

const listSection = (title, values) => {
  if (!Array.isArray(values) || values.length === 0) return '';
  return `\n## ${title}\n${values.map((value) => `- ${safeText(value)}`).join('\n')}\n`;
};

export const buildPublishedLlms = (profile) => {
  const faqSection = Array.isArray(profile.faqs) && profile.faqs.length
    ? `\n## Frequently asked questions\n${profile.faqs.map((faq) => `### ${safeText(faq.question)}\n${safeText(faq.answer)}`).join('\n\n')}\n`
    : '';

  return `${[
    `# ${safeText(profile.entity_name || profile.site_id)}`,
    '',
    `> ${safeText(profile.llms_summary || profile.entity_description)}`,
    '',
    `Canonical site: ${safeText(profile.canonical_url || profile.site_url)}`,
    `Entity type: ${safeText(profile.entity_type)}`,
    listSection('Key facts', profile.llms_key_facts),
    listSection('Services', profile.services),
    listSection('Service areas', profile.service_areas),
    listSection('Topics', profile.search_topics),
    listSection('Official profiles', profile.same_as),
    faqSection,
  ].filter(Boolean).join('\n').trim()}\n`;
};

export const buildPublishedRobots = (profile) => {
  const policy = profile.ai_crawler_policy || {};
  const blocks = ['User-agent: *', policy.default === 'disallow' ? 'Disallow: /' : 'Allow: /'];
  Object.entries(policy).forEach(([crawler, directive]) => {
    if (crawler !== 'default') {
      blocks.push('', `User-agent: ${crawler}`, directive === 'disallow' ? 'Disallow: /' : 'Allow: /');
    }
  });
  const siteUrl = String(profile.site_url || '').replace(/\/$/, '');
  if (siteUrl) blocks.push('', `Sitemap: ${siteUrl}/sitemap.xml`);
  return `${blocks.join('\n')}\n`;
};
