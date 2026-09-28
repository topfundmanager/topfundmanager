import assert from 'node:assert/strict';
import test from 'node:test';

import { onRequest } from '../functions/_middleware.js';

const request = async (pathname, method = 'GET') => {
  let reachedSite = false;
  const response = await onRequest({
    request: new Request(`https://topfundmanager.com${pathname}`, { method }),
    env: {},
    next: async () => {
      reachedSite = true;
      return new Response('site');
    },
  });
  return { status: response.status, reachedSite };
};

test('repository internals return 404 without reaching the site', async () => {
  const internalPaths = [
    '/supabase/migrations/202606170001_forms_portal_primary_schema.sql',
    '/tests/seo-publishing.test.mjs',
    '/workers/inquiry-summary-cron.js',
    '/site-connectors/cloudflare-pages/_middleware.js',
    '/wrangler.toml',
    '/wrangler.inquiry-summary.toml',
    '/package.json',
    '/DEPLOYMENT.md',
    '/SEO-PUBLISHING.md',
    '/.gitignore',
    '//supabase/migrations/x.sql',
    '/Supabase/migrations/x.sql',
    '/supabase%2Fmigrations%2Fx.sql',
    '/%2e%2e/wrangler.toml',
  ];

  for (const path of internalPaths) {
    const result = await request(path);
    assert.equal(result.status, 404, path);
    assert.equal(result.reachedSite, false, path);
  }

  assert.equal((await request('/wrangler.toml', 'HEAD')).status, 404);
  assert.equal((await request('/package.json', 'POST')).status, 404);
});

test('site pages, assets, and APIs still pass through', async () => {
  const publicPaths = [
    '/1-on-1-experience.html',
    '/get-a-cash-offer-now.html',
    '/assets/css/form.css',
    '/forms/',
    '/forms/forms.js',
    '/api/forms/me',
    '/api/seo/nocostnurse/published',
    '/.well-known/security.txt',
    '/testimonials.html',
  ];

  for (const path of publicPaths) {
    const result = await request(path);
    assert.equal(result.reachedSite, true, path);
  }
});
