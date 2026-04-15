const INTERNAL_FIELDS = new Set(['_timestamp', 'website', 'url', 'company_url']);

function cleanString(value) {
  if (typeof value !== 'string') {
    return '';
  }

  return value.trim();
}

function sanitizeSubmission(data) {
  const sanitized = {};

  for (const [key, value] of Object.entries(data)) {
    if (INTERNAL_FIELDS.has(key)) {
      continue;
    }

    sanitized[key] = value;
  }

  return sanitized;
}

export async function forwardSubmissionToTopFundNetwork(env, request, options) {
  const apiUrl = cleanString(env.TOPFUNDNETWORK_FORMS_API_URL);
  const apiKey = cleanString(env.TOPFUNDNETWORK_FORMS_API_KEY);

  if (!apiUrl || !apiKey) {
    return;
  }

  const sourcePageUrl = request.headers.get('referer') || '';
  const origin = request.headers.get('origin') || '';
  const referrer = request.headers.get('referer') || '';
  const ip = request.headers.get('cf-connecting-ip') || request.headers.get('x-forwarded-for') || '';
  const userAgent = request.headers.get('user-agent') || '';

  const response = await fetch(apiUrl, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'x-forms-import-key': apiKey,
    },
    body: JSON.stringify({
      siteId: 'topfundmanager',
      siteName: 'Top Fund Manager',
      formId: options.formId,
      formName: options.formName,
      submittedAt: new Date().toISOString(),
      contactName: options.contactName,
      contactEmail: options.contactEmail,
      contactPhone: options.contactPhone,
      sourcePageUrl,
      origin,
      referrer,
      ip,
      userAgent,
      submission: sanitizeSubmission(options.submission),
      metadata: options.metadata || {},
    }),
  });

  if (!response.ok) {
    const errorText = await response.text();
    throw new Error(`TopFundNetwork import API error: ${errorText}`);
  }
}
