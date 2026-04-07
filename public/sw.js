// RewardKidz — Service Worker v1.1
// Stratégie : Stale-While-Revalidate + Firebase Cloud Messaging (background)

// Firebase compat (requis pour onBackgroundMessage dans le SW — pas d'ES modules ici)
importScripts('https://www.gstatic.com/firebasejs/10.8.0/firebase-app-compat.js');
importScripts('https://www.gstatic.com/firebasejs/10.8.0/firebase-messaging-compat.js');

// ─────────────────────────────────────────────────────────────
const CACHE_NAME   = 'rewardkidz-v1';
const CONFIG_CACHE = 'sw-config-v1';

const ASSETS_TO_CACHE = [
  './',
  './index.html',
  './main.js',
  './firebase.js',
  './manifest.json',
  './css/style.css',
  './pages/parent.html',
  './pages/child.html',
  './pages/child-auth.html',
  './pages/child-detail.html',
  './parent-auth.html',
  './pages/create-family.html',
  './pages/join-family.html',
  './pages/onboarding.html',
];

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
        icon:     './icon-192.png',
        badge:    './icon-192.png',
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

// ── Installation : mise en cache des assets ──────────────────
self.addEventListener('install', event => {
  event.waitUntil(
    caches.open(CACHE_NAME)
      .then(cache =>
        Promise.allSettled(
          ASSETS_TO_CACHE.map(url =>
            cache.add(url).catch(err => console.warn('[SW] Cache miss:', url, err))
          )
        )
      )
      .then(() => self.skipWaiting())
  );
});

// ── Activation : nettoyage + chargement config persistée ─────
self.addEventListener('activate', event => {
  event.waitUntil(
    (async () => {
      // Nettoyer anciens caches (conserver CONFIG_CACHE)
      const keys = await caches.keys();
      await Promise.all(
        keys.filter(k => k !== CACHE_NAME && k !== CONFIG_CACHE).map(k => caches.delete(k))
      );
      await self.clients.claim();
      // Réinitialiser FCM si config disponible (push reçu avant ouverture de l'app)
      const config = await loadPersistedConfig();
      if (config) await ensureMessaging(config);
    })()
  );
});

// ── Fetch : Stale-While-Revalidate ────────────────────────────
self.addEventListener('fetch', event => {
  if (event.request.method !== 'GET') return;

  const url = new URL(event.request.url);
  if (url.origin !== self.location.origin) return;

  event.respondWith(
    caches.match(event.request).then(cached => {
      const fetchUpdate = fetch(event.request)
        .then(response => {
          if (response && response.status === 200) {
            const clone = response.clone();
            caches.open(CACHE_NAME).then(cache => cache.put(event.request, clone));
          }
          return response;
        })
        .catch(() => {});

      return cached || fetchUpdate || caches.match('./index.html');
    })
  );
});

// ── Push fallback (non-FCM) ───────────────────────────────────
// FCM gère ses propres pushs via onBackgroundMessage ci-dessus.
// Ce handler reste en place pour les pushs envoyés hors FCM.
self.addEventListener('push', event => {
  // FCM intercepte ses propres events — on ignore s'il est déjà initialisé
  if (_messagingReady) return;

  let data = { title: 'RewardKidz', body: 'Tu as un nouveau message !' };
  try {
    data = event.data ? { ...data, ...event.data.json() } : data;
  } catch (e) {
    data.body = event.data ? event.data.text() : data.body;
  }

  event.waitUntil(
    self.registration.showNotification(data.title, {
      body:    data.body,
      icon:    './icon-192.png',
      badge:   './icon-192.png',
      vibrate: [200, 100, 200],
      tag:     'rewardkidz-notif',
      renotify: true,
    })
  );
});

// ── Tap sur notification → ouvre la PWA ──────────────────────
self.addEventListener('notificationclick', event => {
  event.notification.close();
  const url = event.notification.data?.url || './';
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

// ── Messages depuis la page ───────────────────────────────────
self.addEventListener('message', async event => {
  if (event.data?.type === 'FIREBASE_CONFIG') {
    await ensureMessaging(event.data.config);
  }
  if (event.data === 'SKIP_WAITING') {
    self.skipWaiting();
  }
});
