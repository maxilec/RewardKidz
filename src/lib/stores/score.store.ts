import { writable, get } from 'svelte/store';
import type { Unsubscribe } from 'firebase/firestore';
import { subscribeToScore } from '$lib/firebase/scores';
import type { ScoreDoc } from '$lib/firebase/types';

// ─────────────────────────────────────────────────────────────
// Store principal : scores par memberId
// ─────────────────────────────────────────────────────────────

/** Map memberId → ScoreDoc courant */
export const scores = writable<Record<string, ScoreDoc>>({});

// ─────────────────────────────────────────────────────────────
// Gestion des subscriptions Firestore
// ─────────────────────────────────────────────────────────────

const _unsubscribers = new Map<string, Unsubscribe>();

/**
 * Abonne un enfant au score temps réel.
 * Idempotent : si un listener est déjà actif pour ce memberId, ne fait rien.
 */
export function subscribeChildScore(familyId: string, memberId: string): void {
  if (_unsubscribers.has(memberId)) return;

  const unsub = subscribeToScore(familyId, memberId, (score) => {
    scores.update(s => ({ ...s, [memberId]: score }));
  });

  _unsubscribers.set(memberId, unsub);
}

/**
 * Désabonne un enfant et supprime son score du store.
 */
export function unsubscribeChild(memberId: string): void {
  const unsub = _unsubscribers.get(memberId);
  if (unsub) {
    unsub();
    _unsubscribers.delete(memberId);
    scores.update(s => {
      const next = { ...s };
      delete next[memberId];
      return next;
    });
  }
}

/**
 * Désabonne tous les enfants et vide le store.
 * À appeler lors du logout ou du changement de famille.
 */
export function unsubscribeAll(): void {
  _unsubscribers.forEach(unsub => unsub());
  _unsubscribers.clear();
  scores.set({});
}
