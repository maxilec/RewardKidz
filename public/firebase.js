// ---------------------------------------------------------
// Firebase initialization + helpers
// ---------------------------------------------------------

import { firebaseConfig } from "./firebase.config.js";

import {
  initializeApp
} from "https://www.gstatic.com/firebasejs/10.8.0/firebase-app.js";

import {
  getAuth,
  GoogleAuthProvider,
  signInWithPopup,
  signOut,
  onAuthStateChanged,
  signInAnonymously
} from "https://www.gstatic.com/firebasejs/10.8.0/firebase-auth.js";

import {
  getFirestore,
  doc,
  getDoc,
  setDoc
} from "https://www.gstatic.com/firebasejs/10.8.0/firebase-firestore.js";

// --- Init Firebase ---
const app = initializeApp(firebaseConfig);
export const auth = getAuth(app);
export const db = getFirestore(app);
export const provider = new GoogleAuthProvider();

// ---------------------------------------------------------
// AUTH HELPERS
// ---------------------------------------------------------

export async function loginWithGoogle() {
  const result = await signInWithPopup(auth, provider);
  return result.user;
}

export async function loginAsChild() {
  const result = await signInAnonymously(auth);
  return result.user;
}

export async function logout() {
  await signOut(auth);
}

export function onUserStateChanged(callback) {
  return onAuthStateChanged(auth, callback);
}

// ---------------------------------------------------------
// USER HELPERS
// ---------------------------------------------------------

export async function getUser(uid) {
  const ref = doc(db, "users", uid);
  const snap = await getDoc(ref);
  return snap.exists() ? snap.data() : null;
}

export async function ensureUserDocument(user) {
  const ref = doc(db, "users", user.uid);
  const snap = await getDoc(ref);

  if (!snap.exists()) {
    await setDoc(ref, {
      uid: user.uid,
      email: user.email || null,
      displayName: user.displayName || null,
      familyId: null,
      role: "none",
      createdAt: Date.now()
    });
  }
}

// ---------------------------------------------------------
// FAMILY HELPERS
// ---------------------------------------------------------

export async function createFamily(user, familyName) {
  const familyId = crypto.randomUUID();

  await setDoc(doc(db, "families", familyId), {
    name: familyName,
    ownerIds: [user.uid],
    createdAt: Date.now()
  });

  await setDoc(doc(db, "families", familyId, "members", user.uid), {
    uid: user.uid,
    role: "parent",
    displayName: user.displayName || "Parent"
  });

  await setDoc(doc(db, "users", user.uid), {
    familyId,
    role: "parent"
  }, { merge: true });

  return familyId;
}

export async function joinFamily(user, familyId) {
  const ref = doc(db, "families", familyId);
  const snap = await getDoc(ref);

  if (!snap.exists()) throw new Error("Famille introuvable");

  await setDoc(doc(db, "families", familyId, "members", user.uid), {
    uid: user.uid,
    role: "child",
    displayName: user.displayName || "Enfant"
  });

  await setDoc(doc(db, "users", user.uid), {
    familyId,
    role: "child"
  }, { merge: true });

  return familyId;
}
