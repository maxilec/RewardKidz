// firebase.config.example.js
// Copier ce fichier en firebase.config.js et remplir les valeurs
// NE PAS commiter firebase.config.js (dans .gitignore)
// Les valeurs réelles sont injectées par GitHub Actions

export const firebaseConfig = {
  apiKey:            'VOTRE_API_KEY',
  // ⚠️  authDomain = domaine Firebase Hosting (pas firebaseapp.com)
  // Utiliser : rewardkidz-4fe68.web.app  pour que l'auth iOS fonctionne
  authDomain:        'rewardkidz-4fe68.web.app',
  projectId:         'rewardkidz-4fe68',
  storageBucket:     'rewardkidz-4fe68.appspot.com',
  messagingSenderId: 'VOTRE_SENDER_ID',
  appId:             'VOTRE_APP_ID',
  // Clé VAPID pour les push notifications (Firebase Console → Project Settings → Cloud Messaging)
  vapidKey:          'VOTRE_VAPID_KEY',
};
