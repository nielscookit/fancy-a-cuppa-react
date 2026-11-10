/* Notification-only worker. No fetch interception or stale app/media cache. */
self.addEventListener('install', event => event.waitUntil(self.skipWaiting()));
self.addEventListener('activate', event => event.waitUntil(self.clients.claim()));

self.addEventListener('push', event => {
  let payload;
  try { payload = event.data?.json(); } catch { /* Always display a visible notification. */ }
  const valid = payload?.version === 1 && payload.type === 'tea-ready';
  event.waitUntil(self.registration.showNotification(valid ? payload.title : 'Fancy a Cuppa', {
    body: valid ? payload.body : 'Your tea is ready.',
    icon: new URL('icons/icon-cuppa-192.png', self.registration.scope).href,
    tag: 'fac-tea-ready',
    data: { url: self.registration.scope },
  }));
});

self.addEventListener('notificationclick', event => {
  event.notification.close();
  event.waitUntil((async () => {
    const scope = self.registration.scope;
    const windows = await self.clients.matchAll({ type: 'window', includeUncontrolled: true });
    const home = windows.find(client => {
      const url = new URL(client.url);
      const base = new URL(scope);
      return url.origin === base.origin && (url.pathname === base.pathname || url.pathname === base.pathname + 'index.html');
    });
    if (home) { await home.focus(); home.postMessage({ type: 'tea-ready' }); }
    else await self.clients.openWindow(scope);
  })());
});
