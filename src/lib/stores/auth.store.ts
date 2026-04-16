import { writable, derived, get } from 'svelte/store';
import type { User } from 'firebase/auth';
import type { UserDoc } from '$lib/firebase/types';

// ─────────────────────────────────────────────────────────────
// Stores primitifs
// ─────────────────────────────────────────────────────────────

/** Utilisateur Firebase Auth courant (null = non authentifié) */
export const authUser = writable<User | null>(null);

/** Document Firestore de l'utilisateur courant */
export const userDoc = writable<UserDoc | null>(null);

/**
 * Devient true une fois que Firebase Auth a résolu son état initial.
 * Utilisé par waitForAuthReady() pour éviter les race conditions au chargement.
 */
export const authReady = writable(false);

/**
 * Code d'invitation en attente (Google / email registration flows).
 * Stocké ici plutôt qu'en variable module-level pour survivre aux navigations SvelteKit.
 */
export const pendingJoin = writable<{ code: string; name: string } | null>(null);

// ─────────────────────────────────────────────────────────────
// Stores dérivés
// ─────────────────────────────────────────────────────────────

/**
 * Rôle de l'utilisateur courant :
 * - undefined  → auth pas encore résolue (ne pas router)
 * - null       → non authentifié
 * - 'parent'   → authentifié parent
 * - 'child'    → authentifié enfant
 */
export const userRole = derived(
  [authReady, userDoc],
  ([$ready, $doc]) => {
    if (!$ready) return undefined;
    return $doc?.role ?? null;
  }
);

// ─────────────────────────────────────────────────────────────
// Auth ready guard
// ─────────────────────────────────────────────────────────────

/**
 * Promise qui se résout quand `authReady` passe à `true`.
 */
export function waitForAuthReady(): Promise<void> {
  return new Promise(resolve => {
    if (get(authReady)) { resolve(); return; }
    const unsub = authReady.subscribe(ready => {
      if (ready) { unsub(); resolve(); }
    });
  });
}

// ─────────────────────────────────────────────────────────────
// Auth listener
// ─────────────────────────────────────────────────────────────

import { onUserStateChanged, db } from '$lib/firebase';
import { doc, onSnapshot } from 'firebase/firestore';
import type { Unsubscribe } from 'firebase/auth';

let _authListenerUnsub: Unsubscribe | null = null;
let _userDocUnsub:      Unsubscribe | null = null;

/**
 * Initialise le listener onAuthStateChanged.
 * Utilise onSnapshot (temps réel) pour le document utilisateur Firestore
 * au lieu d'un getDoc() unique — plus robuste aux erreurs réseau transitoires
 * et aux retards de propagation du token.
 */
export function initAuthListener(): () => void {
  if (_authListenerUnsub) return _authListenerUnsub;

  _authListenerUnsub = onUserStateChanged((user) => {
    // Nettoyer le listener précédent sur le doc utilisateur
    _userDocUnsub?.();
    _userDocUnsub = null;

    if (!user) {
      authUser.set(null);
      userDoc.set(null);
      authReady.set(true);
      return;
    }

    // Réinitialiser authReady AVANT de setter authUser pour éviter la race condition :
    // sans ce reset, le $effect de parent-auth se déclenche avec authUser=user + userDoc=null
    // et redirige vers /onboarding avant que onSnapshot ait retourné les données.
    authReady.set(false);
    authUser.set(user);

    // Listener temps réel sur users/{uid} — se reconnecte automatiquement
    // si le token expire ou si une erreur réseau transitoire survient.
    _userDocUnsub = onSnapshot(
      doc(db, 'users', user.uid),
      (snap) => {
        const data = snap.exists() ? (snap.data() as UserDoc) : null;
        if (!data) {
          console.warn('[auth] users/%s — document absent de Firestore', user.uid);
        }
        userDoc.set(data);
        authReady.set(true); // toujours, y compris lors d'une reconnexion
      },
      (err) => {
        console.error('[auth] Erreur lecture users/%s :', user.uid, err.code, err.message);
        userDoc.set(null);
        authReady.set(true); // ne pas bloquer l'app indéfiniment
      }
    );
  });

  return () => {
    _authListenerUnsub?.();
    _userDocUnsub?.();
    _authListenerUnsub = null;
    _userDocUnsub = null;
  };
}
