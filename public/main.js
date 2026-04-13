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
  getActiveChildOTP,
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
  swConfig,
  initNotifications,
  onForegroundMessage,
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
}

// ---------------------------------------------------------
// Notifications push (FCM)
// ---------------------------------------------------------

async function sendConfigToSW() {
  if (!('serviceWorker' in navigator)) return;
  try {
    const reg  = await navigator.serviceWorker.ready;
    const ctrl = reg.active;
    if (ctrl) ctrl.postMessage({ type: 'FIREBASE_CONFIG', config: swConfig });
  } catch (e) {}
}

function showAppNotification(title, body) {
  let banner = document.getElementById('app-notif-banner');
  if (!banner) {
    banner = document.createElement('div');
    banner.id = 'app-notif-banner';
    document.body.prepend(banner);
  }
  banner.innerHTML = `
    <div class="app-notif-content">
      <strong class="app-notif-title">${title}</strong>
      <span class="app-notif-body">${body}</span>
    </div>
    <button class="app-notif-close" aria-label="Fermer">✕</button>`;
  banner.classList.add('visible');
  banner.querySelector('.app-notif-close').onclick = () => banner.classList.remove('visible');
  clearTimeout(banner._timer);
  banner._timer = setTimeout(() => banner.classList.remove('visible'), 5000);
}

// Appelé une seule fois au démarrage du module
function setupForegroundNotifications() {
  onForegroundMessage(payload => {
    const notif = payload.notification || {};
    showAppNotification(notif.title || 'RewardKidz', notif.body || '');
  });
}

setupForegroundNotifications();

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
  const tabs = [
    { tab: document.getElementById("tabSignin"),     panel: document.getElementById("panel-signin")    },
    { tab: document.getElementById("tabRegister"),   panel: document.getElementById("panel-register")  },
    { tab: document.getElementById("tabJoinFamily"), panel: document.getElementById("panel-join")      },
  ];
  if (!tabs[0].tab) return;

  function activate(index) {
    tabs.forEach(({ tab, panel }, i) => {
      const active = i === index;
      tab.classList.toggle("active", active);
      tab.setAttribute("aria-selected", String(active));
      panel.classList.toggle("hidden", !active);
    });
  }

  tabs.forEach(({ tab }, i) => tab.addEventListener("click", () => activate(i)));
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

// Returns the inner HTML for a score section in the parent dashboard + child-detail
function buildGaugeHTML(score) {
  const pct = (score.points / 5 * 100).toFixed(1);
  return `
    <div class="score-gauge-row">
      <div class="score-gauge-track"><div class="score-gauge-fill" style="width:${pct}%"></div></div>
      <span class="score-points-label">${score.points}/5</span>
    </div>`;
}

function buildScoreHTML(score, memberId) {
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
      <button class="score-btn pause"    data-memberid="${memberId}">Ignorer</button>
      <button class="score-btn validate" data-memberid="${memberId}">✓ Valider</button>`;
  }
  return buildGaugeHTML(score) + `<div class="score-controls">${controls}</div>`;
}

// SVG circular gauge for child page (arc from 8h to 4h, 240° sweep)
function buildCircularGaugeSVG(points, maxPoints = 5) {
  const cx = 80, cy = 80, r = 60, sw = 12;
  const toRad = d => d * Math.PI / 180;
  const pt = d => ({ x: cx + r * Math.cos(toRad(d)), y: cy + r * Math.sin(toRad(d)) });
  const f  = n => n.toFixed(2);
  const startDeg   = 150;   // 8h position in SVG coords (0°=right, CW)
  const totalSweep = 240;   // arc span to 4h position
  const sP = pt(startDeg);
  const eP = pt(startDeg + totalSweep);  // cos/sin handle >360° naturally
  const fillSweep = (points / maxPoints) * totalSweep;
  const fillEndDeg = startDeg + fillSweep;
  const fillP      = pt(fillEndDeg);
  const fillLarge  = fillSweep > 180 ? 1 : 0;
  const trackPath = `M ${f(sP.x)} ${f(sP.y)} A ${r} ${r} 0 1 1 ${f(eP.x)} ${f(eP.y)}`;
  const fillPath  = points > 0
    ? `M ${f(sP.x)} ${f(sP.y)} A ${r} ${r} 0 ${fillLarge} 1 ${f(fillP.x)} ${f(fillP.y)}`
    : '';
  return `
    <svg viewBox="0 0 160 160" class="circ-gauge-svg" aria-hidden="true">
      <defs>
        <linearGradient id="cgFill" x1="0%" y1="0%" x2="100%" y2="100%">
          <stop offset="0%"   stop-color="var(--c-primary)" />
          <stop offset="100%" stop-color="var(--c-primary-end)" />
        </linearGradient>
      </defs>
      <path class="circ-gauge-track" d="${trackPath}" stroke-width="${sw}" />
      ${fillPath ? `<path class="circ-gauge-fill" d="${fillPath}" stroke="url(#cgFill)" stroke-width="${sw}" />` : ''}
      <text x="${cx}" y="${cy - 6}" class="circ-gauge-num">${points}</text>
      <text x="${cx}" y="${cy + 14}" class="circ-gauge-max">/ ${maxPoints}</text>
    </svg>`;
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

  // Créer un compte — Google
  document.getElementById("registerGoogle")?.addEventListener("click", () => {
    loginWithGoogle().catch(e => alert(translateAuthError(e)));
  });

  // Créer un compte — email/password
  document.getElementById("formRegister")?.addEventListener("submit", async (e) => {
    e.preventDefault();
    const email    = document.getElementById("registerEmail").value.trim();
    const pass     = document.getElementById("registerPassword").value;
    const confirm  = document.getElementById("registerPasswordConfirm").value;
    const nickname = document.getElementById("registerNickname")?.value.trim() || null;
    if (!email)           return alert("Saisis ton adresse email.");
    if (!pass)            return alert("Saisis un mot de passe.");
    if (pass !== confirm) return alert("Les mots de passe ne correspondent pas.");
    try {
      await registerWithEmail(email, pass, nickname);
      // onUserStateChanged → pas de famille → navigate("onboarding") → "Créer ma famille"
    } catch (err) {
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

/* ─────────────────────────────────────────────────────────────
   DRAWER PARTAGÉ — même structure pour parent + child-detail
   ───────────────────────────────────────────────────────────── */

function getSharedDrawerHTML() {
  return `
    <div class="app-overlay" id="par-ov" onclick="rkCloseDrawer('par-drawer','par-ov')"></div>
    <div class="app-drawer" id="par-drawer">
      <div class="app-drawer-head">
        <span class="app-drawer-emoji">👨‍👩‍👧</span>
        <div class="drawer-title-row" id="drawerTitleRow">
          <div class="app-drawer-title" id="familyNameDrawer">Ma famille</div>
          <button id="editFamilyNameBtn" class="app-edit-btn" aria-label="Modifier le nom">✏️</button>
        </div>
        <div id="drawerEditForm" class="drawer-edit-form" style="display:none">
          <div class="drawer-edit-row">
            <input id="familyNameInput" type="text" placeholder="Nouveau nom" maxlength="30" autocomplete="off">
            <button id="saveFamilyNameBtn" class="drawer-edit-save" aria-label="Valider">✓</button>
          </div>
        </div>
        <div class="app-drawer-sub">Espace parent</div>
      </div>
      <div class="app-drawer-body">
        <div class="drawer-nav-item" id="drawerDashboardLink">
          <span class="drawer-nav-item-icon">🏠</span>
          <span>Tableau de bord</span>
        </div>
        <div class="app-drawer-sep"></div>
        <div class="drawer-section-label">Enfants</div>
        <div id="drawerChildrenList"><p class="drawer-section-hint">Chargement…</p></div>
        <div id="drawerAddChildArea">
          <button id="drawerAddChildBtn" class="drawer-add-btn">+ Ajouter un enfant</button>
          <form id="formAddChild" class="drawer-add-form" style="display:none">
            <input id="newChildName" type="text" placeholder="Prénom de l'enfant" autocomplete="off">
            <button type="submit" class="drawer-add-save" aria-label="Valider">✓</button>
          </form>
        </div>
      </div>
      <div class="app-drawer-danger-zone">
        <div class="app-drawer-item danger" id="logoutBtn">
          <span class="app-drawer-item-icon">🚪</span>Se déconnecter
        </div>
        <div class="app-drawer-sep"></div>
        <div class="app-drawer-item danger" id="deleteAccountBtn">
          <span class="app-drawer-item-icon">👤</span>Supprimer mon compte
        </div>
        <p id="deleteAccountHint" style="padding:0 20px 8px;font-size:12px;color:#9CA3AF"></p>
        <div class="app-drawer-item danger" id="deleteFamilyBtn">
          <span class="app-drawer-item-icon">🗑</span>Supprimer la famille
        </div>
      </div>
      <div class="app-drawer-foot">
        <div class="app-drawer-code" onclick="rkCopyCode(this)" title="Appuyer pour copier">
          <div>
            <div class="app-drawer-code-label">Code famille permanent</div>
            <div class="app-drawer-code-val" id="permanentFamilyCode">—</div>
          </div>
          <span style="font-size:16px;color:var(--c-primary)">📋</span>
        </div>
        <div class="app-drawer-version">RewardKidz v2.0</div>
      </div>
    </div>`;
}

/**
 * Injecte le drawer partagé dans #drawer-root et initialise tous ses handlers.
 * @param {string}   familyId
 * @param {object}   user            — auth.currentUser
 * @param {object}   opts
 * @param {string}   opts.activePage — 'parent' | 'child-detail'
 * @param {string}   [opts.currentMemberId] — memberId de l'enfant affiché (pour surbrillance)
 * @param {Function} [opts.onChildAdded]    — callback appelé après ajout d'un enfant
 */
async function initSharedDrawer(familyId, user, opts = {}) {
  const { activePage = 'parent', currentMemberId = null, onChildAdded = null } = opts;

  // ── Injection du HTML ──────────────────────────────────
  const root = document.getElementById('drawer-root');
  if (root) root.innerHTML = getSharedDrawerHTML();

  // ── Nom de famille + code permanent ───────────────────
  let familyDoc = null;
  try {
    familyDoc = await getFamily(familyId);
    if (familyDoc) {
      const nameEl = document.getElementById('familyNameDrawer');
      if (nameEl) nameEl.textContent = `Famille ${familyDoc.name}`;
      let familyCode = familyDoc.familyCode;
      if (!familyCode) familyCode = await migrateFamilyCode(familyId);
      const codeEl = document.getElementById('permanentFamilyCode');
      if (codeEl) codeEl.textContent = familyCode || '—';
    }
  } catch (e) { console.error(e); }

  // ── Lien Dashboard ────────────────────────────────────
  const dashLink = document.getElementById('drawerDashboardLink');
  if (dashLink) {
    if (activePage === 'parent') {
      dashLink.classList.add('drawer-nav-item--active');
      dashLink.addEventListener('click', () => rkCloseDrawer('par-drawer', 'par-ov'));
    } else {
      dashLink.addEventListener('click', () => {
        rkCloseDrawer('par-drawer', 'par-ov');
        navigate('parent');
      });
    }
  }

  // ── Édition nom de famille ────────────────────────────
  const _showEdit = (show) => {
    document.getElementById('drawerEditForm').style.display = show ? 'flex' : 'none';
    document.getElementById('drawerTitleRow').style.display = show ? 'none' : 'flex';
  };
  document.getElementById('editFamilyNameBtn')?.addEventListener('click', () => {
    const input = document.getElementById('familyNameInput');
    if (input && familyDoc) input.value = familyDoc.name;
    _showEdit(true);
    input?.focus();
  });
  let _savingName = false;
  const saveFamilyBtn = document.getElementById('saveFamilyNameBtn');
  saveFamilyBtn?.addEventListener('mousedown',  () => { _savingName = true; });
  saveFamilyBtn?.addEventListener('touchstart', () => { _savingName = true; }, { passive: true });
  document.getElementById('familyNameInput')?.addEventListener('blur', () => {
    setTimeout(() => { if (!_savingName) _showEdit(false); _savingName = false; }, 100);
  });
  saveFamilyBtn?.addEventListener('click', async () => {
    const newName = document.getElementById('familyNameInput')?.value.trim();
    if (!newName) { _savingName = false; return; }
    try {
      await updateFamilyName(familyId, newName);
      if (familyDoc) familyDoc = { ...familyDoc, name: newName };
      const headerEl = document.getElementById('familyName');
      if (headerEl) headerEl.textContent = `Famille ${newName}`;
      const drawerEl = document.getElementById('familyNameDrawer');
      if (drawerEl) drawerEl.textContent = `Famille ${newName}`;
      _showEdit(false);
    } catch (e) { alert('Erreur : ' + e.message); }
    finally { _savingName = false; }
  });

  // ── Liste des enfants (cliquable + surbrillance) ──────
  async function renderDrawerChildren() {
    const list = document.getElementById('drawerChildrenList');
    if (!list) return;
    try {
      const members  = await getFamilyMembers(familyId);
      const children = members.filter(m => m.role === 'child');
      list.innerHTML = children.length === 0
        ? "<p class='drawer-section-hint'>Aucun enfant.</p>"
        : children.map(c => `
            <div class="drawer-child-row${c.memberId === currentMemberId ? ' drawer-child-row--active' : ''}"
                 data-memberid="${c.memberId}" data-name="${c.displayName}" data-linkeduid="${c.linkedAuthUid || ''}">
              <span class="drawer-child-name">🧒 ${c.displayName}</span>
            </div>`).join('');
      list.querySelectorAll('.drawer-child-row').forEach(row => {
        row.addEventListener('click', () => {
          _selectedChild = {
            memberId:     row.dataset.memberid,
            displayName:  row.dataset.name,
            familyId,
            linkedAuthUid: row.dataset.linkeduid || null
          };
          rkCloseDrawer('par-drawer', 'par-ov');
          navigate('child-detail');
        });
      });
    } catch (e) { console.error(e); }
  }
  await renderDrawerChildren();

  // ── Formulaire ajout enfant ───────────────────────────
  document.getElementById('drawerAddChildBtn')?.addEventListener('click', () => {
    const form = document.getElementById('formAddChild');
    const btn  = document.getElementById('drawerAddChildBtn');
    if (form) { form.style.display = 'flex'; form.querySelector('input')?.focus(); }
    if (btn) btn.style.display = 'none';
  });
  let _savingChild = false;
  const addSubmitBtn = document.getElementById('formAddChild')?.querySelector('[type=submit]');
  addSubmitBtn?.addEventListener('mousedown',  () => { _savingChild = true; });
  addSubmitBtn?.addEventListener('touchstart', () => { _savingChild = true; }, { passive: true });
  document.getElementById('newChildName')?.addEventListener('blur', () => {
    setTimeout(() => {
      if (!_savingChild) {
        const form = document.getElementById('formAddChild');
        const btn  = document.getElementById('drawerAddChildBtn');
        if (form) { form.style.display = 'none'; const inp = form.querySelector('input'); if (inp) inp.value = ''; }
        if (btn) btn.style.display = '';
      }
      _savingChild = false;
    }, 100);
  });
  document.getElementById('formAddChild')?.addEventListener('submit', async (e) => {
    e.preventDefault();
    const nameEl = document.getElementById('newChildName');
    const name   = nameEl?.value.trim();
    if (!name) return alert('Entre un prénom');
    _savingChild = true;
    try {
      await addChild(familyId, name);
      if (nameEl) nameEl.value = '';
      document.getElementById('formAddChild').style.display  = 'none';
      document.getElementById('drawerAddChildBtn').style.display = '';
      await renderDrawerChildren();
      if (onChildAdded) await onChildAdded();
    } catch (e) { alert('Erreur : ' + e.message); }
    finally { _savingChild = false; }
  });

  // ── Suppression de compte ─────────────────────────────
  try {
    const allMembers = await getFamilyMembers(familyId);
    const parents    = allMembers.filter(m => m.role === 'parent');
    const children   = allMembers.filter(m => m.role === 'child');
    const isSoleParent = parents.length === 1;
    const deleteBtn  = document.getElementById('deleteAccountBtn');
    const deleteHint = document.getElementById('deleteAccountHint');
    if (deleteBtn) {
      if (isSoleParent && children.length > 0) {
        deleteBtn.disabled = true;
        if (deleteHint) deleteHint.textContent = "Invitez un co-parent ou retirez tous les enfants avant de supprimer votre compte.";
      } else {
        const msg = isSoleParent
          ? "⚠️ Vous êtes seul(e) parent — cette action supprimera aussi la famille entière."
          : "La famille et les autres membres ne seront pas affectés.";
        if (deleteHint) deleteHint.textContent = msg;
        const confirmMsg = isSoleParent
          ? "Supprimer votre compte supprimera aussi la famille entière (sans enfants). Cette action est irréversible. Confirmer ?"
          : "Supprimer votre compte ? La famille restera active pour les autres membres. Confirmer ?";
        deleteBtn.addEventListener('click', async () => {
          if (!confirm(confirmMsg)) return;
          deleteBtn.disabled = true;
          try { await deleteParentAccount(user, familyId); }
          catch (e) { alert("Erreur : " + e.message); deleteBtn.disabled = false; }
        });
      }
    }
  } catch (e) { console.error(e); }

  // ── Suppression de la famille ─────────────────────────
  document.getElementById('deleteFamilyBtn')?.addEventListener('click', async () => {
    if (!confirm("Supprimer la famille ? Cette action est irréversible.")) return;
    try { await deleteFamily(familyId); await logout(); }
    catch (e) { alert("Erreur : " + e.message); }
  });

  // ── Déconnexion ───────────────────────────────────────
  document.getElementById('logoutBtn')?.addEventListener('click', () => logout());

  return { renderDrawerChildren };
}

async function initParent() {
  const user = auth.currentUser;
  if (!user) return;

  const userDoc = await getUser(user.uid);
  if (!userDoc?.familyId) return;

  const familyId = userDoc.familyId;

  // ── Nom de famille dans le header ─────────────────────────────
  // (Le drawer est initialisé plus bas via initSharedDrawer)
  try {
    const fDoc = await getFamily(familyId);
    if (fDoc) {
      const el = document.getElementById("familyName");
      if (el) el.textContent = `Famille ${fDoc.name}`;
      let familyCode = fDoc.familyCode;
      if (!familyCode) familyCode = await migrateFamilyCode(familyId);
      const codeModalEl = document.getElementById("permanentFamilyCodeModal");
      if (codeModalEl) codeModalEl.textContent = familyCode || "—";
    }
  } catch (e) { console.error(e); }

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

    section.querySelector('.score-btn.pause')?.addEventListener('click', async () => {
      try { await setDayIgnored(familyId, memberId, true, byUid, byName); await reloadChildScore(memberId); }
      catch (e) { alert("Erreur : " + e.message); }
    });

    section.querySelector('.score-btn.validate')?.addEventListener('click', () => {
      const controls = section.querySelector('.score-controls');
      if (!controls) return;
      const savedHTML = controls.innerHTML;
      controls.innerHTML = `
        <div class="score-confirm-wrap">
          <button class="score-confirm-yes">✓</button>
          <button class="score-confirm-no">✗</button>
        </div>`;
      controls.querySelector('.score-confirm-yes').addEventListener('click', async () => {
        try { await setScoreValidated(familyId, memberId, true, byUid, byName); await reloadChildScore(memberId); }
        catch (e) { alert("Erreur : " + e.message); }
      });
      controls.querySelector('.score-confirm-no').addEventListener('click', () => {
        controls.innerHTML = savedHTML;
        bindScoreHandlersFor(memberId);
      });
    });

    section.querySelector('.score-btn.unvalidate')?.addEventListener('click', async () => {
      try { await setScoreValidated(familyId, memberId, false, byUid, byName); await reloadChildScore(memberId); }
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
              <div class="child-quick-btns">
                <button class="child-quick-remove" data-memberid="${c.memberId}" aria-label="Retirer un point">−</button>
                <button class="child-quick-add"    data-memberid="${c.memberId}" aria-label="Ajouter un point">+</button>
              </div>
            </div>
            <div class="score-section" id="score-${c.memberId}">
              ${buildScoreHTML(score, c.memberId)}
            </div>
          </div>`;
      }).join("");

      // Bind score handlers for each child
      children.forEach(c => bindScoreHandlersFor(c.memberId));

      // Bind quick-add (+) and quick-remove (-) buttons on each card header
      list.querySelectorAll('.child-quick-add').forEach(btn => {
        const mid = btn.dataset.memberid;
        btn.addEventListener('click', async (e) => {
          e.stopPropagation();
          try { await addPoint(familyId, mid, byUid, byName); await reloadChildScore(mid); }
          catch (err) { alert("Erreur : " + err.message); }
        });
      });

      list.querySelectorAll('.child-quick-remove').forEach(btn => {
        const mid = btn.dataset.memberid;
        btn.addEventListener('click', async (e) => {
          e.stopPropagation();
          try { await removePoint(familyId, mid, byUid, byName); await reloadChildScore(mid); }
          catch (err) { alert("Erreur : " + err.message); }
        });
      });

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

      // Rename/delete/OTP are handled in child-detail — nothing to bind here
    } catch (e) { console.error(e); }
  }

  await renderParents();
  await renderChildren();
  await initSharedDrawer(familyId, user, { activePage: 'parent', onChildAdded: renderChildren });

  // Invite parent/tutor — modale
  const inviteBtn    = document.getElementById("generateInvite");
  const inviteCodeEl = document.getElementById("inviteCode");
  if (inviteBtn && inviteCodeEl) {
    // Load existing code when modal opens (openInviteModalBtn is a plain onclick=rkOpenModal)
    // so we preload on page init too
    getActiveInvite(familyId)
      .then(existing => { if (existing) { inviteCodeEl.textContent = existing; renderQRCode(existing); } })
      .catch(() => {});

    inviteBtn.addEventListener("click", async () => {
      inviteBtn.disabled = true;
      try {
        const active = await getActiveInvite(familyId);
        const code   = active ?? await createInvite(familyId);
        inviteCodeEl.textContent = code;
        renderQRCode(code);
      } catch (e) { alert("Erreur : " + e.message); }
      finally { inviteBtn.disabled = false; }
    });
  }

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

    // Populate family code in drawer
    getFamily(familyId).then(fDoc => {
      const codeEl = document.getElementById('childFamilyCodeDisplay');
      if (codeEl && fDoc?.familyCode) codeEl.textContent = fDoc.familyCode;
    }).catch(() => {});

    // Notifications push — envoyer config au SW + demander permission
    sendConfigToSW();
    initNotifications(familyId, memberId); // async, non bloquant

    const renderChildScore = score => {
      const el = document.getElementById("childScoreDisplay");
      if (!el) return;
      let badge = '';
      if (score.validated) badge = '<div class="child-score-badge validated">✓ Journée validée</div>';
      else if (score.ignored) badge = '<div class="child-score-badge ignored">Non comptabilisée</div>';
      el.className = "child-score-display";
      el.innerHTML = buildCircularGaugeSVG(score.points) + badge;
    };

    const unsub = subscribeToScore(familyId, memberId, renderChildScore);
    _unsubscribers.push(unsub);

  } catch (e) { console.error(e); }
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

  // ── Header — nom cliquable pour renommer ───────────────
  const nameEl = document.getElementById("detailChildName");
  if (nameEl) {
    nameEl.textContent = displayName;
    nameEl.classList.add('detail-name-clickable');
  }

  // ── Drawer partagé ─────────────────────────────────────
  await initSharedDrawer(familyId, user, { activePage: 'child-detail', currentMemberId: memberId });

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
    section.querySelector('.score-btn.pause')?.addEventListener('click', async () => {
      try { await setDayIgnored(familyId, memberId, true, byUid, byName); await reloadDetailScore(); }
      catch (e) { alert("Erreur : " + e.message); }
    });
    section.querySelector('.score-btn.validate')?.addEventListener('click', () => {
      const controls = section.querySelector('.score-controls');
      if (!controls) return;
      const savedHTML = controls.innerHTML;
      controls.innerHTML = `
        <div class="score-confirm-wrap">
          <button class="score-confirm-yes">✓</button>
          <button class="score-confirm-no">✗</button>
        </div>`;
      controls.querySelector('.score-confirm-yes').addEventListener('click', async () => {
        try { await setScoreValidated(familyId, memberId, true, byUid, byName); await reloadDetailScore(); }
        catch (e) { alert("Erreur : " + e.message); }
      });
      controls.querySelector('.score-confirm-no').addEventListener('click', () => {
        controls.innerHTML = savedHTML;
        bindDetailScoreButtons(section);
      });
    });
    section.querySelector('.score-btn.unvalidate')?.addEventListener('click', async () => {
      try { await setScoreValidated(familyId, memberId, false, byUid, byName); await reloadDetailScore(); }
      catch (e) { alert("Erreur : " + e.message); }
    });
    section.querySelector('.score-btn.unignore')?.addEventListener('click', async () => {
      try { await setDayIgnored(familyId, memberId, false, byUid, byName); await reloadDetailScore(); }
      catch (e) { alert("Erreur : " + e.message); }
    });
  }

  await reloadDetailScore();

  // ── Gestion ─────────────────────────────────────────────
  // OTP — opens modal, generate button inside modal triggers the actual call
  document.getElementById("detail-otp-btn")?.addEventListener("click", () => {
    if (typeof rkOpenModal === 'function') rkOpenModal('otp-modal');
  });

  // Précharger un OTP valide existant + code famille dans la modale
  getActiveChildOTP(familyId, memberId)
    .then(existing => {
      if (existing) {
        const el = document.getElementById('detail-otp-code');
        if (el) el.textContent = existing;
      }
    }).catch(() => {});
  getFamily(familyId)
    .then(fDoc => {
      const el = document.getElementById('detail-otp-family-code');
      if (el && fDoc?.familyCode) el.textContent = fDoc.familyCode;
    }).catch(() => {});

  async function generateAndShowOTP() {
    const genBtn = document.getElementById("detail-otp-generate-btn");
    const codeEl = document.getElementById("detail-otp-code");
    if (genBtn) genBtn.disabled = true;
    if (codeEl) codeEl.textContent = "…";
    try {
      const otp = await generateChildOTP(familyId, memberId, displayName);
      if (codeEl) codeEl.textContent = otp;
    } catch (e) {
      if (typeof rkCloseModal === 'function') rkCloseModal('otp-modal');
      alert("Erreur : " + e.message);
    } finally {
      if (genBtn) genBtn.disabled = false;
    }
  }

  document.getElementById("detail-otp-generate-btn")?.addEventListener("click", generateAndShowOTP);

  // Renommer en cliquant sur le prénom dans le header
  nameEl?.addEventListener("click", async () => {
    const newName = prompt(`Nouveau prénom :`, displayName);
    if (!newName || newName.trim() === displayName) return;
    try {
      await updateChildName(familyId, memberId, newName.trim());
      displayName = newName.trim();
      _selectedChild.displayName = displayName;
      nameEl.textContent = displayName;
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
