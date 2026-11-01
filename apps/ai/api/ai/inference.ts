/** The removed chat must not remain accessible through shared automatic-marking sessions. */
export default {
  async fetch(): Promise<Response> {
    return new Response('This AI endpoint has been removed.', {
      status: 410,
      headers: { 'Cache-Control': 'no-store' },
    });
  },
};
