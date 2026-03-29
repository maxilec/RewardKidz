# RewardKidz — PWA familiale de récompenses

Application PWA installable sur iPhone/iPad et Android.  
Hébergée sur GitHub Pages — 100% gratuite, sans serveur.

---

## Structure du projet

```
RewardKidz/
├── app.html            ← PWA enfant (écran principal)
├── index.html          ← Redirige vers app.html
├── reader.html         ← Lecteur data.txt / history.txt (Lot 1)
├── firebase.js         ← Config Firebase (à personnaliser)
├── db.js               ← Fonctions Firestore
├── firestore.rules     ← Règles de sécurité Firestore
├── sw.js               ← Service Worker (cache + offline)
├── manifest.json       ← Config PWA
├── icon-192.png        ← Icône app
└── icon-512.png        ← Icône app (grande)
```

---

## Installation et configuration

### 1. Configurer Firebase

Ouvrir `firebase.js` et remplacer les 3 placeholders :

```javascript
apiKey:            'PLACEHOLDER_API_KEY',      // ← ta clé
messagingSenderId: 'PLACEHOLDER_SENDER_ID',    // ← ton ID
appId:             'PLACEHOLDER_APP_ID',        // ← ton ID
```

Les valeurs sont disponibles dans :
**console.firebase.google.com → RewardKidz → Paramètres → Vos applications**

> ℹ️ Ces valeurs peuvent être committées sur GitHub.
> La clé `apiKey` Firebase n'est pas un secret — elle est visible
> dans le navigateur de toute façon. La sécurité repose sur les
> règles Firestore (`firestore.rules`), pas sur le secret des clés.
> Référence : https://firebase.google.com/docs/projects/api-keys

### 2. Déployer les règles Firestore

Dans la console Firebase :
**Firestore Database → Règles → coller le contenu de `firestore.rules` → Publier**

### 3. Déployer sur GitHub Pages

```bash
git add .
git commit -m "config Firebase"
git push
```

L'app sera accessible sur :
`https://maxilec.github.io/RewardKidz/app.html`

---

## Utilisation

### Premier lancement
L'écran d'onboarding propose de saisir un prénom et choisir un avatar.  
Les données sont créées automatiquement dans Firestore.

### Mode hors-ligne
L'app affiche les dernières données connues avec une bannière orange.  
Les actions d'écriture (cocher missions, boutique) sont bloquées.

### Panneau de simulation (onglet Stats)
Permet de tester le score, l'état de la journée et les missions  
sans attendre l'interface parent (disponible au Lot 4).

---

## Lots du projet

| Lot | Statut | Description |
|---|---|---|
| 0 | ✅ Validé | Infrastructure PWA |
| 1 | ✅ Validé | Lecteur data.txt / history.txt |
| 2 | ✅ Livré | PWA enfant complète |
| 3 | 🟡 En cours | Firebase Firestore |
| 0-SEC | ⏳ | Sécurité multi-famille |
| 4 | ⏳ | Vue parent admin |
| 5 | ⏳ | Widget Scriptable v2 |
| 6 | ⏳ | Notifications push |
