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
| **Parent** | Créer/gérer la famille, ajouter des enfants, attribuer des points (±1), valider ou ignorer une journée, consulter l'historique et les statistiques, inviter des co-parents, générer des codes de connexion enfant |
| **Enfant** | Voir son score du jour (jauge circulaire), recevoir des notifications push en temps réel quand le score change ou que la journée est validée |

---

## Pages et fonctionnalités

### Page d'accueil — `/`
Sélection du rôle.

- Deux choix : **Espace enfant** (principal) ou **Espace parent** (secondaire)
- Redirige les utilisateurs déjà authentifiés directement vers leur espace

---

### Authentification parent — `/parent-auth`
Interface à onglets.

**Onglet « S'identifier »**
- Connexion Google (OAuth popup)
- Connexion email + mot de passe

**Onglet « Créer un compte »**
- Inscription email + mot de passe

**Onglet « Rejoindre »**
- Code d'invitation (6 caractères) + code famille permanent (8 caractères) — double vérification
- Connexion Google ou email/mot de passe pour finaliser

---

### Authentification enfant — `/child-auth`
Connexion pour les enfants via codes générés par le parent.

- Saisie du **code famille** permanent (8 caractères)
- Saisie du **code enfant** OTP à 6 chiffres (valable 30 minutes)
- Crée une session anonyme Firebase et lie le device à l'enfant

---

### Onboarding — `/onboarding`
Page post-connexion pour un parent sans famille.

- Deux choix : **Créer ma famille** ou **Rejoindre une famille**

---

### Création de famille — `/create-family`
- Saisie du nom de la famille
- Saisie du prénom du parent (optionnel — reprend le nom du compte Google sinon)
- Transaction Firestore atomique : famille + membre parent + document utilisateur

---

### Rejoindre une famille — `/join-family`
Pour un parent déjà authentifié recevant un code d'invitation.

- Code d'invitation (6 caractères) + code famille permanent (8 caractères)
- Les deux codes doivent pointer vers la même famille

---

### Dashboard parent — `/parent`
Page centrale de gestion.

- Liste des parents membres de la famille
- Bouton **+ Inviter** → modale avec code 6 car. + QR code scannable
- Liste des enfants avec score du jour en temps réel et contrôles (+1, -1, Valider, Ignorer)
- Clic sur une carte enfant → détail

---

### Détail enfant — `/parent/[memberId]`
Vue complète d'un enfant.

- Score du jour + contrôles identiques au dashboard
- Prénom cliquable pour le renommer (✏️ en en-tête)
- Modale **Code connexion** : OTP 6 chiffres + code famille permanent (valable 30 min)
- Histogramme 7j / 30j (uniquement journées validées archivées)
- Statistiques : moyenne et tendance
- Suppression de l'enfant

---

### Dashboard enfant — `/child`
Vue simplifiée.

- Jauge circulaire SVG du score du jour (temps réel)
- Messages d'encouragement selon le score
- Badge journée validée / non comptabilisée
- Drawer avec bouton de déconnexion

---

## Architecture technique

```
┌────────────────────────────────────────────────────┐
│               SvelteKit (SPA statique)             │
│  File-based routing — src/routes/                  │
│  Svelte 5 Runes ($state, $derived, $effect)        │
└──────────────────┬─────────────────────────────────┘
                   │
   ┌───────────────▼───────────────┐
   │    src/lib/firebase/          │  Modules TypeScript
   │    src/lib/stores/            │  Stores Svelte réactifs
   │    src/lib/components/        │  Composants réutilisables
   └───────────────┬───────────────┘
                   │ Firebase SDK v10.8.0 (npm)
   ┌───────────────▼───────────────┐
   │   Cloud Firestore             │  Base de données temps réel
   │   Firebase Auth               │  Email / Google / Anonyme
   │   Firebase Hosting            │  Hébergement statique (build/)
   │   Cloud Functions             │  Notifications push (onScoreChange)
   │   Firebase FCM                │  Push web natif
   └───────────────────────────────┘
```

**Stack front-end** : SvelteKit 2 + Svelte 5, TypeScript strict, CSS custom (design system maison)  
**Stack back-end** : Firebase (Firestore, Auth, Hosting, Functions v2, FCM)  
**PWA** : vite-plugin-pwa + Workbox (stratégie `injectManifest`)  
**Bibliothèques** : Firebase SDK 10.8.0, qrcode (npm), Workbox 7.4  
**Runtime fonctions** : Node.js 20

---

## Modèle de données Firestore

### `/users/{uid}`

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

| Champ | Type | Description |
|-------|------|-------------|
| `name` | string | Nom de la famille |
| `familyCode` | string | Code permanent 8 caractères |
| `ownerIds` | string[] | UIDs des parents |
| `createdAt` | number | Timestamp (ms) |

---

### `/families/{familyId}/members/{memberId}`

| Champ | Type | Description |
|-------|------|-------------|
| `memberId` | string | ID du membre |
| `role` | `"parent"` \| `"child"` | Rôle |
| `displayName` | string | Prénom affiché |
| `linkedAuthUid` | string\|null | UID Firebase Auth lié |
| `childPasswordHash` | string | SHA-256(familyId + ":" + PIN) |
| `fcmToken` | string\|null | Token FCM pour les push notifications |

---

### `/families/{familyId}/scores/{memberId}`
Score du jour — archivé dans `history` uniquement si `validated: true`.

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
Archive des journées validées. Même structure que le score + `archivedAt: Timestamp`.

---

### `/invites/{shortCode}`
Code d'invitation co-parent (6 caractères, valable 15 min).

---

### `/childOTPs/{otpCode}`
Code OTP enfant (6 chiffres, valable 30 min).

---

### Collections réservées *(non implémentées)*
- `/families/{familyId}/economy/` — Monnaie virtuelle
- `/families/{familyId}/missions/` — Missions / tâches
- `/families/{familyId}/avatars/` — Avatars enfants
- `/families/{familyId}/shop/` — Boutique de récompenses

---

## Sécurité (Firestore Rules)

Principe d'**anti-énumération** : lecture publique autorisée uniquement par ID exact (`get`), jamais en `list`.

| Collection | Lecture | Écriture |
|-----------|---------|----------|
| `/users/{uid}` | Propriétaire uniquement | Propriétaire + parents (suppression) |
| `/families/{familyId}` | Parents + membres | Parents uniquement |
| `/families/{…}/members/{…}` | Parents + membres | Parents + enfant (fcmToken, PIN) |
| `/families/{…}/scores/{…}` | Parents + membres | **Parents uniquement** |
| `/families/{…}/scores/{…}/history/{…}` | Parents + membres | Parents uniquement |
| `/invites/{shortCode}` | Public (ID exact) | Membres authentifiés |
| `/childOTPs/{otpCode}` | Public (ID exact) | Parents créent |
| `/familyCodes/{code}` | Public (ID exact) | Authentifiés créent |

---

## Notifications push (FCM)

### Flux

```
Parent : +1 point
  → Firestore mis à jour
  → Cloud Function onScoreChange() déclenché
      → Récupère le fcmToken de l'enfant
      → Envoie le push via FCM Admin SDK
          → App ouverte  : bannière plein largeur (slide-down 5s)
          → App fermée   : notification native OS (Android / iOS 16.4+ PWA)
```

### Événements déclencheurs
| Événement | Titre | Corps |
|-----------|-------|-------|
| Score +1 ou -1 | ⭐ Score +1 ! | Tu as maintenant N/5 étoiles aujourd'hui. |
| Journée validée | ✅ Journée validée ! | Ta journée est validée avec N/5 étoiles. Bravo ! |
| Journée ignorée | 📋 Journée enregistrée | Ta journée d'aujourd'hui a été enregistrée. |

---

## PWA — fonctionnalités offline

| Fonctionnalité | Description |
|----------------|-------------|
| **Service Worker** | Workbox — stratégie `injectManifest`, précache des assets buildés |
| **Cache pages** | Stale-While-Revalidate — chargement depuis le cache, mise à jour en arrière-plan |
| **Cache assets** | Cache-First 1 an — images, polices |
| **FCM SW** | `static/firebase-messaging-sw.js` séparé (mode classic) pour les notifications background |
| **Install banner** | Bandeau après 3s si l'app est installable (`beforeinstallprompt`) |
| **Manifest** | `display: standalone`, orientation portrait, shortcut "Score du jour" |
| **Apple PWA** | Meta tags `apple-mobile-web-app-capable`, icône home screen |

---

## CI/CD — Déploiement

### Workflows GitHub Actions

| Workflow | Branches déclenchantes | Canal Firebase |
|----------|------------------------|----------------|
| `deploy-main.yml` | `main` | `live` (production) |
| `deploy-poc.yml` | `dev/main`, `claude/setup-refactoring-*` | `poc` |

### Étapes build
1. Checkout du dépôt
2. Création du fichier `.env` depuis les secrets GitHub (`VITE_FIREBASE_*`)
3. `npm install`
4. `npm run build` → génère `build/`
5. Déploiement des règles Firestore
6. Déploiement des Cloud Functions (production seulement)
7. Déploiement Firebase Hosting (`build/`)

### Secrets GitHub requis
| Secret | Description |
|--------|-------------|
| `VITE_FIREBASE_API_KEY` | Clé API Firebase |
| `VITE_FIREBASE_AUTH_DOMAIN` | Domaine d'authentification |
| `VITE_FIREBASE_PROJECT_ID` | ID du projet Firebase |
| `VITE_FIREBASE_STORAGE_BUCKET` | Bucket Storage |
| `VITE_FIREBASE_MESSAGING_SENDER_ID` | ID expéditeur FCM |
| `VITE_FIREBASE_APP_ID` | App ID Firebase |
| `VITE_FIREBASE_VAPID_KEY` | Clé VAPID publique pour les push web |
| `FIREBASE_SERVICE_ACCOUNT` | JSON du compte de service (firebase-tools CLI) |

---

## Structure des fichiers

```
RewardKidz/
├── src/
│   ├── app.html                    # Shell PWA
│   ├── app.css                     # Design system (1000+ lignes)
│   ├── service-worker.ts           # SW Workbox (précache + SWR)
│   ├── lib/
│   │   ├── firebase/
│   │   │   ├── app.ts              # Init Firebase (guard HMR)
│   │   │   ├── auth.ts             # loginWithGoogle, registerWithEmail, loginAsChild…
│   │   │   ├── families.ts         # createFamily, getFamilyMembers, OTP, invites…
│   │   │   ├── scores.ts           # addPoint, removePoint, setScoreValidated…
│   │   │   ├── notifications.ts    # initNotifications, onForegroundMessage
│   │   │   ├── types.ts            # Interfaces TypeScript Firestore
│   │   │   └── index.ts            # Barrel export
│   │   ├── stores/
│   │   │   ├── auth.store.ts       # authUser, userDoc, authReady, pendingJoin
│   │   │   ├── family.store.ts     # familyDoc, members, children, parents
│   │   │   ├── score.store.ts      # scores par memberId
│   │   │   ├── ui.store.ts         # drawerOpen, activeModal, pwaPrompt
│   │   │   └── index.ts            # Barrel export
│   │   └── components/
│   │       ├── AppDrawer.svelte    # Sidebar latérale
│   │       ├── AppModal.svelte     # Bottom-sheet modal générique
│   │       ├── PwaBanner.svelte    # Bandeau installation PWA
│   │       ├── ScoreControls.svelte # Boutons +/- valider/ignorer
│   │       ├── LinearGauge.svelte  # Barre de progression score
│   │       ├── CircularGauge.svelte # Jauge SVG circulaire (vue enfant)
│   │       └── Histogram.svelte    # Histogramme 7j / 30j
│   └── routes/
│       ├── +layout.svelte          # Root : auth listener, FCM, PWA banner
│       ├── +layout.ts              # ssr=false, prerender=true
│       ├── +page.svelte            # Landing : choix rôle
│       ├── parent-auth/+page.svelte
│       ├── child-auth/+page.svelte
│       └── (app)/
│           ├── +layout.svelte      # Guard auth + role
│           ├── +layout.ts
│           ├── onboarding/+page.svelte
│           ├── create-family/+page.svelte
│           ├── join-family/+page.svelte
│           ├── child/+page.svelte
│           └── parent/
│               ├── +page.svelte
│               └── [memberId]/+page.svelte
├── static/
│   ├── firebase-messaging-sw.js    # SW FCM (mode classic)
│   ├── manifest.json               # Manifest PWA
│   └── icons/                      # 192×192 et 512×512 PNG (maskable)
├── functions/
│   ├── index.js                    # Cloud Function onScoreChange
│   └── package.json
├── firestore.rules
├── firebase.json
└── .github/workflows/
    ├── deploy-main.yml
    └── deploy-poc.yml
```

---

## Configuration locale

> **Prérequis** : Node.js 20+, Firebase CLI (`npm install -g firebase-tools`)

```bash
# 1. Cloner le dépôt
git clone <url>
cd RewardKidz

# 2. Installer les dépendances
npm install

# 3. Créer le fichier de config Firebase (ne pas commiter)
cp .env.example .env
# Remplir les valeurs VITE_FIREBASE_* depuis la Firebase Console

# 4. Lancer en développement
npm run dev

# 5. Builder pour la production
npm run build

# 6. Déployer (optionnel)
firebase deploy --only hosting
```

---

## Roadmap

Les collections Firestore suivantes sont déjà sécurisées et prêtes pour une prochaine version :

- 🪙 **Économie** — Monnaie virtuelle attribuée par les parents
- 📋 **Missions** — Tâches journalières avec catalogue personnalisable
- 🛒 **Boutique** — Échange de points contre des récompenses
- 🧒 **Avatars** — Personnalisation de l'identité visuelle des enfants
- 📦 **Demandes d'achat** — Workflow enfant → validation parent
