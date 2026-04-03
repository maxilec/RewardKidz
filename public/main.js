import {
  auth,
  loginWithGoogle,
  loginAsChild,
  onUserStateChanged,
  ensureUserDocument,
  getUser,
  createFamily,
  joinFamily,
  resolveInvite,
  createInvite,
  createReconnectInvite,
  logout
} from "./firebase.js";

// ---------------------------------------------------------
// Router + Guard
// ---------------------------------------------------------

function navigate(page) {
  window.location.hash = page;
  loadPage(page);
}

async function loadPage(page) {
  const user = auth.currentUser;

  if (!user) {
    const container = document.getElementById("app");
    if (container) container.innerHTML = "";
    return;
  }

  const userDoc = await getUser(user.uid);

  if (!userDoc.familyId &&
      page !== "create-family" &&
      page !== "join-family") {
    navigate("create-family");
    return;
  }

  if (userDoc.role === "parent" && page === "child") {
    navigate("parent");
    return;
  }

  if (userDoc.role === "child" && page === "parent") {
    navigate("child");
    return;
  }

  const container = document.getElementById("app");
  const html = await fetch(`./pages/${page}.html`).then(r => r.text());
  container.innerHTML = html;

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
// LOGIN SCREEN
// ---------------------------------------------------------

document.getElementById("login").addEventListener("click", async () => {
  const user = await loginWithGoogle();
  await ensureUserDocument(user);
});

document.getElementById("loginChild").addEventListener("click", async () => {
  const user = await loginAsChild();
  await ensureUserDocument(user);
  navigate("join-family");
});

// Reconnexion enfant via code temporaire
document.getElementById("loginChildReconnect").addEventListener("click", () => {
  document.getElementById("childReconnectPanel").style.display = "block";
});

document.getElementById("childReconnectBtn").addEventListener("click", async () => {
  const code = document.getElementById("childReconnectCode").value.trim().toUpperCase();
  if (!code) return alert("Code requis");

  try {
    const invite = await resolveInvite(code);

    const anon = await loginAsChild();
    await ensureUserDocument(anon);

    // Pour l’instant, on ne réutilise pas targetUid (pas de données enfant persistantes)
    await joinFamily(anon, invite.familyId, "Enfant");

    navigate("child");
  } catch (e) {
    alert(e.message);
  }
});

// ---------------------------------------------------------
// AUTH STATE
// ---------------------------------------------------------

onUserStateChanged(async (user) => {
  if (!user) return;

  await ensureUserDocument(user);
  const userDoc = await getUser(user.uid);

  if (!userDoc.familyId) {
    navigate("create-family");
    return;
  }

  navigate(userDoc.role === "parent" ? "parent" : "child");
});

// ---------------------------------------------------------
// PAGE LOGIC
// ---------------------------------------------------------

function initCreateFamily() {
  const btn = document.getElementById("createFamilyBtn");
  if (!btn) return;

  btn.addEventListener("click", async () => {
    const name = document.getElementById("familyName").value.trim();
    const user = auth.currentUser;

    if (!name) return alert("Nom requis");
    if (!user) return alert("Utilisateur non connecté");

    await createFamily(user, name);
    navigate("parent");
  });
}

function initJoinFamily() {
  const btn = document.getElementById("joinFamilyBtn");
  if (!btn) return;

  btn.addEventListener("click", async () => {
    const code = document.getElementById("familyCode").value.trim().toUpperCase();
    const childName = document.getElementById("childName").value.trim();
    const user = auth.currentUser;

    if (!code) return alert("Code requis");
    if (!childName) return alert("Prénom requis");
    if (!user) return alert("Utilisateur non connecté");

    try {
      const invite = await resolveInvite(code);
      await joinFamily(user, invite.familyId, childName);
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

  const inviteBtn = document.getElementById("generateInvite");
  const inviteCode = document.getElementById("inviteCode");

  if (inviteBtn && inviteCode) {
    inviteBtn.addEventListener("click", async () => {
      const code = await createInvite(userDoc.familyId);
      inviteCode.textContent = code;
    });
  }

  const reconnectBtn = document.getElementById("generateReconnect");
  if (reconnectBtn) {
    reconnectBtn.addEventListener("click", async () => {
      const childUid = prompt("UID de l’enfant à reconnecter (POC) ?");
      if (!childUid) return;
      const code = await createReconnectInvite(userDoc.familyId, childUid);
      alert("Code de reconnexion : " + code);
    });
  }

  const logoutBtn = document.getElementById("logoutBtn");
  if (logoutBtn) {
    logoutBtn.addEventListener("click", () => logout());
  }

  const deleteBtn = document.getElementById("deleteFamilyBtn");
  if (deleteBtn) {
    deleteBtn.addEventListener("click", async () => {
      if (!confirm("Supprimer la famille ? Cette action est définitive.")) return;

      await deleteFamily(userDoc.familyId);

      // Déconnecter le parent
      await logout();
    });
  }

}

function initChild() {
  const logoutBtn = document.getElementById("logoutBtn");
  if (logoutBtn) {
    logoutBtn.addEventListener("click", () => logout());
  }
}
