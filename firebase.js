// ═══════════════════════════════════════════════════════════
// RewardKidz — firebase.js
// Configuration et initialisation Firebase SDK v9 (modulaire)
// ─────────────────────────────────────────────────────────
// IMPORTANT : remplacer les 3 valeurs PLACEHOLDER par les
// vraies valeurs de ta console Firebase
// (Paramètres du projet → Vos applications → Config SDK)
// ═══════════════════════════════════════════════════════════

import { initializeApp }                    from 'https://www.gstatic.com/firebasejs/10.12.0/firebase-app.js';
import { getFirestore, enableIndexedDbPersistence }
                                            from 'https://www.gstatic.com/firebasejs/10.12.0/firebase-firestore.js';
import { getAuth }                          from 'https://www.gstatic.com/firebasejs/10.12.0/firebase-auth.js';

// ── Configuration ──────────────────────────────────────────
// ℹ️  NOTE SÉCURITÉ : ces valeurs peuvent être dans le repo Git.
// La clé apiKey Firebase n'est PAS un secret — elle est visible
// dans le navigateur de toute façon et conçue pour être publique.
// La vraie protection vient des règles Firestore (firestore.rules)
// qui contrôlent qui peut lire/écrire quoi.
// Voir : https://firebase.google.com/docs/projects/api-keys
//
// ⚠️  Remplacer les 3 valeurs PLACEHOLDER par tes vraies valeurs
// (console.firebase.google.com → Paramètres → Vos applications)
const firebaseConfig = {
  apiKey:            'PLACEHOLDER_API_KEY',
  authDomain:        'rewardkidz-4fe68.firebaseapp.com',
  projectId:         'rewardkidz-4fe68',
  storageBucket:     'rewardkidz-4fe68.firebasestorage.app',
  messagingSenderId: 'PLACEHOLDER_SENDER_ID',
  appId:             'PLACEHOLDER_APP_ID',
};

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
