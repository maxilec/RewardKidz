// ═══════════════════════════════════════════════════════════
// RewardKidz — db.js v2
// Fonctions Firestore + Auth multi-famille
// ═══════════════════════════════════════════════════════════

import {
  doc, getDoc, setDoc, updateDoc, deleteDoc,
  collection, getDocs, addDoc, query, where,
  onSnapshot, runTransaction,
  serverTimestamp, writeBatch,
} from 'https://www.gstatic.com/firebasejs/10.12.0/firebase-firestore.js';

import {
  signInWithPopup, signInWithRedirect, getRedirectResult,
  signOut, onAuthStateChanged,
  GoogleAuthProvider, OAuthProvider,
  signInAnonymously,
} from 'https://www.gstatic.com/firebasejs/10.12.0/firebase-auth.js';

import { db, auth } from './firebase.js';

// Helpers chemins
const familyRef  = (fid)      => doc(db, 'families', fid);
const memberRef  = (fid, uid) => doc(db, 'families', fid, 'members', uid);
const scoreRef   = (fid, uid) => doc(db, 'families', fid, 'scores', uid);
const econRef    = (fid, uid) => doc(db, 'families', fid, 'economy', uid);
const missRef    = (fid, uid) => doc(db, 'families', fid, 'missions', uid);
const avatarRef  = (fid, uid) => doc(db, 'families', fid, 'avatars', uid);
const tokenRef   = (fid, tid) => doc(db, 'families', fid, 'invites', tid);
const shopRef    = (fid, iid) => doc(db, 'families', fid, 'shop', iid);

function todayStr() {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}-${String(d.getDate()).padStart(2,'0')}`;
}

async function sha256(text) {
  const buf = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(text));
  return Array.from(new Uint8Array(buf)).map(b => b.toString(16).padStart(2,'0')).join('');
}

function generateToken() {
  const arr = new Uint8Array(16);
  crypto.getRandomValues(arr);
  return Array.from(arr).map(b => b.toString(16).padStart(2,'0')).join('');
}

// AUTH
// Détecter si le popup OAuth est supporté
// Safari (tous modes) et PWA standalone → toujours redirect
// Chrome desktop → popup
function useRedirect() {
  const ua  = navigator.userAgent;
  const isStandalone = window.matchMedia('(display-mode: standalone)').matches
                    || window.navigator.standalone === true;
  const isSafari = /Safari/i.test(ua) && !/Chrome|CriOS|FxiOS/i.test(ua);
  const isIOS    = /iPhone|iPad|iPod/i.test(ua);
  return isStandalone || isSafari || isIOS;
}

export async function signInWithGoogle() {
  const provider = new GoogleAuthProvider();
  if(useRedirect()) {
    await signInWithRedirect(auth, provider);
    return null; // Page rechargée, résultat via checkRedirectResult()
  }
  const result = await signInWithPopup(auth, provider);
  return result.user;
}

export async function checkRedirectResult() {
  try {
    const result = await getRedirectResult(auth);
    if(result?.user) {
      console.log('[Auth] Redirect result: user =', result.user.uid);
      return result.user;
    }
    return null;
  } catch(e) {
    console.warn('[Auth] Redirect result error:', e.code, e.message);
    return null;
  }
}

// Attendre que Firebase Auth ait résolu son état initial (redirect ou persisté)
// Attend que Firebase Auth soit prêt ET que le redirect result soit traité.
// Sur iOS Safari, onAuthStateChanged peut d'abord firer null avant de firer
// l'utilisateur (résultat du redirect OAuth pas encore processé).
// On attend jusqu'à 4s avant de résoudre null pour couvrir ce cas.
export function waitForAuthReady() {
  return new Promise(resolve => {
    // Si Firebase a déjà un user courant, résoudre immédiatement
    if (auth.currentUser) { resolve(auth.currentUser); return; }

    let resolved = false;
    const done = (user) => {
      if (resolved) return;
      resolved = true;
      unsub();
      clearTimeout(timer);
      resolve(user);
    };

    // Timer de sécurité : si Firebase ne résout rien après 4s, on capitule
    const timer = setTimeout(() => done(auth.currentUser || null), 4000);

    const unsub = onAuthStateChanged(auth, user => {
      if (user) {
        // On a un utilisateur → résoudre immédiatement
        done(user);
      } else {
        // null : peut être l'état initial avant traitement du redirect.
        // On attend encore un peu (500ms) pour laisser Firebase traiter
        // le redirect result avant de conclure qu'il n'y a pas d'utilisateur.
        setTimeout(() => {
          if (!resolved) done(auth.currentUser || null);
        }, 500);
      }
    });
  });
}

export async function signInWithApple() {
  const provider = new OAuthProvider('apple.com');
  provider.addScope('name');
  if(useRedirect()) {
    await signInWithRedirect(auth, provider);
    return null;
  }
  const result = await signInWithPopup(auth, provider);
  return result.user;
}

export async function signOutUser() { await signOut(auth); }
export function onAuthChange(cb)    { return onAuthStateChanged(auth, cb); }
export function currentUser()       { return auth.currentUser; }

// CRÉATION FAMILLE
export async function createFamily(parentUid, familyName) {
  const familyId = generateToken();
  const batch    = writeBatch(db);
  batch.set(familyRef(familyId), {
    name: familyName || 'Ma Famille',
    ownerIds: [parentUid],
    createdAt: serverTimestamp(),
    updatedAt: serverTimestamp(),
  });
  batch.set(memberRef(familyId, parentUid), {
    role: 'parent', displayName: '', createdAt: serverTimestamp(),
  });
  await batch.commit();
  return familyId;
}

export async function addChildToFamily(familyId, childName, avatarSkin = 's0') {
  const childId = generateToken();
  const batch   = writeBatch(db);
  batch.set(memberRef(familyId, childId), {
    role: 'child', displayName: childName, avatarSkin,
    childPasswordHash: null, linkedAuthUid: null, createdAt: serverTimestamp(),
  });
  batch.set(scoreRef(familyId, childId), {
    value: 8, state: 'normal', lastResetDate: todayStr(), history: [], updatedAt: serverTimestamp(),
  });
  batch.set(econRef(familyId, childId), {
    stars: 0, marbles: 0, transactions: [], updatedAt: serverTimestamp(),
  });
  batch.set(avatarRef(familyId, childId), {
    skin: avatarSkin, hat: 'h0', bg: 'b0', accessory: 'ac0', updatedAt: serverTimestamp(),
  });
  batch.set(missRef(familyId, childId), {
    date: '', items: [], tomorrow: [], updatedAt: serverTimestamp(),
  });
  await batch.commit();
  await generateInviteToken(familyId, childId, 'child');
  return childId;
}

// TOKENS
export async function generateInviteToken(familyId, targetId, type) {
  const existing = await getDocs(
    query(collection(db, 'families', familyId, 'invites'),
      where('targetId', '==', targetId), where('active', '==', true))
  );
  const batch = writeBatch(db);
  existing.docs.forEach(d => batch.update(d.ref, { active: false }));

  const token    = generateToken();
  const tokenId  = await sha256(token);
  const now      = Date.now();
  const expiresAt = new Date(now + (type === 'parent' ? 48 : 7*24) * 3600 * 1000);

  batch.set(tokenRef(familyId, tokenId), {
    type, targetId, familyId, active: true,
    createdAt: serverTimestamp(), expiresAt, usedAt: null, usedBy: null,
  });
  await batch.commit();
  return { token, tokenId, expiresAt };
}

export async function generateParentInviteToken(familyId) {
  return generateInviteToken(familyId, null, 'parent');
}

export async function validateTokenForFamily(familyId, token) {
  const tokenId = await sha256(token);
  const snap    = await getDoc(tokenRef(familyId, tokenId));
  if (!snap.exists()) throw new Error('Token invalide');
  const data = snap.data();
  if (!data.active) throw new Error('Token déjà utilisé');
  const exp = data.expiresAt instanceof Date ? data.expiresAt : data.expiresAt.toDate();
  if (exp < new Date()) throw new Error('Token expiré');
  return { tokenId, ...data };
}

export async function consumeToken(familyId, tokenId, usedByUid) {
  await updateDoc(tokenRef(familyId, tokenId), {
    active: false, usedAt: serverTimestamp(), usedBy: usedByUid,
  });
}

// REJOINDRE FAMILLE — PARENT
export async function joinFamilyAsParent(familyId, token, parentUid) {
  const { tokenId, type } = await validateTokenForFamily(familyId, token);
  if (type !== 'parent') throw new Error('Ce token est pour un enfant');
  const famSnap  = await getDoc(familyRef(familyId));
  if (!famSnap.exists()) throw new Error('Famille introuvable');
  const ownerIds = famSnap.data().ownerIds || [];
  if (ownerIds.includes(parentUid)) throw new Error('Déjà membre de cette famille');
  await updateDoc(familyRef(familyId), {
    ownerIds: [...ownerIds, parentUid], updatedAt: serverTimestamp(),
  });
  await setDoc(memberRef(familyId, parentUid), {
    role: 'parent', displayName: '', createdAt: serverTimestamp(),
  });
  await consumeToken(familyId, tokenId, parentUid);
  return familyId;
}

// REJOINDRE FAMILLE — ENFANT
export async function joinFamilyAsChild(familyId, token) {
  const { tokenId, type, targetId } = await validateTokenForFamily(familyId, token);
  if (type !== 'child') throw new Error('Ce token est pour un parent');
  const { user } = await signInAnonymously(auth);
  const authUid  = user.uid;
  await updateDoc(memberRef(familyId, targetId), {
    linkedAuthUid: authUid, updatedAt: serverTimestamp(),
  });
  await consumeToken(familyId, tokenId, authUid);
  localStorage.setItem('rk_session', JSON.stringify({
    familyId, childId: targetId, authUid, role: 'child',
  }));
  return { familyId, childId: targetId, authUid };
}

export async function loginChildWithPassword(familyId, childId, password) {
  const snap = await getDoc(memberRef(familyId, childId));
  if (!snap.exists()) throw new Error('Profil introuvable');
  const hash = await sha256(password);
  if (snap.data().childPasswordHash !== hash) throw new Error('Mot de passe incorrect');
  const { user } = await signInAnonymously(auth);
  await updateDoc(memberRef(familyId, childId), {
    linkedAuthUid: user.uid, updatedAt: serverTimestamp(),
  });
  localStorage.setItem('rk_session', JSON.stringify({
    familyId, childId, authUid: user.uid, role: 'child',
  }));
  return { familyId, childId, authUid: user.uid };
}

export async function setChildPassword(familyId, childId, password) {
  if (password.length < 4) throw new Error('Minimum 4 caractères');
  const hash = await sha256(password);
  await updateDoc(memberRef(familyId, childId), {
    childPasswordHash: hash, updatedAt: serverTimestamp(),
  });
}

// SESSION
export async function getMySession() {
  const cached = localStorage.getItem('rk_session');
  if (cached) {
    try {
      const s    = JSON.parse(cached);
      const snap = await getDoc(memberRef(s.familyId, s.childId));
      if (snap.exists() && snap.data().linkedAuthUid === s.authUid) return s;
    } catch(e) {}
    localStorage.removeItem('rk_session');
  }
  const user = auth.currentUser;
  if (!user) return null;
  const fams = await getDocs(
    query(collection(db, 'families'), where('ownerIds', 'array-contains', user.uid))
  );
  if (!fams.empty) {
    return { familyId: fams.docs[0].id, authUid: user.uid, role: 'parent' };
  }
  return null;
}

export function clearSession() { localStorage.removeItem('rk_session'); }

// FAMILLE
export async function getFamily(fid) {
  const snap = await getDoc(familyRef(fid));
  return snap.exists() ? { id: snap.id, ...snap.data() } : null;
}

export async function getChildren(fid) {
  const snap = await getDocs(collection(db, 'families', fid, 'members'));
  return snap.docs.filter(d => d.data().role === 'child').map(d => ({ id: d.id, ...d.data() }));
}

export async function getProfile(fid, uid) {
  const snap = await getDoc(memberRef(fid, uid));
  return snap.exists() ? snap.data() : null;
}

export async function updateProfile(data, fid, uid) {
  await updateDoc(memberRef(fid, uid), { ...data, updatedAt: serverTimestamp() });
}

// SCORE
export async function getScore(fid, uid) {
  const snap = await getDoc(scoreRef(fid, uid));
  return snap.exists() ? snap.data() : null;
}

export function listenScore(callback, fid, uid) {
  return onSnapshot(scoreRef(fid, uid), snap => callback(snap.exists() ? snap.data() : null));
}

async function creditPendingHistory(fid, uid) {
  const snap = await getDoc(scoreRef(fid, uid));
  if (!snap.exists()) return;
  const history = snap.data().history || [];
  const pending = history.filter(e => e.credited === false);
  if (!pending.length) return;
  for (const entry of pending) {
    const stars = starsForScore(entry.value);
    if (stars > 0) await addCurrency(stars, 'stars', `Journée du ${entry.date} — score ${entry.value}/10`, fid, uid);
  }
  const updated = history.map(e => e.credited === false ? { ...e, credited: true } : e);
  await updateDoc(scoreRef(fid, uid), { history: updated, updatedAt: serverTimestamp() });
}

export async function ensureDailyReset(fid, uid) {
  const ref   = scoreRef(fid, uid);
  const today = todayStr();
  await runTransaction(db, async tx => {
    const snap = await tx.get(ref);
    if (!snap.exists()) {
      tx.set(ref, { value: 8, state: 'normal', lastResetDate: today, history: [], updatedAt: serverTimestamp() });
      return;
    }
    const data = snap.data();
    if (data.lastResetDate === today) return;
    let history = data.history || [];
    if (data.state === 'validated') {
      history = [{ date: data.lastResetDate, value: data.value, credited: false }, ...history].slice(0, 30);
    }
    tx.update(ref, { value: 8, state: 'normal', lastResetDate: today, history, updatedAt: serverTimestamp() });
  });
  await creditPendingHistory(fid, uid);
}

export async function adjustScore(delta, fid, uid) {
  const ref = scoreRef(fid, uid);
  await runTransaction(db, async tx => {
    const snap   = await tx.get(ref);
    const cur    = snap.exists() ? (snap.data().value || 8) : 8;
    const newVal = Math.max(1, Math.min(10, cur + delta));
    if (snap.exists()) {
      tx.update(ref, { value: newVal, updatedAt: serverTimestamp() });
    } else {
      tx.set(ref, { value: newVal, state: 'normal', lastResetDate: todayStr(), history: [], updatedAt: serverTimestamp() });
    }
  });
}

export async function setScoreState(state, fid, uid) {
  if (!['normal','validated','pause'].includes(state)) throw new Error('État invalide');
  await updateDoc(scoreRef(fid, uid), { state, updatedAt: serverTimestamp() });
}

export async function validateDay(fid, uid) {
  const today = todayStr();
  const snap  = await getDoc(scoreRef(fid, uid));
  if (!snap.exists()) {
    await setDoc(scoreRef(fid, uid), {
      value: 8, state: 'validated', lastResetDate: today,
      history: [{ date: today, value: 8, credited: false }], updatedAt: serverTimestamp(),
    });
    return 0;
  }
  const data = snap.data();
  if (data.state === 'validated') throw new Error('Journée déjà validée');
  const history = [{ date: today, value: data.value, credited: false }, ...(data.history||[])].slice(0, 30);
  await updateDoc(scoreRef(fid, uid), { state: 'validated', history, updatedAt: serverTimestamp() });
  return 0;
}

export async function reactivateDay(fid, uid) {
  const today = todayStr();
  const snap  = await getDoc(scoreRef(fid, uid));
  if (!snap.exists()) throw new Error('Données introuvables');
  const data  = snap.data();
  if (data.state !== 'validated') throw new Error("La journée n'est pas validée");
  const history = (data.history||[]).filter(e => e.date !== today);
  await updateDoc(scoreRef(fid, uid), { state: 'normal', history, updatedAt: serverTimestamp() });
}

function starsForScore(s) {
  if (s<=3) return 0; if (s<=5) return 5; if (s<=7) return 10; if (s<=9) return 15; return 20;
}

// ÉCONOMIE
export async function getEconomy(fid, uid) {
  const snap = await getDoc(econRef(fid, uid));
  return snap.exists() ? snap.data() : { stars: 0, marbles: 0, transactions: [] };
}

export function listenEconomy(callback, fid, uid) {
  return onSnapshot(econRef(fid, uid), snap => callback(snap.exists() ? snap.data() : null));
}

export async function addCurrency(amount, currency, label, fid, uid) {
  const ref = econRef(fid, uid);
  await runTransaction(db, async tx => {
    const snap = await tx.get(ref);
    const data = snap.exists() ? snap.data() : { stars: 0, marbles: 0, transactions: [] };
    const field  = currency === 'stars' ? 'stars' : 'marbles';
    const newVal = Math.max(0, (data[field]||0) + amount);
    const tr     = { date: todayStr(), type: amount>0?'credit':'debit', amount: Math.abs(amount), currency, label };
    const trs    = [tr, ...(data.transactions||[])].slice(0, 100);
    if (snap.exists()) {
      tx.update(ref, { [field]: newVal, transactions: trs, updatedAt: serverTimestamp() });
    } else {
      tx.set(ref, { stars:0, marbles:0, [field]: newVal, transactions: trs, updatedAt: serverTimestamp() });
    }
  });
}

// MISSIONS
export async function getMissions(fid, uid) {
  const snap = await getDoc(missRef(fid, uid));
  return snap.exists() ? snap.data() : { date:'', items:[], tomorrow:[] };
}

export function listenMissions(callback, fid, uid) {
  return onSnapshot(missRef(fid, uid), snap => callback(snap.exists() ? snap.data() : null));
}

export async function ensureDailyMissions(fid, uid) {
  const today   = todayStr();
  const current = await getMissions(fid, uid);
  if (current.date === today && current.items.length > 0) return;
  let items = [];
  if (current.tomorrow?.length > 0) {
    items = current.tomorrow.map(m => ({ ...m, done: false, doneAt: null }));
  } else {
    const snap = await getDocs(collection(db, 'families', fid, 'missionCatalog'));
    const pool = snap.docs.filter(d => d.data().active !== false).map(d => ({ id: d.id, ...d.data() }));
    if (!pool.length) return;
    items = pool.sort(() => Math.random() - 0.5).slice(0, 3).map(m => ({
      missionId: m.id, title: m.title, ico: m.ico, stars: m.stars, marbles: m.marbles, done: false, doneAt: null,
    }));
  }
  await setDoc(missRef(fid, uid), { date: today, items, tomorrow: [], updatedAt: serverTimestamp() });
}

export async function forceDailyMissionsReset(fid, uid) {
  await setDoc(missRef(fid, uid), { date:'', items:[], tomorrow:[], updatedAt: serverTimestamp() });
  await ensureDailyMissions(fid, uid);
}

export async function completeMissionByParent(index, fid, uid) {
  const ref = missRef(fid, uid);
  let mission = null;
  await runTransaction(db, async tx => {
    const snap  = await tx.get(ref);
    if (!snap.exists()) return;
    const items = [...snap.data().items];
    if (!items[index] || items[index].done) return;
    items[index] = { ...items[index], done: true, doneAt: todayStr() };
    mission = items[index];
    tx.update(ref, { items, updatedAt: serverTimestamp() });
  });
  if (mission) {
    if (mission.stars   > 0) await addCurrency(mission.stars,   'stars',   `Mission: ${mission.title}`, fid, uid);
    if (mission.marbles > 0) await addCurrency(mission.marbles, 'marbles', `Mission: ${mission.title}`, fid, uid);
  }
  return mission;
}

export async function setTomorrowMissions(missionIds, fid, uid) {
  if (missionIds.length > 3) throw new Error('Maximum 3 missions');
  const catalog = await getMissionCatalog(fid);
  const items   = missionIds.map(id => {
    const m = catalog.find(c => c.id === id);
    if (!m) throw new Error(`Mission ${id} introuvable`);
    return { missionId: id, title: m.title, ico: m.ico, stars: m.stars, marbles: m.marbles, done: false, doneAt: null };
  });
  await updateDoc(missRef(fid, uid), { tomorrow: items, updatedAt: serverTimestamp() });
}

// AVATAR
export async function getAvatar(fid, uid) {
  const snap = await getDoc(avatarRef(fid, uid));
  return snap.exists() ? snap.data() : { skin:'s0', hat:'h0', bg:'b0', accessory:'ac0' };
}

export async function setAvatar(config, fid, uid) {
  const ref  = avatarRef(fid, uid);
  const snap = await getDoc(ref);
  if (snap.exists()) {
    await updateDoc(ref, { ...config, updatedAt: serverTimestamp() });
  } else {
    await setDoc(ref, { skin:'s0', hat:'h0', bg:'b0', accessory:'ac0', ...config, updatedAt: serverTimestamp() });
  }
}

// BOUTIQUE
export async function getShopItems(fid) {
  const snap = await getDocs(collection(db, 'families', fid, 'shop'));
  return snap.docs.filter(d => d.data().active !== false).map(d => ({ id: d.id, ...d.data() }));
}

export async function createPurchaseRequest(itemId, fid, uid) {
  const itemSnap = await getDoc(shopRef(fid, itemId));
  if (!itemSnap.exists()) throw new Error('Article introuvable');
  const item = itemSnap.data();
  const econ = await getEconomy(fid, uid);
  if ((item.costStars||0) > (econ.stars||0)) throw new Error('Solde insuffisant');
  if ((item.costMarbles||0) > (econ.marbles||0)) throw new Error('Solde insuffisant');
  await addDoc(collection(db, 'families', fid, 'shop', itemId, 'purchaseRequests'), {
    childId: uid, date: todayStr(), status: 'pending', createdAt: serverTimestamp(),
  });
}

export async function getPurchaseRequests(fid) {
  const shopSnap = await getDocs(collection(db, 'families', fid, 'shop'));
  const results  = [];
  for (const shopDoc of shopSnap.docs) {
    const reqSnap = await getDocs(collection(db, 'families', fid, 'shop', shopDoc.id, 'purchaseRequests'));
    reqSnap.docs.filter(d => d.data().status === 'pending')
      .forEach(d => results.push({ id: d.id, itemId: shopDoc.id, item: shopDoc.data(), ...d.data() }));
  }
  return results;
}

export async function approvePurchase(itemId, requestId, fid) {
  const reqRef   = doc(db, 'families', fid, 'shop', itemId, 'purchaseRequests', requestId);
  const reqSnap  = await getDoc(reqRef);
  if (!reqSnap.exists()) throw new Error('Demande introuvable');
  const request  = reqSnap.data();
  const itemSnap = await getDoc(shopRef(fid, itemId));
  if (!itemSnap.exists()) throw new Error('Article introuvable');
  const item = itemSnap.data();
  if (item.costStars   > 0) await addCurrency(-item.costStars,   'stars',   `Achat: ${item.name}`, fid, request.childId);
  if (item.costMarbles > 0) await addCurrency(-item.costMarbles, 'marbles', `Achat: ${item.name}`, fid, request.childId);
  await updateDoc(reqRef, { status: 'approved', updatedAt: serverTimestamp() });
}

export async function rejectPurchase(itemId, requestId, fid) {
  await updateDoc(
    doc(db, 'families', fid, 'shop', itemId, 'purchaseRequests', requestId),
    { status: 'rejected', updatedAt: serverTimestamp() }
  );
}

// CATALOGUE
export async function getMissionCatalog(fid) {
  const snap = await getDocs(collection(db, 'families', fid, 'missionCatalog'));
  return snap.docs.map(d => ({ id: d.id, ...d.data() }));
}

// PIN PARENT
export async function getParentPinHash(fid) {
  const snap = await getDoc(familyRef(fid));
  return snap.exists() ? (snap.data().parentPinHash || null) : null;
}

export async function setParentPin(pinHash, fid) {
  await updateDoc(familyRef(fid), { parentPinHash: pinHash, updatedAt: serverTimestamp() });
}

// INIT CATALOGUE & BOUTIQUE PAR DÉFAUT
export async function initDefaultCatalog(fid) {
  const existing = await getDocs(collection(db, 'families', fid, 'missionCatalog'));
  if (!existing.empty) return;
  const missions = [
    {title:"Faire son lit",ico:"🛏️",stars:2,marbles:5,active:true},
    {title:"Lire 20 minutes",ico:"📚",stars:3,marbles:8,active:true},
    {title:"Aider à mettre la table",ico:"🍽️",stars:1,marbles:3,active:true},
    {title:"Ranger sa chambre",ico:"🧹",stars:2,marbles:6,active:true},
    {title:"Se brosser les dents",ico:"🦷",stars:1,marbles:2,active:true},
    {title:"Manger ses légumes",ico:"🥦",stars:2,marbles:5,active:true},
    {title:"Préparer son sac",ico:"🎒",stars:1,marbles:3,active:true},
    {title:"Faire ses devoirs",ico:"✏️",stars:3,marbles:10,active:true},
    {title:"Dire s'il te plaît & merci",ico:"🙏",stars:1,marbles:2,active:true},
    {title:"S'occuper de l'animal",ico:"🐾",stars:2,marbles:4,active:true},
  ];
  const batch = writeBatch(db);
  missions.forEach((m,i) => batch.set(doc(db,'families',fid,'missionCatalog',`m${String(i+1).padStart(2,'0')}`),m));
  await batch.commit();
}

export async function initDefaultShop(fid) {
  const existing = await getDocs(collection(db, 'families', fid, 'shop'));
  if (!existing.empty) return;
  const items = [
    {name:'Glace',ico:'🍦',category:'real',costStars:10,costMarbles:0,active:true},
    {name:'Cinéma',ico:'🎬',category:'real',costStars:0,costMarbles:30,active:true},
    {name:'1h Jeu Vidéo',ico:'🎮',category:'real',costStars:20,costMarbles:0,active:true},
    {name:'Pizza Party',ico:'🍕',category:'real',costStars:0,costMarbles:25,active:true},
    {name:'Livre Surprise',ico:'📚',category:'real',costStars:15,costMarbles:0,active:true},
    {name:'Soirée Pyjama',ico:'🌟',category:'real',costStars:0,costMarbles:40,active:true},
    {name:'Rainbow',ico:'🌈',category:'app',costStars:0,costMarbles:20,active:true},
    {name:'Couronne',ico:'👑',category:'app',costStars:0,costMarbles:30,active:true},
  ];
  const batch = writeBatch(db);
  items.forEach((item,i) => batch.set(doc(db,'families',fid,'shop',`s${String(i+1).padStart(2,'0')}`),item));
  await batch.commit();
}

// SUPPRESSION FAMILLE (RGPD)
export async function deleteFamily(fid) {
  const cols  = ['members','scores','economy','missions','avatars','missionCatalog','shop','invites'];
  const batch = writeBatch(db);
  for (const col of cols) {
    const snap = await getDocs(collection(db, 'families', fid, col));
    snap.docs.forEach(d => batch.delete(d.ref));
  }
  batch.delete(familyRef(fid));
  await batch.commit();
  localStorage.removeItem('rk_session');
}
