// ---------------------------------------------------------
// Imports
// ---------------------------------------------------------
import {
  auth,
  loginWithGoogle,
  loginAsChild,
  onUserStateChanged,
  ensureUserDocument,
  getUser,
  createFamily,
  joinFamily,
  logout
} from "./firebase.js";

// ---------------------------------------------------------
// Simple SPA Router (hash-based) + Guard
// ---------------------------------------------------------

function navigate(page) {
  window.location.hash = page;
  loadPage(page);
}

async function loadPage(page) {
  const user = auth.currentUser;

  // 1) Pas connecté → on laisse l'écran de login
  if (!user) {
    const container = document.getElementById("app");
    if (container) container.innerHTML = "";
    return;
  }

  // 2) Récupérer le profil utilisateur
  const userDoc = await getUser(user.uid);

  // 3) Pas de famille → accès uniquement à create-family / join-family
  if (!userDoc.familyId &&
      page !== "create-family" &&
      page !== "join-family") {
    navigate("create-family");
    return;
  }

  // 4) Parent ne va pas sur child
  if (userDoc.role === "parent" && page === "child") {
    navigate("parent");
    return;
  }

  // 5) Enfant ne va pas sur parent
  if (userDoc.role === "child" && page === "parent") {
    navigate("child");
    return;
  }

  // 6) Chargement de la page
  const container = document.getElementById("app");
  const html = await fetch(`./pages/${page}.html`).then(r => r.text());
  container.innerHTML = html;

  // 7) Bind page-specific logic
  if (page === "create-family") initCreateFamily();
  if (page === "join-family") initJoinFamily();
  if (page === "parent") initParent();
  if (page === "child") initChild();
}

window.addEventListener("hashchange", () => {
  const page = location.hash.replace("#", "") || "create-family";
  loadPage(page);
});

// ---------------------------------------------------------
// LOGIN BUTTONS (in index.html)
// ---------------------------------------------------------

document.getElementById("login").addEventListener("click", async () => {
  const user = await loginWithGoogle();
  console.log("Connecté :", user.email);
  await ensureUserDocument(user);
});

document.getElementById("loginChild").addEventListener("click", async () => {
  const user = await loginAsChild();
  console.log("Enfant connecté anonymement :", user.uid);
  await ensureUserDocument(user);
  navigate("join-family");
});

// ---------------------------------------------------------
// ON AUTH STATE CHANGED
// ---------------------------------------------------------

onUserStateChanged(async (user) => {
  if (!user) {
    console.log("Aucun utilisateur connecté");
    return;
  }

  console.log("Session restaurée :", user.email || user.uid);

  await ensureUserDocument(user);
  const userDoc = await getUser(user.uid);

  if (!userDoc.familyId) {
    navigate("create-family");
    return;
  }

  if (userDoc.role === "parent") {
    navigate("parent");
  } else {
    navigate("child");
  }
});

// ---------------------------------------------------------
// PAGE LOGIC
// ---------------------------------------------------------

function initCreateFamily() {
  const btn = document.getElementById("createFamilyBtn");
  if (!btn) return;

  btn.addEventListener("click", async () => {
    const nameInput = document.getElementById("familyName");
    const name = nameInput.value.trim();
    const user = auth.currentUser;

    if (!name) return alert("Nom requis");
    if (!user) return alert("Utilisateur non connecté");

    const familyId = await createFamily(user, name);
    console.log("Famille créée :", familyId);

    navigate("parent");
  });
}

function initJoinFamily() {
  const btn = document.getElementById("joinFamilyBtn");
  if (!btn) return;

  btn.addEventListener("click", async () => {
    const codeInput = document.getElementById("familyCode");
    const code = codeInput.value.trim();
    const user = auth.currentUser;

    if (!code) return alert("Code requis");
    if (!user) return alert("Utilisateur non connecté");

    try {
      await joinFamily(user, code);
      navigate("child");
    } catch (e) {
      console.error(e);
      alert("Famille introuvable");
    }
  });
}

async function initParent() {
  const user = auth.currentUser;
  if (!user) return;

  const userDoc = await getUser(user.uid);

  const codeDisplay = document.getElementById("familyCodeDisplay");
  const copyBtn = document.getElementById("copyFamilyCode");

  if (codeDisplay) {
    codeDisplay.textContent = userDoc.familyId || "Aucune famille";
  }

  if (copyBtn && userDoc.familyId) {
    copyBtn.addEventListener("click", () => {
      navigator.clipboard.writeText(userDoc.familyId);
      alert("Code famille copié !");
    });
  }

  const logoutBtn = document.getElementById("logoutBtn");
  if (logoutBtn) {
    logoutBtn.addEventListener("click", () => {
      logout();
    });
  }

  const btnFamily = document.getElementById("btnFamily");
  const btnMissions = document.getElementById("btnMissions");
  const btnShop = document.getElementById("btnShop");

  if (btnFamily) btnFamily.addEventListener("click", () => alert("À venir : gestion famille"));
  if (btnMissions) btnMissions.addEventListener("click", () => alert("À venir : missions"));
  if (btnShop) btnShop.addEventListener("click", () => alert("À venir : boutique"));
}

function initChild() {
  console.log("Page enfant chargée");

  const logoutBtn = document.getElementById("logoutBtn");
  if (logoutBtn) {
    logoutBtn.addEventListener("click", () => {
      logout();
    });
  }

  const btnChildMissions = document.getElementById("btnChildMissions");
  const btnChildShop = document.getElementById("btnChildShop");
  const btnChildScore = document.getElementById("btnChildScore");

  if (btnChildMissions) btnChildMissions.addEventListener("click", () => alert("À venir : missions enfant"));
  if (btnChildShop) btnChildShop.addEventListener("click", () => alert("À venir : boutique enfant"));
  if (btnChildScore) btnChildScore.addEventListener("click", () => alert("À venir : score du jour"));
}
