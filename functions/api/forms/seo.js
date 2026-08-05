import { errorResponse, jsonResponse, requireSession, supabaseFetchJson } from './utils.js';

const MAX_LIST_ITEMS = 40;
const EDITABLE_FIELDS = [
  'site_url',
  'management_status',
  'seo_title',
  'meta_description',
  'canonical_url',
  'robots_directive',
  'language_code',
  'og_title',
  'og_description',
  'og_image_url',
  'twitter_card',
  'twitter_title',
  'twitter_description',
  'twitter_image_url',
  'entity_type',
  'entity_name',
  'entity_description',
  'audience',
  'services',
  'service_areas',
  'search_topics',
  'same_as',
  'faqs',
  'structured_data',
  'llms_summary',
  'llms_key_facts',
  'ai_crawler_policy',
];

const STRING_LIMITS = {
  site_url: 500,
  management_status: 20,
  seo_title: 160,
  meta_description: 500,
  canonical_url: 500,
  robots_directive: 200,
  language_code: 20,
  og_title: 200,
  og_description: 500,
  og_image_url: 500,
  twitter_card: 50,
  twitter_title: 200,
  twitter_description: 500,
  twitter_image_url: 500,
  entity_type: 100,
  entity_name: 200,
  entity_description: 1200,
  llms_summary: 4000,
};

const URL_FIELDS = new Set([
  'site_url',
  'canonical_url',
  'og_image_url',
  'twitter_image_url',
]);

const LIST_FIELDS = new Set([
  'audience',
  'services',
  'service_areas',
  'search_topics',
  'same_as',
  'llms_key_facts',
]);

function cleanString(value, field) {
  if (typeof value !== 'string') {
    throw new Error(`${field} must be text.`);
  }

  const cleaned = value.trim();
  const maxLength = STRING_LIMITS[field] || 500;
  if (cleaned.length > maxLength) {
    throw new Error(`${field} must be ${maxLength} characters or fewer.`);
  }
  return cleaned;
}

function validateUrl(value, field) {
  const cleaned = cleanString(value, field);
  if (!cleaned) return '';

  let parsed;
  try {
    parsed = new URL(cleaned);
  } catch {
    throw new Error(`${field} must be a valid URL.`);
  }

  if (!['http:', 'https:'].includes(parsed.protocol)) {
    throw new Error(`${field} must use http or https.`);
  }
  return parsed.toString();
}

function cleanList(value, field) {
  if (!Array.isArray(value)) {
    throw new Error(`${field} must be a list.`);
  }
  if (value.length > MAX_LIST_ITEMS) {
    throw new Error(`${field} can contain at most ${MAX_LIST_ITEMS} items.`);
  }

  return value.map((item) => {
    if (typeof item !== 'string') {
      throw new Error(`${field} items must be text.`);
    }
    const cleaned = item.trim();
    if (!cleaned || cleaned.length > 500) {
      throw new Error(`${field} items must contain 1 to 500 characters.`);
    }
    if (field === 'same_as') {
      return validateUrl(cleaned, field);
    }
    return cleaned;
  });
}

function cleanFaqs(value) {
  if (!Array.isArray(value) || value.length > 30) {
    throw new Error('faqs must be a list with no more than 30 entries.');
  }

  return value.map((faq) => {
    if (!faq || typeof faq !== 'object' || Array.isArray(faq)) {
      throw new Error('Each FAQ must include a question and answer.');
    }
    const question = String(faq.question || '').trim();
    const answer = String(faq.answer || '').trim();
    if (!question || !answer || question.length > 300 || answer.length > 2000) {
      throw new Error('FAQ questions and answers are required and must fit the allowed length.');
    }
    return { question, answer };
  });
}

function cleanJsonValue(value, field) {
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    throw new Error(`${field} must be a JSON object.`);
  }
  const serialized = JSON.stringify(value);
  if (serialized.length > 50000) {
    throw new Error(`${field} is too large.`);
  }
  return value;
}

function normalizeProfile(input) {
  if (!input || typeof input !== 'object' || Array.isArray(input)) {
    throw new Error('profile is required.');
  }

  const normalized = {};
  EDITABLE_FIELDS.forEach((field) => {
    if (!Object.prototype.hasOwnProperty.call(input, field)) return;

    if (URL_FIELDS.has(field)) {
      normalized[field] = validateUrl(input[field], field);
    } else if (LIST_FIELDS.has(field)) {
      normalized[field] = cleanList(input[field], field);
    } else if (field === 'faqs') {
      normalized[field] = cleanFaqs(input[field]);
    } else if (field === 'structured_data' || field === 'ai_crawler_policy') {
      normalized[field] = cleanJsonValue(input[field], field);
    } else {
      normalized[field] = cleanString(input[field], field);
    }
  });

  if (normalized.management_status && !['draft', 'ready'].includes(normalized.management_status)) {
    throw new Error('management_status must be draft or ready.');
  }

  if (normalized.twitter_card && !['summary', 'summary_large_image'].includes(normalized.twitter_card)) {
    throw new Error('twitter_card must be summary or summary_large_image.');
  }

  return normalized;
}

export async function onRequestGet({ request, env }) {
  try {
    const session = await requireSession(request, env);
    if (!session) return errorResponse(401, 'Unauthorized');

    const profiles = await supabaseFetchJson(
      env,
      '/rest/v1/site_seo_profiles?select=*&order=site_id.asc'
    );
    const sites = await supabaseFetchJson(
      env,
      '/rest/v1/forms_sites?select=site_id,site_name&order=site_id.asc'
    );
    const siteNames = new Map((sites || []).map((site) => [site.site_id, site.site_name]));

    return jsonResponse({
      success: true,
      profiles: (profiles || []).map((profile) => ({
        ...profile,
        site_name: siteNames.get(profile.site_id) || profile.site_id,
      })),
    });
  } catch (error) {
    return errorResponse(500, error.message || 'Unable to load SEO profiles.');
  }
}

export async function onRequestPut({ request, env }) {
  try {
    const session = await requireSession(request, env);
    if (!session) return errorResponse(401, 'Unauthorized');

    const body = await request.json();
    const siteId = typeof body?.siteId === 'string' ? body.siteId.trim() : '';
    if (!/^[a-z0-9][a-z0-9_-]{1,63}$/.test(siteId)) {
      return errorResponse(400, 'A valid siteId is required.');
    }

    const sites = await supabaseFetchJson(
      env,
      `/rest/v1/forms_sites?select=site_id&site_id=eq.${encodeURIComponent(siteId)}&limit=1`
    );
    if (!sites?.length) return errorResponse(404, 'Site not found.');

    const existing = await supabaseFetchJson(
      env,
      `/rest/v1/site_seo_profiles?select=revision,source_snapshot,source_checked_at&site_id=eq.${encodeURIComponent(siteId)}&limit=1`
    );
    const normalized = normalizeProfile(body.profile);
    const now = new Date().toISOString();
    const payload = {
      site_id: siteId,
      ...normalized,
      revision: Number(existing?.[0]?.revision || 0) + 1,
      source_snapshot: existing?.[0]?.source_snapshot || {},
      source_checked_at: existing?.[0]?.source_checked_at || null,
      updated_by: session.email,
      updated_at: now,
    };

    const saved = await supabaseFetchJson(
      env,
      '/rest/v1/site_seo_profiles?on_conflict=site_id',
      {
        method: 'POST',
        headers: { Prefer: 'resolution=merge-duplicates,return=representation' },
        body: JSON.stringify(payload),
      }
    );

    return jsonResponse({ success: true, profile: saved?.[0] || payload });
  } catch (error) {
    const message = error.message || 'Unable to save SEO profile.';
    const status = message.startsWith('Supabase error:') ? 500 : 400;
    return errorResponse(status, message);
  }
}
