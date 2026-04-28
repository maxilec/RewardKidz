<script lang="ts">
  import { goto } from '$app/navigation';
  import { page } from '$app/stores';
  import {
    loginWithGoogle, loginWithEmail, registerWithEmail, translateAuthError,
    resolveInvite, resolveByFamilyCode, resolveInviteLink, getUser, logout
  } from '$lib/firebase';
  import { pendingOnboarding, authReady, authUser, userDoc } from '$lib/stores';
  import { auth } from '$lib/firebase/auth';
  import RegisterForm  from '$lib/components/RegisterForm.svelte';
  import GoogleIcon    from '$lib/components/icons/GoogleIcon.svelte';
  import EyeIcon       from '$lib/components/icons/EyeIcon.svelte';
  import QrScanner     from '$lib/components/QrScanner.svelte';

  // ── Tab state ──────────────────────────────────────────────
  type Tab = 'signin' | 'create' | 'join';
  const _urlTab = $page.url.searchParams.get('tab');
  let activeTab = $state<Tab>(
    _urlTab === 'create' ? 'create' : _urlTab === 'join' ? 'join' : 'signin'
  );

  // ── Error messages per panel ───────────────────────────────
  let errorSignin = $state('');
  let errorCreate = $state('');
  let errorJoin   = $state('');

  // ── Loading flags ──────────────────────────────────────────
  let loadingSignin = $state(false);
  let loadingCreate = $state(false);
  let loadingJoin   = $state(false);

  // ── Form fields — Sign in ──────────────────────────────────
  let signinEmail    = $state('');
  let signinPassword = $state('');
  let showSigninPwd  = $state(false);

  // ── Form fields — Créer une famille ───────────────────────
  let createFamilyName = $state('');

  // ── Form fields — Rejoindre ────────────────────────────────
  let joinInviteCode = $state('');
  let joinFamilyCode = $state('');

  // ── Mode rejoindre : QR ───────────────────────────────────
  let joinScannerOpen  = $state(false);
  let joinQrToken      = $state('');
  let joinQrFamilyId   = $state('');
  let joinQrFamilyName = $state('');
  let joinQrResolved   = $state(false);

  async function handleJoinScan(raw: string) {
    joinScannerOpen = false;
    errorJoin = '';
    loadingJoin = true;
    try {
      let token: string | null = null;
      try { token = new URL(raw).searchParams.get('token'); } catch { /* pas une URL */ }
      if (!token) { errorJoin = 'QR code non reconnu — ce code n\'appartient pas à RewardKidz.'; return; }

      const link = await resolveInviteLink(token);
      if (!link)                  { errorJoin = 'QR code expiré. Demandez un nouveau code au co-parent.'; return; }
      if (link.type !== 'parent') { errorJoin = 'Ce QR code est destiné aux enfants, pas aux parents.'; return; }

      joinQrToken      = token;
      joinQrFamilyId   = link.familyId;
      joinQrFamilyName = link.familyName;
      joinQrResolved   = true;
    } catch (e: any) {
      errorJoin = e.message || 'QR code invalide.';
    } finally {
      loadingJoin = false;
    }
  }

  // ── Redirect once authenticated (signin tab only) ──────────
  // Les onglets create/join gèrent leur propre navigation et déconnexion
  // en cas d'utilisateur déjà associé à une famille.
  $effect(() => {
    if (!$authReady) return;
    if (!$authUser || $authUser.isAnonymous) return;
    if (activeTab !== 'signin') return;
    if ($userDoc?.familyId) {
      goto($userDoc.role === 'parent' ? '/parent' : '/child');
      return;
    }
    goto('/onboarding');
  });

  // ── Back to landing ────────────────────────────────────────
  async function goBack() {
    const user = auth.currentUser;
    if (user) await logout();
    goto('/');
  }

  const ERR_ALREADY_IN_FAMILY =
    'Vous êtes déjà associé(e) à une famille. Vous ne pouvez pas en créer ou rejoindre une nouvelle.';

  // ─────────────────────────────────────────────────────────
  // Onglet : S'identifier
  // ─────────────────────────────────────────────────────────

  async function handleLoginGoogle() {
    errorSignin = '';
    loadingSignin = true;
    try {
      await loginWithGoogle();
    } catch (e) {
      errorSignin = translateAuthError(e);
    } finally {
      loadingSignin = false;
    }
  }

  async function handleSignin(e: SubmitEvent) {
    e.preventDefault();
    errorSignin = '';
    loadingSignin = true;
    try {
      await loginWithEmail(signinEmail.trim(), signinPassword);
    } catch (err) {
      errorSignin = translateAuthError(err);
    } finally {
      loadingSignin = false;
    }
  }

  // ─────────────────────────────────────────────────────────
  // Onglet : Créer une famille
  // ─────────────────────────────────────────────────────────

  async function handleCreateGoogle() {
    errorCreate = '';
    const name = createFamilyName.trim();
    if (!name) { errorCreate = 'Le nom de la famille est requis.'; return; }
    loadingCreate = true;
    try {
      await loginWithGoogle();
      const user = auth.currentUser;
      if (user) {
        const existing = await getUser(user.uid);
        if (existing?.familyId) {
          await logout();
          errorCreate = ERR_ALREADY_IN_FAMILY;
          return;
        }
        pendingOnboarding.set({ action: 'create', familyName: name });
        goto('/parent-setup');
      }
    } catch (e) {
      errorCreate = translateAuthError(e);
    } finally {
      loadingCreate = false;
    }
  }

  async function handleCreateEmail(email: string, password: string) {
    errorCreate = '';
    const name = createFamilyName.trim();
    if (!name) { errorCreate = 'Le nom de la famille est requis.'; return; }
    loadingCreate = true;
    try {
      await registerWithEmail(email, password);
      pendingOnboarding.set({ action: 'create', familyName: name });
      goto('/parent-setup');
    } catch (e) {
      errorCreate = translateAuthError(e);
    } finally {
      loadingCreate = false;
    }
  }

  // ─────────────────────────────────────────────────────────
  // Onglet : Rejoindre une famille
  // ─────────────────────────────────────────────────────────

  // Résolution des codes ou du token QR → { familyId, token? }
  async function resolveJoinTarget(): Promise<{ familyId: string; token?: string }> {
    if (joinQrResolved) {
      return { familyId: joinQrFamilyId, token: joinQrToken };
    }
    const famCode = joinFamilyCode.trim().toUpperCase();
    const code    = joinInviteCode.trim();
    if (!famCode) throw new Error('Entrez le code famille.');
    if (!code)    throw new Error("Entrez le code d'invitation.");
    const [fid1, fid2] = await Promise.all([resolveInvite(code), resolveByFamilyCode(famCode)]);
    if (fid1 !== fid2) throw new Error("Le code d'invitation et le code famille ne correspondent pas.");
    return { familyId: fid1 };
  }

  async function handleJoinGoogle() {
    errorJoin = '';
    // Validation anticipée en mode codes (avant d'ouvrir le popup Google)
    if (!joinQrResolved) {
      if (!joinFamilyCode.trim()) { errorJoin = 'Entrez le code famille.'; return; }
      if (!joinInviteCode.trim()) { errorJoin = "Entrez le code d'invitation."; return; }
    }
    loadingJoin = true;
    try {
      await loginWithGoogle();
      const user = auth.currentUser;
      if (user) {
        const existing = await getUser(user.uid);
        if (existing?.familyId) { await logout(); errorJoin = ERR_ALREADY_IN_FAMILY; return; }
        const { familyId, token } = await resolveJoinTarget();
        pendingOnboarding.set(token
          ? { action: 'token', familyId, token }
          : { action: 'join',  familyId });
        goto('/parent-setup');
      }
    } catch (err) {
      errorJoin = (err as { message?: string }).message || translateAuthError(err);
    } finally {
      loadingJoin = false;
    }
  }

  async function handleJoinEmail(email: string, password: string) {
    errorJoin = '';
    loadingJoin = true;
    try {
      const { familyId, token } = await resolveJoinTarget();
      await registerWithEmail(email, password);
      pendingOnboarding.set(token
        ? { action: 'token', familyId, token }
        : { action: 'join',  familyId });
      goto('/parent-setup');
    } catch (err) {
      errorJoin = (err as { message?: string }).message || translateAuthError(err);
    } finally {
      loadingJoin = false;
    }
  }
</script>

<div class="page parent-auth">

  <div class="ob-blobs" aria-hidden="true">
    <div class="ob-blob ob-blob-1"></div>
    <div class="ob-blob ob-blob-2"></div>
  </div>

  <button class="ob-btn-back" aria-label="Retour" onclick={goBack}>←</button>

  <div class="ob-content ob-content--pad-top">

    <div style="margin-bottom:20px">
      <span class="ob-logo">Reward<em>Kidz</em></span>
    </div>

    <!-- Tabs -->
    <div class="ob-tabs" role="tablist">
      <button
        class="ob-tab"
        class:active={activeTab === 'signin'}
        role="tab"
        aria-selected={activeTab === 'signin'}
        aria-controls="panel-signin"
        onclick={() => { activeTab = 'signin'; errorSignin = ''; }}
      >S'identifier</button>
      <button
        class="ob-tab"
        class:active={activeTab === 'create'}
        role="tab"
        aria-selected={activeTab === 'create'}
        aria-controls="panel-create"
        onclick={() => { activeTab = 'create'; errorCreate = ''; }}
      >Créer une famille</button>
      <button
        class="ob-tab"
        class:active={activeTab === 'join'}
        role="tab"
        aria-selected={activeTab === 'join'}
        aria-controls="panel-join"
        onclick={() => { activeTab = 'join'; errorJoin = ''; }}
      >Rejoindre</button>
    </div>

    <!-- ── Panel : S'identifier ── -->
    <div id="panel-signin" class="ob-panel" class:hidden={activeTab !== 'signin'} role="tabpanel">

      <p class="ob-hint ob-mb16">Connectez-vous à votre compte parent.</p>

      {#if errorSignin}
        <div class="ob-error ob-mb12">{errorSignin}</div>
      {/if}

      <button class="ob-btn-google ob-mb16" onclick={handleLoginGoogle} disabled={loadingSignin}>
        <GoogleIcon /> Continuer avec Google
      </button>

      <div class="ob-sep">ou par email</div>

      <form novalidate onsubmit={handleSignin}>
        <div class="ob-form-field">
          <label class="ob-label" for="signinEmail">Email</label>
          <input class="ob-input" id="signinEmail" type="email"
                 placeholder="votre@email.com" required autocomplete="email"
                 bind:value={signinEmail}>
        </div>
        <div class="ob-form-field ob-mb8">
          <label class="ob-label" for="signinPassword">Mot de passe</label>
          <div class="ob-input-pwd">
            <input class="ob-input" id="signinPassword"
                   type={showSigninPwd ? 'text' : 'password'}
                   placeholder="••••••••" required autocomplete="current-password"
                   bind:value={signinPassword}>
            <button type="button" class="ob-pwd-toggle"
                    onclick={() => showSigninPwd = !showSigninPwd}
                    aria-label={showSigninPwd ? 'Masquer' : 'Afficher'}>
              <EyeIcon closed={!showSigninPwd} />
            </button>
          </div>
        </div>
        <button type="submit" class="ob-btn-primary" disabled={loadingSignin}>
          {loadingSignin ? 'Connexion…' : 'Se connecter'}
        </button>
      </form>

    </div><!-- /#panel-signin -->

    <!-- ── Panel : Créer une famille ── -->
    <div id="panel-create" class="ob-panel" class:hidden={activeTab !== 'create'} role="tabpanel">

      {#if errorCreate}
        <div class="ob-error ob-mb12">{errorCreate}</div>
      {/if}

      <div class="ob-card ob-mb20">
        <p class="ob-card-title">Votre famille</p>
        <div class="ob-form-field ob-mb0">
          <label class="ob-label" for="createFamilyName">Nom de la famille</label>
          <input
            class="ob-input"
            id="createFamilyName"
            type="text"
            placeholder="Les Dupont, Ma Super Famille…"
            maxlength="40"
            autocomplete="off"
            bind:value={createFamilyName}
          >
        </div>
      </div>

      <div class="ob-card-auth-title ob-mb12">Créer votre compte</div>

      <button class="ob-btn-google ob-mb16" onclick={handleCreateGoogle} disabled={loadingCreate}>
        <GoogleIcon /> Continuer avec Google
      </button>

      <div class="ob-sep">ou par email</div>

      <RegisterForm
        error={errorCreate}
        loading={loadingCreate}
        submitLabel="Créer ma famille"
        onSubmit={handleCreateEmail}
      />

    </div><!-- /#panel-create -->

    <!-- ── Panel : Rejoindre ── -->
    <div id="panel-join" class="ob-panel" class:hidden={activeTab !== 'join'} role="tabpanel">

      {#if errorJoin}
        <div class="ob-error ob-mb12">{errorJoin}</div>
      {/if}

      <div class="ob-card ob-mb20">
        <div class="join-card-header">
          <p class="ob-card-title">Codes d'accès</p>
          <button
            class="btn-qr-pill"
            onclick={() => joinScannerOpen = true}
            disabled={loadingJoin}
            aria-label="Scanner un QR code"
          >
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor"
                 stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
              <rect x="3" y="3" width="7" height="7" rx="1"/>
              <rect x="14" y="3" width="7" height="7" rx="1"/>
              <rect x="3" y="14" width="7" height="7" rx="1"/>
              <path d="M14 14h2v2h-2z M18 14h3 M14 18v3 M18 18h3v3h-3z"/>
            </svg>
          </button>
        </div>

        {#if joinQrResolved}
          <div class="join-qr-success ob-mb12">
            <div class="join-qr-check">✅</div>
            <div class="join-qr-info">
              <div class="join-qr-label">Famille détectée</div>
              <div class="join-qr-name">{joinQrFamilyName}</div>
            </div>
            <button class="join-qr-rescan" onclick={() => { joinQrResolved = false; joinQrToken = ''; joinQrFamilyId = ''; }}>
              ✕
            </button>
          </div>
        {/if}

        <div class="ob-form-field" class:field-secondary={joinQrResolved}>
          <label class="ob-label" for="joinFamilyCode">
            Code famille
            <span style="font-weight:400;color:var(--c-txt-m)">(8 caractères)</span>
          </label>
          <input class="ob-input ob-code-input" id="joinFamilyCode" type="text"
                 maxlength="8" placeholder="ABCD1234"
                 autocomplete="off" style="text-transform:uppercase;letter-spacing:5px"
                 disabled={joinQrResolved}
                 bind:value={joinFamilyCode}>
        </div>
        <div class="ob-form-field ob-mb0" class:field-secondary={joinQrResolved}>
          <label class="ob-label" for="joinInviteCode">
            Code d'invitation
            <span style="font-weight:400;color:var(--c-txt-m)">(6 chiffres — valable 15 min)</span>
          </label>
          <input class="ob-input ob-code-input otp-input" id="joinInviteCode"
                 type="tel" inputmode="numeric"
                 maxlength="6" placeholder="••••••"
                 autocomplete="one-time-code" style="letter-spacing:8px"
                 disabled={joinQrResolved}
                 bind:value={joinInviteCode}>
        </div>
      </div>

      <div class="ob-card-auth-title ob-mb12">Créer votre compte</div>

      <button class="ob-btn-google ob-mb16" onclick={handleJoinGoogle} disabled={loadingJoin}>
        <GoogleIcon /> Continuer avec Google
      </button>

      <div class="ob-sep">ou par email</div>

      <RegisterForm
        error={errorJoin}
        loading={loadingJoin}
        submitLabel="Créer un compte et rejoindre"
        onSubmit={handleJoinEmail}
      />

    </div><!-- /#panel-join -->

  </div><!-- /.ob-content -->

</div><!-- /.page.parent-auth -->

{#if joinScannerOpen}
  <QrScanner onScan={handleJoinScan} onClose={() => joinScannerOpen = false} />
{/if}

<style>
  .ob-error {
    background: rgba(239, 68, 68, 0.1);
    border: 1px solid rgba(239, 68, 68, 0.3);
    color: #dc2626;
    border-radius: 8px;
    padding: 0.625rem 0.875rem;
    font-size: 0.875rem;
  }
  .ob-card {
    background: var(--c-bg-alt, #f8f9fb);
    border: 1.5px solid var(--c-border, #e5e7eb);
    border-radius: 14px;
    padding: 1rem 1rem 0.75rem;
  }
  .ob-card-title {
    font-size: 0.7rem;
    font-weight: 700;
    letter-spacing: 0.08em;
    text-transform: uppercase;
    color: var(--c-txt-m);
    margin: 0 0 0.75rem;
  }
  .ob-card-auth-title {
    font-size: 0.7rem;
    font-weight: 700;
    letter-spacing: 0.08em;
    text-transform: uppercase;
    color: var(--c-txt-m);
  }
  .ob-mb0 { margin-bottom: 0 !important; }
  .ob-mb20 { margin-bottom: 1.25rem; }

  /* ── En-tête carte codes avec pastille QR ── */
  .join-card-header {
    display: flex;
    align-items: center;
    justify-content: space-between;
    margin-bottom: 0.75rem;
  }
  .join-card-header .ob-card-title { margin: 0; }
  .btn-qr-pill {
    width: 32px;
    height: 32px;
    border-radius: 50%;
    border: 1.5px solid var(--c-border, #d1d5db);
    background: var(--c-bg, #fff);
    display: flex;
    align-items: center;
    justify-content: center;
    cursor: pointer;
    color: var(--c-txt-m, #6b7280);
    flex-shrink: 0;
    transition: border-color 0.15s, color 0.15s;
  }
  .btn-qr-pill:hover:not(:disabled) {
    border-color: var(--c-purple, #7c3aed);
    color: var(--c-purple, #7c3aed);
  }
  .btn-qr-pill:disabled { opacity: 0.4; cursor: default; }

  /* Champs secondaires quand QR résolu */
  .field-secondary { opacity: 0.4; pointer-events: none; }

  /* ── Succès QR ── */
  .join-qr-success {
    display: flex;
    align-items: center;
    gap: 12px;
    background: rgba(16, 185, 129, 0.08);
    border: 1.5px solid rgba(16, 185, 129, 0.3);
    border-radius: 12px;
    padding: 0.875rem 1rem;
  }
  .join-qr-check { font-size: 1.4rem; flex-shrink: 0; }
  .join-qr-info  { flex: 1; min-width: 0; }
  .join-qr-label { font-size: 0.7rem; font-weight: 700; text-transform: uppercase; letter-spacing: 0.06em; color: var(--c-txt-m); }
  .join-qr-name  { font-size: 1rem; font-weight: 700; color: var(--c-txt); white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
  .join-qr-rescan {
    flex-shrink: 0;
    background: none;
    border: 1px solid var(--c-border, #d1d5db);
    border-radius: 8px;
    padding: 4px 10px;
    font-size: 0.78rem;
    font-weight: 600;
    color: var(--c-txt-m);
    cursor: pointer;
  }
</style>
