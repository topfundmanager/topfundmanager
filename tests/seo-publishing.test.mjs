import assert from 'node:assert/strict';
import test from 'node:test';

import { onRequestPut } from '../functions/api/forms/seo.js';
import { onRequestGet as getSeoJson } from '../functions/api/seo/[siteId].js';
import { onRequestGet as getLlmsText } from '../functions/api/seo/[siteId]/llms.txt.js';
import { onRequestGet as getRobotsText } from '../functions/api/seo/[siteId]/robots.txt.js';

const env = {
  SUPABASE_URL: 'https://example.supabase.co',
  SUPABASE_SERVICE_ROLE_KEY: 'service-role-key',
};

const jsonResponse = (value, status = 200) => new Response(JSON.stringify(value), {
  status,
  headers: { 'Content-Type': 'application/json' },
});

const readyProfile = {
  site_id: 'jccaring',
  site_url: 'https://jccaring.com/',
  management_status: 'ready',
  seo_title: 'JC Caring title',
  meta_description: 'JC Caring description',
  canonical_url: 'https://jccaring.com/',
  robots_directive: 'index, follow',
  language_code: 'en',
  og_title: 'JC Caring social title',
  og_description: 'JC Caring social description',
  og_image_url: 'https://jccaring.com/social.jpg',
  twitter_card: 'summary_large_image',
  twitter_title: 'JC Caring social title',
  twitter_description: 'JC Caring social description',
  twitter_image_url: 'https://jccaring.com/social.jpg',
  entity_type: 'MedicalBusiness',
  entity_name: 'JC Caring',
  entity_description: 'Pediatric home nursing in Georgia.',
  audience: ['Georgia families'],
  services: ['Pediatric nursing'],
  service_areas: ['Georgia'],
  search_topics: ['pediatric home nursing'],
  same_as: [],
  faqs: [],
  structured_data: { '@context': 'https://schema.org', '@type': 'MedicalBusiness' },
  llms_summary: 'JC Caring provides pediatric home nursing in Georgia.',
  llms_key_facts: ['Serves Georgia families'],
  ai_crawler_policy: { default: 'allow', GPTBot: 'allow' },
  revision: 8,
  updated_at: '2026-09-22T18:00:00.000Z',
};

test('saving a ready profile updates managed endpoints without publishing the site', async () => {
  const originalFetch = globalThis.fetch;
  const writes = [];

  globalThis.fetch = async (url, init = {}) => {
    const parsed = new URL(url);
    if (parsed.pathname === '/rest/v1/forms_sessions' && (init.method || 'GET') === 'GET') {
      return jsonResponse([{ id: 'session', email: 'admin@example.com', expires_at: '2099-01-01T00:00:00Z' }]);
    }
    if (parsed.pathname === '/rest/v1/forms_sessions' && init.method === 'PATCH') {
      return new Response(null, { status: 204 });
    }
    if (parsed.pathname === '/rest/v1/forms_sites') {
      return jsonResponse([{ site_id: 'jccaring' }]);
    }
    if (parsed.pathname === '/rest/v1/site_seo_profiles' && (init.method || 'GET') === 'GET') {
      return jsonResponse([{ revision: 7, source_snapshot: {}, source_checked_at: null }]);
    }
    if (parsed.pathname === '/rest/v1/site_seo_profiles' && init.method === 'POST') {
      const payload = JSON.parse(init.body);
      writes.push(payload);
      return jsonResponse([{ ...payload }]);
    }
    return jsonResponse({ message: 'Unexpected request' }, 500);
  };

  try {
    const request = new Request('https://topfundmanager.com/api/forms/seo', {
      method: 'PUT',
      headers: {
        Cookie: 'tfm_forms_session=session-token',
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ siteId: 'jccaring', profile: readyProfile }),
    });
    const response = await onRequestPut({ request, env });
    const body = await response.json();

    assert.equal(response.status, 200);
    assert.equal(response.headers.get('cache-control'), 'no-store');
    assert.equal(writes.length, 1);
    assert.equal(writes[0].revision, 8);
    assert.equal(writes[0].updated_by, 'admin@example.com');
    assert.deepEqual(body.publication, {
      published: false,
      status: 'not_published',
      revision: null,
      savedRevision: 8,
      endpoints: {
        json: '/api/seo/jccaring',
        llms: '/api/seo/jccaring/llms.txt',
        robots: '/api/seo/jccaring/robots.txt',
      },
    });
  } finally {
    globalThis.fetch = originalFetch;
  }
});

test('managed JSON endpoint serves the current revision without caching', async () => {
  const originalFetch = globalThis.fetch;
  globalThis.fetch = async () => jsonResponse([readyProfile]);

  try {
    const response = await getSeoJson({ env, params: { siteId: 'jccaring' } });
    const body = await response.json();
    assert.equal(response.status, 200);
    assert.equal(body.revision, 8);
    assert.equal(response.headers.get('x-seo-revision'), '8');
    assert.match(response.headers.get('cache-control'), /no-store/);
    assert.equal(response.headers.get('cloudflare-cdn-cache-control'), 'no-store');
  } finally {
    globalThis.fetch = originalFetch;
  }
});

test('managed llms.txt and robots.txt expose the current revision without caching', async () => {
  const originalFetch = globalThis.fetch;
  globalThis.fetch = async (url) => {
    const parsed = new URL(url);
    return parsed.searchParams.get('select')?.includes('ai_crawler_policy,revision')
      ? jsonResponse([readyProfile])
      : jsonResponse([readyProfile]);
  };

  try {
    const llms = await getLlmsText({ env, params: { siteId: 'jccaring' } });
    const robots = await getRobotsText({ env, params: { siteId: 'jccaring' } });
    assert.equal(llms.status, 200);
    assert.equal(robots.status, 200);
    assert.equal(llms.headers.get('x-seo-revision'), '8');
    assert.equal(robots.headers.get('x-seo-revision'), '8');
    assert.match(llms.headers.get('cache-control'), /no-store/);
    assert.match(robots.headers.get('cache-control'), /no-store/);
    assert.match(await llms.text(), /# JC Caring/);
    assert.match(await robots.text(), /User-agent: GPTBot/);
  } finally {
    globalThis.fetch = originalFetch;
  }
});
