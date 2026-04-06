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

// ---------------------------------------------------------
// PIN HELPERS
// ---------------------------------------------------------

// Hash a PIN using SHA-256 with familyId as salt
async function hashPin(familyId, pin) {
  const data = new TextEncoder().encode(familyId + ":" + pin);
  const buf = await crypto.subtle.digest("SHA-256", data);
  return Array.from(new Uint8Array(buf)).map(b => b.toString(16).padStart(2, "0")).join("");
}

// Generate a permanent family code (8 chars)
function generateFamilyCode() {
  const chars = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";
  const arr = new Uint8Array(8);
  crypto.getRandomValues(arr);
  return Array.from(arr).map(b => chars[b % chars.length]).join("");
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
  const familyCode = generateFamilyCode();
  const batch = writeBatch(db);

  // Famille + code permanent + membre parent + user doc en un seul commit
  batch.set(doc(db, "families", familyId), {
    name: familyName,
    familyCode,
    ownerIds: [user.uid],
    createdAt: Date.now()
  });
  batch.set(doc(db, "familyCodes", familyCode), {
    familyId
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

export async function joinFamily(user, familyId, displayName, pin) {
  const memberId = crypto.randomUUID();
  const childPasswordHash = await hashPin(familyId, pin);
  const batch = writeBatch(db);

  batch.set(doc(db, "families", familyId, "members", memberId), {
    memberId,
    linkedAuthUid: user.uid,
    role: "child",
    displayName,
    childPasswordHash
  });
  batch.set(doc(db, "families", familyId, "reconnectPublic", memberId), {
    displayName,
    childPasswordHash
  });
  batch.set(doc(db, "users", user.uid), {
    uid: user.uid,
    email: null,
    displayName,
    familyId,
    memberId,
    role: "child",
    createdAt: Date.now()
  });

  await batch.commit();
  return memberId;
}

// Reconnect an existing child on a new device / new anonymous session
export async function reconnectChild(user, familyId, displayName, pin) {
  // 1. Find member by displayName in reconnectPublic
  const snap = await getDocs(query(
    collection(db, "families", familyId, "reconnectPublic"),
    where("displayName", "==", displayName)
  ));
  if (snap.empty) throw new Error("Aucun membre trouvé avec ce prénom");

  // 2. Verify PIN client-side
  const hash = await hashPin(familyId, pin);
  const match = snap.docs.find(d => d.data().childPasswordHash === hash);
  if (!match) throw new Error("PIN incorrect");

  const memberId = match.id;
  const memberRef = doc(db, "families", familyId, "members", memberId);
  const memberSnap = await getDoc(memberRef);
  const oldUid = memberSnap.data().linkedAuthUid;

  // 3. Atomic update: linkedAuthUid + user docs
  const batch = writeBatch(db);
  batch.update(memberRef, { linkedAuthUid: user.uid });
  if (oldUid && oldUid !== user.uid) {
    batch.delete(doc(db, "users", oldUid));
  }
  batch.set(doc(db, "users", user.uid), {
    uid: user.uid,
    email: null,
    displayName,
    familyId,
    memberId,
    role: "child",
    createdAt: Date.now()
  });
  await batch.commit();
  return memberId;
}

// Resolve a permanent family code → returns familyId
export async function resolveByFamilyCode(permanentCode) {
  const ref = doc(db, "familyCodes", permanentCode.toUpperCase());
  const snap = await getDoc(ref);
  if (!snap.exists()) throw new Error("Code famille invalide");
  return snap.data().familyId;
}

// Get all members of a family
export async function getFamilyMembers(familyId) {
  const snap = await getDocs(collection(db, "families", familyId, "members"));
  return snap.docs.map(d => d.data());
}

// Delete a family, all its members' user documents, reconnectPublic docs, invitations and familyCode index
export async function deleteFamily(familyId) {
  const [membersSnap, invitesSnap, reconnectSnap, familyDoc] = await Promise.all([
    getDocs(collection(db, "families", familyId, "members")),
    getDocs(query(collection(db, "invites"), where("familyId", "==", familyId))),
    getDocs(collection(db, "families", familyId, "reconnectPublic")),
    getDoc(doc(db, "families", familyId))
  ]);

  // Batch 1: delete user docs + invites + reconnectPublic docs
  // (while family still exists so isParentOf() rule evaluates correctly)
  const cleanupBatch = writeBatch(db);
  membersSnap.forEach(memberDoc => {
    const uid = memberDoc.data().linkedAuthUid || memberDoc.data().uid || memberDoc.id;
    cleanupBatch.delete(doc(db, "users", uid));
  });
  invitesSnap.forEach(inviteDoc => cleanupBatch.delete(inviteDoc.ref));
  reconnectSnap.forEach(reconnectDoc => cleanupBatch.delete(reconnectDoc.ref));

  // Delete familyCode index
  const familyCode = familyDoc.exists() ? familyDoc.data().familyCode : null;
  if (familyCode) {
    cleanupBatch.delete(doc(db, "familyCodes", familyCode));
  }
  await cleanupBatch.commit();

  // Batch 2: delete member docs + family
  const familyBatch = writeBatch(db);
  membersSnap.forEach(memberDoc => familyBatch.delete(memberDoc.ref));
  familyBatch.delete(doc(db, "families", familyId));
  await familyBatch.commit();
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
