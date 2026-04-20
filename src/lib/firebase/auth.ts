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

export { signOut } from 'firebase/auth';

// ─────────────────────────────────────────────────────────────
// Traduction des codes d'erreur Firebase Auth → messages FR
// ─────────────────────────────────────────────────────────────

const AUTH_ERROR_MAP: Record<string, string> = {
  'auth/email-already-in-use':  'Cet email est déjà utilisé.',
  'auth/invalid-email':         'Adresse email invalide.',
  'auth/weak-password':         'Mot de passe trop court (6 caractères minimum).',
  'auth/user-not-found':        'Aucun compte trouvé pour cet email.',
  'auth/wrong-password':        'Mot de passe incorrect.',
  'auth/invalid-credential':    'Email ou mot de passe incorrect.',
  'auth/popup-closed-by-user':  'Connexion annulée.',
};

export function translateAuthError(err: unknown): string {
  const e = err as { code?: string; message?: string };
  return (e.code && AUTH_ERROR_MAP[e.code]) || e.message || 'Erreur inconnue.';
}
