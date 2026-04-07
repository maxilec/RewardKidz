# RewardKidz

Système de récompenses familial sous forme de PWA (Progressive Web App). Les parents gèrent les scores journaliers de leurs enfants (0 à 5 étoiles) ; les enfants voient leur progression en temps réel et reçoivent des notifications push.

---

## Table des matières

- [Aperçu fonctionnel](#aperçu-fonctionnel)
- [Pages et fonctionnalités](#pages-et-fonctionnalités)
- [Architecture technique](#architecture-technique)
- [Modèle de données Firestore](#modèle-de-données-firestore)
- [Sécurité (Firestore Rules)](#sécurité-firestore-rules)
- [Notifications push (FCM)](#notifications-push-fcm)
- [PWA — fonctionnalités offline](#pwa--fonctionnalités-offline)
- [CI/CD — Déploiement](#cicd--déploiement)
- [Structure des fichiers](#structure-des-fichiers)
- [Configuration locale](#configuration-locale)
- [Roadmap](#roadmap)

---

## Aperçu fonctionnel

| Rôle | Fonctionnalités principales |
|------|-----------------------------|
| **Parent** | Créer/gérer la famille, ajouter des enfants, attribuer des points (±1), valider ou ignorer une journée, consulter l'historique et les statistiques, inviter d'autres parents, générer des codes de connexion enfant |
| **Enfant** | Voir son score du jour (5 étoiles), recevoir des notifications push en temps réel quand le score change ou que la journée est validée |

---

## Pages et fonctionnalités

### Sélection du rôle — `#onboarding`
Page d'accueil post-connexion pour les utilisateurs sans famille.

- Deux choix : **Créer ma famille** ou **J'ai un code d'invitation**
- Redirige vers `#create-family` ou `#parent-auth` selon le choix

---

### Création de famille — `#create-family`
Initialisation d'une nouvelle famille par un parent.

- Saisie du nom de la famille (ex. : « Les SuperKids »)
- Saisie du prénom du parent (affiché dans l'interface)
- Crée la famille, le membre parent et le document utilisateur en une seule transaction Firestore atomique
- Génère automatiquement un code famille permanent à 8 caractères

---

### Authentification parent — `#parent-auth`
Interface à onglets pour les parents.

**Onglet « S'identifier »**
- Connexion Google (OAuth popup)
- Connexion email + mot de passe

**Onglet « Rejoindre »**
- Saisie d'un code d'invitation à 6 caractères (reçu d'un parent déjà membre)
- Saisie d'un prénom affiché
- Connexion Google ou email/mot de passe pour finaliser l'adhésion
- Rejoint la famille en conservant le profil du co-parent

---

### Authentification enfant — `#child-auth`
Connexion pour les enfants via codes générés par le parent.

- Saisie du **code famille** permanent (8 caractères)
- Saisie du **code enfant** OTP à 6 chiffres (valable 30 minutes)
- Crée une session anonyme Firebase et lie le device à l'enfant

---

### Rejoindre / Reconnexion enfant — `#join-family`
Deux modes pour les enfants.

**Première connexion**
- Code d'invitation 6 caractères (fourni par un parent)
- Saisie du prénom
- Création d'un PIN secret à 4 chiffres (hashé SHA-256 avec le familyId comme sel)

**Reconnexion** (si l'enfant revient sur un nouvel appareil)
- Code famille permanent 8 caractères
- Prénom + PIN
- Relie le nouveau device anonyme à l'identité existante de l'enfant

---

### Dashboard parent — `#parent`
Page centrale de gestion de la famille.

**En-tête**
- Nom de la famille avec bouton ✏️ pour le modifier en ligne (mise à jour Firestore immédiate)

**Membres adultes**
- Liste de tous les parents/tuteurs avec badge « Vous » ou « Membre »

**Enfants**
- Formulaire d'ajout d'un enfant (prénom → crée le membre + génère un OTP)
- Pour chaque enfant : carte avec
  - Prénom + badge de statut (🟢 Connecté / ⏳ En attente)
  - Boutons ✏️ Renommer et 🗑 Supprimer
  - Score du jour en temps réel (5 étoiles + N/5)
  - Contrôles score : **+1**, **-1**, **Valider la journée**, **Ignorer la journée**
  - Bouton **Code connexion** → génère un OTP à 6 chiffres + affiche le code famille (valable 30 min)

**Invitation co-parent**
- Génération d'un code à 6 caractères valable 15 minutes
- Affichage + QR code généré à la volée (bibliothèque QRCode.js)

**Code famille permanent**
- Code à 8 caractères permanent, à transmettre aux enfants pour se reconnecter

**Gestion du compte**
- Suppression du compte parent (bloquée si seul parent avec des enfants)
- Suppression de la famille (action irréversible)
- Déconnexion

---

### Dashboard enfant — `#child`
Vue simplifiée, centrée sur le score.

- Message de bienvenue personnalisé (« Bonjour Léa ! »)
- Score du jour en **temps réel** : 5 étoiles (pleines/vides) + compteur N/5
- Badges de statut : ✓ *Journée validée par un parent* / *Journée non comptabilisée*
- Avertissement de déconnexion (codes nécessaires pour se reconnecter)
- Bouton déconnexion

---

### Détail enfant — `#child-detail` *(vue parent)*
Accessible en cliquant sur la carte d'un enfant dans le dashboard parent.

**Score du jour**
- Affichage + mêmes contrôles que dans le dashboard parent

**Gestion**
- Code connexion OTP
- Renommer l'enfant
- Supprimer l'enfant

**Statistiques**
- Moyenne sur les 7 derniers jours validés
- Tendance sur 30 jours (↑ Hausse / ↓ Baisse / → Stable)

**Historique**
- Histogramme interactif bascule 7j / 30j
- Chaque barre représente le score du jour (hauteur = N/5)
- Marquage visuel : journée validée, ignorée, aujourd'hui

---

## Architecture technique

```
┌─────────────────────────────────────┐
│           SPA Hash Router           │
│  #onboarding → #parent / #child     │
│  (loadPage + init* par rôle)        │
└─────────────┬───────────────────────┘
              │
   ┌──────────▼──────────┐
   │   public/main.js    │  Routeur + logique UI
   │   public/firebase.js│  Helpers Firestore + Auth + FCM
   └──────────┬──────────┘
              │ Firebase SDK v10.8.0 (CDN)
   ┌──────────▼──────────┐
   │   Cloud Firestore   │  Base de données temps réel
   │   Firebase Auth     │  Email / Google / Anonyme
   │   Firebase Hosting  │  Hébergement statique
   │   Cloud Functions   │  Notifications push (onScoreChange)
   │   Firebase FCM      │  Push web natif
   └─────────────────────┘
```

**Stack front-end** : Vanilla JS (ES Modules), CSS3 (Flexbox/Grid), Service Worker  
**Stack back-end** : Firebase (Firestore, Auth, Hosting, Functions v2, FCM)  
**Bibliothèques** : Firebase SDK 10.8.0, QRCode.js 1.0.0  
**Runtime fonctions** : Node.js 20

---

## Modèle de données Firestore

### `/users/{uid}`
Document utilisateur (parent ou enfant).

| Champ | Type | Description |
|-------|------|-------------|
| `uid` | string | Firebase Auth UID |
| `email` | string\|null | Email (null pour les enfants anonymes) |
| `displayName` | string | Prénom affiché |
| `familyId` | string | ID de la famille |
| `memberId` | string | ID dans la famille (= uid pour les parents) |
| `role` | `"parent"` \| `"child"` | Rôle |
| `createdAt` | number | Timestamp (ms) |

---

### `/families/{familyId}`
Document racine de la famille.

| Champ | Type | Description |
|-------|------|-------------|
| `name` | string | Nom de la famille |
| `familyCode` | string | Code permanent 8 caractères |
| `ownerIds` | string[] | UIDs des parents |
| `createdAt` | number | Timestamp (ms) |

---

### `/families/{familyId}/members/{memberId}`
Membre de la famille (parent ou enfant).

| Champ | Type | Description |
|-------|------|-------------|
| `memberId` | string | ID du membre (uid pour parent, UUID pour enfant) |
| `role` | `"parent"` \| `"child"` | Rôle |
| `displayName` | string | Prénom affiché |
| `linkedAuthUid` | string\|null | UID Firebase Auth lié (null si enfant pas encore connecté) |
| `childPasswordHash` | string | SHA-256(familyId + ":" + PIN) |
| `avatarSkin` | string | (réservé) Thème d'avatar |
| `fcmToken` | string\|null | Token FCM pour les push notifications |

---

### `/families/{familyId}/scores/{memberId}`
Score du jour (écrasé chaque jour, archivé dans `history`).

| Champ | Type | Description |
|-------|------|-------------|
| `date` | string | `"YYYY-MM-DD"` |
| `points` | number | 0 à 5 |
| `validated` | boolean | Journée validée par un parent |
| `ignored` | boolean | Journée non comptabilisée |
| `log` | object[] | Audit : `{ type, by, byName, pointsAfter, ts }` |
| `updatedAt` | Timestamp | Dernière modification (serveur) |

---

### `/families/{familyId}/scores/{memberId}/history/{date}`
Archive des scores passés (copie du doc score à minuit).

Même structure que le score + `archivedAt: Timestamp`.

---

### `/invites/{shortCode}`
Code d'invitation parent (6 caractères, valable 15 min).

| Champ | Type | Description |
|-------|------|-------------|
| `familyId` | string | Famille cible |
| `expiresAt` | number | Timestamp d'expiration (ms) |
| `active` | boolean | false si expiré |

---

### `/childOTPs/{otpCode}`
Code OTP enfant (6 chiffres, valable 30 min).

| Champ | Type | Description |
|-------|------|-------------|
| `familyId` | string | Famille |
| `memberId` | string | Enfant cible |
| `displayName` | string | Prénom |
| `expiresAt` | number | Timestamp d'expiration (ms) |
| `currentLinkedAuthUid` | string\|null | UID de l'ancienne session (pour nettoyage) |

---

### Collections réservées *(non implémentées)*
- `/families/{familyId}/economy/{userId}` — Monnaie virtuelle
- `/families/{familyId}/missions/{missionId}` — Missions / tâches
- `/families/{familyId}/missionCatalog/{missionId}` — Catalogue de missions
- `/families/{familyId}/avatars/{userId}` — Avatars enfants
- `/families/{familyId}/shop/{itemId}` — Boutique de récompenses
- `/families/{familyId}/shop/{itemId}/purchaseRequests/{reqId}` — Demandes d'achat

---

## Sécurité (Firestore Rules)

Toutes les collections appliquent le principe d'**anti-énumération** : la lecture publique est autorisée uniquement par ID exact (`get`), jamais en `list`.

| Collection | Lecture | Écriture |
|-----------|---------|----------|
| `/users/{uid}` | Propriétaire uniquement | Propriétaire + parents (pour suppression) |
| `/families/{familyId}` | Parents + membres | Parents uniquement |
| `/families/{…}/members/{…}` | Parents + membres | Parents + enfant (champs limités : `fcmToken`, PIN, avatar) |
| `/families/{…}/scores/{…}` | Parents + membres | **Parents uniquement** |
| `/families/{…}/scores/{…}/history/{…}` | Parents + membres | Parents uniquement |
| `/invites/{shortCode}` | Public (ID exact) | Membres authentifiés |
| `/childOTPs/{otpCode}` | Public (ID exact) | Parents créent, tous peuvent supprimer |
| `/familyCodes/{code}` | Public (ID exact) | Authentifiés créent, membres suppriment |

**Helpers de règles** :
- `isAuth()` — utilisateur connecté
- `isParentOf(familyId)` — membre avec `role = "parent"` dans la famille
- `isMemberOf(familyId)` — user doc avec `familyId` correspondant

---

## Notifications push (FCM)

### Flux

```
Parent : +1 point
  → Firestore : families/{id}/scores/{id} mis à jour
  → Cloud Function : onScoreChange() déclenché
      → Récupère le fcmToken du membre
      → Envoie le push via FCM Admin SDK
          → App ouverte  : bannière plein largeur (slide-down 5s)
          → App fermée   : notification native OS (Android / iOS 16.4+ PWA)
```

### Événements déclencheurs (côté enfant)
| Événement | Titre | Corps |
|-----------|-------|-------|
| Score +1 ou -1 | ⭐ Score +1 ! | Tu as maintenant N/5 étoiles aujourd'hui. |
| Journée validée | ✅ Journée validée ! | Ta journée est validée avec N/5 étoiles. Bravo ! |
| Journée ignorée | 📋 Journée enregistrée | Ta journée d'aujourd'hui a été enregistrée par un parent. |

### Activation (côté enfant)
1. L'enfant se connecte → l'app demande la permission de notification
2. Si accordée : le token FCM est récupéré et sauvegardé dans `members/{id}.fcmToken`
3. Le token invalide (désinstallation) est nettoyé automatiquement par la Cloud Function

### Clé VAPID
Générée dans Firebase Console → Project Settings → Cloud Messaging → Web push certificates.  
Injectée en CI via le secret GitHub `FIREBASE_VAPID_KEY`.

---

## PWA — fonctionnalités offline

| Fonctionnalité | Description |
|----------------|-------------|
| **Service Worker** | Cache Stale-While-Revalidate — l'app se charge depuis le cache, se met à jour en arrière-plan |
| **Offline** | Toutes les pages statiques accessibles sans réseau (données non synchronisées tant que la connexion n'est pas rétablie) |
| **Install banner** | Bandeau en bas après 3 secondes si l'app est installable (`beforeinstallprompt`) |
| **Pull-to-refresh** | Swipe vers le bas depuis le haut de la page → rechargement des données |
| **Bouton ↻** | Bouton fixe en haut à droite, animation de rotation pendant le chargement |
| **Apple PWA** | Meta tags `apple-mobile-web-app-capable`, icône home screen, barre de statut native |
| **Manifest** | `display: standalone`, orientation portrait, shortcut "Score du jour" |
| **Icônes** | 192×192 et 512×512 PNG (maskable) — à fournir dans `public/` |

---

## CI/CD — Déploiement

### Workflows GitHub Actions

| Workflow | Branches déclenchantes | Canal Firebase | Fonctions |
|----------|------------------------|----------------|-----------|
| `deploy-main.yml` | `main` | `live` (production) | ✅ Déployées |
| `deploy-poc.yml` | `dev/main`, `fix/2.0/POC`, `claude/secure-dev-branch-*` | `poc` | ❌ (hosting seulement) |

### Étapes (deploy-main)
1. Checkout du dépôt
2. Génération de `public/firebase.config.js` depuis les secrets GitHub
3. Vérification du fichier généré
4. Déploiement des règles Firestore
5. `npm install` dans `functions/`
6. Déploiement des Cloud Functions
7. Déploiement Firebase Hosting (canal `live`)

### Secrets GitHub requis
| Secret | Description |
|--------|-------------|
| `FIREBASE_API_KEY` | Clé API Firebase |
| `FIREBASE_AUTH_DOMAIN` | Domaine d'authentification (ex. `rewardkidz-4fe68.web.app`) |
| `FIREBASE_PROJECT_ID` | ID du projet Firebase |
| `FIREBASE_STORAGE_BUCKET` | Bucket Storage |
| `FIREBASE_SENDER_ID` | ID expéditeur FCM |
| `FIREBASE_APP_ID` | App ID Firebase |
| `FIREBASE_VAPID_KEY` | Clé VAPID publique pour les push web |
| `FIREBASE_SERVICE_ACCOUNT` | JSON du compte de service (pour firebase-tools CLI) |

---

## Structure des fichiers

```
RewardKidz/
├── public/
│   ├── index.html              # Point d'entrée SPA, SW registration, install banner
│   ├── main.js                 # Routeur hash + toutes les init* de pages (~1000 lignes)
│   ├── firebase.js             # Helpers Firestore, Auth, FCM (~700 lignes)
│   ├── sw.js                   # Service Worker (cache SWR + FCM background)
│   ├── manifest.json           # Manifest PWA
│   ├── firebase.config.js      # ⚠️ Gitignored — généré par CI depuis les secrets
│   ├── firebase.config.example.js  # Template de configuration locale
│   ├── css/
│   │   └── style.css           # Styles globaux (~960 lignes)
│   └── pages/
│       ├── onboarding.html     # Sélection du rôle (créer / rejoindre)
│       ├── create-family.html  # Création de famille
│       ├── parent-auth.html    # Authentification parent (Google + email + invitation)
│       ├── child-auth.html     # Connexion enfant (code famille + OTP)
│       ├── join-family.html    # Première connexion enfant / reconnexion
│       ├── parent.html         # Dashboard parent
│       ├── child.html          # Dashboard enfant
│       └── child-detail.html   # Détail + statistiques enfant (vue parent)
├── functions/
│   ├── index.js                # Cloud Function onScoreChange (notifications FCM)
│   └── package.json            # firebase-admin + firebase-functions v5, Node 20
├── firestore.rules             # Règles de sécurité Firestore
├── firebase.json               # Config Firebase (hosting, firestore, functions)
└── .github/
    └── workflows/
        ├── deploy-main.yml     # CI production (main → canal live)
        └── deploy-poc.yml      # CI POC (dev/main → canal poc)
```

---

## Configuration locale

> **Prérequis** : Node.js 20+, Firebase CLI (`npm install -g firebase-tools`)

```bash
# 1. Cloner le dépôt
git clone <url>
cd RewardKidz

# 2. Créer le fichier de config Firebase (ne pas commiter)
cp public/firebase.config.example.js public/firebase.config.js
# Remplir les valeurs depuis la Firebase Console

# 3. Installer les dépendances Cloud Functions
cd functions && npm install && cd ..

# 4. Servir localement
firebase serve --only hosting
# ou avec les émulateurs :
firebase emulators:start
```

> **⚠️ Icônes manquantes** : Ajouter `public/icon-192.png` et `public/icon-512.png` pour activer l'installabilité PWA et les notifications.

---

## Roadmap

Les collections Firestore suivantes sont déjà sécurisées et prêtes à être utilisées dans une prochaine version :

- 🪙 **Économie** — Monnaie virtuelle attribuée par les parents
- 📋 **Missions** — Tâches journalières avec catalogue personnalisable
- 🛒 **Boutique** — Échange de points contre des récompenses
- 🧒 **Avatars** — Personnalisation de l'identité visuelle des enfants
- 📦 **Demandes d'achat** — Workflow enfant → validation parent
