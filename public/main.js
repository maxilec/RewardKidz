import {
  auth,
  loginWithGoogle,
  loginAsChild,
  onUserStateChanged,
  getUser,
  createFamily,
  joinFamily,
  resolveInvite,
  createInvite,
  createReconnectInvite,
  getFamilyChildren,
  getFamilyPrivateInfo,
  deleteFamily,
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
  const app = document.getElementById("app");

  if (!user) {
    if (app) app.innerHTML = "";
    return;
  }

  const userDoc = await getUser(user.uid);

  // Si user existe et a une famille → on force parent/child
  if (userDoc && userDoc.familyId) {
    if (userDoc.role === "parent" && page !== "parent") {
      page = "parent";
    }
    if (userDoc.role === "child" && page !== "child") {
      page = "child";
    }
  } else {
    // Pas de famille → onboarding
    if (page !== "create-family" && page !== "join-family") {
      page = "create-family";
    }
  }

  const html = await fetch(`./pages/${page}.html`).then(r => r.text());
  app.innerHTML = html;

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
  await loginWithGoogle();
  navigate("create-family");
});

document.getElementById("loginChild").addEventListener("click", async () => {
  await loginAsChild();
  navigate("join-family");
});

// Reconnexion enfant
document.getElementById("loginChildReconnect").addEventListener("click", () => {
  document.getElementById("childReconnectPanel").style.display = "block";
});

document.getElementById("childReconnectBtn").addEventListener("click", async () => {
  const code = document.getElementById("childReconnectCode").value.trim().toUpperCase();
  if (!code) return alert("Code requis");

  try {
    const invite = await resolveInvite(code);
    const anon = await loginAsChild();
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

  let userDoc = await getUser(user.uid);

  if (!userDoc) {
    await createUserProfile(user.uid, {
      role: null,
      familyId: null,
      displayName: null
    });
    userDoc = await getUser(user.uid);
  }

  if (!userDoc.familyId) {
    navigate("create-family");
    return;
  }

  navigate(userDoc.role === "parent" ? "parent" : "child");
});


// ---------------------------------------------------------
// PAGES
// ---------------------------------------------------------
function initCreateFamily() {
  const btn = document.getElementById("createFamilyBtn");
  if (!btn) return;

  btn.addEventListener("click", async () => {
    const familyName = document.getElementById("familyName").value.trim();
    const parentName = document.getElementById("parentName").value.trim();
    const user = auth.currentUser;

    if (!familyName) return alert("Nom de famille requis");
    if (!parentName) return alert("Votre prénom est requis");
    if (!user) return alert("Utilisateur non connecté");

    await createFamily(user, familyName, parentName);
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
  if (!userDoc) return;

  // Nom de la famille (privé)
  const familyInfo = await getFamilyPrivateInfo(userDoc.familyId);
  const familyTitle = document.getElementById("familyTitle");
  if (familyTitle && familyInfo) {
    familyTitle.textContent = familyInfo.familyName;
  }

  // Liste des enfants
  const childrenList = document.getElementById("childrenList");
  if (childrenList) {
    const children = await getFamilyChildren(userDoc.familyId);
    if (children.length === 0) {
      childrenList.innerHTML = "<li>Aucun enfant pour le moment</li>";
    } else {
      childrenList.innerHTML = children
        .map(c => `<li>${c.name} <span class="uid">(${c.uid})</span></li>`)
        .join("");
    }
  }

  // Invitation générale
  const inviteBtn = document.getElementById("generateInvite");
  const inviteCode = document.getElementById("inviteCode");
  if (inviteBtn && inviteCode) {
    inviteBtn.addEventListener("click", async () => {
      const code = await createInvite(userDoc.familyId);
      inviteCode.textContent = code;
    });
  }

  // Reconnexion enfant
  const reconnectBtn = document.getElementById("generateReconnect");
  if (reconnectBtn) {
    reconnectBtn.addEventListener("click", async () => {
      const childUid = prompt("UID de l’enfant à reconnecter ?");
      if (!childUid) return;
      const code = await createReconnectInvite(userDoc.familyId, childUid);
      alert("Code de reconnexion : " + code);
    });
  }

  // Suppression famille
  const deleteBtn = document.getElementById("deleteFamilyBtn");
  if (deleteBtn) {
    deleteBtn.addEventListener("click", async () => {
      if (!confirm("Supprimer la famille ? Action définitive.")) return;
      await deleteFamily(userDoc.familyId);
      await logout();
    });
  }

  // Logout
  const logoutBtn = document.getElementById("logoutBtn");
  if (logoutBtn) {
    logoutBtn.addEventListener("click", () => logout());
  }
}

function initChild() {
  const logoutBtn = document.getElementById("logoutBtn");
  if (logoutBtn) {
    logoutBtn.addEventListener("click", () => logout());
  }
}
