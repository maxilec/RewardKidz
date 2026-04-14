import { writable, derived } from 'svelte/store';
import type { FamilyDoc, MemberDoc } from '$lib/firebase/types';

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
