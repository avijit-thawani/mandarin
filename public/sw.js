self.addEventListener('install', () => {
  self.skipWaiting();
});

self.addEventListener('activate', (event) => {
  event.waitUntil(self.clients.claim());
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
    icon: '/veena.svg',
    badge: '/veena.svg',
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
        const windowClient = client;
        if ('focus' in windowClient) {
          windowClient.navigate(targetUrl);
          return windowClient.focus();
        }
      }
      if (self.clients.openWindow) {
        return self.clients.openWindow(targetUrl);
      }
      return undefined;
    })
  );
});
