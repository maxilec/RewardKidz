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
  deleteChild,
  updateChildName,
  generateChildOTP,
  connectChildDevice,
  getFamilyMembers,
  migrateFamilyCode,
  deleteFamily,
  deleteParentAccount,
  resolveInvite,
  getActiveInvite,
  createInvite,
  getOrCreateDayScore,
  readDayScore,
  getChildHistory,
  addPoint,
  removePoint,
  setScoreValidated,
  setDayIgnored,
  subscribeToScore,
  updateFamilyName,
  logout
} from "./firebase.js";

// ---------------------------------------------------------
// Pending-join state (Google or email registration flows)
// ---------------------------------------------------------
let pendingJoinCode    = null;
let pendingDisplayName = null;
let _selectedChild     = null; // { memberId, displayName, familyId, linkedAuthUid }
let _currentPage       = null;
let _unsubscribers     = [];

function cleanupPage() {
  _unsubscribers.forEach(fn => fn());
  _unsubscribers = [];
  const existing = document.getElementById('ptr-indicator');
  if (existing) existing.remove();
}

function setupPullToRefresh(onRefresh) {
  const app = document.getElementById('app');
  if (!app) return;

  // Bouton ↻ flottant
  const btn = document.createElement('button');
  btn.id = 'refresh-btn';
  btn.setAttribute('aria-label', 'Actualiser');
  btn.innerHTML = '↻';
  app.prepend(btn);
  btn.addEventListener('click', () => {
    btn.classList.add('spinning');
    onRefresh().finally(() => btn.classList.remove('spinning'));
  });

  // Indicateur pull-to-refresh
  const indicator = document.createElement('div');
  indicator.id = 'ptr-indicator';
  document.body.prepend(indicator);

  let startY = 0, pulling = false;

  app.addEventListener('touchstart', e => {
    if (app.scrollTop === 0) { startY = e.touches[0].clientY; pulling = true; }
  }, { passive: true });

  app.addEventListener('touchmove', e => {
    if (!pulling) return;
    const delta = e.touches[0].clientY - startY;
    if (delta > 0) {
      indicator.style.height = Math.min(delta * 0.5, 48) + 'px';
      indicator.style.opacity = String(Math.min(delta / 60, 1));
    }
  }, { passive: true });

  app.addEventListener('touchend', e => {
    if (!pulling) return;
    const delta = e.changedTouches[0].clientY - startY;
    indicator.style.height = '0';
    indicator.style.opacity = '0';
    pulling = false;
    if (delta > 60) {
      btn.classList.add('spinning');
      onRefresh().finally(() => btn.classList.remove('spinning'));
    }
  }, { passive: true });
}

// ---------------------------------------------------------
// SPA Router (hash-based)
// ---------------------------------------------------------

function navigate(page) {
  const current = location.hash.replace("#", "") || "onboarding";
  if (current === page) loadPage(page);
  else window.location.hash = page;
}

async function loadPage(page) {
  cleanupPage();
  _currentPage = page;

  const user = auth.currentUser;

  const unauthPages = ["parent-auth", "child-auth"];
  if (!user && !unauthPages.includes(page)) {
    const container = document.getElementById("app");
    if (container) container.innerHTML = "";
    return;
  }

  // Skip Firestore read for pages that never need a family doc (faster render)
  const noFamilyPages = ["onboarding", "create-family", "parent-auth", "child-auth"];
  const userDoc = (user && !noFamilyPages.includes(page)) ? await getUser(user.uid) : null;
  if ((!userDoc || !userDoc.familyId) && !noFamilyPages.includes(page)) {
    navigate("onboarding");
    return;
  }

  if (userDoc?.role === "parent" && page === "child") { navigate("parent"); return; }
  if (userDoc?.role === "child"  && page === "parent") { navigate("child");  return; }
  if (userDoc?.role === "child"  && page === "child-detail") { navigate("child"); return; }
  if (userDoc?.role === "parent" && page === "child-detail" && !_selectedChild) { navigate("parent"); return; }

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
  if (page === "child-detail") initChildDetail();
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
// HISTOGRAM HELPERS (view)
// ---------------------------------------------------------

function formatDayLabel(dateStr, isToday, compact = false) {
  if (isToday) return 'Auj.';
  const [y, m, d] = dateStr.split('-').map(Number);
  const date = new Date(y, m - 1, d);
  const names = ['Di', 'Lu', 'Ma', 'Me', 'Je', 'Ve', 'Sa'];
  return compact ? String(date.getDate()) : `${names[date.getDay()]} ${date.getDate()}`;
}

function renderHistogram(entries, compact = false) {
  const MAX_H = 90; // px — max bar height
  const bars = entries.map(e => {
    const empty = e.missing || e.ignored;
    const h = empty ? 0 : Math.round((e.points / 5) * MAX_H);
    const barCls   = [e.isToday ? 'today' : '', empty ? 'empty' : ''].filter(Boolean).join(' ');
    const labelCls = e.isToday ? 'today' : '';
    return `<div class="histogram-bar-group">
      <div class="histogram-bar-wrap">
        <div class="histogram-bar ${barCls}" style="height:${h}px"></div>
      </div>
      <span class="histogram-label ${labelCls}">${formatDayLabel(e.date, e.isToday, compact)}</span>
    </div>`;
  }).join('');
  return `<div class="histogram-chart">${bars}</div>`;
}

// ---------------------------------------------------------
// SCORE HELPERS (view)
// ---------------------------------------------------------

function buildScoreStars(points) {
  return Array.from({length: 5}, (_, i) =>
    `<span class="score-star ${i < points ? 'filled' : 'empty'}">⭐</span>`
  ).join('');
}

// Returns the inner HTML for a score section in the parent dashboard
function buildScoreHTML(score, memberId) {
  const stars = buildScoreStars(score.points);

  let controls;
  if (score.validated) {
    controls = `
      <span class="score-status-badge validated">✓ Journée validée</span>
      <button class="score-btn unvalidate" data-memberid="${memberId}">↩ Annuler</button>`;
  } else if (score.ignored) {
    controls = `
      <span class="score-status-badge ignored">Journée ignorée</span>
      <button class="score-btn unignore" data-memberid="${memberId}">↩ Rétablir</button>`;
  } else {
    controls = `
      <button class="score-btn add"      data-memberid="${memberId}" ${score.points >= 5 ? 'disabled' : ''}>+1</button>
      <button class="score-btn remove"   data-memberid="${memberId}" ${score.points <= 0 ? 'disabled' : ''}>−1</button>
      <button class="score-btn validate" data-memberid="${memberId}">✓ Valider</button>
      <button class="score-btn ignore"   data-memberid="${memberId}">🚫 Ignorer</button>`;
  }

  return `
    <div class="score-stars-row">
      ${stars}
      <span class="score-points-label">${score.points}/5</span>
    </div>
    <div class="score-controls">${controls}</div>`;
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
      const name     = document.getElementById("familyName").value.trim();
      const nickname = document.getElementById("parentNickname")?.value.trim();
      const user = auth.currentUser;
      if (!name) return alert("Nom de la famille requis");
      if (!user)  return alert("Utilisateur non connecté");
      await createFamily(user, name, nickname || null);
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
    const code     = document.getElementById("joinInviteCode").value.trim().toUpperCase();
    const nickname = document.getElementById("joinNickname")?.value.trim();
    if (!code) return alert("Entre le code d'invitation");
    pendingJoinCode    = code;
    pendingDisplayName = nickname || null;
    loginWithGoogle().catch(err => { pendingJoinCode = null; pendingDisplayName = null; alert(translateAuthError(err)); });
  });

  // Rejoindre — email/password
  document.getElementById("formJoin")?.addEventListener("submit", async (e) => {
    e.preventDefault();
    const code     = document.getElementById("joinInviteCode").value.trim().toUpperCase();
    const nickname = document.getElementById("joinNickname")?.value.trim();
    const email    = document.getElementById("joinEmail").value.trim();
    const pass     = document.getElementById("joinPassword").value;
    if (!code) return alert("Entre le code d'invitation");
    pendingJoinCode = code; pendingDisplayName = nickname || null;
    try {
      await registerWithEmail(email, pass, nickname || null);
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

  // Family name + permanent code + édition nom
  let familyDoc = null;
  try {
    familyDoc = await getFamily(familyId);
    if (familyDoc) {
      const el = document.getElementById("familyName");
      if (el) el.textContent = `Famille ${familyDoc.name}`;

      let familyCode = familyDoc.familyCode;
      if (!familyCode) familyCode = await migrateFamilyCode(familyId);
      const codeEl = document.getElementById("permanentFamilyCode");
      if (codeEl) codeEl.textContent = familyCode || "—";
    }
  } catch (e) { console.error(e); }

  // Édition du nom de famille
  document.getElementById('editFamilyNameBtn')?.addEventListener('click', () => {
    const input = document.getElementById('familyNameInput');
    if (input && familyDoc) input.value = familyDoc.name;
    document.getElementById('familyNameEditForm').style.display = 'flex';
    document.getElementById('editFamilyNameBtn').style.display = 'none';
  });
  document.getElementById('cancelFamilyNameBtn')?.addEventListener('click', () => {
    document.getElementById('familyNameEditForm').style.display = 'none';
    document.getElementById('editFamilyNameBtn').style.display = '';
  });
  document.getElementById('saveFamilyNameBtn')?.addEventListener('click', async () => {
    const newName = document.getElementById('familyNameInput')?.value.trim();
    if (!newName) return;
    try {
      await updateFamilyName(familyId, newName);
      if (familyDoc) familyDoc = { ...familyDoc, name: newName };
      const el = document.getElementById('familyName');
      if (el) el.textContent = `Famille ${newName}`;
      document.getElementById('familyNameEditForm').style.display = 'none';
      document.getElementById('editFamilyNameBtn').style.display = '';
    } catch (e) { alert('Erreur : ' + e.message); }
  });

  // Adult members list — returns all members for reuse by button setup
  async function renderParents() {
    try {
      const members = await getFamilyMembers(familyId);
      const parents = members.filter(m => m.role === "parent");
      const list = document.getElementById("parentsList");
      if (list) {
        list.innerHTML = parents.length === 0
          ? "<p class='hint'>Aucun membre adulte.</p>"
          : parents.map(p => `
              <div class="child-member-row">
                <span class="child-name">👤 ${p.displayName || "—"}</span>
                <span class="child-status connected">${p.uid === user.uid ? "Vous" : "Membre"}</span>
              </div>`).join("");
      }
      return members;
    } catch (e) { console.error(e); return []; }
  }

  const byUid  = user.uid;
  const byName = userDoc.displayName || user.displayName || "Parent";

  // Reload only the score section for one child (preserves OTP display state)
  async function reloadChildScore(memberId) {
    try {
      const score = await getOrCreateDayScore(familyId, memberId);
      const el = document.getElementById(`score-${memberId}`);
      if (!el) return;
      el.innerHTML = buildScoreHTML(score, memberId);
      bindScoreHandlersFor(memberId);
    } catch (e) { console.error(e); }
  }

  // Bind score action buttons for one child's score section
  function bindScoreHandlersFor(memberId) {
    const section = document.getElementById(`score-${memberId}`);
    if (!section) return;

    section.querySelector('.score-btn.add')?.addEventListener('click', async () => {
      try { await addPoint(familyId, memberId, byUid, byName); await reloadChildScore(memberId); }
      catch (e) { alert("Erreur : " + e.message); }
    });

    section.querySelector('.score-btn.remove')?.addEventListener('click', async () => {
      if (!confirm("Retirer 1 point ?")) return;
      try { await removePoint(familyId, memberId, byUid, byName); await reloadChildScore(memberId); }
      catch (e) { alert("Erreur : " + e.message); }
    });

    section.querySelector('.score-btn.validate')?.addEventListener('click', async () => {
      try { await setScoreValidated(familyId, memberId, true, byUid, byName); await reloadChildScore(memberId); }
      catch (e) { alert("Erreur : " + e.message); }
    });

    section.querySelector('.score-btn.unvalidate')?.addEventListener('click', async () => {
      try { await setScoreValidated(familyId, memberId, false, byUid, byName); await reloadChildScore(memberId); }
      catch (e) { alert("Erreur : " + e.message); }
    });

    section.querySelector('.score-btn.ignore')?.addEventListener('click', async () => {
      if (!confirm("Ignorer la journée pour cet enfant ?")) return;
      try { await setDayIgnored(familyId, memberId, true, byUid, byName); await reloadChildScore(memberId); }
      catch (e) { alert("Erreur : " + e.message); }
    });

    section.querySelector('.score-btn.unignore')?.addEventListener('click', async () => {
      try { await setDayIgnored(familyId, memberId, false, byUid, byName); await reloadChildScore(memberId); }
      catch (e) { alert("Erreur : " + e.message); }
    });
  }

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

      // Load all scores in parallel (lazy reset included)
      const scores = await Promise.all(
        children.map(c => getOrCreateDayScore(familyId, c.memberId))
      );
      const scoreMap = Object.fromEntries(children.map((c, i) => [c.memberId, scores[i]]));

      list.innerHTML = children.map(c => {
        const score = scoreMap[c.memberId];
        return `
          <div class="child-score-card" id="child-card-${c.memberId}">
            <div class="child-card-header child-card-header--clickable"
                 data-memberid="${c.memberId}" data-name="${c.displayName}" data-linkeduid="${c.linkedAuthUid || ''}">
              <span class="child-name">🧒 ${c.displayName}</span>
              <span class="child-status ${c.linkedAuthUid ? 'connected' : 'pending'}">
                ${c.linkedAuthUid ? "Connecté" : "En attente"}
              </span>
              <button class="icon-btn rename-btn" data-memberid="${c.memberId}" data-name="${c.displayName}">✏️</button>
              <button class="icon-btn danger delete-btn" data-memberid="${c.memberId}" data-name="${c.displayName}">🗑</button>
            </div>
            <div class="score-section" id="score-${c.memberId}">
              ${buildScoreHTML(score, c.memberId)}
            </div>
            <div class="child-otp-section">
              <button class="secondary-btn otp-btn" data-memberid="${c.memberId}" data-name="${c.displayName}">Code connexion</button>
              <div class="otp-display" id="otp-${c.memberId}" style="display:none;"></div>
            </div>
          </div>`;
      }).join("");

      // Bind score handlers for each child
      children.forEach(c => bindScoreHandlersFor(c.memberId));

      // Abonnements temps réel — met à jour le score dès qu'un parent modifie depuis un autre appareil
      children.forEach(c => {
        const unsub = subscribeToScore(familyId, c.memberId, score => {
          const el = document.getElementById(`score-${c.memberId}`);
          if (!el) return;
          el.innerHTML = buildScoreHTML(score, c.memberId);
          bindScoreHandlersFor(c.memberId);
        });
        _unsubscribers.push(unsub);
      });

      // Navigate to child detail when clicking the card header (not on action buttons)
      list.querySelectorAll(".child-card-header--clickable").forEach(header => {
        header.addEventListener("click", e => {
          if (e.target.closest("button")) return;
          _selectedChild = {
            memberId:     header.dataset.memberid,
            displayName:  header.dataset.name,
            familyId,
            linkedAuthUid: header.dataset.linkeduid || null
          };
          navigate("child-detail");
        });
      });

      list.querySelectorAll(".otp-btn").forEach(btn => {
        btn.addEventListener("click", async () => {
          const memberId = btn.dataset.memberid;
          const name     = btn.dataset.name;
          btn.disabled = true;
          try {
            const familyDoc  = await getFamily(familyId);
            const familyCode = familyDoc?.familyCode || "—";
            const otp        = await generateChildOTP(familyId, memberId, name);
            const display    = document.getElementById(`otp-${memberId}`);
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

      list.querySelectorAll(".rename-btn").forEach(btn => {
        btn.addEventListener("click", async () => {
          const memberId = btn.dataset.memberid;
          const current  = btn.dataset.name;
          const newName  = prompt(`Nouveau prénom pour ${current} :`, current);
          if (!newName || newName.trim() === current) return;
          try {
            await updateChildName(familyId, memberId, newName.trim());
            await renderChildren();
          } catch (e) { alert("Erreur : " + e.message); }
        });
      });

      list.querySelectorAll(".delete-btn").forEach(btn => {
        btn.addEventListener("click", async () => {
          const memberId = btn.dataset.memberid;
          const name     = btn.dataset.name;
          if (!confirm(`Supprimer ${name} ? Cette action est irréversible.`)) return;
          try {
            await deleteChild(familyId, memberId);
            await renderChildren();
          } catch (e) { alert("Erreur : " + e.message); }
        });
      });
    } catch (e) { console.error(e); }
  }

  const allMembers = await renderParents();
  await renderChildren();

  // ── Delete account button setup ─────────────────────────
  {
    const parents  = allMembers.filter(m => m.role === "parent");
    const children = allMembers.filter(m => m.role === "child");
    const isSoleParent = parents.length === 1;
    const hasChildren  = children.length > 0;
    const btn  = document.getElementById("deleteAccountBtn");
    const hint = document.getElementById("deleteAccountHint");

    if (btn) {
      if (isSoleParent && hasChildren) {
        // Blocked — can't leave while sole parent with children
        btn.disabled = true;
        if (hint) {
          hint.textContent = "Invitez un co-parent ou retirez tous les enfants avant de supprimer votre compte.";
          hint.classList.add("hint-warning");
        }
      } else {
        const msg = isSoleParent
          ? "⚠️ Vous êtes seul(e) parent — cette action supprimera aussi la famille entière."
          : "La famille et les autres membres ne seront pas affectés.";
        if (hint) { hint.textContent = msg; }

        const confirmMsg = isSoleParent
          ? "Supprimer votre compte supprimera aussi la famille entière (sans enfants). Cette action est irréversible. Confirmer ?"
          : "Supprimer votre compte ? La famille restera active pour les autres membres. Confirmer ?";

        btn.addEventListener("click", async () => {
          if (!confirm(confirmMsg)) return;
          btn.disabled = true;
          try {
            await deleteParentAccount(user, familyId);
            // Auth deletion or signOut handled inside deleteParentAccount
            // onAuthStateChanged will route back to landing
          } catch (e) {
            alert("Erreur : " + e.message);
            btn.disabled = false;
          }
        });
      }
    }
  }

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

  setupPullToRefresh(async () => {
    cleanupPage();
    await loadPage(_currentPage);
  });
}

async function initChild() {
  bindLogoutButton();

  const user = auth.currentUser;
  if (!user) return;

  try {
    const userDoc = await getUser(user.uid);
    if (!userDoc?.familyId) return;

    const { familyId, memberId, displayName } = userDoc;

    const welcomeEl = document.getElementById("childWelcome");
    if (welcomeEl && displayName) welcomeEl.textContent = `Bonjour ${displayName} !`;

    if (!memberId) return;

    const renderChildScore = score => {
      const el = document.getElementById("childScoreDisplay");
      if (!el) return;
      const stars = Array.from({length: 5}, (_, i) =>
        `<span class="score-star ${i < score.points ? 'filled' : 'empty'}">⭐</span>`
      ).join('');
      let badge = '';
      if (score.validated) badge = '<div class="child-score-badge validated">✓ Journée validée par un parent</div>';
      else if (score.ignored) badge = '<div class="child-score-badge ignored">Journée non comptabilisée</div>';
      el.className = "child-score-display";
      el.innerHTML = `
        <div class="score-stars-row">${stars}</div>
        <div class="child-score-number">${score.points}<span class="score-max">/5</span></div>
        ${badge}`;
    };

    const unsub = subscribeToScore(familyId, memberId, renderChildScore);
    _unsubscribers.push(unsub);

  } catch (e) { console.error(e); }

  setupPullToRefresh(async () => {
    cleanupPage();
    await loadPage(_currentPage);
  });
}

async function initChildDetail() {
  // Guard — _selectedChild must be set before navigating here
  if (!_selectedChild) { navigate("parent"); return; }

  const { familyId } = _selectedChild;
  let { memberId, displayName, linkedAuthUid } = _selectedChild;

  const user = auth.currentUser;
  if (!user) return;
  const userDoc = await getUser(user.uid);
  const byUid  = user.uid;
  const byName = userDoc?.displayName || user.displayName || "Parent";

  // ── Back button ────────────────────────────────────────
  document.getElementById("backToParent")?.addEventListener("click", () => navigate("parent"));

  // ── Header ─────────────────────────────────────────────
  const nameEl   = document.getElementById("detailChildName");
  const statusEl = document.getElementById("detailChildStatus");
  if (nameEl) nameEl.textContent = displayName;
  if (statusEl) {
    statusEl.textContent = linkedAuthUid ? "Connecté" : "En attente";
    statusEl.className   = `child-status ${linkedAuthUid ? 'connected' : 'pending'}`;
  }

  // ── Score du jour ───────────────────────────────────────
  let currentScore = null;

  async function reloadDetailScore() {
    currentScore = await getOrCreateDayScore(familyId, memberId);
    const section = document.getElementById("detail-score-section");
    if (!section) return;
    section.innerHTML = buildScoreHTML(currentScore, memberId);
    bindDetailScoreButtons(section);
  }

  function bindDetailScoreButtons(section) {
    section.querySelector('.score-btn.add')?.addEventListener('click', async () => {
      try { await addPoint(familyId, memberId, byUid, byName); await reloadDetailScore(); }
      catch (e) { alert("Erreur : " + e.message); }
    });
    section.querySelector('.score-btn.remove')?.addEventListener('click', async () => {
      if (!confirm("Retirer 1 point ?")) return;
      try { await removePoint(familyId, memberId, byUid, byName); await reloadDetailScore(); }
      catch (e) { alert("Erreur : " + e.message); }
    });
    section.querySelector('.score-btn.validate')?.addEventListener('click', async () => {
      try { await setScoreValidated(familyId, memberId, true, byUid, byName); await reloadDetailScore(); }
      catch (e) { alert("Erreur : " + e.message); }
    });
    section.querySelector('.score-btn.unvalidate')?.addEventListener('click', async () => {
      try { await setScoreValidated(familyId, memberId, false, byUid, byName); await reloadDetailScore(); }
      catch (e) { alert("Erreur : " + e.message); }
    });
    section.querySelector('.score-btn.ignore')?.addEventListener('click', async () => {
      if (!confirm("Ignorer la journée pour cet enfant ?")) return;
      try { await setDayIgnored(familyId, memberId, true, byUid, byName); await reloadDetailScore(); }
      catch (e) { alert("Erreur : " + e.message); }
    });
    section.querySelector('.score-btn.unignore')?.addEventListener('click', async () => {
      try { await setDayIgnored(familyId, memberId, false, byUid, byName); await reloadDetailScore(); }
      catch (e) { alert("Erreur : " + e.message); }
    });
  }

  await reloadDetailScore();

  // ── Gestion ─────────────────────────────────────────────
  // OTP
  document.getElementById("detail-otp-btn")?.addEventListener("click", async () => {
    const btn = document.getElementById("detail-otp-btn");
    btn.disabled = true;
    try {
      const familyDoc  = await getFamily(familyId);
      const familyCode = familyDoc?.familyCode || "—";
      const otp        = await generateChildOTP(familyId, memberId, displayName);
      const display    = document.getElementById("detail-otp-display");
      if (display) {
        display.innerHTML = `
          <div class="otp-code-block">
            <div>Code famille&nbsp;: <strong class="code-value">${familyCode}</strong></div>
            <div>Code enfant&nbsp;&nbsp;: <strong class="code-value otp-value">${otp}</strong></div>
            <div class="otp-expiry">⏱ Valable 30 minutes</div>
          </div>`;
        display.style.display = "block";
      }
    } catch (e) { alert("Erreur : " + e.message); }
    finally { btn.disabled = false; }
  });

  // Rename
  document.getElementById("detail-rename-btn")?.addEventListener("click", async () => {
    const newName = prompt(`Nouveau prénom pour ${displayName} :`, displayName);
    if (!newName || newName.trim() === displayName) return;
    try {
      await updateChildName(familyId, memberId, newName.trim());
      displayName = newName.trim();
      _selectedChild.displayName = displayName;
      if (nameEl) nameEl.textContent = displayName;
    } catch (e) { alert("Erreur : " + e.message); }
  });

  // Delete
  document.getElementById("detail-delete-btn")?.addEventListener("click", async () => {
    if (!confirm(`Supprimer ${displayName} ? Cette action est irréversible.`)) return;
    try {
      await deleteChild(familyId, memberId);
      _selectedChild = null;
      navigate("parent");
    } catch (e) { alert("Erreur : " + e.message); }
  });

  // ── Statistiques + Histogramme ──────────────────────────
  let history30Cache = null; // lazy-loaded on toggle

  function updateStats(entries7, allEntries) {
    // Moyenne 7j validés
    const validated7 = entries7.filter(d => !d.missing && d.validated);
    const avg7El = document.getElementById("stat-avg7");
    if (avg7El) {
      avg7El.textContent = validated7.length > 0
        ? (validated7.reduce((s, d) => s + d.points, 0) / validated7.length).toFixed(1) + " / 5"
        : "—";
    }

    // Tendance 30j (toujours calculée sur les 30j si disponibles)
    const trendEl = document.getElementById("stat-trend30");
    if (trendEl) {
      const real = allEntries.filter(d => !d.missing && !d.ignored);
      if (real.length < 4) {
        trendEl.textContent = "—";
      } else {
        const half   = Math.floor(real.length / 2);
        const avg1st = real.slice(0, half).reduce((s, d) => s + d.points, 0) / half;
        const avg2nd = real.slice(half).reduce((s, d) => s + d.points, 0) / (real.length - half);
        const delta  = avg2nd - avg1st;
        trendEl.textContent = delta > 0.3 ? "↑ Hausse" : delta < -0.3 ? "↓ Baisse" : "→ Stable";
      }
    }
  }

  async function loadAndRenderHistory(days) {
    const container = document.getElementById("histogram-container");
    if (container) container.innerHTML = `<p class="hint">Chargement…</p>`;

    let entries;
    if (days === 7) {
      entries = await getChildHistory(familyId, memberId, 7, currentScore);
    } else {
      if (!history30Cache) history30Cache = await getChildHistory(familyId, memberId, 30, currentScore);
      entries = history30Cache;
    }

    // Stats: always pass 7j slice + full entries for trend
    const last7 = entries.slice(-7);
    const allForTrend = history30Cache ?? entries;
    updateStats(last7, allForTrend);

    if (container) container.innerHTML = renderHistogram(entries, days > 7);
  }

  await loadAndRenderHistory(7);

  document.getElementById("toggle-7d")?.addEventListener("click", async () => {
    document.getElementById("toggle-7d")?.classList.add("active");
    document.getElementById("toggle-30d")?.classList.remove("active");
    await loadAndRenderHistory(7);
  });
  document.getElementById("toggle-30d")?.addEventListener("click", async () => {
    document.getElementById("toggle-30d")?.classList.add("active");
    document.getElementById("toggle-7d")?.classList.remove("active");
    await loadAndRenderHistory(30);
  });
}
