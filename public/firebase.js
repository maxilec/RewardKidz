// ---------------------------------------------------------
// Firebase initialization
// ---------------------------------------------------------
import { firebaseConfig } from "./firebase.config.js";

import {
  initializeApp
} from "https://www.gstatic.com/firebasejs/10.8.0/firebase-app.js";

import {
  getMessaging,
  getToken,
  onMessage
} from "https://www.gstatic.com/firebasejs/10.8.0/firebase-messaging.js";

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
  deleteUser
} from "https://www.gstatic.com/firebasejs/10.8.0/firebase-auth.js";

import {
  getFirestore,
  doc,
  getDoc,
  setDoc,
  getDocs,
  deleteDoc,
  writeBatch,
  updateDoc,
  arrayUnion,
  collection,
  query,
  where,
  serverTimestamp,
  onSnapshot
} from "https://www.gstatic.com/firebasejs/10.8.0/firebase-firestore.js";

// ---------------------------------------------------------
// Init Firebase
// ---------------------------------------------------------
const app = initializeApp(firebaseConfig);
export const auth = getAuth(app);
export const db = getFirestore(app);
export const provider = new GoogleAuthProvider();

// Config minimale exposée pour le service worker (valeurs publiques côté client)
export const swConfig = {
  apiKey:            firebaseConfig.apiKey,
  projectId:         firebaseConfig.projectId,
  messagingSenderId: firebaseConfig.messagingSenderId,
  appId:             firebaseConfig.appId,
};

// Firebase Cloud Messaging
export const messaging = getMessaging(app);

// Demande la permission, obtient le token FCM et le persiste dans le membre doc.
// À appeler côté enfant uniquement, après identification.
export async function initNotifications(familyId, memberId) {
  if (!('Notification' in window) || !('serviceWorker' in navigator)) return;
  let permission = Notification.permission;
  if (permission === 'default') {
    permission = await Notification.requestPermission();
  }
  if (permission !== 'granted') return;
  try {
    const reg = await navigator.serviceWorker.ready;
    const token = await getToken(messaging, {
      vapidKey: firebaseConfig.vapidKey,
      serviceWorkerRegistration: reg,
    });
    if (!token) return;
    await updateDoc(doc(db, "families", familyId, "members", memberId), {
      fcmToken: token,
    });
  } catch (e) {
    console.warn('[FCM] getToken failed:', e);
  }
}

// Enregistre un callback pour les messages FCM reçus quand l'app est au premier plan.
export function onForegroundMessage(callback) {
  return onMessage(messaging, callback);
}

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

export async function loginWithEmail(email, password) {
  const result = await signInWithEmailAndPassword(auth, email, password);
  return result.user;
}

export async function registerWithEmail(email, password, displayName) {
  const result = await createUserWithEmailAndPassword(auth, email, password);
  if (displayName) await updateProfile(result.user, { displayName });
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

export async function createFamily(user, familyName, parentDisplayName) {
  const familyId = crypto.randomUUID();
  const familyCode = generateFamilyCode();
  const displayName = parentDisplayName || user.displayName || "Parent";
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
    displayName
  });
  batch.set(doc(db, "users", user.uid), {
    uid: user.uid,
    email: user.email || null,
    displayName,
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
    childPasswordHash,
    linkedAuthUid: user.uid
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

// Join a family as a Google / email-authenticated adult (no PIN needed) — role: parent
export async function joinFamilyAsAuthenticated(user, familyId, displayName) {
  const name = displayName || user.displayName || "Membre";
  const batch = writeBatch(db);
  batch.set(doc(db, "families", familyId, "members", user.uid), {
    uid: user.uid,
    memberId: user.uid,
    linkedAuthUid: user.uid,
    role: "parent",
    displayName: name
  });
  batch.set(doc(db, "users", user.uid), {
    uid: user.uid,
    email: user.email || null,
    displayName: name,
    familyId,
    memberId: user.uid,
    role: "parent",
    createdAt: Date.now()
  });
  await batch.commit();
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
  // oldUid is read from reconnectPublic (public read) — avoid reading members doc
  // which requires isParentOf/isMemberOf (not yet satisfied by the reconnecting user)
  const oldUid = match.data().linkedAuthUid;

  // 3. Atomic update: linkedAuthUid + user docs + reconnectPublic
  const batch = writeBatch(db);
  batch.update(memberRef, { linkedAuthUid: user.uid });
  batch.update(match.ref, { linkedAuthUid: user.uid });
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

// Generate and save a permanent familyCode for families created before this feature
export async function migrateFamilyCode(familyId) {
  const familyCode = generateFamilyCode();
  const batch = writeBatch(db);
  batch.update(doc(db, "families", familyId), { familyCode });
  batch.set(doc(db, "familyCodes", familyCode), { familyId });
  await batch.commit();
  return familyCode;
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
// CHILD OTP SYSTEM
// ---------------------------------------------------------

// Create a child account (parent-side) and generate their first OTP
export async function addChild(familyId, displayName) {
  const memberId = crypto.randomUUID();
  await setDoc(doc(db, "families", familyId, "members", memberId), {
    memberId, role: "child", displayName, linkedAuthUid: null
  });
  const otp = await generateChildOTP(familyId, memberId, displayName);
  return { memberId, otp };
}

// Rename a child (parent-side) — updates member doc only
export async function updateChildName(familyId, memberId, newName) {
  await updateDoc(doc(db, "families", familyId, "members", memberId), { displayName: newName });
}

// Delete a child and all associated data (parent-side)
export async function deleteChild(familyId, memberId) {
  const memberRef = doc(db, "families", familyId, "members", memberId);
  const memberSnap = await getDoc(memberRef);
  if (!memberSnap.exists()) throw new Error("Enfant introuvable");
  const { linkedAuthUid } = memberSnap.data();

  const batch = writeBatch(db);
  batch.delete(memberRef);
  batch.delete(doc(db, "families", familyId, "childOTPs", memberId));
  // Delete today's score doc (history sub-collection remains orphaned — no cascade possible client-side)
  batch.delete(doc(db, "families", familyId, "scores", memberId));
  if (linkedAuthUid) batch.delete(doc(db, "users", linkedAuthUid));
  await batch.commit();

  // Clean up any top-level OTP doc for this child
  const otpSnap = await getDocs(query(collection(db, "childOTPs"), where("memberId", "==", memberId)));
  if (!otpSnap.empty) {
    const cleanBatch = writeBatch(db);
    otpSnap.forEach(d => cleanBatch.delete(d.ref));
    await cleanBatch.commit();
  }
}

// Generate (or regenerate) a 6-digit OTP for an existing child.
// Called by the parent who already has isParentOf rights → can read the member doc.
// currentLinkedAuthUid is stored in the OTP doc so the child device never needs to
// read the member doc directly (permission denied for anonymous users).
export async function generateChildOTP(familyId, memberId, displayName) {
  // Read the current linked UID so reconnection can clean up the old user doc
  const memberSnap = await getDoc(doc(db, "families", familyId, "members", memberId));
  const currentLinkedAuthUid = memberSnap.exists() ? memberSnap.data().linkedAuthUid : null;

  // Clean up any previous OTP for this child
  const oldSnap = await getDocs(query(
    collection(db, "childOTPs"), where("memberId", "==", memberId)
  ));
  if (!oldSnap.empty) {
    const cleanBatch = writeBatch(db);
    oldSnap.forEach(d => cleanBatch.delete(d.ref));
    cleanBatch.delete(doc(db, "families", familyId, "childOTPs", memberId));
    await cleanBatch.commit();
  }

  const otpCode = String(Math.floor(100000 + Math.random() * 900000));
  const expiresAt = Date.now() + 30 * 60 * 1000; // 30 min

  const b = writeBatch(db);
  // Top-level doc: child looks up by code (public read, no auth needed)
  b.set(doc(db, "childOTPs", otpCode), {
    otpCode, familyId, memberId, displayName, expiresAt, currentLinkedAuthUid
  });
  // Subcollection doc: existence check for Firestore security rules
  b.set(doc(db, "families", familyId, "childOTPs", memberId), { otpCode, expiresAt });
  await b.commit();
  return otpCode;
}

// Connect a child device using the family code (8 chars) + child OTP (6 digits).
// All required data comes from the public OTP doc → no member doc read needed.
export async function connectChildDevice(user, familyCode, otpCode) {
  // 1. Resolve family code → familyId (public)
  const familyId = await resolveByFamilyCode(familyCode);

  // 2. Read and validate OTP (public)
  const otpRef = doc(db, "childOTPs", otpCode);
  const otpSnap = await getDoc(otpRef);
  if (!otpSnap.exists()) throw new Error("Code enfant invalide");
  const { familyId: otpFamilyId, memberId, displayName, expiresAt, currentLinkedAuthUid } = otpSnap.data();
  if (otpFamilyId !== familyId) throw new Error("Le code famille et le code enfant ne correspondent pas");
  if (Date.now() > expiresAt) throw new Error("Code expiré — demande un nouveau code au parent");

  const oldUid = currentLinkedAuthUid || null;
  const batch = writeBatch(db);
  batch.update(doc(db, "families", familyId, "members", memberId), { linkedAuthUid: user.uid });
  batch.delete(otpRef);
  batch.delete(doc(db, "families", familyId, "childOTPs", memberId));
  if (oldUid && oldUid !== user.uid) batch.delete(doc(db, "users", oldUid));
  batch.set(doc(db, "users", user.uid), {
    uid: user.uid, email: null, displayName, familyId, memberId, role: "child", createdAt: Date.now()
  });
  await batch.commit();
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

// ---------------------------------------------------------
// SCORE HISTORY
// ---------------------------------------------------------

// Fetch the last `days` entries for a child's score, newest = last element.
// `todayScore` is the already-loaded score for today (passed to avoid an extra read).
// Missing days (parent never opened dashboard that day) are returned with missing: true.
export async function getChildHistory(familyId, memberId, days, todayScore) {
  // Build list of past dates (excluding today)
  const pastDates = Array.from({ length: days - 1 }, (_, i) => {
    const d = new Date();
    d.setDate(d.getDate() - (days - 1 - i));
    return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
  });

  // Parallel reads — one getDoc per date
  const snaps = await Promise.all(
    pastDates.map(date => getDoc(doc(db, "families", familyId, "scores", memberId, "history", date)))
  );

  const history = pastDates.map((date, i) => {
    const snap = snaps[i];
    return snap.exists()
      ? { date, missing: false, ...snap.data() }
      : { date, missing: true, points: 0, validated: false, ignored: false };
  });

  // Append today (already loaded by caller)
  history.push({ ...todayScore, missing: false, isToday: true });
  return history;
}

// ---------------------------------------------------------
// DELETE PARENT ACCOUNT
// ---------------------------------------------------------

// Delete the current parent's account.
// - Sole parent + children  → throws (blocked in UI, safety guard)
// - Sole parent + no children → deletes the entire family
// - Multiple parents → removes only this member, family stays active
// Firestore data is removed first; Auth deletion is best-effort
// (if recent-login required, data is already gone and user is signed out)
export async function deleteParentAccount(user, familyId) {
  const members  = await getFamilyMembers(familyId);
  const parents  = members.filter(m => m.role === "parent");
  const children = members.filter(m => m.role === "child");

  if (parents.length === 1 && children.length > 0) {
    throw new Error("Impossible : vous êtes le seul parent et la famille a des enfants.");
  }

  if (parents.length <= 1) {
    // Sole parent, no children → delete the whole family
    await deleteFamily(familyId);
  } else {
    // Multiple parents → remove only this parent
    const batch = writeBatch(db);
    batch.delete(doc(db, "families", familyId, "members", user.uid));
    batch.delete(doc(db, "users", user.uid));
    await batch.commit();
  }

  // Best-effort Auth account deletion
  try {
    await deleteUser(user);
  } catch {
    // requires-recent-login: Firestore data already gone, just sign out
    await signOut(auth);
  }
}

// ---------------------------------------------------------
// SCORE SYSTEM
// ---------------------------------------------------------

function today() {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}-${String(d.getDate()).padStart(2,'0')}`;
}

// Get or create today's score doc. Archives previous day if date changed. Parent only (write needed).
export async function getOrCreateDayScore(familyId, memberId) {
  const ref = doc(db, "families", familyId, "scores", memberId);
  const snap = await getDoc(ref);
  const todayStr = today();

  if (snap.exists()) {
    const data = snap.data();
    if (data.date === todayStr) return { id: memberId, ...data };
    // Archive previous day to history
    await setDoc(
      doc(db, "families", familyId, "scores", memberId, "history", data.date),
      { ...data, archivedAt: serverTimestamp() }
    );
  }

  const fresh = { points: 0, date: todayStr, validated: false, ignored: false, log: [] };
  await setDoc(ref, { ...fresh, updatedAt: serverTimestamp() });
  return { id: memberId, ...fresh };
}

// Read today's score for a child (read-only — children cannot write scores).
export async function readDayScore(familyId, memberId) {
  const ref = doc(db, "families", familyId, "scores", memberId);
  const snap = await getDoc(ref);
  const todayStr = today();
  if (!snap.exists() || snap.data().date !== todayStr) {
    return { id: memberId, points: 0, date: todayStr, validated: false, ignored: false, log: [] };
  }
  return { id: memberId, ...snap.data() };
}

// Add 1 point (max 5). Parent only.
export async function addPoint(familyId, memberId, byUid, byName) {
  const score = await getOrCreateDayScore(familyId, memberId);
  if (score.validated || score.ignored) throw new Error("Score verrouillé — journée validée ou ignorée");
  if (score.points >= 5) throw new Error("Score maximum atteint (5/5)");
  const newPoints = score.points + 1;
  await updateDoc(doc(db, "families", familyId, "scores", memberId), {
    points: newPoints,
    log: arrayUnion({ type: 'add', by: byUid, byName, pointsAfter: newPoints, ts: Date.now() }),
    updatedAt: serverTimestamp()
  });
  return newPoints;
}

// Remove 1 point (min 0). Parent only.
export async function removePoint(familyId, memberId, byUid, byName) {
  const score = await getOrCreateDayScore(familyId, memberId);
  if (score.validated || score.ignored) throw new Error("Score verrouillé — journée validée ou ignorée");
  if (score.points <= 0) throw new Error("Score déjà à 0");
  const newPoints = score.points - 1;
  await updateDoc(doc(db, "families", familyId, "scores", memberId), {
    points: newPoints,
    log: arrayUnion({ type: 'remove', by: byUid, byName, pointsAfter: newPoints, ts: Date.now() }),
    updatedAt: serverTimestamp()
  });
  return newPoints;
}

// Validate or un-validate the day's score. Reversible. Parent only.
export async function setScoreValidated(familyId, memberId, validated, byUid, byName) {
  const score = await getOrCreateDayScore(familyId, memberId);
  await updateDoc(doc(db, "families", familyId, "scores", memberId), {
    validated,
    log: arrayUnion({ type: validated ? 'validate' : 'unvalidate', by: byUid, byName, pointsAfter: score.points, ts: Date.now() }),
    updatedAt: serverTimestamp()
  });
}

// Ignore or un-ignore the day. Reversible. Parent only.
export async function setDayIgnored(familyId, memberId, ignored, byUid, byName) {
  const score = await getOrCreateDayScore(familyId, memberId);
  await updateDoc(doc(db, "families", familyId, "scores", memberId), {
    ignored,
    log: arrayUnion({ type: ignored ? 'ignore' : 'unignore', by: byUid, byName, pointsAfter: score.points, ts: Date.now() }),
    updatedAt: serverTimestamp()
  });
}

// Real-time listener on today's score for a child (parent or child view).
// Returns an unsubscribe function. Calls callback immediately with current data.
export function subscribeToScore(familyId, memberId, callback) {
  const ref = doc(db, "families", familyId, "scores", memberId);
  return onSnapshot(
    ref,
    snap => {
      const todayStr = today();
      const data = snap.exists() ? snap.data() : null;
      if (data && data.date === todayStr) {
        callback({ id: memberId, ...data });
      } else {
        callback({ id: memberId, points: 0, date: todayStr, validated: false, ignored: false, log: [] });
      }
    },
    err => {
      // Erreur silencieuse — typiquement token expiré ou permission révoquée.
      // Le listener sera relancé automatiquement quand l'auth se rétablit.
      console.warn('[subscribeToScore] listener error:', err.code);
    }
  );
}

// Update the family name (parent only).
export async function updateFamilyName(familyId, newName) {
  await updateDoc(doc(db, "families", familyId), { name: newName });
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
