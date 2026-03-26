# RewardKidz — PWA Validation · Lot 0

## Fichiers inclus

```
RewardKidz-pwa/
├── index.html      ← Page de validation avec checklist automatique
├── manifest.json   ← Config PWA (nom, icônes, display standalone)
├── sw.js           ← Service Worker (cache + offline + notifs)
├── icon-192.png    ← À générer (voir ci-dessous)
├── icon-512.png    ← À générer (voir ci-dessous)
└── README.md       ← Ce fichier
```

---

## 1. Générer les icônes (obligatoire)

Créer 2 images PNG carrées avec le logo RewardKidz (emoji 🦄 sur fond #09031c) :
- `icon-192.png` → 192×192 px
- `icon-512.png` → 512×512 px

**Option rapide :** utiliser https://favicon.io/emoji-favicons/  
Sélectionner l'emoji 🦄, télécharger et renommer les fichiers.

---

## 2. Déploiement selon ta situation

### Option A — GitHub + Cloudflare Pages (recommandé)

```bash
# 1. Créer un repo GitHub
git init
git add .
git commit -m "RewardKidz PWA validation"
git remote add origin https://github.com/TON_USER/RewardKidz.git
git push -u origin main

# 2. Sur Cloudflare Pages
#    → dash.cloudflare.com → Pages → Create a project
#    → Connect to Git → sélectionner le repo
#    → Build command : (vide)
#    → Build output directory : /
#    → Deploy !

# URL générée : https://RewardKidz.pages.dev
```

### Option B — GitHub + GitHub Pages

```bash
git init && git add . && git commit -m "init"
git remote add origin https://github.com/TON_USER/RewardKidz.git
git push -u origin main

# Sur GitHub : Settings → Pages → Branch: main → / (root) → Save
# URL : https://TON_USER.github.io/RewardKidz
```

### Option C — Sans compte (test local rapide)

```bash
# Installer un serveur local HTTPS (obligatoire pour SW sur certains navigateurs)
npx serve .

# Ou avec Python
python3 -m http.server 8080

# Ouvrir http://localhost:8080
# Note : Service Worker + Notifications fonctionnent sur localhost sans HTTPS
```

---

## 3. Checklist de validation

Une fois déployé, ouvrir l'URL sur **iPhone (iOS 16.4+)** dans Safari.

### Étape 1 — Dans Safari
- [ ] Page se charge correctement
- [ ] Checklist affiche ✅ HTTPS, ✅ Service Worker, ✅ Manifest

### Étape 2 — Installation
- [ ] Appuyer sur ⬆️ Partager → "Sur l'écran d'accueil" → Ajouter
- [ ] Ouvrir l'app depuis l'écran d'accueil
- [ ] Vérifier : pas de barre Safari → ✅ Standalone

### Étape 3 — Offline
- [ ] Activer le mode avion ✈️
- [ ] Recharger la page
- [ ] La page doit s'afficher → ✅ Offline OK

### Étape 4 — Persistance
- [ ] Fermer l'app complètement
- [ ] Rouvrir depuis l'écran d'accueil
- [ ] "Sessions enregistrées" doit passer à 2 → ✅ localStorage OK

### Étape 5 — Notifications (iOS 16.4+ requis)
- [ ] Appuyer "Demander la permission notifications"
- [ ] Accepter dans le popup iOS
- [ ] Appuyer "Envoyer une notification test"
- [ ] Notification reçue → ✅ Push OK

---

## 4. Résultats attendus

| Résultat | Signification |
|---|---|
| 7–8 checks ✅ | PWA prête → passer au Lot 1 (lecteur data.txt) |
| 5–6 checks ✅ | Fondations OK, notifications à déboguer → acceptable |
| < 5 checks ✅ | Problème HTTPS ou navigateur → investiguer avant de continuer |

---

## 5. Problèmes courants

**Service Worker ne s'enregistre pas**
→ Vérifier que l'URL est bien en HTTPS (ou localhost)
→ Vérifier que `sw.js` est à la racine du domaine (pas dans un sous-dossier)

**"Ajouter à l'écran d'accueil" absent sur iOS**
→ Doit être dans Safari (pas Chrome iOS)
→ Le lien doit être en HTTPS

**Notifications refusées sur iOS**
→ L'app doit être en mode standalone (installée)
→ iOS < 16.4 : non supporté

**Page blanche après mode avion**
→ Le Service Worker n'a pas encore mis le cache en place
→ Visiter la page en ligne d'abord, attendre quelques secondes, puis tester offline
