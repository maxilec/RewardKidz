// ---------------------------------------------------------
// Imports
// ---------------------------------------------------------
import {
  auth,
  loginWithGoogle,
  loginAsChild,
  onUserStateChanged,
  getUser,
  getFamily,
  createFamily,
  joinFamily,
  reconnectChild,
  getFamilyMembers,
  resolveByFamilyCode,
  deleteFamily,
  resolveInvite,
  getActiveInvite,
  createInvite,
  logout
} from "./firebase.js";

// ---------------------------------------------------------
// Simple SPA Router (hash-based) + Guard
// ---------------------------------------------------------

function navigate(page) {
  const current = location.hash.replace("#", "") || "onboarding";
  if (current === page) {
    // Le hash ne changera pas → hashchange ne se déclenchera pas → appel direct
    loadPage(page);
  } else {
    // Changement de hash → hashchange déclenchera loadPage (un seul appel)
    window.location.hash = page;
  }
}

async function loadPage(page) {
  const user = auth.currentUser;

  // 1) Pas connecté → on laisse l'écran de login
  if (!user) {
    const container = document.getElementById("app");
    if (container) container.innerHTML = "";
    return;
  }

  // 2) Récupérer le profil utilisateur (peut être null avant création de famille)
  const userDoc = await getUser(user.uid);

  // 3) Pas de famille → accès uniquement à onboarding / create-family / join-family
  const noFamilyPages = ["onboarding", "create-family", "join-family"];
  if ((!userDoc || !userDoc.familyId) && !noFamilyPages.includes(page)) {
    navigate("onboarding");
    return;
  }

  // 4) Parent ne va pas sur child
  if (userDoc?.role === "parent" && page === "child") {
    navigate("parent");
    return;
  }

  // 5) Enfant ne va pas sur parent
  if (userDoc?.role === "child" && page === "parent") {
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
  await loginWithGoogle();
  // onUserStateChanged prend le relais — pas de user doc créé ici
});

document.getElementById("loginChild").addEventListener("click", async () => {
  await loginAsChild();
  // onUserStateChanged prend le relais et redirige vers join-family
});

// ---------------------------------------------------------
// ON AUTH STATE CHANGED
// ---------------------------------------------------------

onUserStateChanged(async (user) => {
  if (!user) return;

  const userDoc = await getUser(user.uid);

  // Pas de user doc ou pas de famille → routing initial
  if (!userDoc || !userDoc.familyId) {
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

function renderQRCode(code) {
  const container = document.getElementById("inviteQRCode");
  if (!container) return;
  container.innerHTML = "";
  if (!code) { container.style.display = "none"; return; }
  new QRCode(container, {
    text: code,
    width: 120,
    height: 120,
    colorDark: "#000000",
    colorLight: "#ffffff",
    correctLevel: QRCode.CorrectLevel.M
  });
  container.style.display = "block";
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

    await createFamily(user, name);
    navigate("parent");
  });
}

function initJoinFamily() {
  // Tab switching
  const tabJoin = document.getElementById("tabJoin");
  const tabReconnect = document.getElementById("tabReconnect");
  const modeJoin = document.getElementById("modeJoin");
  const modeReconnect = document.getElementById("modeReconnect");

  tabJoin?.addEventListener("click", () => {
    tabJoin.classList.add("active");
    tabReconnect.classList.remove("active");
    modeJoin.style.display = "";
    modeReconnect.style.display = "none";
  });

  tabReconnect?.addEventListener("click", () => {
    tabReconnect.classList.add("active");
    tabJoin.classList.remove("active");
    modeReconnect.style.display = "";
    modeJoin.style.display = "none";
  });

  // JOIN (first time)
  const joinBtn = document.getElementById("joinFamilyBtn");
  if (joinBtn) {
    joinBtn.addEventListener("click", async () => {
      const code = document.getElementById("inviteCode").value.trim().toUpperCase();
      const name = document.getElementById("joinChildName").value.trim();
      const pin  = document.getElementById("joinChildPin").value.trim();
      const user = auth.currentUser;

      if (!code || !name || !pin) return alert("Tous les champs sont requis");
      if (!/^\d{4}$/.test(pin)) return alert("Le code secret doit contenir 4 chiffres");
      if (!user) return alert("Utilisateur non connecté");

      try {
        const familyId = await resolveInvite(code);
        await joinFamily(user, familyId, name, pin);
        navigate("child");
      } catch (e) {
        alert(e.message);
      }
    });
  }

  // RECONNECT
  const reconnectBtn = document.getElementById("reconnectFamilyBtn");
  if (reconnectBtn) {
    reconnectBtn.addEventListener("click", async () => {
      const permanentCode = document.getElementById("familyCodePermanent").value.trim().toUpperCase();
      const name = document.getElementById("reconnectChildName").value.trim();
      const pin  = document.getElementById("reconnectChildPin").value.trim();
      const user = auth.currentUser;

      if (!permanentCode || !name || !pin) return alert("Tous les champs sont requis");
      if (!/^\d{4}$/.test(pin)) return alert("Le code secret doit contenir 4 chiffres");
      if (!user) return alert("Utilisateur non connecté");

      try {
        const familyId = await resolveByFamilyCode(permanentCode);
        await reconnectChild(user, familyId, name, pin);
        navigate("child");
      } catch (e) {
        alert(e.message);
      }
    });
  }
}

async function initParent() {
  const user = auth.currentUser;
  if (!user) return;

  const userDoc = await getUser(user.uid);

  // Nom de la famille + code permanent
  if (userDoc.familyId) {
    const familyDoc = await getFamily(userDoc.familyId);
    if (familyDoc) {
      const familyNameEl = document.getElementById("familyName");
      if (familyNameEl) familyNameEl.textContent = `Famille ${familyDoc.name}`;

      const permanentCodeEl = document.getElementById("permanentFamilyCode");
      if (permanentCodeEl) permanentCodeEl.textContent = familyDoc.familyCode || "—";
    }
  }

  // Liste des enfants
  try {
    const members = await getFamilyMembers(userDoc.familyId);
    const children = members.filter(m => m.role === "child");
    const list = document.getElementById("childrenList");
    if (list) {
      list.innerHTML = children.length === 0
        ? "<p>Aucun enfant n'a encore rejoint la famille.</p>"
        : children.map(c => `<div class="child-item">👦 ${c.displayName}</div>`).join("");
    }
  } catch (e) {
    console.error("Impossible de charger les membres :", e);
  }

  // Code d'invitation : afficher le code actif existant, ou en créer un nouveau
  const inviteBtn = document.getElementById("generateInvite");
  const inviteCodeEl = document.getElementById("inviteCode");

  if (inviteBtn && inviteCodeEl) {
    try {
      const existing = await getActiveInvite(userDoc.familyId);
      if (existing) {
        inviteCodeEl.textContent = existing;
        renderQRCode(existing);
      }
    } catch (e) {
      console.error("Impossible de récupérer le code d'invitation :", e);
    }

    inviteBtn.addEventListener("click", async () => {
      try {
        const active = await getActiveInvite(userDoc.familyId);
        const code = active ?? await createInvite(userDoc.familyId);
        inviteCodeEl.textContent = code;
        renderQRCode(code);
      } catch (e) {
        console.error("Erreur code d'invitation :", e);
        alert("Erreur lors de la génération du code : " + e.message);
      }
    });
  }

  // Suppression de la famille
  const deleteFamilyBtn = document.getElementById("deleteFamilyBtn");
  if (deleteFamilyBtn) {
    deleteFamilyBtn.addEventListener("click", async () => {
      const confirmed = confirm(
        "Supprimer la famille ? Cette action est irréversible et supprimera tous les membres."
      );
      if (!confirmed) return;

      try {
        await deleteFamily(userDoc.familyId);
        await logout(); // Déconnexion après suppression — onUserStateChanged(null) ramène le login
      } catch (e) {
        alert("Erreur lors de la suppression : " + e.message);
      }
    });
  }

  bindLogoutButton();
}

function initChild() {
  bindLogoutButton();
}
