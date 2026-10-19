// Replace only the legacy study worker on the teacher origin. Keep its stored data intact.
const teacherRoot = 'https://gaps.getlacuna.app/';
const ownsLegacyScope =
  self.location.origin === new URL(teacherRoot).origin &&
  self.location.pathname === '/sw.js' &&
  self.registration.scope === teacherRoot;

self.addEventListener('install', (event) => {
  event.waitUntil(
    ownsLegacyScope
      ? self.skipWaiting()
      : Promise.reject(new Error('This retirement worker is restricted to the Gaps root scope.')),
  );
});

self.addEventListener('activate', (event) => {
  if (!ownsLegacyScope) return;
  event.waitUntil(
    (async () => {
      // Take over without a fetch handler: the next request goes to the new teacher build.
      await self.clients.claim();
      await self.registration.unregister();
      const windows = await self.clients.matchAll({ type: 'window' });
      await Promise.all(
        windows.map((client) => {
          const url = new URL(client.url);
          // The old teacher home has no edits to lose. Leave other learner views until navigation.
          if (
            url.origin === new URL(teacherRoot).origin &&
            url.pathname === '/' &&
            (url.hash === '' || url.hash === '#/teach')
          ) {
            return client.navigate(client.url);
          }
        }),
      );
    })(),
  );
});
