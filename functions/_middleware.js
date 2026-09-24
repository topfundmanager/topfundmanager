import {
  buildPublishedLlms,
  buildPublishedRobots,
  getPublishedProfile,
  toPublishedPayload,
} from './api/seo/published-utils.js';
import { applyPublishedHead } from './seo-head.js';

export async function onRequest(context) {
  const { request, env } = context;
  if (request.method !== 'GET') return context.next();
  const path = new URL(request.url).pathname;
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
