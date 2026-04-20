// SPA mode : pas de SSR, rendu 100% côté client.
// adapter-static utilise fallback: 'index.html' pour toutes les routes non pré-rendues.
export const prerender = true;
export const ssr = false;
