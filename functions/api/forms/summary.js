import {
  errorResponse,
  jsonResponse,
  sendResendEmail,
  supabaseFetchJson,
} from './utils.js';

const SUMMARY_KEY = 'inquiries';
const DEFAULT_TIME_ZONE = 'America/Denver';
const DEFAULT_LOOKBACK_DAYS = 7;
const MAX_SUBMISSIONS = 500;
const RECIPIENTS = {
  monday: 'jgiles@theregurus.com',
  friday: 'crafted@marloweemrys.com',
};

function cleanString(value) {
  return typeof value === 'string' ? value.trim() : '';
}

function getAuthToken(request) {
  const explicit = request.headers.get('x-forms-summary-secret');
  if (explicit) return explicit.trim();
  return request.headers.get('authorization')?.replace(/^Bearer\s+/i, '').trim() || '';
}

function escapeHtml(value) {
  return String(value ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

function getLocalParts(date, timeZone) {
  const parts = new Intl.DateTimeFormat('en-US', {
    timeZone,
    weekday: 'long',
    hour: 'numeric',
    hourCycle: 'h23',
  }).formatToParts(date);

  return {
    weekday: parts.find((part) => part.type === 'weekday')?.value?.toLowerCase() || '',
    hour: Number.parseInt(parts.find((part) => part.type === 'hour')?.value || '', 10),
  };
}

function getScheduleForDate(date, timeZone) {
  const { weekday, hour } = getLocalParts(date, timeZone);
  if (hour !== 9) return null;
  if (weekday === 'monday') {
    return { day: 'monday', recipient: RECIPIENTS.monday };
  }
  if (weekday === 'friday') {
    return { day: 'friday', recipient: RECIPIENTS.friday };
  }
  return null;
}

function getForcedSchedule(value) {
  const key = cleanString(value).toLowerCase();
  if (key === 'monday') {
    return { day: 'monday', recipient: RECIPIENTS.monday };
  }
  if (key === 'friday') {
    return { day: 'friday', recipient: RECIPIENTS.friday };
  }
  return null;
}

function fallbackWindowStart(now) {
  return new Date(now.getTime() - DEFAULT_LOOKBACK_DAYS * 24 * 60 * 60 * 1000);
}

async function getWindowStart(env, now) {
  const runs = await supabaseFetchJson(
    env,
    `/rest/v1/forms_summary_runs?select=window_end,sent_at&summary_key=eq.${SUMMARY_KEY}&status=eq.sent&order=window_end.desc&limit=1`
  );

  const lastWindowEnd = runs?.[0]?.window_end || runs?.[0]?.sent_at;
  if (!lastWindowEnd) {
    return fallbackWindowStart(now);
  }

  const parsed = new Date(lastWindowEnd);
  return Number.isNaN(parsed.getTime()) ? fallbackWindowStart(now) : parsed;
}

async function loadSubmissions(env, windowStart, windowEnd) {
  const query = [
    '/rest/v1/forms_submissions?select=id,site_id,form_id,submitted_at,page_url,referrer,data',
    `submitted_at=gte.${encodeURIComponent(windowStart.toISOString())}`,
    `submitted_at=lt.${encodeURIComponent(windowEnd.toISOString())}`,
    'order=submitted_at.desc',
    `limit=${MAX_SUBMISSIONS}`,
  ].join('&');

  const submissions = await supabaseFetchJson(env, query);
  return (submissions || []).filter((submission) => {
    const serialized = JSON.stringify(submission.data || {});
    return !serialized.includes('tfm-wire-test-');
  });
}

function getContact(data) {
  const imported = data?._import || {};
  const fullName = [data?.firstName, data?.lastName].filter(Boolean).join(' ');
  return {
    name: imported.contactName || data?.name || fullName || '',
    email: imported.contactEmail || data?.email || data?.nominator_email || '',
    phone: imported.contactPhone || data?.phone || data?.nominator_phone || '',
  };
}

function groupCounts(submissions) {
  const counts = new Map();
  for (const submission of submissions) {
    const key = `${submission.site_id || 'unknown'} / ${submission.form_id || 'unknown'}`;
    counts.set(key, (counts.get(key) || 0) + 1);
  }
  return Array.from(counts.entries()).sort((a, b) => b[1] - a[1]);
}

function buildSummaryHtml({ submissions, windowStart, windowEnd, scheduledDay }) {
  const counts = groupCounts(submissions);
  const countRows = counts.length
    ? counts
        .map(([label, count]) => `<tr><td>${escapeHtml(label)}</td><td align="right">${count}</td></tr>`)
        .join('')
    : '<tr><td colspan="2">No new inquiries in this window.</td></tr>';

  const detailRows = submissions.slice(0, 40).map((submission) => {
    const data = submission.data || {};
    const imported = data._import || {};
    const contact = getContact(data);
    const label = imported.formName || submission.form_id || 'Website form';
    const pageUrl = submission.page_url || submission.referrer || '';
    return `
      <tr>
        <td>${escapeHtml(new Date(submission.submitted_at).toLocaleString('en-US', { timeZone: DEFAULT_TIME_ZONE }))}</td>
        <td>${escapeHtml(submission.site_id || '')}</td>
        <td>${escapeHtml(label)}</td>
        <td>${escapeHtml(contact.name || '-')}</td>
        <td>${escapeHtml(contact.email || '-')}</td>
        <td>${escapeHtml(contact.phone || '-')}</td>
        <td>${pageUrl ? `<a href="${escapeHtml(pageUrl)}">${escapeHtml(pageUrl)}</a>` : '-'}</td>
      </tr>
    `;
  }).join('');

  const details = detailRows || '<tr><td colspan="7">No inquiry details to show.</td></tr>';
  const truncatedNote = submissions.length > 40
    ? `<p>${submissions.length - 40} additional inquiries are available in the dashboard.</p>`
    : '';

  return `
    <div style="font-family:Arial,sans-serif;color:#111827;line-height:1.5">
      <h2 style="margin:0 0 8px;">New inquiries summary</h2>
      <p style="margin:0 0 16px;color:#4b5563;">
        ${escapeHtml(scheduledDay)} summary for ${escapeHtml(windowStart.toISOString())}
        through ${escapeHtml(windowEnd.toISOString())}.
      </p>
      <h3>Totals</h3>
      <table style="border-collapse:collapse;width:100%;max-width:560px" border="1" cellpadding="8">
        <thead><tr><th align="left">Site / Form</th><th align="right">New inquiries</th></tr></thead>
        <tbody>${countRows}</tbody>
      </table>
      <h3>Recent inquiries</h3>
      <table style="border-collapse:collapse;width:100%" border="1" cellpadding="8">
        <thead>
          <tr>
            <th align="left">Submitted</th>
            <th align="left">Site</th>
            <th align="left">Form</th>
            <th align="left">Name</th>
            <th align="left">Email</th>
            <th align="left">Phone</th>
            <th align="left">Page</th>
          </tr>
        </thead>
        <tbody>${details}</tbody>
      </table>
      ${truncatedNote}
    </div>
  `;
}

async function recordSummaryRun(env, record) {
  await supabaseFetchJson(env, '/rest/v1/forms_summary_runs', {
    method: 'POST',
    headers: { Prefer: 'return=minimal' },
    body: JSON.stringify(record),
  });
}

export async function onRequestPost({ request, env }) {
  try {
    const expectedSecret = cleanString(env.FORMS_SUMMARY_SECRET);
    if (!expectedSecret) {
      return errorResponse(500, 'Forms summary secret is not configured.');
    }

    if (getAuthToken(request) !== expectedSecret) {
      return errorResponse(401, 'Unauthorized forms summary request.');
    }

    const body = await request.json().catch(() => ({}));
    const now = body.scheduledTime ? new Date(body.scheduledTime) : new Date();
    if (Number.isNaN(now.getTime())) {
      return errorResponse(400, 'Invalid scheduledTime.');
    }

    const timeZone = cleanString(env.FORMS_SUMMARY_TIME_ZONE) || DEFAULT_TIME_ZONE;
    const schedule = getForcedSchedule(body.forceRecipient) || getScheduleForDate(now, timeZone);
    if (!schedule) {
      return jsonResponse({ success: true, skipped: true, reason: 'No summary scheduled for this hour.' });
    }

    const windowEnd = now;
    const windowStart = body.windowStart ? new Date(body.windowStart) : await getWindowStart(env, now);
    if (Number.isNaN(windowStart.getTime())) {
      return errorResponse(400, 'Invalid windowStart.');
    }

    const submissions = await loadSubmissions(env, windowStart, windowEnd);
    const from = cleanString(env.FORMS_SUMMARY_FROM_EMAIL)
      || cleanString(env.FORMS_FROM_EMAIL)
      || cleanString(env.FROM_EMAIL)
      || 'noreply@updates.topfundmanager.com';
    const subject = `New inquiries summary: ${submissions.length} new`;
    const html = buildSummaryHtml({
      submissions,
      windowStart,
      windowEnd,
      scheduledDay: schedule.day,
    });

    if (body.dryRun === true) {
      return jsonResponse({
        success: true,
        dryRun: true,
        recipient: schedule.recipient,
        submissionCount: submissions.length,
        windowStart: windowStart.toISOString(),
        windowEnd: windowEnd.toISOString(),
      });
    }

    const resendResult = await sendResendEmail(env, {
      from,
      to: schedule.recipient,
      subject,
      html,
      replyTo: from,
    });

    await recordSummaryRun(env, {
      summary_key: SUMMARY_KEY,
      recipient: schedule.recipient,
      scheduled_day: schedule.day,
      window_start: windowStart.toISOString(),
      window_end: windowEnd.toISOString(),
      submission_count: submissions.length,
      status: 'sent',
      resend_id: resendResult?.id || null,
      metadata: {
        counts: Object.fromEntries(groupCounts(submissions)),
        truncated: submissions.length > 40,
      },
      sent_at: new Date().toISOString(),
    });

    return jsonResponse({
      success: true,
      recipient: schedule.recipient,
      submissionCount: submissions.length,
      windowStart: windowStart.toISOString(),
      windowEnd: windowEnd.toISOString(),
      resendId: resendResult?.id || null,
    });
  } catch (error) {
    return errorResponse(500, error.message || 'Unable to send forms summary.');
  }
}
