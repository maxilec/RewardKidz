// ═══════════════════════════════════════════════════════════
// RewardKidz — firebase.js
// Configuration et initialisation Firebase SDK v9 (modulaire)
// ─────────────────────────────────────────────────────────
// La config est dans firebase.config.js (généré par GitHub Actions)
// ou firebase.config.js local (dans .gitignore)
// Voir firebase.config.example.js pour le template
// ═══════════════════════════════════════════════════════════

import { initializeApp }                    from 'https://www.gstatic.com/firebasejs/10.12.0/firebase-app.js';
import { getFirestore, enableIndexedDbPersistence }
                                            from 'https://www.gstatic.com/firebasejs/10.12.0/firebase-firestore.js';
import { getAuth }                          from 'https://www.gstatic.com/firebasejs/10.12.0/firebase-auth.js';
import { firebaseConfig }                   from './firebase.config.js';

// ── Initialisation ──────────────────────────────────────────
const app  = initializeApp(firebaseConfig);
const db   = getFirestore(app);
const auth = getAuth(app);

// ── Persistance offline (IndexedDB) ────────────────────────
// Permet d'afficher les dernières données même sans réseau
enableIndexedDbPersistence(db).catch(err => {
  if (err.code === 'failed-precondition') {
    // Plusieurs onglets ouverts — persistance désactivée
    console.warn('[Firebase] Persistance offline désactivée (multi-onglets)');
  } else if (err.code === 'unimplemented') {
    // Navigateur incompatible (rare sur iOS 16.4+)
    console.warn('[Firebase] Persistance offline non supportée sur ce navigateur');
  }
});

// ── IDs de la famille de démo ───────────────────────────────
// Pour la phase de test avec 1 famille
// Sera remplacé par l'auth dynamique au Lot 0-SEC
export const DEMO_FAMILY_ID = 'famille_demo';
export const DEMO_CHILD_ID  = 'enfant_demo';
export const DEMO_PARENT_ID = 'parent_demo';

export { app, db, auth };
