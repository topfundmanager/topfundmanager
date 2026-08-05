const retiredDashboardPaths = new Set([
  '/forms/dashboard',
  '/forms/dashboard.html',
]);

export const onRequest = async (context) => {
  const pathname = new URL(context.request.url).pathname.replace(/\/+$/, '');

  if (retiredDashboardPaths.has(pathname)) {
    return new Response('Not Found', {
      status: 404,
      headers: {
        'Cache-Control': 'no-store',
        'Content-Type': 'text/plain; charset=utf-8',
        'X-Robots-Tag': 'noindex',
      },
    });
  }

  return context.next();
};
