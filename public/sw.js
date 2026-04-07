// RewardKidz — Service Worker v1.0
// Stratégie : Stale-While-Revalidate pour les assets statiques

const CACHE_NAME = 'rewardkidz-v1';

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

// ── Activation : nettoyage des anciens caches ─────────────────
self.addEventListener('activate', event => {
  event.waitUntil(
    caches.keys()
      .then(keys => Promise.all(
        keys
          .filter(key => key !== CACHE_NAME)
          .map(key => caches.delete(key))
      ))
      .then(() => self.clients.claim())
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

// ── Push notifications ────────────────────────────────────────
self.addEventListener('push', event => {
  let data = {
    title: 'RewardKidz',
    body: 'Tu as un nouveau message !',
    icon: './icon-192.png'
  };

  try {
    data = event.data ? { ...data, ...event.data.json() } : data;
  } catch (e) {
    data.body = event.data ? event.data.text() : data.body;
  }

  event.waitUntil(
    self.registration.showNotification(data.title, {
      body: data.body,
      icon: data.icon || './icon-192.png',
      badge: './icon-192.png',
      data: data.url || './',
      vibrate: [200, 100, 200],
      tag: 'rewardkidz-notif',
      renotify: true,
    })
  );
});

// ── Tap sur notification → ouvre la PWA ──────────────────────
self.addEventListener('notificationclick', event => {
  event.notification.close();
  const url = event.notification.data || './';
  event.waitUntil(
    clients.matchAll({ type: 'window', includeUncontrolled: true })
      .then(windowClients => {
        for (const client of windowClients) {
          if (client.url === url && 'focus' in client) return client.focus();
        }
        if (clients.openWindow) return clients.openWindow(url);
      })
  );
});

// ── Message depuis la page ────────────────────────────────────
self.addEventListener('message', event => {
  if (event.data === 'SKIP_WAITING') self.skipWaiting();
});
