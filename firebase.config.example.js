// ═══════════════════════════════════════════════════════════
// firebase.config.example.js — TEMPLATE (sans valeurs réelles)
// ─────────────────────────────────────────────────────────
// Ce fichier sert de documentation pour les secrets GitHub.
// Les vraies valeurs sont injectées par GitHub Actions au déploiement.
//
// Pour développer en local :
//   1. Copier ce fichier en firebase.config.js
//   2. Remplir les valeurs depuis console.firebase.google.com
//   3. firebase.config.js est dans .gitignore — ne jamais le committer
// ═══════════════════════════════════════════════════════════

export const firebaseConfig = {
  apiKey:            '',   // GitHub Secret: FIREBASE_API_KEY
  authDomain:        '',   // GitHub Secret: FIREBASE_AUTH_DOMAIN
  projectId:         '',   // GitHub Secret: FIREBASE_PROJECT_ID
  storageBucket:     '',   // GitHub Secret: FIREBASE_STORAGE_BUCKET
  messagingSenderId: '',   // GitHub Secret: FIREBASE_SENDER_ID
  appId:             '',   // GitHub Secret: FIREBASE_APP_ID
};
