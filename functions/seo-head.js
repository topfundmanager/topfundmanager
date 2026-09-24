const escapeHtml = (value) => String(value ?? '').replace(/[&<>"']/g, (char) => ({
  '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;',
})[char]);

const meta = (key, value, kind = 'name') => value
  ? `<meta ${kind}="${escapeHtml(key)}" content="${escapeHtml(value)}">`
  : '';

const jsonLd = (value) => value && typeof value === 'object' && Object.keys(value).length
  ? `<script type="application/ld+json">${JSON.stringify(value).replace(/</g, '\\u003c')}</script>`
  : '';

export const buildPublishedHead = (profile) => {
  const seo = profile.seo || {};
  const og = profile.social?.openGraph || {};
  const twitter = profile.social?.twitter || {};
  const faqs = profile.entity?.faqs || [];
  const faqData = Array.isArray(faqs) && faqs.length
    ? { '@context': 'https://schema.org', '@type': 'FAQPage', mainEntity: faqs.map((item) => ({
      '@type': 'Question', name: item.question,
      acceptedAnswer: { '@type': 'Answer', text: item.answer },
    })) }
    : null;

  return [
    `<title>${escapeHtml(seo.title || '')}</title>`,
    meta('description', seo.description),
    meta('robots', seo.robots),
    seo.canonical ? `<link rel="canonical" href="${escapeHtml(seo.canonical)}">` : '',
    meta('og:type', 'website', 'property'),
    meta('og:title', og.title || seo.title, 'property'),
    meta('og:description', og.description || seo.description, 'property'),
    meta('og:url', seo.canonical, 'property'),
    meta('og:image', og.image, 'property'),
    meta('og:site_name', profile.entity?.name, 'property'),
    meta('twitter:card', twitter.card || 'summary_large_image'),
    meta('twitter:title', twitter.title || og.title || seo.title),
    meta('twitter:description', twitter.description || og.description || seo.description),
    meta('twitter:image', twitter.image || og.image),
    meta('seo-publication-revision', profile.revision),
    jsonLd(profile.structuredData),
    jsonLd(faqData),
  ].filter(Boolean).join('\n');
};

export const applyPublishedHead = (response, profile) => {
  const head = buildPublishedHead(profile);
  const rewritten = new HTMLRewriter()
    .on('head', { element(element) { element.append(head, { html: true }); } })
    .on('head title', { element(element) { element.remove(); } })
    .on('head link', { element(element) {
      if ((element.getAttribute('rel') || '').toLowerCase() === 'canonical') element.remove();
    } })
    .on('head meta', { element(element) {
      const name = (element.getAttribute('name') || '').toLowerCase();
      const property = (element.getAttribute('property') || '').toLowerCase();
      if (['description', 'robots', 'seo-publication-revision'].includes(name) ||
          name.startsWith('twitter:') || property.startsWith('og:')) element.remove();
    } })
    .on('head script', { element(element) {
      if ((element.getAttribute('type') || '').toLowerCase() === 'application/ld+json') element.remove();
    } })
    .transform(response);
  rewritten.headers.set('Cache-Control', 'no-store');
  rewritten.headers.set('X-SEO-Published-Revision', String(profile.revision));
  return rewritten;
};
