export const onRequest = () => new Response('Not Found', {
  status: 404,
  headers: {
    'Cache-Control': 'no-store',
    'Content-Type': 'text/plain; charset=utf-8',
    'X-Robots-Tag': 'noindex',
  },
});
