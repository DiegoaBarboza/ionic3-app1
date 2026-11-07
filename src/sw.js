import { clientsClaim } from 'workbox-core';
import { cleanupOutdatedCaches, precacheAndRoute, createHandlerBoundToURL } from 'workbox-precaching';
import { NavigationRoute, registerRoute } from 'workbox-routing';

self.skipWaiting();
clientsClaim();

cleanupOutdatedCaches();
precacheAndRoute(self.__WB_MANIFEST);

registerRoute(
  new NavigationRoute(createHandlerBoundToURL('/index.html'), {
    denylist: [/^\/supabase\//]
  })
);

/**
 * Alertas de atraso/pendência (Construção de Máquinas, projetos de serviço,
 * encomendas, horas não lançadas) chegam aqui via Web Push, disparados 1x/dia
 * pela Edge Function send-alerts. O payload é { title, body, url }.
 */
self.addEventListener('push', (event) => {
  let data = {};
  try {
    data = event.data ? event.data.json() : {};
  } catch {
    data = { title: 'Zentro Projects', body: event.data ? event.data.text() : '' };
  }
  const title = data.title || 'Zentro Projects';
  const options = {
    body: data.body || '',
    icon: '/icons/icon-192.png',
    badge: '/icons/icon-192.png',
    data: { url: data.url || '/' }
  };
  event.waitUntil(self.registration.showNotification(title, options));
});

self.addEventListener('notificationclick', (event) => {
  event.notification.close();
  const url = event.notification.data?.url || '/';
  event.waitUntil(
    self.clients.matchAll({ type: 'window' }).then((windows) => {
      for (const win of windows) {
        if (win.url.includes(url) && 'focus' in win) return win.focus();
      }
      if (self.clients.openWindow) return self.clients.openWindow(url);
    })
  );
});
