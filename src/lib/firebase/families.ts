import {
  getFirestore,
  doc,
  getDoc,
  setDoc,
  getDocs,
  writeBatch,
  updateDoc,
  collection,
  query,
  where,
  serverTimestamp
} from 'firebase/firestore';
import { getAuth, deleteUser, signOut, type User } from 'firebase/auth';
import { firebaseApp } from './app';
import type { FamilyDoc, InviteLink, MemberDoc, UserDoc } from './types';

export const db = getFirestore(firebaseApp);

// ─────────────────────────────────────────────────────────────
// Helpers internes
// ─────────────────────────────────────────────────────────────

async function hashPin(familyId: string, pin: string): Promise<string> {
  const data = new TextEncoder().encode(familyId + ':' + pin);
  const buf  = await crypto.subtle.digest('SHA-256', data);
  return Array.from(new Uint8Array(buf))
    .map(b => b.toString(16).padStart(2, '0'))
    .join('');
}

function generateFamilyCode(): string {
  const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
  const arr   = new Uint8Array(8);
  crypto.getRandomValues(arr);
  return Array.from(arr).map(b => chars[b % chars.length]).join('');
}

function generateShortCode(): string {
  const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
  const arr   = new Uint8Array(6);
  crypto.getRandomValues(arr);
  return Array.from(arr).map(b => chars[b % chars.length]).join('');
}

function generateToken(): string {
  const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZabcdefghjkmnpqrstuvwxyz23456789';
  const arr   = new Uint8Array(32);
  crypto.getRandomValues(arr);
  return Array.from(arr).map(b => chars[b % chars.length]).join('');
}

// ─────────────────────────────────────────────────────────────
// User
// ─────────────────────────────────────────────────────────────

export async function getUser(uid: string): Promise<UserDoc | null> {
  const ref  = doc(db, 'users', uid);
  const snap = await getDoc(ref);
  return snap.exists() ? (snap.data() as UserDoc) : null;
}

// ─────────────────────────────────────────────────────────────
// Family
// ─────────────────────────────────────────────────────────────

export async function getFamily(familyId: string): Promise<FamilyDoc | null> {
  const ref  = doc(db, 'families', familyId);
  const snap = await getDoc(ref);
  return snap.exists() ? (snap.data() as FamilyDoc) : null;
}

export async function updateFamilyName(familyId: string, newName: string): Promise<void> {
  await updateDoc(doc(db, 'families', familyId), { name: newName });
}

export async function createFamily(
  user: User,
  familyName: string,
  parentDisplayName?: string | null
): Promise<string> {
  const familyId    = crypto.randomUUID();
  const familyCode  = generateFamilyCode();
  const displayName = parentDisplayName || user.displayName || 'Parent';
  const batch       = writeBatch(db);

  batch.set(doc(db, 'families', familyId), {
    name: familyName,
    familyCode,
    ownerIds:  [user.uid],
    createdAt: Date.now()
  });
  batch.set(doc(db, 'familyCodes', familyCode), { familyId });
  batch.set(doc(db, 'families', familyId, 'members', user.uid), {
    uid: user.uid,
    memberId: user.uid,
    role: 'parent',
    displayName
  });
  batch.set(doc(db, 'users', user.uid), {
    uid: user.uid,
    email: user.email || null,
    displayName,
    familyId,
    role: 'parent',
    createdAt: Date.now()
  });

  await batch.commit();
  return familyId;
}

export async function getFamilyMembers(familyId: string): Promise<MemberDoc[]> {
  const snap = await getDocs(collection(db, 'families', familyId, 'members'));
  return snap.docs.map(d => d.data() as MemberDoc);
}

export async function migrateFamilyCode(familyId: string): Promise<string> {
  const familyCode = generateFamilyCode();
  const batch      = writeBatch(db);
  batch.update(doc(db, 'families', familyId), { familyCode });
  batch.set(doc(db, 'familyCodes', familyCode), { familyId });
  await batch.commit();
  return familyCode;
}

export async function deleteFamily(familyId: string): Promise<void> {
  const [membersSnap, invitesSnap, reconnectSnap, familySnap] = await Promise.all([
    getDocs(collection(db, 'families', familyId, 'members')),
    getDocs(query(collection(db, 'invites'), where('familyId', '==', familyId))),
    getDocs(collection(db, 'families', familyId, 'reconnectPublic')),
    getDoc(doc(db, 'families', familyId))
  ]);

  // Batch 1 : suppression user docs + invites + reconnectPublic
  // (pendant que la famille existe encore pour que isParentOf() s'évalue correctement)
  const cleanupBatch = writeBatch(db);
  membersSnap.forEach(memberDoc => {
    const d   = memberDoc.data() as MemberDoc;
    const uid = d.linkedAuthUid || d.uid;
    if (uid) cleanupBatch.delete(doc(db, 'users', uid));
  });
  invitesSnap.forEach(inviteDoc => cleanupBatch.delete(inviteDoc.ref));
  reconnectSnap.forEach(r => cleanupBatch.delete(r.ref));

  const familyCode = familySnap.exists()
    ? (familySnap.data() as FamilyDoc).familyCode
    : null;
  if (familyCode) cleanupBatch.delete(doc(db, 'familyCodes', familyCode));
  await cleanupBatch.commit();

  // Batch 2 : suppression membres + famille
  const familyBatch = writeBatch(db);
  membersSnap.forEach(memberDoc => familyBatch.delete(memberDoc.ref));
  familyBatch.delete(doc(db, 'families', familyId));
  await familyBatch.commit();
}

// ─────────────────────────────────────────────────────────────
// Join / reconnect
// ─────────────────────────────────────────────────────────────

export async function resolveByFamilyCode(permanentCode: string): Promise<string> {
  const ref  = doc(db, 'familyCodes', permanentCode.toUpperCase());
  const snap = await getDoc(ref);
  if (!snap.exists()) throw new Error('Code famille invalide');
  return (snap.data() as { familyId: string }).familyId;
}

export async function joinFamily(
  user: User,
  familyId: string,
  displayName: string,
  pin: string
): Promise<string> {
  const memberId          = crypto.randomUUID();
  const childPasswordHash = await hashPin(familyId, pin);
  const batch             = writeBatch(db);

  batch.set(doc(db, 'families', familyId, 'members', memberId), {
    memberId,
    linkedAuthUid: user.uid,
    role: 'child',
    displayName,
    childPasswordHash
  });
  batch.set(doc(db, 'families', familyId, 'reconnectPublic', memberId), {
    displayName,
    childPasswordHash,
    linkedAuthUid: user.uid
  });
  batch.set(doc(db, 'users', user.uid), {
    uid: user.uid,
    email: null,
    displayName,
    familyId,
    memberId,
    role: 'child',
    createdAt: Date.now()
  });

  await batch.commit();
  return memberId;
}

export async function joinFamilyAsAuthenticated(
  user: User,
  familyId: string,
  displayName?: string
): Promise<void> {
  const name  = displayName || user.displayName || 'Membre';
  const batch = writeBatch(db);

  batch.set(doc(db, 'families', familyId, 'members', user.uid), {
    uid:           user.uid,
    memberId:      user.uid,
    linkedAuthUid: user.uid,
    role:          'parent',
    displayName:   name
  });
  batch.set(doc(db, 'users', user.uid), {
    uid:        user.uid,
    email:      user.email || null,
    displayName: name,
    familyId,
    memberId:   user.uid,
    role:       'parent',
    createdAt:  Date.now()
  });
  await batch.commit();
}

export async function reconnectChild(
  user: User,
  familyId: string,
  displayName: string,
  pin: string
): Promise<string> {
  const snap = await getDocs(query(
    collection(db, 'families', familyId, 'reconnectPublic'),
    where('displayName', '==', displayName)
  ));
  if (snap.empty) throw new Error('Aucun membre trouvé avec ce prénom');

  const hash  = await hashPin(familyId, pin);
  const match = snap.docs.find(d => (d.data() as { childPasswordHash: string }).childPasswordHash === hash);
  if (!match) throw new Error('PIN incorrect');

  const memberId   = match.id;
  const memberRef  = doc(db, 'families', familyId, 'members', memberId);
  const oldUid     = (match.data() as { linkedAuthUid: string }).linkedAuthUid;
  const batch      = writeBatch(db);

  batch.update(memberRef, { linkedAuthUid: user.uid });
  batch.update(match.ref, { linkedAuthUid: user.uid });
  if (oldUid && oldUid !== user.uid) batch.delete(doc(db, 'users', oldUid));
  batch.set(doc(db, 'users', user.uid), {
    uid: user.uid, email: null, displayName, familyId, memberId, role: 'child', createdAt: Date.now()
  });
  await batch.commit();
  return memberId;
}

// ─────────────────────────────────────────────────────────────
// Children management (parent-side)
// ─────────────────────────────────────────────────────────────

export async function addChild(
  familyId: string,
  displayName: string
): Promise<{ memberId: string; otp: string }> {
  const memberId = crypto.randomUUID();
  await setDoc(doc(db, 'families', familyId, 'members', memberId), {
    memberId, role: 'child', displayName, linkedAuthUid: null
  });
  const otp = await generateChildOTP(familyId, memberId, displayName);
  return { memberId, otp };
}

export async function updateChildName(
  familyId: string,
  memberId: string,
  newName: string
): Promise<void> {
  await updateDoc(doc(db, 'families', familyId, 'members', memberId), { displayName: newName });
}

export async function deleteChild(familyId: string, memberId: string): Promise<void> {
  const memberRef  = doc(db, 'families', familyId, 'members', memberId);
  const memberSnap = await getDoc(memberRef);
  if (!memberSnap.exists()) throw new Error('Enfant introuvable');

  const { linkedAuthUid } = memberSnap.data() as MemberDoc;
  const batch = writeBatch(db);

  batch.delete(memberRef);
  batch.delete(doc(db, 'families', familyId, 'childOTPs', memberId));
  batch.delete(doc(db, 'families', familyId, 'scores', memberId));
  if (linkedAuthUid) batch.delete(doc(db, 'users', linkedAuthUid));
  await batch.commit();

  // Nettoyage des OTP top-level
  const otpSnap = await getDocs(
    query(collection(db, 'childOTPs'), where('memberId', '==', memberId))
  );
  if (!otpSnap.empty) {
    const cleanBatch = writeBatch(db);
    otpSnap.forEach(d => cleanBatch.delete(d.ref));
    await cleanBatch.commit();
  }
}

// ─────────────────────────────────────────────────────────────
// Child OTP system
// ─────────────────────────────────────────────────────────────

export async function generateChildOTP(
  familyId: string,
  memberId: string,
  displayName: string
): Promise<string> {
  const memberSnap          = await getDoc(doc(db, 'families', familyId, 'members', memberId));
  const currentLinkedAuthUid = memberSnap.exists()
    ? (memberSnap.data() as MemberDoc).linkedAuthUid ?? null
    : null;

  // Nettoyage des anciens OTP
  const oldSnap = await getDocs(
    query(collection(db, 'childOTPs'), where('memberId', '==', memberId))
  );
  if (!oldSnap.empty) {
    const cleanBatch = writeBatch(db);
    oldSnap.forEach(d => cleanBatch.delete(d.ref));
    cleanBatch.delete(doc(db, 'families', familyId, 'childOTPs', memberId));
    await cleanBatch.commit();
  }

  const otpCode  = String(Math.floor(100000 + Math.random() * 900000));
  const expiresAt = Date.now() + 30 * 60 * 1000; // 30 min

  const b = writeBatch(db);
  b.set(doc(db, 'childOTPs', otpCode), {
    otpCode, familyId, memberId, displayName, expiresAt, currentLinkedAuthUid
  });
  b.set(doc(db, 'families', familyId, 'childOTPs', memberId), { otpCode, expiresAt });
  await b.commit();

  return otpCode;
}

export async function getActiveChildOTP(
  familyId: string,
  memberId: string
): Promise<string | null> {
  try {
    const snap = await getDoc(doc(db, 'families', familyId, 'childOTPs', memberId));
    if (!snap.exists()) return null;
    const { otpCode, expiresAt } = snap.data() as { otpCode: string; expiresAt: number };
    if (Date.now() > expiresAt) return null;
    return otpCode;
  } catch { return null; }
}

export async function connectChildDevice(
  user: User,
  familyCode: string,
  otpCode: string
): Promise<void> {
  const familyId = await resolveByFamilyCode(familyCode);

  const otpRef  = doc(db, 'childOTPs', otpCode);
  const otpSnap = await getDoc(otpRef);
  if (!otpSnap.exists()) throw new Error('Code enfant invalide');

  const {
    familyId: otpFamilyId,
    memberId,
    displayName,
    expiresAt,
    currentLinkedAuthUid
  } = otpSnap.data() as {
    familyId: string;
    memberId: string;
    displayName: string;
    expiresAt: number;
    currentLinkedAuthUid: string | null;
  };

  if (otpFamilyId !== familyId)
    throw new Error('Le code famille et le code enfant ne correspondent pas');
  if (Date.now() > expiresAt)
    throw new Error('Code expiré — demande un nouveau code au parent');

  const oldUid = currentLinkedAuthUid;
  const batch  = writeBatch(db);

  batch.update(doc(db, 'families', familyId, 'members', memberId), { linkedAuthUid: user.uid });
  batch.delete(otpRef);
  batch.delete(doc(db, 'families', familyId, 'childOTPs', memberId));
  if (oldUid && oldUid !== user.uid) batch.delete(doc(db, 'users', oldUid));
  batch.set(doc(db, 'users', user.uid), {
    uid: user.uid, email: null, displayName, familyId, memberId, role: 'child', createdAt: Date.now()
  });
  await batch.commit();
}

// ─────────────────────────────────────────────────────────────
// Invitation system
// ─────────────────────────────────────────────────────────────

export async function getActiveInvite(familyId: string): Promise<string | null> {
  const snap = await getDocs(
    query(collection(db, 'invites'), where('familyId', '==', familyId))
  );
  const now = Date.now();
  for (const d of snap.docs) {
    const data = d.data() as { active: boolean; expiresAt: number; shortCode: string };
    if (data.active && data.expiresAt > now) return data.shortCode;
  }
  return null;
}

export async function createInvite(familyId: string): Promise<string> {
  const snap = await getDocs(
    query(collection(db, 'invites'), where('familyId', '==', familyId))
  );
  const now          = Date.now();
  const cleanupBatch = writeBatch(db);
  let hasCleanup     = false;

  snap.forEach(d => {
    const data = d.data() as { active: boolean; expiresAt: number };
    if (!data.active || data.expiresAt <= now) {
      cleanupBatch.delete(d.ref);
      hasCleanup = true;
    }
  });
  if (hasCleanup) await cleanupBatch.commit();

  const shortCode = generateShortCode();
  const expiresAt = now + 15 * 60 * 1000;
  await setDoc(doc(db, 'invites', shortCode), {
    familyId,
    shortCode,
    createdAt: serverTimestamp(),
    expiresAt,
    active: true
  });
  return shortCode;
}

export async function resolveInvite(shortCode: string): Promise<string> {
  const ref  = doc(db, 'invites', shortCode);
  const snap = await getDoc(ref);

  if (!snap.exists()) throw new Error('Code invalide');

  const data = snap.data() as { active: boolean; expiresAt: number; familyId: string };
  if (!data.active)          throw new Error('Code expiré');
  if (Date.now() > data.expiresAt) throw new Error('Code expiré');

  return data.familyId;
}

// ─────────────────────────────────────────────────────────────
// Invite links (token-based, for QR codes)
// ─────────────────────────────────────────────────────────────

export async function createParentInviteLink(familyId: string): Promise<string> {
  const familySnap = await getDoc(doc(db, 'families', familyId));
  if (!familySnap.exists()) throw new Error('Famille introuvable');
  const family = familySnap.data() as FamilyDoc;

  const token  = generateToken();
  const now    = Date.now();
  await setDoc(doc(db, 'inviteLinks', token), {
    token,
    type:       'parent',
    familyId,
    familyCode: family.familyCode,
    familyName: family.name,
    createdAt:  now,
    expiresAt:  now + 24 * 60 * 60 * 1000, // 24 h
    used:       false
  } satisfies InviteLink);
  return token;
}

export async function createChildInviteLink(
  familyId:    string,
  memberId:    string,
  displayName: string
): Promise<string> {
  const familySnap = await getDoc(doc(db, 'families', familyId));
  if (!familySnap.exists()) throw new Error('Famille introuvable');
  const family = familySnap.data() as FamilyDoc;

  const token = generateToken();
  const now   = Date.now();
  await setDoc(doc(db, 'inviteLinks', token), {
    token,
    type:        'child',
    familyId,
    familyCode:  family.familyCode,
    familyName:  family.name,
    memberId,
    displayName,
    createdAt:   now,
    expiresAt:   now + 2 * 60 * 60 * 1000, // 2 h
    used:        false
  } satisfies InviteLink);
  return token;
}

export async function resolveInviteLink(token: string): Promise<InviteLink | null> {
  const snap = await getDoc(doc(db, 'inviteLinks', token));
  if (!snap.exists()) return null;
  const link = snap.data() as InviteLink;
  if (Date.now() > link.expiresAt)        return null;
  if (link.type === 'child' && link.used) return null;
  return link;
}

export async function connectChildDeviceViaToken(user: User, token: string): Promise<void> {
  const linkRef  = doc(db, 'inviteLinks', token);
  const linkSnap = await getDoc(linkRef);
  if (!linkSnap.exists()) throw new Error('Lien invalide ou expiré');

  const link = linkSnap.data() as InviteLink;
  if (link.type !== 'child')       throw new Error("Ce lien n'est pas destiné à un enfant");
  if (Date.now() > link.expiresAt) throw new Error('Lien expiré — demande un nouveau QR code au parent');
  if (link.used)                   throw new Error('Ce lien a déjà été utilisé');

  const { familyId, memberId, displayName = '' } = link;

  const memberSnap         = await getDoc(doc(db, 'families', familyId, 'members', memberId));
  const currentLinkedAuthUid = memberSnap.exists()
    ? (memberSnap.data() as MemberDoc).linkedAuthUid ?? null
    : null;

  const batch = writeBatch(db);
  batch.update(doc(db, 'families', familyId, 'members', memberId), { linkedAuthUid: user.uid });
  batch.update(linkRef, { used: true });
  if (currentLinkedAuthUid && currentLinkedAuthUid !== user.uid) {
    batch.delete(doc(db, 'users', currentLinkedAuthUid));
  }
  batch.set(doc(db, 'users', user.uid), {
    uid: user.uid, email: null, displayName, familyId, memberId, role: 'child', createdAt: Date.now()
  });
  await batch.commit();
}

// ─────────────────────────────────────────────────────────────
// Delete parent account
// ─────────────────────────────────────────────────────────────

export async function deleteParentAccount(user: User, familyId: string): Promise<void> {
  const members  = await getFamilyMembers(familyId);
  const parents  = members.filter(m => m.role === 'parent');
  const children = members.filter(m => m.role === 'child');

  if (parents.length === 1 && children.length > 0) {
    throw new Error('Invitez un co-parent ou retirez tous les enfants avant de supprimer votre compte.');
  }

  if (parents.length <= 1) {
    await deleteFamily(familyId);
  } else {
    const batch = writeBatch(db);
    batch.delete(doc(db, 'families', familyId, 'members', user.uid));
    batch.delete(doc(db, 'users', user.uid));
    await batch.commit();
  }

  // Best-effort Auth account deletion
  try {
    await deleteUser(user);
  } catch {
    // requires-recent-login : données Firestore déjà supprimées, déconnexion simple
    await signOut(getAuth(firebaseApp));
  }
}
