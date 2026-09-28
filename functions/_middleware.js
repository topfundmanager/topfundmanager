import {
  buildPublishedLlms,
  buildPublishedRobots,
  getPublishedProfile,
  toPublishedPayload,
} from './api/seo/published-utils.js';
import { applyPublishedHead } from './seo-head.js';

// The Pages build output is the repository root, so keep repository internals off the site.
const INTERNAL_PATH = /^\/(?:(?:supabase|tests|workers|site-connectors|node_modules)\/|\.(?!well-known\/)|package(?:-lock)?\.json$|wrangler(?:\.[\w-]+)?\.toml$)|\.md$/i;

const isInternalPath = (pathname) => {
  let path;
  try {
    path = decodeURIComponent(pathname);
  } catch {
    return true;
  }
  return INTERNAL_PATH.test(path.replace(/\/{2,}/g, '/'));
};

export async function onRequest(context) {
  const { request, env } = context;
  const path = new URL(request.url).pathname;
  if (isInternalPath(path)) {
    return new Response('Not Found', {
      status: 404,
      headers: {
        'Cache-Control': 'no-store',
        'Content-Type': 'text/plain; charset=utf-8',
        'X-Robots-Tag': 'noindex',
      },
    });
  }

  if (request.method !== 'GET') return context.next();
  if (!['/', '/index.html', '/llms.txt', '/robots.txt'].includes(path)) {
    return context.next();
  }

  let profile;
  try {
    profile = await getPublishedProfile(env, 'topfundmanager');
  } catch (error) {
    console.error('Published SEO lookup failed:', error);
    return context.next();
  }
  if (!profile) return context.next();

  if (path === '/llms.txt') return new Response(buildPublishedLlms(profile), {
    headers: { 'Content-Type': 'text/plain; charset=utf-8', 'Cache-Control': 'no-store' },
  });
  if (path === '/robots.txt') return new Response(buildPublishedRobots(profile), {
    headers: { 'Content-Type': 'text/plain; charset=utf-8', 'Cache-Control': 'no-store' },
  });

  const response = await context.next();
  if (!response.ok || !(response.headers.get('content-type') || '').includes('text/html')) return response;
  return applyPublishedHead(response, toPublishedPayload(profile));
}
