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
  deleteFamily,
  resolveInvite,
  createInvite,
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

  // 3) Pas de famille → accès uniquement à onboarding / create-family / join-family
  const noFamilyPages = ["onboarding", "create-family", "join-family"];
  if (!userDoc.familyId && !noFamilyPages.includes(page)) {
    navigate("onboarding");
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
  if (page === "onboarding") initOnboarding();
  if (page === "create-family") initCreateFamily();
  if (page === "join-family") initJoinFamily();
  if (page === "parent") initParent();
  if (page === "child") initChild();
}

window.addEventListener("hashchange", () => {
  const page = location.hash.replace("#", "") || "onboarding";
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
  // onUserStateChanged prend le relais et redirige vers join-family (anonyme sans famille)
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
    // Utilisateur anonyme (enfant) → directement sur join-family
    // Utilisateur identifié → onboarding pour choisir
    navigate(user.isAnonymous ? "join-family" : "onboarding");
    return;
  }

  if (userDoc.role === "parent") {
    navigate("parent");
  } else {
    navigate("child");
  }
});

// ---------------------------------------------------------
// SHARED UI HELPERS
// ---------------------------------------------------------

function bindLogoutButton() {
  const btn = document.getElementById("logoutBtn");
  if (btn) btn.addEventListener("click", () => logout());
}

// ---------------------------------------------------------
// PAGE LOGIC
// ---------------------------------------------------------

function initOnboarding() {
  document.getElementById("goCreateFamily")?.addEventListener("click", () => navigate("create-family"));
  document.getElementById("goJoinFamily")?.addEventListener("click", () => navigate("join-family"));
}

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
    const code = document.getElementById("familyCode").value.trim().toUpperCase();
    const user = auth.currentUser;

    if (!code) return alert("Code requis");
    if (!user) return alert("Utilisateur non connecté");

    try {
      const familyId = await resolveInvite(code);
      await joinFamily(user, familyId);
      navigate("child");
    } catch (e) {
      alert(e.message);
    }
  });
}

async function initParent() {
  const user = auth.currentUser;
  if (!user) return;

  const userDoc = await getUser(user.uid);

  // Génération d’un code d’invitation
  const inviteBtn = document.getElementById("generateInvite");
  const inviteCode = document.getElementById("inviteCode");

  if (inviteBtn && inviteCode) {
    inviteBtn.addEventListener("click", async () => {
      const code = await createInvite(userDoc.familyId);
      inviteCode.textContent = code;
    });
  }

  // Suppression de la famille
  const deleteFamilyBtn = document.getElementById("deleteFamilyBtn");
  if (deleteFamilyBtn) {
    deleteFamilyBtn.addEventListener("click", async () => {
      const confirmed = confirm(
        "Supprimer la famille ? Cette action est irréversible et déconnectera tous les membres."
      );
      if (!confirmed) return;

      try {
        await deleteFamily(userDoc.familyId);
        navigate("create-family");
      } catch (e) {
        alert("Erreur lors de la suppression : " + e.message);
      }
    });
  }

  bindLogoutButton();
}

function initChild() {
  console.log("Page enfant chargée");
  bindLogoutButton();
}
