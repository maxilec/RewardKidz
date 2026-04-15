import { initializeApp, getApps, getApp } from 'firebase/app';

const firebaseConfig = {
  apiKey:            import.meta.env.VITE_FIREBASE_API_KEY,
  // authDomain = domaine Firebase Hosting (pas firebaseapp.com)
  // Utiliser rewardkidz-4fe68.web.app pour que l'auth iOS fonctionne
  authDomain:        import.meta.env.VITE_FIREBASE_AUTH_DOMAIN,
  projectId:         import.meta.env.VITE_FIREBASE_PROJECT_ID,
  storageBucket:     import.meta.env.VITE_FIREBASE_STORAGE_BUCKET,
  messagingSenderId: import.meta.env.VITE_FIREBASE_MESSAGING_SENDER_ID,
  appId:             import.meta.env.VITE_FIREBASE_APP_ID,
};

// Config minimale exposée pour le service worker FCM (valeurs publiques côté client)
export const swConfig = {
  apiKey:            firebaseConfig.apiKey,
  projectId:         firebaseConfig.projectId,
  messagingSenderId: firebaseConfig.messagingSenderId,
  appId:             firebaseConfig.appId,
};

// Clé VAPID pour les push notifications
export const vapidKey: string = import.meta.env.VITE_FIREBASE_VAPID_KEY;

// Guard HMR : évite de ré-initialiser Firebase lors du hot module replacement en dev
export const firebaseApp = getApps().length ? getApp() : initializeApp(firebaseConfig);

// Vérification rapide — loggue en console si des clés sont manquantes
// (aide à diagnostiquer les problèmes de déploiement CI)
const missingKeys = Object.entries(firebaseConfig)
  .filter(([, v]) => !v)
  .map(([k]) => k);
if (missingKeys.length > 0) {
  console.error('[firebase] Clés de configuration manquantes :', missingKeys.join(', '));
  console.error('[firebase] Vérifiez les secrets GitHub Actions (VITE_FIREBASE_*)');
} else {
  console.info('[firebase] Initialisé sur le projet :', firebaseConfig.projectId);
}
