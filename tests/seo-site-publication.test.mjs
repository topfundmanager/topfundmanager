import assert from 'node:assert/strict';
import test from 'node:test';

import { onRequestPost as publishSeo } from '../functions/api/forms/seo/publish.js';
import { onRequestGet as getPublishedSeo } from '../functions/api/seo/[siteId]/published.js';
import { onRequestGet as getPublishedLlms } from '../functions/api/seo/[siteId]/published/llms.txt.js';
import { onRequestGet as getPublishedRobots } from '../functions/api/seo/[siteId]/published/robots.txt.js';
import { buildPublishedHead } from '../functions/seo-head.js';

const env = {
  SUPABASE_URL: 'https://example.supabase.co',
  SUPABASE_SERVICE_ROLE_KEY: 'test-key',
};

const json = (value, status = 200) => new Response(JSON.stringify(value), {
  status,
  headers: { 'Content-Type': 'application/json' },
});

const snapshot = {
  site_id: 'jccaring', site_url: 'https://jccaring.com/', revision: 8,
  seo_title: 'JC Caring published title', meta_description: 'Published description',
  canonical_url: 'https://jccaring.com/', robots_directive: 'index, follow',
  language_code: 'en', og_title: 'Social title', og_description: 'Social description',
  og_image_url: 'https://jccaring.com/social.jpg', twitter_card: 'summary_large_image',
  twitter_title: 'Social title', twitter_description: 'Social description',
  twitter_image_url: 'https://jccaring.com/social.jpg', entity_type: 'MedicalBusiness',
  entity_name: 'JC Caring', entity_description: 'Pediatric home nursing',
  audience: ['Georgia families'], services: ['Nursing'], service_areas: ['Georgia'],
  search_topics: ['Pediatric nursing'], same_as: [], faqs: [],
  structured_data: { '@context': 'https://schema.org', '@type': 'MedicalBusiness' },
  llms_summary: 'JC Caring supports Georgia families.', llms_key_facts: ['Serves Georgia'],
  ai_crawler_policy: { default: 'allow', GPTBot: 'allow' },
};

test('published delivery endpoints serve the frozen revision, not later edits', async () => {
  const originalFetch = globalThis.fetch;
  globalThis.fetch = async () => json([{
    published_snapshot: snapshot,
    published_revision: 8,
    published_at: '2026-09-24T00:00:00Z',
  }]);
  try {
    const params = { siteId: 'jccaring' };
    const response = await getPublishedSeo({ env, params });
    const body = await response.json();
    assert.equal(response.status, 200);
    assert.equal(body.revision, 8);
    assert.equal(body.seo.title, 'JC Caring published title');
    assert.equal(response.headers.get('x-seo-revision'), '8');
    assert.match(await (await getPublishedLlms({ env, params })).text(), /# JC Caring/);
    assert.match(await (await getPublishedRobots({ env, params })).text(), /User-agent: GPTBot/);
  } finally {
    globalThis.fetch = originalFetch;
  }
});

test('published HTML head escapes text and emits a verifiable revision', () => {
  const head = buildPublishedHead({
    revision: 8,
    seo: { title: 'JC Caring & friends', description: 'Care <at home>', canonical: 'https://jccaring.com/' },
    social: { openGraph: {}, twitter: {} },
    entity: { name: 'JC Caring', faqs: [] },
    structuredData: { '@context': 'https://schema.org', description: '</script><script>alert(1)</script>' },
  });
  assert.match(head, /<title>JC Caring &amp; friends<\/title>/);
  assert.match(head, /Care &lt;at home&gt;/);
  assert.match(head, /name="seo-publication-revision" content="8"/);
  assert.doesNotMatch(head, /<script>alert\(1\)<\/script>/);
});

test('publish requires current ready revision and verifies the live marker', async () => {
  const originalFetch = globalThis.fetch;
  const calls = [];
  let profile = {
    site_id: 'jccaring', site_url: 'https://jccaring.com/',
    canonical_url: 'https://jccaring.com/', management_status: 'ready',
    revision: 8, published_revision: null, published_at: null, published_by: null,
    live_verified_revision: null, live_verified_at: null, live_verification_error: null,
  };
  globalThis.fetch = async (url, init = {}) => {
    const parsed = new URL(url);
    calls.push({ url: String(url), init });
    if (parsed.hostname === 'jccaring.com') return new Response(
      '<html><head><meta name="seo-publication-revision" content="8"></head></html>',
      { headers: { 'Content-Type': 'text/html' } }
    );
    if (parsed.pathname === '/rest/v1/forms_sessions' && init.method === 'PATCH') {
      return new Response(null, { status: 204 });
    }
    if (parsed.pathname === '/rest/v1/forms_sessions') {
      return json([{ id: 'session', email: 'admin@example.com', expires_at: '2099-01-01T00:00:00Z' }]);
    }
    if (parsed.pathname === '/rest/v1/site_seo_profiles') {
      if (init.method === 'PATCH') return new Response(null, { status: 204 });
      return json([profile]);
    }
    if (parsed.pathname === '/rest/v1/rpc/publish_site_seo') {
      return json([{ published_revision: 8, published_at: '2026-09-24T00:00:00Z' }]);
    }
    throw new Error(`Unexpected request: ${url}`);
  };
  try {
    const request = (revision) => new Request('https://topfundmanager.com/api/forms/seo/publish', {
      method: 'POST',
      headers: { Cookie: 'tfm_forms_session=session-token', 'Content-Type': 'application/json' },
      body: JSON.stringify({ siteId: 'jccaring', revision }),
    });
    const stale = await publishSeo({ request: request(7), env });
    assert.equal(stale.status, 409);
    assert.equal(calls.filter((call) => call.url.includes('publish_site_seo')).length, 0);

    const published = await publishSeo({ request: request(8), env });
    const body = await published.json();
    assert.equal(published.status, 200);
    assert.equal(body.publication.revision, 8);
    assert.equal(body.publication.liveVerified, true);
    assert.equal(calls.filter((call) => call.url.includes('publish_site_seo')).length, 1);
    assert.equal(calls.filter((call) => call.url.startsWith('https://jccaring.com/')).length, 1);
  } finally {
    globalThis.fetch = originalFetch;
  }
});
