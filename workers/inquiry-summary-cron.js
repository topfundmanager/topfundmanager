const DEFAULT_ENDPOINT = 'https://topfundmanager.com/api/forms/summary';
const DEFAULT_TIME_ZONE = 'America/Denver';

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

function shouldRun(date, env) {
  const timeZone = env.FORMS_SUMMARY_TIME_ZONE || DEFAULT_TIME_ZONE;
  const { weekday, hour } = getLocalParts(date, timeZone);
  return hour === 9 && (weekday === 'monday' || weekday === 'friday');
}

async function invokeSummary(env, scheduledTime, extra = {}) {
  const secret = env.FORMS_SUMMARY_SECRET;
  if (!secret) {
    throw new Error('FORMS_SUMMARY_SECRET is not configured.');
  }

  const endpoint = env.SUMMARY_ENDPOINT || DEFAULT_ENDPOINT;
  const response = await fetch(endpoint, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${secret}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      scheduledTime: scheduledTime.toISOString(),
      ...extra,
    }),
  });

  const text = await response.text();
  if (!response.ok) {
    throw new Error(`Summary endpoint failed (${response.status}): ${text}`);
  }

  return text;
}

export default {
  async scheduled(event, env, ctx) {
    const scheduledTime = new Date(event.scheduledTime);
    if (!shouldRun(scheduledTime, env)) {
      return;
    }

    ctx.waitUntil(invokeSummary(env, scheduledTime, { cron: event.cron }));
  },

  async fetch(request, env) {
    const url = new URL(request.url);
    if (url.pathname !== '/trigger') {
      return new Response('Not found', { status: 404 });
    }

    const provided = request.headers.get('authorization')?.replace(/^Bearer\s+/i, '').trim() || '';
    if (!env.FORMS_SUMMARY_SECRET || provided !== env.FORMS_SUMMARY_SECRET) {
      return new Response('Unauthorized', { status: 401 });
    }

    const forceRecipient = url.searchParams.get('forceRecipient') || undefined;
    const dryRun = url.searchParams.get('dryRun') === '1';
    const result = await invokeSummary(env, new Date(), { forceRecipient, dryRun });
    return new Response(result, {
      headers: { 'Content-Type': 'application/json' },
    });
  },
};
