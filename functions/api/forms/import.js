import {
  errorResponse,
  getRequestMeta,
  jsonResponse,
  supabaseFetchJson,
} from './utils.js';

function getImportKey(request) {
  const explicitKey = request.headers.get('x-forms-import-key')?.trim();
  if (explicitKey) {
    return explicitKey;
  }

  return request.headers.get('authorization')?.replace(/^Bearer\s+/i, '').trim() || '';
}

function cleanString(value) {
  if (typeof value !== 'string') {
    return null;
  }

  const trimmed = value.trim();
  return trimmed || null;
}

function normalizeTimestamp(value) {
  if (!value) {
    return new Date().toISOString();
  }

  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime())) {
    return new Date().toISOString();
  }

  return parsed.toISOString();
}

function buildSubmissionData(body) {
  const submission = body?.submission || body?.data;
  if (!submission || typeof submission !== 'object' || Array.isArray(submission)) {
    return null;
  }

  const metadata = body?.metadata && typeof body.metadata === 'object' && !Array.isArray(body.metadata)
    ? body.metadata
    : {};

  return {
    ...submission,
    _import: {
      siteName: cleanString(body.siteName),
      formName: cleanString(body.formName),
      contactName: cleanString(body.contactName),
      contactEmail: cleanString(body.contactEmail),
      contactPhone: cleanString(body.contactPhone),
      importedAt: new Date().toISOString(),
      metadata,
    },
  };
}

export async function onRequestPost({ request, env }) {
  try {
    const expectedKey = env.FORMS_IMPORT_API_KEY?.trim();
    if (!expectedKey) {
      return errorResponse(500, 'Forms import API key is not configured.');
    }

    const providedKey = getImportKey(request);
    if (!providedKey || providedKey !== expectedKey) {
      return errorResponse(401, 'Unauthorized forms import request.');
    }

    const body = await request.json();
    const siteId = cleanString(body?.siteId);
    const formId = cleanString(body?.formId);
    const data = buildSubmissionData(body);

    if (!siteId) {
      return errorResponse(400, 'siteId is required.');
    }

    if (!formId) {
      return errorResponse(400, 'formId is required.');
    }

    if (!data) {
      return errorResponse(400, 'submission must be an object.');
    }

    const requestMeta = getRequestMeta(request);
    const siteName = cleanString(body.siteName) || siteId;

    await supabaseFetchJson(env, '/rest/v1/forms_sites?on_conflict=site_id', {
      method: 'POST',
      headers: { Prefer: 'resolution=ignore-duplicates,return=minimal' },
      body: JSON.stringify({
        site_id: siteId,
        site_name: siteName,
        site_key: crypto.randomUUID(),
        allowed_origins: [],
      }),
    });

    await supabaseFetchJson(env, '/rest/v1/forms_submissions', {
      method: 'POST',
      headers: { Prefer: 'return=minimal' },
      body: JSON.stringify({
        site_id: siteId,
        form_id: formId,
        data,
        origin: cleanString(body.origin) || requestMeta.origin,
        ip: cleanString(body.ip) || requestMeta.ip,
        user_agent: cleanString(body.userAgent) || requestMeta.userAgent,
        page_url: cleanString(body.sourcePageUrl) || cleanString(body.pageUrl) || requestMeta.referrer,
        referrer: cleanString(body.referrer) || requestMeta.referrer,
        submitted_at: normalizeTimestamp(cleanString(body.submittedAt)),
      }),
    });

    return jsonResponse({ success: true }, 201);
  } catch (error) {
    return errorResponse(500, error.message || 'Unable to import submission.');
  }
}
