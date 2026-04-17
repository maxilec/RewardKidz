import {
  getFirestore,
  doc,
  getDoc,
  setDoc,
  getDocs,
  updateDoc,
  arrayUnion,
  collection,
  onSnapshot,
  serverTimestamp,
  type Unsubscribe
} from 'firebase/firestore';
import { firebaseApp } from './app';
import type { ScoreDoc, HistoryEntry } from './types';

const db = getFirestore(firebaseApp);

// ─────────────────────────────────────────────────────────────
// Internal helpers
// ─────────────────────────────────────────────────────────────

function today(): string {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

function emptyScore(memberId: string): ScoreDoc {
  return {
    id: memberId,
    points: 0,
    date: today(),
    validated: false,
    ignored: false,
    log: []
  };
}

// ─────────────────────────────────────────────────────────────
// Score reads
// ─────────────────────────────────────────────────────────────

/**
 * Obtient ou crée le score du jour. Archive le jour précédent si la date a changé.
 * Parent seulement (écriture nécessaire).
 */
export async function getOrCreateDayScore(familyId: string, memberId: string): Promise<ScoreDoc> {
  const ref      = doc(db, 'families', familyId, 'scores', memberId);
  const snap     = await getDoc(ref);
  const todayStr = today();

  if (snap.exists()) {
    const data = snap.data() as Omit<ScoreDoc, 'id'>;
    if (data.date === todayStr) return { id: memberId, ...data };

    // Archive le jour précédent uniquement si la journée a été validée
    if (data.validated) {
      await setDoc(
        doc(db, 'families', familyId, 'scores', memberId, 'history', data.date),
        { ...data, archivedAt: serverTimestamp() }
      );
    }
  }

  const fresh = emptyScore(memberId);
  await setDoc(ref, { ...fresh, updatedAt: serverTimestamp() });
  return fresh;
}

/**
 * Lecture seule du score du jour (enfants — pas d'écriture).
 */
export async function readDayScore(familyId: string, memberId: string): Promise<ScoreDoc> {
  const ref      = doc(db, 'families', familyId, 'scores', memberId);
  const snap     = await getDoc(ref);
  const todayStr = today();

  if (!snap.exists() || (snap.data() as { date: string }).date !== todayStr) {
    return emptyScore(memberId);
  }
  return { id: memberId, ...(snap.data() as Omit<ScoreDoc, 'id'>) };
}

// ─────────────────────────────────────────────────────────────
// Score mutations (parent only)
// ─────────────────────────────────────────────────────────────

export async function addPoint(
  familyId: string,
  memberId: string,
  byUid: string,
  byName: string
): Promise<number> {
  const score = await getOrCreateDayScore(familyId, memberId);
  if (score.validated || score.ignored) throw new Error('Score verrouillé — journée validée ou ignorée');
  if (score.points >= 5)                throw new Error('Score maximum atteint (5/5)');

  const newPoints = score.points + 1;
  await updateDoc(doc(db, 'families', familyId, 'scores', memberId), {
    points: newPoints,
    log: arrayUnion({ type: 'add', by: byUid, byName, pointsAfter: newPoints, ts: Date.now() }),
    updatedAt: serverTimestamp()
  });
  return newPoints;
}

export async function removePoint(
  familyId: string,
  memberId: string,
  byUid: string,
  byName: string
): Promise<number> {
  const score = await getOrCreateDayScore(familyId, memberId);
  if (score.validated || score.ignored) throw new Error('Score verrouillé — journée validée ou ignorée');
  if (score.points <= 0)                throw new Error('Score déjà à 0');

  const newPoints = score.points - 1;
  await updateDoc(doc(db, 'families', familyId, 'scores', memberId), {
    points: newPoints,
    log: arrayUnion({ type: 'remove', by: byUid, byName, pointsAfter: newPoints, ts: Date.now() }),
    updatedAt: serverTimestamp()
  });
  return newPoints;
}

export async function setScoreValidated(
  familyId: string,
  memberId: string,
  validated: boolean,
  byUid: string,
  byName: string
): Promise<void> {
  const score = await getOrCreateDayScore(familyId, memberId);
  await updateDoc(doc(db, 'families', familyId, 'scores', memberId), {
    validated,
    log: arrayUnion({
      type: validated ? 'validate' : 'unvalidate',
      by: byUid,
      byName,
      pointsAfter: score.points,
      ts: Date.now()
    }),
    updatedAt: serverTimestamp()
  });
}

export async function setDayIgnored(
  familyId: string,
  memberId: string,
  ignored: boolean,
  byUid: string,
  byName: string
): Promise<void> {
  const score = await getOrCreateDayScore(familyId, memberId);
  await updateDoc(doc(db, 'families', familyId, 'scores', memberId), {
    ignored,
    log: arrayUnion({
      type: ignored ? 'ignore' : 'unignore',
      by: byUid,
      byName,
      pointsAfter: score.points,
      ts: Date.now()
    }),
    updatedAt: serverTimestamp()
  });
}

// ─────────────────────────────────────────────────────────────
// Real-time subscription
// ─────────────────────────────────────────────────────────────

/**
 * Écoute en temps réel le score du jour pour un enfant.
 * Retourne une fonction `unsubscribe`.
 */
export function subscribeToScore(
  familyId: string,
  memberId: string,
  callback: (score: ScoreDoc) => void
): Unsubscribe {
  const ref = doc(db, 'families', familyId, 'scores', memberId);

  return onSnapshot(
    ref,
    snap => {
      const todayStr = today();
      const data     = snap.exists() ? (snap.data() as Omit<ScoreDoc, 'id'>) : null;

      if (data && data.date === todayStr) {
        callback({ id: memberId, ...data });
      } else {
        callback(emptyScore(memberId));
      }
    },
    err => {
      // Erreur silencieuse — typiquement token expiré ou permission révoquée.
      // Le listener sera relancé automatiquement quand l'auth se rétablit.
      console.warn('[subscribeToScore] listener error:', err.code);
    }
  );
}

// ─────────────────────────────────────────────────────────────
// History
// ─────────────────────────────────────────────────────────────

/**
 * Récupère l'historique des `days` derniers jours pour un enfant (jours passés uniquement,
 * aujourd'hui exclu — il est déjà affiché dans le « Score du jour »).
 * Les jours manquants sont retournés avec `missing: true`.
 */
export async function getChildHistory(
  familyId: string,
  memberId: string,
  days: number
): Promise<HistoryEntry[]> {
  // Construit la liste des jours passés : J-days … J-1
  const pastDates = Array.from({ length: days }, (_, i) => {
    const d = new Date();
    d.setDate(d.getDate() - (days - i));
    return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
  });

  // Lectures parallèles
  const snaps = await Promise.all(
    pastDates.map(date =>
      getDoc(doc(db, 'families', familyId, 'scores', memberId, 'history', date))
    )
  );

  return pastDates.map((date, i) => {
    const snap = snaps[i];
    if (snap.exists()) {
      const d = snap.data() as { points: number; validated: boolean; ignored: boolean };
      return { date, missing: false, points: d.points, validated: d.validated, ignored: d.ignored };
    }
    return { date, missing: true, points: 0, validated: false, ignored: false };
  });
}
