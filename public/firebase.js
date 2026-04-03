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
  deleteDoc,
  collection,
  getDocs,
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
// AUTH
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
// USERS
// ---------------------------------------------------------
export async function getUser(uid) {
  const ref = doc(db, "users", uid);
  const snap = await getDoc(ref);
  return snap.exists() ? snap.data() : null;
}

// Création / mise à jour du profil user
export async function createUserProfile(uid, { role, familyId, displayName }) {
  const ref = doc(db, "users", uid);
  await setDoc(ref, {
    uid,
    role: role ?? null,
    familyId: familyId ?? null,
    displayName: displayName ?? null,
    createdAt: Date.now()
  }, { merge: true });
}

// ---------------------------------------------------------
// FAMILIES
// ---------------------------------------------------------
export async function createFamily(user, familyName, parentDisplayName) {
  const familyId = crypto.randomUUID();

  // Doc public minimal
  await setDoc(doc(db, "families", familyId), {
    ownerIds: [user.uid],
    createdAt: Date.now()
  });

  // Doc privé avec le nom de la famille
  await setDoc(doc(db, "families", familyId, "private", "info"), {
    familyName
  });

  // Membre parent
  await setDoc(doc(db, "families", familyId, "members", user.uid), {
    uid: user.uid,
    role: "parent",
    displayName: parentDisplayName
  });

  // Profil user
  await createUserProfile(user.uid, {
    role: "parent",
    familyId,
    displayName: parentDisplayName
  });

  return familyId;
}

export async function joinFamily(user, familyId, childName) {
  await setDoc(doc(db, "families", familyId, "members", user.uid), {
    uid: user.uid,
    role: "child",
    displayName: childName
  });

  await createUserProfile(user.uid, {
    role: "child",
    familyId,
    displayName: childName
  });

  return familyId;
}

export async function deleteFamily(familyId) {
  // POC : on ne supprime que le doc racine
  await deleteDoc(doc(db, "families", familyId));
}

export async function getFamilyChildren(familyId) {
  const col = collection(db, "families", familyId, "members");
  const snap = await getDocs(col);

  const children = [];
  snap.forEach(d => {
    const data = d.data();
    if (data.role === "child") {
      children.push({ uid: data.uid, name: data.displayName });
    }
  });
  return children;
}

export async function getFamilyPrivateInfo(familyId) {
  const ref = doc(db, "families", familyId, "private", "info");
  const snap = await getDoc(ref);
  return snap.exists() ? snap.data() : null;
}

// ---------------------------------------------------------
// INVITATIONS (general + reconnect)
// ---------------------------------------------------------
function generateShortCode() {
  const chars = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";
  const arr = new Uint8Array(6);
  crypto.getRandomValues(arr);
  return Array.from(arr).map(b => chars[b % chars.length]).join("");
}

// Nouvel enfant
export async function createInvite(familyId) {
  const shortCode = generateShortCode();
  const expiresAt = Date.now() + 15 * 60 * 1000;

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

// Reconnexion enfant existant
export async function createReconnectInvite(familyId, childUid) {
  const shortCode = generateShortCode();
  const expiresAt = Date.now() + 10 * 60 * 1000;

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

// Résolution d’un code
export async function resolveInvite(shortCode) {
  // general
  let ref = doc(db, "invites", "general", shortCode);
  let snap = await getDoc(ref);

  if (snap.exists()) {
    const data = snap.data();
    if (!data.active || Date.now() > data.expiresAt) {
      throw new Error("Code expiré");
    }
    return { ...data, type: "general" };
  }

  // reconnect
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
