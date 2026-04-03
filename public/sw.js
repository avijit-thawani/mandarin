const SW_VERSION = '2026-04-03-1';
const REMINDER_TAG = 'mandarin-reminder';

self.addEventListener('install', () => {
  self.skipWaiting();
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys().then((names) =>
      Promise.all(names.map((name) => caches.delete(name)))
    ).then(() => self.clients.claim())
     .then(() =>
       self.clients.matchAll({ type: 'window' }).then((clients) => {
         clients.forEach((client) => client.navigate(client.url));
       })
     )
  );
});

self.addEventListener('fetch', (event) => {
  if (event.request.mode === 'navigate') {
    event.respondWith(
      fetch(event.request, { cache: 'no-store' })
        .catch(() => caches.match(event.request))
    );
  }
});

self.addEventListener('push', (event) => {
  let payload = {
    title: 'Mandarin reminder',
    body: 'Time for a quick review session.',
    url: '/quiz',
  };

  try {
    if (event.data) {
      const parsed = event.data.json();
      payload = {
        ...payload,
        ...parsed,
      };
    }
  } catch (_error) {
    // Ignore payload parse errors and keep defaults.
  }

  const notificationOptions = {
    body: payload.body,
    icon: '/icon-192.png',
    badge: '/icon-192.png',
    tag: REMINDER_TAG,
    data: {
      url: payload.url || '/quiz',
    },
  };

  event.waitUntil(self.registration.showNotification(payload.title, notificationOptions));
});

self.addEventListener('notificationclick', (event) => {
  event.notification.close();

  const targetUrl = event.notification?.data?.url || '/quiz';

  event.waitUntil(
    self.clients.matchAll({ type: 'window', includeUncontrolled: true }).then((clients) => {
      for (const client of clients) {
        if ('navigate' in client && 'focus' in client) {
          return client.navigate(targetUrl).then(() => client.focus());
        }
      }
      return self.clients.openWindow(targetUrl);
    })
  );
});

self.addEventListener('message', (event) => {
  if (event.data?.type === 'CLEAR_NOTIFICATIONS') {
    event.waitUntil(
      self.registration.getNotifications({ tag: REMINDER_TAG }).then((notifications) => {
        notifications.forEach((n) => n.close());
      })
    );
  }
});
