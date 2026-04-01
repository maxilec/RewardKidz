// ═══════════════════════════════════════════════════════════
// RewardKidz — firebase.js v2
// Config Firebase + Firestore + Auth
// ═══════════════════════════════════════════════════════════

import { initializeApp }                              from 'https://www.gstatic.com/firebasejs/10.12.0/firebase-app.js';
import { getFirestore, enableIndexedDbPersistence }   from 'https://www.gstatic.com/firebasejs/10.12.0/firebase-firestore.js';
import { getAuth, setPersistence, browserLocalPersistence } from 'https://www.gstatic.com/firebasejs/10.12.0/firebase-auth.js';
import { firebaseConfig }                             from './firebase.config.js';

const app  = initializeApp(firebaseConfig);
const db   = getFirestore(app);
const auth = getAuth(app);

// Persistance Auth locale — garantit que la session Firebase Auth
// survit aux rechargements de page et aux redirects OAuth sur iOS Safari
setPersistence(auth, browserLocalPersistence)
  .catch(err => console.error('[Firebase] Erreur persistance Auth:', err));

// Persistance Firestore offline
enableIndexedDbPersistence(db).catch(err => {
  if (err.code === 'failed-precondition')
    console.warn('[Firebase] Persistance offline désactivée (multi-onglets)');
  else if (err.code === 'unimplemented')
    console.warn('[Firebase] Persistance offline non supportée');
});

export { app, db, auth };
