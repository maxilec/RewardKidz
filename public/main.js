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
  joinFamilyAsAuthenticated,
  addChild,
  generateChildOTP,
  connectChildDevice,
  getFamilyMembers,
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
let pendingJoinCode    = null;
let pendingDisplayName = null;

// ---------------------------------------------------------
// SPA Router (hash-based)
// ---------------------------------------------------------

function navigate(page) {
  const current = location.hash.replace("#", "") || "onboarding";
  if (current === page) loadPage(page);
  else window.location.hash = page;
}

async function loadPage(page) {
  const user = auth.currentUser;

  const unauthPages = ["parent-auth", "child-auth"];
  if (!user && !unauthPages.includes(page)) {
    const container = document.getElementById("app");
    if (container) container.innerHTML = "";
    return;
  }

  const userDoc = user ? await getUser(user.uid) : null;

  const noFamilyPages = ["onboarding", "create-family", "parent-auth", "child-auth"];
  if ((!userDoc || !userDoc.familyId) && !noFamilyPages.includes(page)) {
    navigate("onboarding");
    return;
  }

  if (userDoc?.role === "parent" && page === "child") { navigate("parent"); return; }
  if (userDoc?.role === "child"  && page === "parent") { navigate("child");  return; }

  const container = document.getElementById("app");
  document.getElementById("login-screen").style.display = "none";
  document.getElementById("app").style.display = "block";
  const html = await fetch(`./pages/${page}.html`, { cache: "no-store" }).then(r => r.text());
  container.innerHTML = html;

  if (page === "onboarding")   initOnboarding();
  if (page === "create-family") initCreateFamily();
  if (page === "parent-auth")  initParentAuth();
  if (page === "child-auth")   initChildAuth();
  if (page === "parent")       initParent();
  if (page === "child")        initChild();
}

window.addEventListener("hashchange", () => {
  const page = location.hash.replace("#", "") || "onboarding";
  loadPage(page);
});

// ---------------------------------------------------------
// LANDING PAGE HANDLERS (index.html buttons)
// ---------------------------------------------------------

document.getElementById("goParent")?.addEventListener("click", async () => {
  // Authenticated parent navigates directly; unauthenticated parent sees parent-auth SPA page
  if (auth.currentUser && !auth.currentUser.isAnonymous) {
    const userDoc = await getUser(auth.currentUser.uid);
    if (userDoc?.familyId) {
      // Already has a family — show app and navigate
      document.getElementById("login-screen").style.display = "none";
      document.getElementById("app").style.display = "block";
      navigate(userDoc.role === "parent" ? "parent" : "onboarding");
      return;
    }
  }
  // Need to auth first — temporarily show the app container with parent-auth page
  document.getElementById("login-screen").style.display = "none";
  document.getElementById("app").style.display = "block";
  navigate("parent-auth");
});

document.getElementById("goChild")?.addEventListener("click", async () => {
  await loginAsChild();
  // onUserStateChanged will route to child-auth
});

// ---------------------------------------------------------
// ON AUTH STATE CHANGED — routing
// ---------------------------------------------------------

onUserStateChanged(async (user) => {
  if (!user) {
    // Show landing again
    document.getElementById("login-screen").style.display = "flex";
    document.getElementById("app").style.display = "none";
    return;
  }

  // Process a pending adult join (Google or email registration)
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
    // Anonymous → child auth screen; authenticated (no family yet) → onboarding to create one
    navigate(user.isAnonymous ? "child-auth" : "onboarding");
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
    text: code, width: 120, height: 120,
    colorDark: "#000000", colorLight: "#ffffff",
    correctLevel: QRCode.CorrectLevel.M
  });
  container.style.display = "block";
}

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

function setupAuthTabs() {
  const tabSignin    = document.getElementById("tabSignin");
  const tabJoinFamily = document.getElementById("tabJoinFamily");
  const panelSignin  = document.getElementById("panel-signin");
  const panelJoin    = document.getElementById("panel-join");
  if (!tabSignin) return;

  tabSignin.addEventListener("click", () => {
    tabSignin.classList.add("active");     tabSignin.setAttribute("aria-selected", "true");
    tabJoinFamily.classList.remove("active"); tabJoinFamily.setAttribute("aria-selected", "false");
    panelSignin.classList.remove("hidden");
    panelJoin.classList.add("hidden");
  });
  tabJoinFamily.addEventListener("click", () => {
    tabJoinFamily.classList.add("active");  tabJoinFamily.setAttribute("aria-selected", "true");
    tabSignin.classList.remove("active");   tabSignin.setAttribute("aria-selected", "false");
    panelJoin.classList.remove("hidden");
    panelSignin.classList.add("hidden");
  });
}

// ---------------------------------------------------------
// PAGE LOGIC
// ---------------------------------------------------------

function initOnboarding() {
  document.getElementById("goCreateFamily")?.addEventListener("click", () => navigate("create-family"));
  document.getElementById("goJoinFamily")?.addEventListener("click",   () => navigate("parent-auth"));
}

function initCreateFamily() {
  document.getElementById("createFamilyBtn")?.addEventListener("click", async () => {
    try {
      const name = document.getElementById("familyName").value.trim();
      const user = auth.currentUser;
      if (!name) return alert("Nom requis");
      if (!user)  return alert("Utilisateur non connecté");
      await createFamily(user, name);
      navigate("parent");
    } catch (e) { alert(e.message); }
  });
}

function initParentAuth() {
  // Back to landing — works whether user is authenticated or not
  document.getElementById("backToLanding")?.addEventListener("click", async () => {
    if (auth.currentUser) await logout();
    document.getElementById("login-screen").style.display = "flex";
    document.getElementById("app").style.display = "none";
  });

  setupAuthTabs();

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
    } catch (e) { alert(translateAuthError(e)); }
  });

  // Rejoindre — Google
  document.getElementById("joinGoogle")?.addEventListener("click", () => {
    const code = document.getElementById("joinInviteCode").value.trim().toUpperCase();
    if (!code) return alert("Entre le code d'invitation");
    pendingJoinCode = code;
    loginWithGoogle().catch(err => { pendingJoinCode = null; alert(translateAuthError(err)); });
  });

  // Rejoindre — email/password
  document.getElementById("formJoin")?.addEventListener("submit", async (e) => {
    e.preventDefault();
    const code = document.getElementById("joinInviteCode").value.trim().toUpperCase();
    const name = document.getElementById("joinDisplayName").value.trim();
    const email = document.getElementById("joinEmail").value.trim();
    const pass  = document.getElementById("joinPassword").value;
    if (!code) return alert("Entre le code d'invitation");
    if (!name) return alert("Entre ton prénom");
    pendingJoinCode = code; pendingDisplayName = name;
    try {
      await registerWithEmail(email, pass, name);
    } catch (err) {
      pendingJoinCode = null; pendingDisplayName = null;
      alert(translateAuthError(err));
    }
  });
}

function initChildAuth() {
  document.getElementById("backToLanding")?.addEventListener("click", () => logout());

  document.getElementById("connectChildBtn")?.addEventListener("click", async () => {
    const familyCode = document.getElementById("childFamilyCode").value.trim().toUpperCase();
    const otp = document.getElementById("childOtpInput").value.trim();
    if (!familyCode) return alert("Entre le code famille");
    if (!/^\d{6}$/.test(otp)) return alert("Le code enfant doit contenir 6 chiffres");
    try {
      await connectChildDevice(auth.currentUser, familyCode, otp);
      navigate("child");
    } catch (e) { alert(e.message); }
  });
}

async function initParent() {
  const user = auth.currentUser;
  if (!user) return;

  const userDoc = await getUser(user.uid);
  if (!userDoc?.familyId) return;

  const familyId = userDoc.familyId;

  // Family name + permanent code
  try {
    const familyDoc = await getFamily(familyId);
    if (familyDoc) {
      const el = document.getElementById("familyName");
      if (el) el.textContent = `Famille ${familyDoc.name}`;

      let familyCode = familyDoc.familyCode;
      if (!familyCode) familyCode = await migrateFamilyCode(familyId);
      const codeEl = document.getElementById("permanentFamilyCode");
      if (codeEl) codeEl.textContent = familyCode || "—";
    }
  } catch (e) { console.error(e); }

  // Children list + add child
  async function renderChildren() {
    try {
      const members  = await getFamilyMembers(familyId);
      const children = members.filter(m => m.role === "child");
      const list = document.getElementById("childrenList");
      if (!list) return;

      if (children.length === 0) {
        list.innerHTML = "<p class='hint'>Aucun enfant pour l'instant.</p>";
        return;
      }

      list.innerHTML = children.map(c => `
        <div class="child-member-row" id="child-row-${c.memberId}">
          <span class="child-name">🧒 ${c.displayName}</span>
          <span class="child-status ${c.linkedAuthUid ? 'connected' : 'pending'}">
            ${c.linkedAuthUid ? "Connecté" : "En attente"}
          </span>
          <button class="secondary-btn otp-btn" data-memberid="${c.memberId}" data-name="${c.displayName}">
            Générer un code
          </button>
          <div class="otp-display" id="otp-${c.memberId}" style="display:none;"></div>
        </div>
      `).join("");

      list.querySelectorAll(".otp-btn").forEach(btn => {
        btn.addEventListener("click", async () => {
          const memberId = btn.dataset.memberid;
          const name     = btn.dataset.name;
          btn.disabled = true;
          try {
            const familyDoc = await getFamily(familyId);
            const familyCode = familyDoc?.familyCode || "—";
            const otp = await generateChildOTP(familyId, memberId, name);
            const display = document.getElementById(`otp-${memberId}`);
            if (display) {
              display.innerHTML = `
                <div class="otp-code-block">
                  <div>Code famille&nbsp;: <strong class="code-value">${familyCode}</strong></div>
                  <div>Code enfant&nbsp;&nbsp;: <strong class="code-value otp-value">${otp}</strong></div>
                  <div class="otp-expiry">⏱ Valable 30 minutes</div>
                </div>`;
              display.style.display = "block";
            }
          } catch (e) {
            alert("Erreur : " + e.message);
          } finally {
            btn.disabled = false;
          }
        });
      });
    } catch (e) { console.error(e); }
  }

  await renderChildren();

  document.getElementById("formAddChild")?.addEventListener("submit", async (e) => {
    e.preventDefault();
    const nameEl = document.getElementById("newChildName");
    const name = nameEl?.value.trim();
    if (!name) return alert("Entre un prénom");
    try {
      await addChild(familyId, name);
      if (nameEl) nameEl.value = "";
      await renderChildren();
    } catch (e) { alert("Erreur : " + e.message); }
  });

  // Invite parent/tutor
  const inviteBtn    = document.getElementById("generateInvite");
  const inviteCodeEl = document.getElementById("inviteCode");
  if (inviteBtn && inviteCodeEl) {
    try {
      const existing = await getActiveInvite(familyId);
      if (existing) { inviteCodeEl.textContent = existing; renderQRCode(existing); }
    } catch (e) { console.error(e); }

    inviteBtn.addEventListener("click", async () => {
      try {
        const active = await getActiveInvite(familyId);
        const code = active ?? await createInvite(familyId);
        inviteCodeEl.textContent = code;
        renderQRCode(code);
      } catch (e) { alert("Erreur : " + e.message); }
    });
  }

  // Delete family
  document.getElementById("deleteFamilyBtn")?.addEventListener("click", async () => {
    if (!confirm("Supprimer la famille ? Cette action est irréversible.")) return;
    try { await deleteFamily(familyId); await logout(); }
    catch (e) { alert("Erreur : " + e.message); }
  });

  bindLogoutButton();
}

function initChild() {
  bindLogoutButton();
}
