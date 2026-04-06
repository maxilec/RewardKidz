// ---------------------------------------------------------
// Imports
// ---------------------------------------------------------
import {
  auth,
  loginWithGoogle,
  loginWithEmail,
  registerWithEmail,
  loginAsChild,
  onUserStateChanged,
  getUser,
  getFamily,
  createFamily,
  joinFamily,
  joinFamilyAsAuthenticated,
  reconnectChild,
  getFamilyMembers,
  resolveByFamilyCode,
  migrateFamilyCode,
  deleteFamily,
  resolveInvite,
  getActiveInvite,
  createInvite,
  logout
} from "./firebase.js";

// ---------------------------------------------------------
// Pending-join state (Google or email registration flows)
// ---------------------------------------------------------
let pendingJoinCode     = null;
let pendingDisplayName  = null;

// ---------------------------------------------------------
// SPA Router (hash-based)
// ---------------------------------------------------------

function navigate(page) {
  const current = location.hash.replace("#", "") || "onboarding";
  if (current === page) {
    loadPage(page);
  } else {
    window.location.hash = page;
  }
}

async function loadPage(page) {
  const user = auth.currentUser;

  if (!user) {
    const container = document.getElementById("app");
    if (container) container.innerHTML = "";
    return;
  }

  const userDoc = await getUser(user.uid);

  const noFamilyPages = ["onboarding", "create-family", "join-family"];
  if ((!userDoc || !userDoc.familyId) && !noFamilyPages.includes(page)) {
    navigate("onboarding");
    return;
  }

  if (userDoc?.role === "parent" && page === "child") { navigate("parent"); return; }
  if (userDoc?.role === "child"  && page === "parent") { navigate("child");  return; }

  const container = document.getElementById("app");
  const html = await fetch(`./pages/${page}.html`, { cache: "no-store" }).then(r => r.text());
  container.innerHTML = html;

  if (page === "onboarding")    initOnboarding();
  if (page === "create-family") initCreateFamily();
  if (page === "join-family")   initJoinFamily();
  if (page === "parent")        initParent();
  if (page === "child")         initChild();
}

window.addEventListener("hashchange", () => {
  const page = location.hash.replace("#", "") || "onboarding";
  loadPage(page);
});

// ---------------------------------------------------------
// LOGIN SCREEN HANDLERS (index.html buttons)
// ---------------------------------------------------------

// S'identifier — Google
document.getElementById("loginGoogle")?.addEventListener("click", () => {
  loginWithGoogle().catch(e => alert(translateAuthError(e)));
});

// S'identifier — email/password
document.getElementById("formSignin")?.addEventListener("submit", async (e) => {
  e.preventDefault();
  try {
    await loginWithEmail(
      document.getElementById("signinEmail").value.trim(),
      document.getElementById("signinPassword").value
    );
  } catch (e) {
    alert(translateAuthError(e));
  }
});

// Rejoindre — Google
document.getElementById("joinGoogle")?.addEventListener("click", () => {
  const code = document.getElementById("joinInviteCode").value.trim().toUpperCase();
  if (!code) return alert("Entre le code d'invitation");
  pendingJoinCode = code;
  loginWithGoogle().catch(err => {
    pendingJoinCode = null;
    alert(translateAuthError(err));
  });
});

// Rejoindre — email/password (creation de compte)
document.getElementById("formJoin")?.addEventListener("submit", async (e) => {
  e.preventDefault();
  const code = document.getElementById("joinInviteCode").value.trim().toUpperCase();
  const name = document.getElementById("joinDisplayName").value.trim();
  const email = document.getElementById("joinEmail").value.trim();
  const pass  = document.getElementById("joinPassword").value;

  if (!code) return alert("Entre le code d'invitation");
  if (!name) return alert("Entre ton prénom");
  if (!email || !pass) return alert("Email et mot de passe requis");

  pendingJoinCode    = code;
  pendingDisplayName = name;
  try {
    await registerWithEmail(email, pass, name);
    // onUserStateChanged prend le relais avec pendingJoinCode
  } catch (err) {
    pendingJoinCode    = null;
    pendingDisplayName = null;
    alert(translateAuthError(err));
  }
});

// Jeune enfant sans compte (anonyme + PIN)
document.getElementById("goChildAnon")?.addEventListener("click", async () => {
  await loginAsChild();
});

// ---------------------------------------------------------
// ON AUTH STATE CHANGED — routing + pending join
// ---------------------------------------------------------

onUserStateChanged(async (user) => {
  if (!user) return;

  // Traitement d'une jointure en attente (via Google ou email)
  if (pendingJoinCode) {
    const code = pendingJoinCode;
    const name = pendingDisplayName || user.displayName || "Membre";
    pendingJoinCode    = null;
    pendingDisplayName = null;
    try {
      const familyId = await resolveInvite(code);
      await joinFamilyAsAuthenticated(user, familyId, name);
    } catch (err) {
      alert(err.message || "Impossible de rejoindre la famille");
      await logout();
      return;
    }
  }

  const userDoc = await getUser(user.uid);

  if (!userDoc || !userDoc.familyId) {
    navigate(user.isAnonymous ? "join-family" : "onboarding");
    return;
  }

  navigate(userDoc.role === "parent" ? "parent" : "child");
});

// ---------------------------------------------------------
// SHARED HELPERS
// ---------------------------------------------------------

function bindLogoutButton() {
  document.getElementById("logoutBtn")?.addEventListener("click", () => logout());
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

// Human-readable Firebase Auth error messages
function translateAuthError(err) {
  const map = {
    "auth/email-already-in-use": "Cet email est déjà utilisé.",
    "auth/invalid-email": "Adresse email invalide.",
    "auth/weak-password": "Mot de passe trop court (6 caractères minimum).",
    "auth/user-not-found": "Aucun compte trouvé pour cet email.",
    "auth/wrong-password": "Mot de passe incorrect.",
    "auth/invalid-credential": "Email ou mot de passe incorrect.",
    "auth/popup-closed-by-user": "Connexion annulée."
  };
  return map[err.code] || err.message;
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
    try {
      const name = document.getElementById("familyName").value.trim();
      const user = auth.currentUser;
      if (!name) return alert("Nom requis");
      if (!user)  return alert("Utilisateur non connecté");
      await createFamily(user, name);
      navigate("parent");
    } catch (e) {
      alert(e.message);
    }
  });
}

function initJoinFamily() {
  // Bouton retour → déconnexion de l'utilisateur anonyme
  document.getElementById("backToLogin")?.addEventListener("click", () => logout());

  // Tab switching
  const tabJoin      = document.getElementById("tabJoin");
  const tabReconnect = document.getElementById("tabReconnect");
  const modeJoin     = document.getElementById("modeJoin");
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

  // JOIN (première fois, via invite code)
  document.getElementById("joinFamilyBtn")?.addEventListener("click", async () => {
    try {
      const codeEl = document.getElementById("inviteCode");
      const nameEl = document.getElementById("joinChildName");
      const pinEl  = document.getElementById("joinChildPin");
      if (!codeEl || !nameEl || !pinEl) throw new Error("Formulaire introuvable, rechargez la page");

      const code = codeEl.value.trim().toUpperCase();
      const name = nameEl.value.trim();
      const pin  = pinEl.value.trim();
      const user = auth.currentUser;

      if (!code || !name || !pin) return alert("Tous les champs sont requis");
      if (!/^\d{4}$/.test(pin))   return alert("Le code secret doit contenir 4 chiffres");
      if (!user)                  return alert("Utilisateur non connecté");

      const familyId = await resolveInvite(code);
      await joinFamily(user, familyId, name, pin);
      navigate("child");
    } catch (e) {
      alert(e.message || "Une erreur est survenue");
    }
  });

  // RECONNECT (retour sur un nouvel appareil, via code famille permanent)
  document.getElementById("reconnectFamilyBtn")?.addEventListener("click", async () => {
    try {
      const permCodeEl = document.getElementById("familyCodePermanent");
      const nameEl     = document.getElementById("reconnectChildName");
      const pinEl      = document.getElementById("reconnectChildPin");
      if (!permCodeEl || !nameEl || !pinEl) throw new Error("Formulaire introuvable, rechargez la page");

      const permanentCode = permCodeEl.value.trim().toUpperCase();
      const name = nameEl.value.trim();
      const pin  = pinEl.value.trim();
      const user = auth.currentUser;

      if (!permanentCode || !name || !pin) return alert("Tous les champs sont requis");
      if (!/^\d{4}$/.test(pin))            return alert("Le code secret doit contenir 4 chiffres");
      if (!user)                           return alert("Utilisateur non connecté");

      const familyId = await resolveByFamilyCode(permanentCode);
      await reconnectChild(user, familyId, name, pin);
      navigate("child");
    } catch (e) {
      alert(e.message || "Une erreur est survenue");
    }
  });
}

async function initParent() {
  const user = auth.currentUser;
  if (!user) return;

  const userDoc = await getUser(user.uid);
  if (!userDoc?.familyId) return;

  // Nom de la famille + code permanent
  try {
    const familyDoc = await getFamily(userDoc.familyId);
    if (familyDoc) {
      const familyNameEl = document.getElementById("familyName");
      if (familyNameEl) familyNameEl.textContent = `Famille ${familyDoc.name}`;

      let familyCode = familyDoc.familyCode;
      if (!familyCode) {
        familyCode = await migrateFamilyCode(userDoc.familyId);
      }
      const permanentCodeEl = document.getElementById("permanentFamilyCode");
      if (permanentCodeEl) permanentCodeEl.textContent = familyCode || "—";
    }
  } catch (e) {
    console.error("Erreur chargement famille :", e);
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

  // Code d'invitation temporaire
  const inviteBtn    = document.getElementById("generateInvite");
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
        const code   = active ?? await createInvite(userDoc.familyId);
        inviteCodeEl.textContent = code;
        renderQRCode(code);
      } catch (e) {
        alert("Erreur lors de la génération du code : " + e.message);
      }
    });
  }

  // Suppression de la famille
  document.getElementById("deleteFamilyBtn")?.addEventListener("click", async () => {
    if (!confirm("Supprimer la famille ? Cette action est irréversible et supprimera tous les membres.")) return;
    try {
      await deleteFamily(userDoc.familyId);
      await logout();
    } catch (e) {
      alert("Erreur lors de la suppression : " + e.message);
    }
  });

  bindLogoutButton();
}

function initChild() {
  bindLogoutButton();
}
