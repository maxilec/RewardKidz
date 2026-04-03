// ---------------------------------------------------------
// Imports
// ---------------------------------------------------------
import {
  loginWithGoogle,
  onUserStateChanged,
  ensureUserDocument,
  getUser,
  createFamily,
  joinFamily,
  logout,
  auth
} from "./firebase.js";

// ---------------------------------------------------------
// Simple SPA Router (hash-based)
// ---------------------------------------------------------

function navigate(page) {
  window.location.hash = page;
  loadPage(page);
}

async function loadPage(page) {
  const user = auth.currentUser;

  // --- 1) Pas connecté → retour login ---
  if (!user && page !== "login") {
    document.getElementById("app").innerHTML = "";
    return; // on laisse l'écran de login visible
  }

  // --- 2) Connecté → on récupère son profil ---
  let userDoc = null;
  if (user) {
    userDoc = await getUser(user.uid);
  }

  // --- 3) Pas de famille → accès uniquement à create-family ou join-family ---
  if (user && !userDoc.familyId) {
    if (page !== "create-family" && page !== "join-family") {
      navigate("create-family");
      return;
    }
  }

  // --- 4) Parent ne peut pas aller sur child ---
  if (userDoc && userDoc.role === "parent" && page === "child") {
    navigate("parent");
    return;
  }

  // --- 5) Enfant ne peut pas aller sur parent ---
  if (userDoc && userDoc.role === "child" && page === "parent") {
    navigate("child");
    return;
  }

  // --- 6) Chargement de la page ---
  const container = document.getElementById("app");
  const html = await fetch(`./pages/${page}.html`).then(r => r.text());
  container.innerHTML = html;

  // --- 7) Bind page-specific logic ---
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
// LOGIN BUTTON (in index.html)
// ---------------------------------------------------------

document.getElementById("login").addEventListener("click", async () => {
  const user = await loginWithGoogle();
  console.log("Connecté :", user.email);
  await ensureUserDocument(user);
});

// ---------------------------------------------------------
// ON AUTH STATE CHANGED
// ---------------------------------------------------------

onUserStateChanged(async (user) => {
  if (!user) return;

  console.log("Session restaurée :", user.email);

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
  btn.addEventListener("click", async () => {
    const name = document.getElementById("familyName").value.trim();
    const user = auth.currentUser;

    if (!name) return alert("Nom requis");

    const familyId = await createFamily(user, name);
    console.log("Famille créée :", familyId);

    navigate("parent");
  });
}

function initJoinFamily() {
  const btn = document.getElementById("joinFamilyBtn");
  btn.addEventListener("click", async () => {
    const code = document.getElementById("familyCode").value.trim();
    const user = auth.currentUser;

    try {
      await joinFamily(user, code);
      navigate("child");
    } catch (e) {
      alert("Famille introuvable");
    }
  });
}

async function initParent() {
  const user = auth.currentUser;
  const userDoc = await getUser(user.uid);

    // Afficher le code famille
  document.getElementById("familyCodeDisplay").textContent = userDoc.familyId;

    // Copier le code
  document.getElementById("copyFamilyCode").addEventListener("click", () => {
    navigator.clipboard.writeText(userDoc.familyId);
    alert("Code copié !");
  });
  
  document.getElementById("logoutBtn").addEventListener("click", () => {
    logout();
  });

  document.getElementById("btnFamily").addEventListener("click", () => {
    alert("À venir : gestion famille");
  });

  document.getElementById("btnMissions").addEventListener("click", () => {
    alert("À venir : missions");
  });

  document.getElementById("btnShop").addEventListener("click", () => {
    alert("À venir : boutique");
  });
}

function initChild() {
  console.log("Page enfant chargée");

  document.getElementById("logoutBtn").addEventListener("click", () => {
    logout();
  });

  document.getElementById("btnChildMissions").addEventListener("click", () => {
    alert("À venir : missions enfant");
  });

  document.getElementById("btnChildShop").addEventListener("click", () => {
    alert("À venir : boutique enfant");
  });

  document.getElementById("btnChildScore").addEventListener("click", () => {
    alert("À venir : score du jour");
  });
}
