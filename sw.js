// RewardKids — Service Worker v1.0
// Stratégie : Cache First pour les assets, Network First pour les données

const CACHE_NAME = 'rewardkids-v1';
const ASSETS_TO_CACHE = [
  '/',
  '/index.html',
  '/manifest.json',
  '/icon-192.png',
  '/icon-512.png',
];

// ── Installation : mise en cache des assets ──────────────────
self.addEventListener('install', event => {
  console.log('[SW] Install');
  event.waitUntil(
    caches.open(CACHE_NAME)
      .then(cache => {
        console.log('[SW] Caching assets');
        // On cache ce qu'on peut, on ignore les erreurs individuelles
        return Promise.allSettled(
          ASSETS_TO_CACHE.map(url =>
            cache.add(url).catch(err => console.warn('[SW] Cache miss:', url, err))
          )
        );
      })
      .then(() => self.skipWaiting())
  );
});

// ── Activation : nettoyage des anciens caches ─────────────────
self.addEventListener('activate', event => {
  console.log('[SW] Activate');
  event.waitUntil(
    caches.keys()
      .then(keys => Promise.all(
        keys
          .filter(key => key !== CACHE_NAME)
          .map(key => {
            console.log('[SW] Deleting old cache:', key);
            return caches.delete(key);
          })
      ))
      .then(() => self.clients.claim())
  );
});

// ── Fetch : Cache First avec fallback réseau ──────────────────
self.addEventListener('fetch', event => {
  // On ne gère que les requêtes GET sur notre domaine
  if (event.request.method !== 'GET') return;

  const url = new URL(event.request.url);

  // Ignorer les requêtes vers d'autres domaines (Firebase, Google Fonts, etc.)
  if (url.origin !== self.location.origin) return;

  event.respondWith(
    caches.match(event.request)
      .then(cached => {
        if (cached) {
          // Retourner le cache immédiatement + mettre à jour en arrière-plan
          const fetchUpdate = fetch(event.request)
            .then(response => {
              if (response && response.status === 200) {
                const responseClone = response.clone();
                caches.open(CACHE_NAME)
                  .then(cache => cache.put(event.request, responseClone));
              }
              return response;
            })
            .catch(() => {}); // Silencieux si hors-ligne

          return cached;
        }

        // Pas en cache → réseau
        return fetch(event.request)
          .then(response => {
            if (!response || response.status !== 200) return response;

            const responseClone = response.clone();
            caches.open(CACHE_NAME)
              .then(cache => cache.put(event.request, responseClone));

            return response;
          })
          .catch(() => {
            // Offline + pas en cache → page offline générique
            return caches.match('/index.html');
          });
      })
  );
});

// ── Push notifications (préparation Lot 6) ───────────────────
self.addEventListener('push', event => {
  console.log('[SW] Push reçu');

  let data = { title: 'RewardKids 🦄', body: 'Tu as un nouveau message !', icon: '/icon-192.png' };

  try {
    data = event.data ? { ...data, ...event.data.json() } : data;
  } catch(e) {
    data.body = event.data ? event.data.text() : data.body;
  }

  event.waitUntil(
    self.registration.showNotification(data.title, {
      body:  data.body,
      icon:  data.icon  || '/icon-192.png',
      badge: '/icon-192.png',
      data:  data.url   || '/',
      vibrate: [200, 100, 200],
      tag: 'rewardkids-notif',
      renotify: true,
    })
  );
});

// Tap sur notification → ouvre la PWA
self.addEventListener('notificationclick', event => {
  event.notification.close();
  const url = event.notification.data || '/';
  event.waitUntil(
    clients.matchAll({ type: 'window', includeUncontrolled: true })
      .then(windowClients => {
        // Si la PWA est déjà ouverte → focus
        for (const client of windowClients) {
          if (client.url === url && 'focus' in client) return client.focus();
        }
        // Sinon → ouvrir
        if (clients.openWindow) return clients.openWindow(url);
      })
  );
});

// ── Message depuis la page ────────────────────────────────────
self.addEventListener('message', event => {
  if (event.data === 'SKIP_WAITING') self.skipWaiting();
});
