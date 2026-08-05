import { supabaseFetchJson } from '../../forms/utils.js';

const TEXT_HEADERS = {
  'Content-Type': 'text/plain; charset=utf-8',
  'Access-Control-Allow-Origin': '*',
  'Cache-Control': 'public, max-age=300, stale-while-revalidate=3600',
};

const safeText = (value) => String(value || '').replace(/[\u0000-\u001f\u007f]/g, ' ').trim();

function listSection(title, values) {
  if (!Array.isArray(values) || values.length === 0) return '';
  return `\n## ${title}\n${values.map((value) => `- ${safeText(value)}`).join('\n')}\n`;
}

export async function onRequestGet({ env, params }) {
  try {
    const siteId = String(params?.siteId || '').trim();
    if (!/^[a-z0-9][a-z0-9_-]{1,63}$/.test(siteId)) {
      return new Response('Invalid site ID.\n', { status: 400, headers: TEXT_HEADERS });
    }

    const profiles = await supabaseFetchJson(
      env,
      `/rest/v1/site_seo_profiles?select=*&site_id=eq.${encodeURIComponent(siteId)}&management_status=eq.ready&limit=1`
    );
    if (!profiles?.length) {
      return new Response('SEO profile not found.\n', { status: 404, headers: TEXT_HEADERS });
    }

    const profile = profiles[0];
    const faqSection = Array.isArray(profile.faqs) && profile.faqs.length
      ? `\n## Frequently asked questions\n${profile.faqs.map((faq) => `### ${safeText(faq.question)}\n${safeText(faq.answer)}`).join('\n\n')}\n`
      : '';

    const content = [
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
    ].filter(Boolean).join('\n');

    return new Response(`${content.trim()}\n`, { status: 200, headers: TEXT_HEADERS });
  } catch (error) {
    return new Response('Unable to load SEO profile.\n', { status: 500, headers: TEXT_HEADERS });
  }
}
