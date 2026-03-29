// ═══════════════════════════════════════════════════════════
// RewardKidz — db.js
// Toutes les fonctions d'accès Firestore
// ─────────────────────────────────────────────────────────
// Structure :
//   families/{familyId}/
//     members/{userId}
//     scores/{userId}
//     economy/{userId}
//     missions/{userId}
//     avatars/{userId}
//     missionCatalog/{missionId}
//     shop/{itemId}
//       purchaseRequests/{requestId}
// ═══════════════════════════════════════════════════════════

import {
  doc, getDoc, setDoc, updateDoc,
  collection, getDocs, addDoc,
  onSnapshot, runTransaction,
  serverTimestamp, Timestamp,
} from 'https://www.gstatic.com/firebasejs/10.12.0/firebase-firestore.js';

import { db, DEMO_FAMILY_ID, DEMO_CHILD_ID } from './firebase.js';

// ── Helpers chemins ─────────────────────────────────────────
const familyRef  = (fid)         => doc(db, 'families', fid);
const memberRef  = (fid, uid)    => doc(db, 'families', fid, 'members',       uid);
const scoreRef   = (fid, uid)    => doc(db, 'families', fid, 'scores',        uid);
const econRef    = (fid, uid)    => doc(db, 'families', fid, 'economy',       uid);
const missRef    = (fid, uid)    => doc(db, 'families', fid, 'missions',      uid);
const avatarRef  = (fid, uid)    => doc(db, 'families', fid, 'avatars',       uid);
const catRef     = (fid, mid)    => doc(db, 'families', fid, 'missionCatalog',mid);
const shopRef    = (fid, iid)    => doc(db, 'families', fid, 'shop',          iid);
const reqRef     = (fid, iid)    => collection(db, 'families', fid, 'shop', iid, 'purchaseRequests');

// ── Utilitaires ─────────────────────────────────────────────
function todayStr() {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}-${String(d.getDate()).padStart(2,'0')}`;
}

// ═══════════════════════════════════════════════════════════
// INITIALISATION — créer la structure de démo si elle n'existe pas
// ═══════════════════════════════════════════════════════════
export async function initDemoFamily() {
  const fid = DEMO_FAMILY_ID;
  const cid = DEMO_CHILD_ID;

  // Vérifier si la famille existe déjà
  const famSnap = await getDoc(familyRef(fid));
  if (famSnap.exists()) {
    console.log('[DB] Famille démo déjà initialisée');
    return;
  }

  console.log('[DB] Initialisation de la famille démo...');

  // Famille
  await setDoc(familyRef(fid), {
    createdAt: serverTimestamp(),
    appName: 'Aventuriers de la Journée',
  });

  // Profil enfant
  await setDoc(memberRef(fid, cid), {
    role: 'child',
    displayName: 'Démo',
    age: 8,
    createdAt: serverTimestamp(),
  });

  // Score initial
  await setDoc(scoreRef(fid, cid), {
    value: 8,
    state: 'normal',       // normal | validated | pause
    lastResetDate: todayStr(),
    history: [],
    updatedAt: serverTimestamp(),
  });

  // Économie initiale
  await setDoc(econRef(fid, cid), {
    stars: 0,
    marbles: 0,
    transactions: [],
    updatedAt: serverTimestamp(),
  });

  // Avatar par défaut
  await setDoc(avatarRef(fid, cid), {
    skin: 's0',
    hat: 'h0',
    bg: 'b0',
    accessory: 'ac0',
    updatedAt: serverTimestamp(),
  });

  // Missions du jour (vides — remplies par ensureDailyMissions)
  await setDoc(missRef(fid, cid), {
    date: '',
    items: [],
    updatedAt: serverTimestamp(),
  });

  // Catalogue missions par défaut
  const defaultMissions = [
    { title: 'Faire son lit',             ico: '🛏️', stars: 2, marbles: 5,  active: true },
    { title: 'Lire 20 minutes',           ico: '📚', stars: 3, marbles: 8,  active: true },
    { title: 'Aider à mettre la table',   ico: '🍽️', stars: 1, marbles: 3,  active: true },
    { title: 'Ranger sa chambre',         ico: '🧹', stars: 2, marbles: 6,  active: true },
    { title: 'Se brosser les dents',      ico: '🦷', stars: 1, marbles: 2,  active: true },
    { title: 'Manger ses légumes',        ico: '🥦', stars: 2, marbles: 5,  active: true },
    { title: 'Préparer son sac',          ico: '🎒', stars: 1, marbles: 3,  active: true },
    { title: 'Faire ses devoirs',         ico: '✏️', stars: 3, marbles: 10, active: true },
    { title: "Dire s'il te plaît & merci",ico: '🙏', stars: 1, marbles: 2,  active: true },
    { title: "S'occuper de l'animal",     ico: '🐾', stars: 2, marbles: 4,  active: true },
  ];
  for (let i = 0; i < defaultMissions.length; i++) {
    await setDoc(catRef(fid, `m${String(i+1).padStart(2,'0')}`), defaultMissions[i]);
  }

  // Boutique par défaut
  const defaultShop = [
    { name: 'Glace',          ico: '🍦', category: 'real', costStars: 10, costMarbles: 0,  active: true },
    { name: 'Cinéma',         ico: '🎬', category: 'real', costStars: 0,  costMarbles: 30, active: true },
    { name: '1h Jeu Vidéo',   ico: '🎮', category: 'real', costStars: 20, costMarbles: 0,  active: true },
    { name: 'Pizza Party',    ico: '🍕', category: 'real', costStars: 0,  costMarbles: 25, active: true },
    { name: 'Livre Surprise', ico: '📚', category: 'real', costStars: 15, costMarbles: 0,  active: true },
    { name: 'Soirée Pyjama',  ico: '🌟', category: 'real', costStars: 0,  costMarbles: 40, active: true },
    { name: 'Rainbow',        ico: '🌈', category: 'app',  costStars: 0,  costMarbles: 20, active: true },
    { name: 'Couronne',       ico: '👑', category: 'app',  costStars: 0,  costMarbles: 30, active: true },
  ];
  for (let i = 0; i < defaultShop.length; i++) {
    await setDoc(shopRef(fid, `s${String(i+1).padStart(2,'0')}`), defaultShop[i]);
  }

  console.log('[DB] ✅ Famille démo initialisée');
}

// ═══════════════════════════════════════════════════════════
// SCORE
// ═══════════════════════════════════════════════════════════

// Lire le score courant (une fois)
export async function getScore(fid = DEMO_FAMILY_ID, uid = DEMO_CHILD_ID) {
  const snap = await getDoc(scoreRef(fid, uid));
  return snap.exists() ? snap.data() : null;
}

// Écouter le score en temps réel (retourne unsubscribe)
export function listenScore(callback, fid = DEMO_FAMILY_ID, uid = DEMO_CHILD_ID) {
  return onSnapshot(scoreRef(fid, uid), snap => {
    callback(snap.exists() ? snap.data() : null);
  });
}

// Reset quotidien — remet à 8 si on change de jour
export async function ensureDailyReset(fid = DEMO_FAMILY_ID, uid = DEMO_CHILD_ID) {
  const ref = scoreRef(fid, uid);
  const today = todayStr();

  await runTransaction(db, async tx => {
    const snap = await tx.get(ref);
    if (!snap.exists()) return;

    const data = snap.data();
    if (data.lastResetDate === today) return; // Déjà reseté aujourd'hui

    // Sauvegarder la valeur d'hier dans l'historique si elle était validée
    let history = data.history || [];
    if (data.state === 'validated') {
      history = [
        { date: data.lastResetDate, value: data.value },
        ...history,
      ].slice(0, 30); // Max 30 entrées
    }

    tx.update(ref, {
      value: 8,
      state: 'normal',
      lastResetDate: today,
      history,
      updatedAt: serverTimestamp(),
    });
  });
}

// Mettre à jour le score (parent uniquement au Lot 0-SEC)
export async function setScore(value, fid = DEMO_FAMILY_ID, uid = DEMO_CHILD_ID) {
  value = Math.max(1, Math.min(10, Math.round(value)));
  await updateDoc(scoreRef(fid, uid), {
    value,
    updatedAt: serverTimestamp(),
  });
}

// Changer l'état (normal / validated / pause)
export async function setScoreState(state, fid = DEMO_FAMILY_ID, uid = DEMO_CHILD_ID) {
  const validStates = ['normal', 'validated', 'pause'];
  if (!validStates.includes(state)) throw new Error('État invalide');

  const ref = scoreRef(fid, uid);

  await runTransaction(db, async tx => {
    const snap = await tx.get(ref);
    if (!snap.exists()) return;
    const data = snap.data();

    const updates = { state, updatedAt: serverTimestamp() };

    // Si on valide : ajouter à l'historique
    if (state === 'validated') {
      const history = [
        { date: todayStr(), value: data.value },
        ...(data.history || []),
      ].slice(0, 30);
      updates.history = history;
    }

    tx.update(ref, updates);
  });
}

// ═══════════════════════════════════════════════════════════
// ÉCONOMIE
// ═══════════════════════════════════════════════════════════

export async function getEconomy(fid = DEMO_FAMILY_ID, uid = DEMO_CHILD_ID) {
  const snap = await getDoc(econRef(fid, uid));
  return snap.exists() ? snap.data() : { stars: 0, marbles: 0, transactions: [] };
}

export function listenEconomy(callback, fid = DEMO_FAMILY_ID, uid = DEMO_CHILD_ID) {
  return onSnapshot(econRef(fid, uid), snap => {
    callback(snap.exists() ? snap.data() : null);
  });
}

export async function addCurrency(amount, currency, label, fid = DEMO_FAMILY_ID, uid = DEMO_CHILD_ID) {
  const ref = econRef(fid, uid);
  await runTransaction(db, async tx => {
    const snap = await tx.get(ref);
    if (!snap.exists()) return;
    const data = snap.data();

    const field = currency === 'stars' ? 'stars' : 'marbles';
    const newVal = Math.max(0, (data[field] || 0) + amount);

    const transaction = {
      date: todayStr(),
      type: amount > 0 ? 'credit' : 'debit',
      amount: Math.abs(amount),
      currency,
      label,
    };
    const transactions = [transaction, ...(data.transactions || [])].slice(0, 100);

    tx.update(ref, {
      [field]: newVal,
      transactions,
      updatedAt: serverTimestamp(),
    });
  });
}

// ═══════════════════════════════════════════════════════════
// MISSIONS
// ═══════════════════════════════════════════════════════════

export async function getMissions(fid = DEMO_FAMILY_ID, uid = DEMO_CHILD_ID) {
  const snap = await getDoc(missRef(fid, uid));
  return snap.exists() ? snap.data() : { date: '', items: [] };
}

export function listenMissions(callback, fid = DEMO_FAMILY_ID, uid = DEMO_CHILD_ID) {
  return onSnapshot(missRef(fid, uid), snap => {
    callback(snap.exists() ? snap.data() : null);
  });
}

// Tirer 3 missions aléatoires depuis le catalogue
export async function ensureDailyMissions(fid = DEMO_FAMILY_ID, uid = DEMO_CHILD_ID) {
  const today = todayStr();
  const current = await getMissions(fid, uid);

  // Déjà tiré aujourd'hui → ne rien faire
  if (current.date === today && current.items.length > 0) return;

  // Charger le catalogue actif
  const catSnap = await getDocs(collection(db, 'families', fid, 'missionCatalog'));
  const pool = catSnap.docs
    .filter(d => d.data().active !== false)
    .map(d => ({ id: d.id, ...d.data() }));

  if (!pool.length) return;

  // Tirage aléatoire de 3 missions uniques
  const shuffled = pool.sort(() => Math.random() - 0.5).slice(0, 3);
  const items = shuffled.map(m => ({
    missionId:   m.id,
    title:       m.title,
    ico:         m.ico,
    stars:       m.stars,
    marbles:     m.marbles,
    done:        false,
    doneAt:      null,
  }));

  await setDoc(missRef(fid, uid), {
    date: today,
    items,
    updatedAt: serverTimestamp(),
  });
}

// Force le re-tirage des missions (panneau de simulation)
export async function forceDailyMissionsReset(fid = DEMO_FAMILY_ID, uid = DEMO_CHILD_ID) {
  await setDoc(missRef(fid, uid), {
    date:      '',
    items:     [],
    updatedAt: serverTimestamp(),
  });
  await ensureDailyMissions(fid, uid);
}

// Cocher une mission (enfant)
export async function completeMission(index, fid = DEMO_FAMILY_ID, uid = DEMO_CHILD_ID) {
  const ref = missRef(fid, uid);

  await runTransaction(db, async tx => {
    const snap = await tx.get(ref);
    if (!snap.exists()) return;
    const data = snap.data();

    const items = [...data.items];
    if (items[index]?.done) return; // Déjà cochée

    items[index] = {
      ...items[index],
      done: true,
      doneAt: todayStr(),
    };

    tx.update(ref, { items, updatedAt: serverTimestamp() });
  });

  // Créditer les récompenses
  const missions = await getMissions(fid, uid);
  const m = missions.items[index];
  if (m) {
    if (m.stars   > 0) await addCurrency(m.stars,   'stars',   `Mission: ${m.title}`, fid, uid);
    if (m.marbles > 0) await addCurrency(m.marbles, 'marbles', `Mission: ${m.title}`, fid, uid);
  }
}

// ═══════════════════════════════════════════════════════════
// AVATAR
// ═══════════════════════════════════════════════════════════

export async function getAvatar(fid = DEMO_FAMILY_ID, uid = DEMO_CHILD_ID) {
  const snap = await getDoc(avatarRef(fid, uid));
  return snap.exists() ? snap.data() : { skin:'s0', hat:'h0', bg:'b0', accessory:'ac0' };
}

export async function setAvatar(config, fid = DEMO_FAMILY_ID, uid = DEMO_CHILD_ID) {
  await updateDoc(avatarRef(fid, uid), {
    ...config,
    updatedAt: serverTimestamp(),
  });
}

// ═══════════════════════════════════════════════════════════
// BOUTIQUE
// ═══════════════════════════════════════════════════════════

export async function getShopItems(fid = DEMO_FAMILY_ID) {
  const snap = await getDocs(collection(db, 'families', fid, 'shop'));
  return snap.docs
    .filter(d => d.data().active !== false)
    .map(d => ({ id: d.id, ...d.data() }));
}

// Créer une demande d'achat (enfant)
export async function createPurchaseRequest(itemId, fid = DEMO_FAMILY_ID, uid = DEMO_CHILD_ID) {
  // Vérifier le solde
  const econ = await getEconomy(fid, uid);
  const itemSnap = await getDoc(shopRef(fid, itemId));
  if (!itemSnap.exists()) throw new Error('Article introuvable');

  const item = itemSnap.data();
  const hasStars   = econ.stars   >= (item.costStars   || 0);
  const hasMarbles = econ.marbles >= (item.costMarbles || 0);

  if (!hasStars || !hasMarbles) {
    throw new Error('Solde insuffisant');
  }

  await addDoc(reqRef(fid, itemId), {
    childId:   uid,
    date:      todayStr(),
    status:    'pending',   // pending | approved | rejected
    createdAt: serverTimestamp(),
  });
}

// ═══════════════════════════════════════════════════════════
// PROFIL
// ═══════════════════════════════════════════════════════════

export async function getProfile(fid = DEMO_FAMILY_ID, uid = DEMO_CHILD_ID) {
  const snap = await getDoc(memberRef(fid, uid));
  return snap.exists() ? snap.data() : null;
}

export async function updateProfile(data, fid = DEMO_FAMILY_ID, uid = DEMO_CHILD_ID) {
  await updateDoc(memberRef(fid, uid), {
    ...data,
    updatedAt: serverTimestamp(),
  });
}

// ═══════════════════════════════════════════════════════════
// CATALOGUE MISSIONS (lecture parent)
// ═══════════════════════════════════════════════════════════

export async function getMissionCatalog(fid = DEMO_FAMILY_ID) {
  const snap = await getDocs(collection(db, 'families', fid, 'missionCatalog'));
  return snap.docs.map(d => ({ id: d.id, ...d.data() }));
}
