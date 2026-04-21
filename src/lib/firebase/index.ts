// ─────────────────────────────────────────────────────────────
// Re-exports publics de la couche Firebase
// ─────────────────────────────────────────────────────────────

export { firebaseApp, swConfig, vapidKey } from './app';

export {
  auth,
  provider,
  loginWithGoogle,
  loginAsChild,
  loginWithEmail,
  registerWithEmail,
  logout,
  onUserStateChanged,
  translateAuthError
} from './auth';

export {
  db,
  getUser,
  updateParentProfile,
  getFamily,
  updateFamilyName,
  createFamily,
  getFamilyMembers,
  migrateFamilyCode,
  deleteFamily,
  resolveByFamilyCode,
  joinFamily,
  joinFamilyAsAuthenticated,
  reconnectChild,
  addChild,
  updateChildName,
  deleteChild,
  generateChildOTP,
  getActiveChildOTP,
  connectChildDevice,
  getActiveInvite,
  createInvite,
  resolveInvite,
  createParentInviteLink,
  createChildInviteLink,
  resolveInviteLink,
  connectChildDeviceViaToken,
  deleteParentAccount
} from './families';

export {
  getOrCreateDayScore,
  readDayScore,
  addPoint,
  removePoint,
  setScoreValidated,
  setDayIgnored,
  subscribeToScore,
  getChildHistory
} from './scores';

export {
  sendConfigToSW,
  initNotifications,
  onForegroundMessage
} from './notifications';

export type {
  UserDoc,
  FamilyDoc,
  MemberDoc,
  ScoreDoc,
  ScoreLogEntry,
  HistoryEntry,
  InviteLink
} from './types';
