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
  query,
  where,
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
  const batch = writeBatch(db);

  // Création atomique : famille + membre + user doc en un seul commit
  batch.set(doc(db, "families", familyId), {
    name: familyName,
    ownerIds: [user.uid],
    createdAt: Date.now()
  });
  batch.set(doc(db, "families", familyId, "members", user.uid), {
    uid: user.uid,
    role: "parent",
    displayName: user.displayName || "Parent"
  });
  batch.set(doc(db, "users", user.uid), {
    uid: user.uid,
    email: user.email || null,
    displayName: user.displayName || null,
    familyId,
    role: "parent",
    createdAt: Date.now()
  });

  await batch.commit();
  return familyId;
}

export async function joinFamily(user, familyId) {
  const batch = writeBatch(db);

  // Création atomique : membre + user doc en un seul commit
  batch.set(doc(db, "families", familyId, "members", user.uid), {
    uid: user.uid,
    role: "child",
    displayName: user.displayName || "Enfant"
  });
  batch.set(doc(db, "users", user.uid), {
    uid: user.uid,
    email: user.email || null,
    displayName: user.displayName || null,
    familyId,
    role: "child",
    createdAt: Date.now()
  });

  await batch.commit();
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

// Returns the shortCode of an active, non-expired invite for this family, or null
export async function getActiveInvite(familyId) {
  const snap = await getDocs(query(collection(db, "invites"), where("familyId", "==", familyId)));
  const now = Date.now();
  for (const d of snap.docs) {
    const data = d.data();
    if (data.active && data.expiresAt > now) return data.shortCode;
  }
  return null;
}

// Create an invitation valid for 15 minutes.
// Deletes expired invites for this family first. Creates a new one.
export async function createInvite(familyId) {
  // Nettoyage des invites expirées
  const snap = await getDocs(query(collection(db, "invites"), where("familyId", "==", familyId)));
  const now = Date.now();
  const cleanupBatch = writeBatch(db);
  let hasCleanup = false;
  snap.forEach(d => {
    if (!d.data().active || d.data().expiresAt <= now) {
      cleanupBatch.delete(d.ref);
      hasCleanup = true;
    }
  });
  if (hasCleanup) await cleanupBatch.commit();

  // Création du nouveau code
  const shortCode = generateShortCode();
  const expiresAt = now + 15 * 60 * 1000;
  await setDoc(doc(db, "invites", shortCode), {
    familyId,
    shortCode,
    createdAt: serverTimestamp(),
    expiresAt,
    active: true
  });

  return shortCode;
}

// Delete a family, all its members' user documents, and all linked invitations
export async function deleteFamily(familyId) {
  const [membersSnap, invitesSnap] = await Promise.all([
    getDocs(collection(db, "families", familyId, "members")),
    getDocs(query(collection(db, "invites"), where("familyId", "==", familyId)))
  ]);

  // Batch 1 : suppression des user docs + invitations pendant que la famille et ses
  // membres existent encore (isMemberOf() dans les rules s'évalue correctement)
  const cleanupBatch = writeBatch(db);
  membersSnap.forEach(memberDoc => cleanupBatch.delete(doc(db, "users", memberDoc.id)));
  invitesSnap.forEach(inviteDoc => cleanupBatch.delete(inviteDoc.ref));
  await cleanupBatch.commit();

  // Batch 2 : suppression des docs membre + famille
  const familyBatch = writeBatch(db);
  membersSnap.forEach(memberDoc => familyBatch.delete(memberDoc.ref));
  familyBatch.delete(doc(db, "families", familyId));
  await familyBatch.commit();
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
