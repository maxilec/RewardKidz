// ─────────────────────────────────────────────────────────────
// Firestore document types
// ─────────────────────────────────────────────────────────────

export interface UserDoc {
  uid: string;
  email: string | null;
  displayName: string;
  familyId: string;
  /** Uniquement pour les enfants (role === 'child') */
  memberId?: string;
  role: 'parent' | 'child';
  createdAt: number;
}

export interface FamilyDoc {
  name: string;
  familyCode: string;
  ownerIds: string[];
  createdAt: number;
}

export interface MemberDoc {
  /** uid Firebase Auth — présent pour les parents */
  uid?: string;
  /** ID du membre Firestore — présent pour les enfants */
  memberId?: string;
  linkedAuthUid?: string | null;
  role: 'parent' | 'child';
  displayName: string;
  /** Hash PIN — uniquement pour les enfants avec PIN (ancien flux) */
  childPasswordHash?: string;
  /** Token FCM — présent si l'enfant a accordé la permission notifications */
  fcmToken?: string;
}

export interface ScoreLogEntry {
  type: 'add' | 'remove' | 'validate' | 'unvalidate' | 'ignore' | 'unignore';
  by: string;
  byName: string;
  pointsAfter: number;
  ts: number;
}

export interface ScoreDoc {
  /** Correspond au memberId */
  id: string;
  points: number;
  /** Format YYYY-MM-DD */
  date: string;
  validated: boolean;
  ignored: boolean;
  log: ScoreLogEntry[];
}

export interface HistoryEntry {
  /** Format YYYY-MM-DD */
  date: string;
  missing: boolean;
  points: number;
  validated: boolean;
  ignored: boolean;
  isToday?: boolean;
}
