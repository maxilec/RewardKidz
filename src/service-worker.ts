/// <reference lib="webworker" />
/// <reference types="vite-plugin-pwa/vanillajs" />

import { cleanupOutdatedCaches, precacheAndRoute } from 'workbox-precaching';
import { registerRoute }                           from 'workbox-routing';
import { StaleWhileRevalidate, CacheFirst }        from 'workbox-strategies';
import { ExpirationPlugin }                        from 'workbox-expiration';

declare const self: ServiceWorkerGlobalScope;

// ── Précache : liste injectée par vite-plugin-pwa au build ───
// En dev ce tableau est vide (devOptions.enabled = false).
precacheAndRoute(self.__WB_MANIFEST);
cleanupOutdatedCaches();

// ── Navigation (SPA fallback) — Stale-While-Revalidate ───────
// Retourne la page en cache immédiatement + rafraîchit en arrière-plan.
registerRoute(
  ({ request }) => request.mode === 'navigate',
  new StaleWhileRevalidate({ cacheName: 'rk-pages' })
);

// ── Images & fonts — Cache-First (1 an) ──────────────────────
registerRoute(
  ({ request }) => request.destination === 'image' || request.destination === 'font',
  new CacheFirst({
    cacheName: 'rk-assets',
    plugins: [
      new ExpirationPlugin({
        maxEntries:    60,
        maxAgeSeconds: 365 * 24 * 60 * 60  // 1 an
      })
    ]
  })
);

// ── Scripts & styles — Stale-While-Revalidate ────────────────
registerRoute(
  ({ request }) => request.destination === 'script' || request.destination === 'style',
  new StaleWhileRevalidate({ cacheName: 'rk-static' })
);

// ── Activation immédiate (sans attendre rechargement) ─────────
self.addEventListener('activate', () => self.clients.claim());
self.addEventListener('install',  () => self.skipWaiting());
