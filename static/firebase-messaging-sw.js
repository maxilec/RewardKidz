// RewardKidz — Firebase Cloud Messaging Service Worker
// Ce SW est séparé du SW principal (géré par vite-plugin-pwa).
// Il doit rester en mode "classic" (pas d'ES modules) car les SW FCM
// utilisent importScripts() pour charger le SDK compat.

// Firebase compat (requis pour onBackgroundMessage dans le SW — pas d'ES modules ici)
importScripts('https://www.gstatic.com/firebasejs/10.8.0/firebase-app-compat.js');
importScripts('https://www.gstatic.com/firebasejs/10.8.0/firebase-messaging-compat.js');

// ─────────────────────────────────────────────────────────────
const CONFIG_CACHE = 'sw-config-v1';

// ── FCM : initialisation lazy ────────────────────────────────
let _messagingReady = false;

async function ensureMessaging(config) {
  if (_messagingReady) return;
  try {
    if (!firebase.apps.length) firebase.initializeApp(config);
    const messagingSW = firebase.messaging();
    messagingSW.onBackgroundMessage(payload => {
      const notif  = payload.notification || {};
      const title  = notif.title || 'RewardKidz';
      const body   = notif.body  || '';
      self.registration.showNotification(title, {
        body,
        icon:     '/icon-192.png',
        badge:    '/icon-192.png',
        tag:      'rewardkidz-score',
        renotify: true,
        vibrate:  [200, 100, 200],
        data:     payload.data || {},
      });
    });
    _messagingReady = true;
    // Persister le config pour les push reçus quand l'app est fermée
    const cache = await caches.open(CONFIG_CACHE);
    await cache.put('/sw-config', new Response(JSON.stringify(config)));
  } catch (e) {
    console.warn('[SW FCM] init failed:', e);
  }
}

async function loadPersistedConfig() {
  try {
    const cache = await caches.open(CONFIG_CACHE);
    const resp  = await cache.match('/sw-config');
    if (resp) return JSON.parse(await resp.text());
  } catch (e) {}
  return null;
}

// ── Activation : chargement config persistée ─────────────────
self.addEventListener('activate', event => {
  event.waitUntil(
    (async () => {
      await self.clients.claim();
      const config = await loadPersistedConfig();
      if (config) await ensureMessaging(config);
    })()
  );
});

// ── Messages depuis la page ───────────────────────────────────
self.addEventListener('message', async event => {
  if (event.data?.type === 'FIREBASE_CONFIG') {
    await ensureMessaging(event.data.config);
  }
});

// ── Tap sur notification → ouvre la PWA ──────────────────────
self.addEventListener('notificationclick', event => {
  event.notification.close();
  const url = event.notification.data?.url || '/';
  event.waitUntil(
    clients.matchAll({ type: 'window', includeUncontrolled: true })
      .then(windowClients => {
        for (const client of windowClients) {
          if ('focus' in client) return client.focus();
        }
        if (clients.openWindow) return clients.openWindow(url);
      })
  );
});
