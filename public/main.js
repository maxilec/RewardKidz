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
  logout // ← IMPORTANT
} from "./firebase.js";

// ---------------------------------------------------------
// Simple SPA Router (hash-based)
// ---------------------------------------------------------

function navigate(page) {
  window.location.hash = page;
  loadPage(page);
}

async function loadPage(page) {
  const container = document.getElementById("app");

  const html = await fetch(`./pages/${page}.html`).then(r => r.text());
  container.innerHTML = html;

  // Bind page-specific logic
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

function initParent() {
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
