import { writable } from 'svelte/store';

// ─────────────────────────────────────────────────────────────
// UI state stores
// ─────────────────────────────────────────────────────────────

/** Le drawer latéral parent est-il ouvert ? */
export const drawerOpen = writable(false);

/** ID de la modale actuellement ouverte (null = aucune) */
export const activeModal = writable<string | null>(null);

/** Événement `beforeinstallprompt` capturé pour le bandeau PWA */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
export const pwaPrompt = writable<any | null>(null);

// ─────────────────────────────────────────────────────────────
// Helpers
// ─────────────────────────────────────────────────────────────

export function openDrawer(): void {
  drawerOpen.set(true);
  if (typeof document !== 'undefined') {
    document.body.style.overflow = 'hidden';
  }
}

export function closeDrawer(): void {
  drawerOpen.set(false);
  if (typeof document !== 'undefined') {
    document.body.style.overflow = '';
  }
}

export function openModal(id: string): void {
  activeModal.set(id);
}

export function closeModal(): void {
  activeModal.set(null);
}
