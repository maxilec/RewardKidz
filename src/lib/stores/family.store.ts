import { writable, derived } from 'svelte/store';
import { onSnapshot, doc, collection, getFirestore } from 'firebase/firestore';
import { firebaseApp } from '$lib/firebase/app';
import type { FamilyDoc, MemberDoc } from '$lib/firebase/types';
import type { Unsubscribe } from 'firebase/auth';

const db = getFirestore(firebaseApp);

// ─────────────────────────────────────────────────────────────
// Stores primitifs
// ─────────────────────────────────────────────────────────────

/** Document Firestore de la famille courante */
export const familyDoc = writable<FamilyDoc | null>(null);

/** Liste de tous les membres (parents + enfants) */
export const members = writable<MemberDoc[]>([]);

// ─────────────────────────────────────────────────────────────
// Stores dérivés
// ─────────────────────────────────────────────────────────────

/** Filtre uniquement les membres enfants */
export const children = derived(
  members,
  ($members) => $members.filter(m => m.role === 'child')
);

/** Filtre uniquement les membres parents */
export const parents = derived(
  members,
  ($members) => $members.filter(m => m.role === 'parent')
);

// ─────────────────────────────────────────────────────────────
// Listener temps réel
// ─────────────────────────────────────────────────────────────

let _familyUnsub: Unsubscribe | null = null;
let _membersUnsub: Unsubscribe | null = null;

/**
 * Démarre les listeners onSnapshot pour la famille et ses membres.
 * Appelé depuis le layout racine dès que userDoc.familyId est disponible.
 * Passer null pour nettoyer (déconnexion).
 * Retourne une fonction de nettoyage (compatible $effect Svelte 5).
 */
export function initFamilyListener(familyId: string | null): () => void {
  // Nettoyage des listeners précédents
  _familyUnsub?.();
  _membersUnsub?.();
  _familyUnsub = null;
  _membersUnsub = null;

  if (!familyId) {
    familyDoc.set(null);
    members.set([]);
    return () => {};
  }

  _familyUnsub = onSnapshot(
    doc(db, 'families', familyId),
    (snap) => familyDoc.set(snap.exists() ? (snap.data() as FamilyDoc) : null),
    (err) => console.warn('[familyDoc] listener error:', err.code)
  );

  _membersUnsub = onSnapshot(
    collection(db, 'families', familyId, 'members'),
    (snap) => members.set(snap.docs.map(d => d.data() as MemberDoc)),
    (err) => console.warn('[members] listener error:', err.code)
  );

  return () => {
    _familyUnsub?.();
    _membersUnsub?.();
    _familyUnsub = null;
    _membersUnsub = null;
  };
}
