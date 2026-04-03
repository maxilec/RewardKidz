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
  serverTimestamp,
  collection
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
      childName: null,
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

export async function joinFamily(user, familyId, childName) {
  await setDoc(doc(db, "families", familyId, "members", user.uid), {
    uid: user.uid,
    role: "child",
    displayName: childName
  });

  await setDoc(doc(db, "users", user.uid), {
    familyId,
    role: "child",
    childName
  }, { merge: true });

  return familyId;
}

export async function deleteFamily(familyId) {
  await deleteDoc(doc(db, "families", familyId));
}

export async function getFamilyChildren(familyId) {
  const col = collection(db, "families", familyId, "members");
  const snap = await getDocs(col);

  const children = [];
  snap.forEach(doc => {
    const data = doc.data();
    if (data.role === "child") {
      children.push({
        uid: data.uid,
        name: data.displayName
      });
    }
  });

  return children;
}
// ---------------------------------------------------------
// INVITATIONS (general + reconnect, shortCode 6 chars)
// ---------------------------------------------------------

function generateShortCode() {
  const chars = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";
  const arr = new Uint8Array(6);
  crypto.getRandomValues(arr);
  return Array.from(arr).map(b => chars[b % chars.length]).join("");
}

// Invitation générale (nouvel enfant)
export async function createInvite(familyId) {
  const shortCode = generateShortCode();
  const expiresAt = Date.now() + 15 * 60 * 1000; // 15 min

  await setDoc(doc(db, "invites", "general", shortCode), {
    familyId,
    shortCode,
    createdAt: serverTimestamp(),
    expiresAt,
    active: true,
    targetUid: null
  });

  return shortCode;
}

// Invitation ciblée (reconnexion enfant existant)
export async function createReconnectInvite(familyId, childUid) {
  const shortCode = generateShortCode();
  const expiresAt = Date.now() + 10 * 60 * 1000; // 10 min

  await setDoc(doc(db, "invites", "reconnect", shortCode), {
    familyId,
    shortCode,
    createdAt: serverTimestamp(),
    expiresAt,
    active: true,
    targetUid: childUid
  });

  return shortCode;
}

// Résolution d’un code (cherche d’abord dans general, puis reconnect)
export async function resolveInvite(shortCode) {
  // 1) general
  let ref = doc(db, "invites", "general", shortCode);
  let snap = await getDoc(ref);

  if (snap.exists()) {
    const data = snap.data();
    if (!data.active || Date.now() > data.expiresAt) {
      throw new Error("Code expiré");
    }
    return { ...data, type: "general" };
  }

  // 2) reconnect
  ref = doc(db, "invites", "reconnect", shortCode);
  snap = await getDoc(ref);

  if (snap.exists()) {
    const data = snap.data();
    if (!data.active || Date.now() > data.expiresAt) {
      throw new Error("Code expiré");
    }
    return { ...data, type: "reconnect" };
  }

  throw new Error("Code invalide");
}
