import { getMessaging, getToken, onMessage } from 'firebase/messaging';
import { getFirestore, doc, updateDoc } from 'firebase/firestore';
import { firebaseApp, vapidKey, swConfig } from './app';

const messaging = getMessaging(firebaseApp);
const db        = getFirestore(firebaseApp);

// ─────────────────────────────────────────────────────────────
// Push config → Service Worker FCM
// ─────────────────────────────────────────────────────────────

/**
 * Envoie la config Firebase au Service Worker FCM pour lui permettre
 * d'initialiser Firebase en mode background (quand l'app est fermée).
 */
export async function sendConfigToSW(): Promise<void> {
  if (!('serviceWorker' in navigator)) return;
  try {
    const reg  = await navigator.serviceWorker.ready;
    const ctrl = reg.active;
    if (ctrl) ctrl.postMessage({ type: 'FIREBASE_CONFIG', config: swConfig });
  } catch { /* silencieux */ }
}

// ─────────────────────────────────────────────────────────────
// Notifications (enfant uniquement)
// ─────────────────────────────────────────────────────────────

/**
 * Demande la permission, obtient le token FCM et le persiste dans le membre doc.
 * À appeler côté enfant uniquement, après identification.
 */
export async function initNotifications(familyId: string, memberId: string): Promise<void> {
  if (!('Notification' in window) || !('serviceWorker' in navigator)) return;

  let permission = Notification.permission;
  if (permission === 'default') {
    permission = await Notification.requestPermission();
  }
  if (permission !== 'granted') return;

  try {
    const reg   = await navigator.serviceWorker.ready;
    const token = await getToken(messaging, {
      vapidKey,
      serviceWorkerRegistration: reg
    });
    if (!token) return;

    await updateDoc(doc(db, 'families', familyId, 'members', memberId), { fcmToken: token });
  } catch (e) {
    console.warn('[FCM] getToken failed:', e);
  }
}

/**
 * Enregistre un callback pour les messages FCM reçus au premier plan.
 * Retourne une fonction de désinscription.
 */
export function onForegroundMessage(
  callback: (payload: { notification?: { title?: string; body?: string } }) => void
): () => void {
  return onMessage(messaging, callback as Parameters<typeof onMessage>[1]);
}
