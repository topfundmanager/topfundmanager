import { applyPublishedHead } from './seo-head.js';

const SITE_IDS = Object.freeze({
  'ghicontractors.com': 'ghicontractors',
  'jccaring.com': 'jccaring',
  'nocostnurse.com': 'nocostnurse',
  'theregurus.com': 'theregurus',
});

const siteIdFor = (hostname) => SITE_IDS[hostname.replace(/^www\./, '')];

const publishedUrl = (siteId, suffix = '') =>
  `https://topfundmanager.com/api/seo/${siteId}/published${suffix}`;

const fetchPublished = (url) => fetch(url, {
  headers: { 'Cache-Control': 'no-cache' },
  cf: { cacheTtl: 0 },
  signal: AbortSignal.timeout(5000),
});

const unpublishedFallback = (path, context) => {
  if (path === '/robots.txt') {
    return new Response('User-agent: *\nAllow: /\n', {
      headers: { 'Content-Type': 'text/plain; charset=utf-8', 'Cache-Control': 'no-store' },
    });
  }
  if (path === '/llms.txt') {
    return new Response('No SEO profile has been published for this site.\n', {
      status: 404,
      headers: { 'Content-Type': 'text/plain; charset=utf-8', 'Cache-Control': 'no-store' },
    });
  }
  return context.next();
};

export async function onRequest(context) {
  if (context.request.method !== 'GET') return context.next();
  const url = new URL(context.request.url);
  const siteId = siteIdFor(url.hostname);
  if (!siteId || !['/', '/index.html', '/robots.txt', '/llms.txt'].includes(url.pathname)) {
    return context.next();
  }

  let source;
  try {
    source = await fetchPublished(publishedUrl(siteId,
      url.pathname === '/' || url.pathname === '/index.html' ? '' : url.pathname));
  } catch (error) {
    console.error(`SEO connector for ${siteId} could not load the published profile:`, error);
    return unpublishedFallback(url.pathname, context);
  }
  if (!source.ok) return unpublishedFallback(url.pathname, context);

  if (url.pathname === '/robots.txt' || url.pathname === '/llms.txt') {
    return new Response(source.body, {
      headers: { 'Content-Type': 'text/plain; charset=utf-8', 'Cache-Control': 'no-store' },
    });
  }

  let profile;
  try { profile = await source.json(); } catch { return unpublishedFallback(url.pathname, context); }
  if (profile.siteId !== siteId || !profile.revision || !profile.seo?.canonical) {
    return unpublishedFallback(url.pathname, context);
  }
  const response = await context.next();
  if (!response.ok || !(response.headers.get('content-type') || '').includes('text/html')) {
    return response;
  }
  return applyPublishedHead(response, profile);
}
