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
 * À appeler en début de load() dans les routes protégées pour éviter
 * la race condition entre le chargement de page et la résolution Firebase Auth.
 */
export function waitForAuthReady(): Promise<void> {
  return new Promise(resolve => {
    // Déjà prêt
    if (get(authReady)) { resolve(); return; }

    const unsub = authReady.subscribe(ready => {
      if (ready) {
        unsub();
        resolve();
      }
    });
  });
}

// ─────────────────────────────────────────────────────────────
// Auth listener
// ─────────────────────────────────────────────────────────────

import { onUserStateChanged, getUser } from '$lib/firebase';
import type { Unsubscribe } from 'firebase/auth';

let _authListenerUnsub: Unsubscribe | null = null;

/**
 * Initialise le listener onAuthStateChanged.
 * À appeler une seule fois dans `+layout.svelte` `onMount`.
 * Retourne une fonction de nettoyage pour le unmount.
 */
export function initAuthListener(): () => void {
  if (_authListenerUnsub) return _authListenerUnsub;

  _authListenerUnsub = onUserStateChanged(async (user) => {
    authUser.set(user);

    if (!user) {
      userDoc.set(null);
      authReady.set(true);
      return;
    }

    try {
      const doc = await getUser(user.uid);
      userDoc.set(doc);
    } catch {
      userDoc.set(null);
    } finally {
      authReady.set(true);
    }
  });

  return () => {
    _authListenerUnsub?.();
    _authListenerUnsub = null;
  };
}
