// ---------------------------------------------------------
// Firebase initialization
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
  setDoc,
  getDocs,
  deleteDoc,
  writeBatch,
  collection,
  serverTimestamp
} from "https://www.gstatic.com/firebasejs/10.8.0/firebase-firestore.js";

// ---------------------------------------------------------
// Init Firebase
// ---------------------------------------------------------
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

export async function getFamily(familyId) {
  const ref = doc(db, "families", familyId);
  const snap = await getDoc(ref);
  return snap.exists() ? snap.data() : null;
}

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

  // User doc créé ici — jamais avant (pas de collecte de données prématurée)
  await setDoc(doc(db, "users", user.uid), {
    uid: user.uid,
    email: user.email || null,
    displayName: user.displayName || null,
    familyId,
    role: "parent",
    createdAt: Date.now()
  });

  return familyId;
}

export async function joinFamily(user, familyId) {
  await setDoc(doc(db, "families", familyId, "members", user.uid), {
    uid: user.uid,
    role: "child",
    displayName: user.displayName || "Enfant"
  });

  // User doc créé ici — jamais avant (pas de collecte de données prématurée)
  await setDoc(doc(db, "users", user.uid), {
    uid: user.uid,
    email: user.email || null,
    displayName: user.displayName || null,
    familyId,
    role: "child",
    createdAt: Date.now()
  });

  return familyId;
}

// ---------------------------------------------------------
// INVITATION SYSTEM (shortCode 6 chars + expiration)
// ---------------------------------------------------------

// 6-char alphanumeric code (no ambiguous chars)
function generateShortCode() {
  const chars = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";
  const arr = new Uint8Array(6);
  crypto.getRandomValues(arr);
  return Array.from(arr).map(b => chars[b % chars.length]).join("");
}

// Create an invitation valid for 15 minutes
export async function createInvite(familyId) {
  const shortCode = generateShortCode();
  const expiresAt = Date.now() + 15 * 60 * 1000; // 15 minutes

  await setDoc(doc(db, "invites", shortCode), {
    familyId,
    shortCode,
    createdAt: serverTimestamp(),
    expiresAt,
    active: true
  });

  return shortCode;
}

// Delete a family and all its members' user documents
export async function deleteFamily(familyId) {
  const batch = writeBatch(db);

  const membersSnap = await getDocs(collection(db, "families", familyId, "members"));
  membersSnap.forEach(memberDoc => {
    batch.delete(doc(db, "users", memberDoc.id)); // Suppression du compte utilisateur
    batch.delete(memberDoc.ref);                  // Suppression du membre
  });

  batch.delete(doc(db, "families", familyId));

  await batch.commit();
}

// Resolve an invitation code → returns familyId
export async function resolveInvite(shortCode) {
  const ref = doc(db, "invites", shortCode);
  const snap = await getDoc(ref);

  if (!snap.exists()) throw new Error("Code invalide");

  const data = snap.data();

  if (!data.active) throw new Error("Code expiré");
  if (Date.now() > data.expiresAt) throw new Error("Code expiré");

  return data.familyId;
}
