import {
  getAuth,
  GoogleAuthProvider,
  signInWithPopup,
  signOut,
  onAuthStateChanged,
  signInAnonymously,
  signInWithEmailAndPassword,
  createUserWithEmailAndPassword,
  updateProfile,
  deleteUser,
  sendPasswordResetEmail,
  confirmPasswordReset,
  verifyPasswordResetCode,
  reauthenticateWithCredential,
  EmailAuthProvider,
  updatePassword,
  type User,
  type Unsubscribe
} from 'firebase/auth';
import { firebaseApp } from './app';

export const auth = getAuth(firebaseApp);
export const provider = new GoogleAuthProvider();

// ─────────────────────────────────────────────────────────────
// Auth helpers
// ─────────────────────────────────────────────────────────────

export async function loginWithGoogle(): Promise<User | undefined> {
  try {
    const result = await signInWithPopup(auth, provider);
    return result.user;
  } catch (e: unknown) {
    const err = e as { code?: string };
    // Annulé par un autre popup — silencieux
    if (err.code === 'auth/cancelled-popup-request') return undefined;
    throw e;
  }
}

export async function loginAsChild(): Promise<User> {
  const result = await signInAnonymously(auth);
  return result.user;
}

export async function loginWithEmail(email: string, password: string): Promise<User> {
  const result = await signInWithEmailAndPassword(auth, email, password);
  return result.user;
}

export async function registerWithEmail(
  email: string,
  password: string,
  displayName?: string
): Promise<User> {
  const result = await createUserWithEmailAndPassword(auth, email, password);
  if (displayName) await updateProfile(result.user, { displayName });
  return result.user;
}

export async function logout(): Promise<void> {
  await signOut(auth);
}

export function onUserStateChanged(
  callback: (user: User | null) => void
): Unsubscribe {
  return onAuthStateChanged(auth, callback);
}

export async function deleteCurrentUser(user: User): Promise<void> {
  await deleteUser(user);
}

export async function resetPassword(email: string): Promise<void> {
  await sendPasswordResetEmail(auth, email);
}

export async function applyPasswordReset(oobCode: string, newPassword: string): Promise<void> {
  await confirmPasswordReset(auth, oobCode, newPassword);
}

export async function getEmailFromResetCode(oobCode: string): Promise<string> {
  return await verifyPasswordResetCode(auth, oobCode);
}

export async function changePassword(
  user: User,
  currentPassword: string,
  newPassword: string
): Promise<void> {
  const credential = EmailAuthProvider.credential(user.email!, currentPassword);
  await reauthenticateWithCredential(user, credential);
  await updatePassword(user, newPassword);
}

export { signOut } from 'firebase/auth';

// ─────────────────────────────────────────────────────────────
// Traduction des codes d'erreur Firebase Auth → messages FR
// ─────────────────────────────────────────────────────────────

const AUTH_ERROR_MAP: Record<string, string> = {
  'auth/email-already-in-use':   'Cet email est déjà utilisé.',
  'auth/invalid-email':          'Adresse email invalide.',
  'auth/weak-password':          'Mot de passe trop court (6 caractères minimum).',
  'auth/user-not-found':         'Aucun compte trouvé pour cet email.',
  'auth/wrong-password':         'Mot de passe incorrect.',
  'auth/invalid-credential':     'Email ou mot de passe incorrect.',
  'auth/popup-closed-by-user':   'Connexion annulée.',
  'auth/too-many-requests':      'Trop de tentatives. Réessayez dans quelques minutes.',
  'auth/requires-recent-login':  'Session expirée. Déconnectez-vous et reconnectez-vous avant de changer le mot de passe.',
};

export function translateAuthError(err: unknown): string {
  const e = err as { code?: string; message?: string };
  return (e.code && AUTH_ERROR_MAP[e.code]) || e.message || 'Erreur inconnue.';
}
