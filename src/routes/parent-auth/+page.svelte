<script lang="ts">
  import { goto } from '$app/navigation';
  import { page } from '$app/stores';
  import {
    loginWithGoogle, loginWithEmail, registerWithEmail, translateAuthError,
    resolveInvite, resolveByFamilyCode, getUser, logout
  } from '$lib/firebase';
  import { pendingOnboarding, authReady, authUser, userDoc } from '$lib/stores';
  import { auth } from '$lib/firebase/auth';
  import RegisterForm from '$lib/components/RegisterForm.svelte';

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

  async function handleJoinGoogle() {
    errorJoin = '';
    const famCode = joinFamilyCode.trim().toUpperCase();
    const code    = joinInviteCode.trim();
    if (!famCode) { errorJoin = 'Entre le code famille.'; return; }
    if (!code)    { errorJoin = "Entre le code d'invitation."; return; }
    loadingJoin = true;
    try {
      await loginWithGoogle();
      const user = auth.currentUser;
      if (user) {
        const existing = await getUser(user.uid);
        if (existing?.familyId) {
          await logout();
          errorJoin = ERR_ALREADY_IN_FAMILY;
          return;
        }
        const [fid1, fid2] = await Promise.all([resolveInvite(code), resolveByFamilyCode(famCode)]);
        if (fid1 !== fid2) throw new Error("Le code d'invitation et le code famille ne correspondent pas.");
        pendingOnboarding.set({ action: 'join', familyId: fid1 });
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
    const famCode = joinFamilyCode.trim().toUpperCase();
    const code    = joinInviteCode.trim();
    if (!famCode) { errorJoin = 'Entre le code famille.'; return; }
    if (!code)    { errorJoin = "Entre le code d'invitation."; return; }
    loadingJoin = true;
    try {
      await registerWithEmail(email, password);
      const [fid1, fid2] = await Promise.all([resolveInvite(code), resolveByFamilyCode(famCode)]);
      if (fid1 !== fid2) throw new Error("Le code d'invitation et le code famille ne correspondent pas.");
      pendingOnboarding.set({ action: 'join', familyId: fid1 });
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
        <svg width="20" height="20" viewBox="0 0 48 48" aria-hidden="true">
          <path fill="#EA4335" d="M24 9.5c3.5 0 6.4 1.2 8.7 3.1l6.5-6.5C35.4 2.5 30.1 0 24 0 14.7 0 6.7 5.5 2.9 13.5l7.6 5.9C12.4 13.3 17.8 9.5 24 9.5z"/>
          <path fill="#4285F4" d="M46.5 24.5c0-1.6-.1-3.2-.4-4.7H24v9h12.7c-.6 3-2.3 5.5-4.8 7.2l7.4 5.7c4.3-4 6.8-9.9 6.8-17.2h.4z"/>
          <path fill="#FBBC05" d="M10.5 28.6A14.8 14.8 0 0 1 9.5 24c0-1.6.3-3.1.7-4.6l-7.6-5.9A24 24 0 0 0 0 24c0 3.9.9 7.6 2.6 10.8l7.9-6.2z"/>
          <path fill="#34A853" d="M24 48c6.1 0 11.3-2 15-5.4l-7.4-5.7c-2 1.4-4.6 2.2-7.6 2.2-6.2 0-11.5-4.2-13.4-9.8l-7.9 6.2C6.7 42.5 14.7 48 24 48z"/>
        </svg>
        Continuer avec Google
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
              {#if showSigninPwd}
                <svg xmlns="http://www.w3.org/2000/svg" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z"/><circle cx="12" cy="12" r="3"/></svg>
              {:else}
                <svg xmlns="http://www.w3.org/2000/svg" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M17.94 17.94A10.07 10.07 0 0 1 12 20c-7 0-11-8-11-8a18.45 18.45 0 0 1 5.06-5.94"/><path d="M9.9 4.24A9.12 9.12 0 0 1 12 4c7 0 11 8 11 8a18.5 18.5 0 0 1-2.16 3.19m-6.72-1.07a3 3 0 1 1-4.24-4.24"/><line x1="1" y1="1" x2="23" y2="23"/></svg>
              {/if}
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
        <svg width="20" height="20" viewBox="0 0 48 48" aria-hidden="true">
          <path fill="#EA4335" d="M24 9.5c3.5 0 6.4 1.2 8.7 3.1l6.5-6.5C35.4 2.5 30.1 0 24 0 14.7 0 6.7 5.5 2.9 13.5l7.6 5.9C12.4 13.3 17.8 9.5 24 9.5z"/>
          <path fill="#4285F4" d="M46.5 24.5c0-1.6-.1-3.2-.4-4.7H24v9h12.7c-.6 3-2.3 5.5-4.8 7.2l7.4 5.7c4.3-4 6.8-9.9 6.8-17.2h.4z"/>
          <path fill="#FBBC05" d="M10.5 28.6A14.8 14.8 0 0 1 9.5 24c0-1.6.3-3.1.7-4.6l-7.6-5.9A24 24 0 0 0 0 24c0 3.9.9 7.6 2.6 10.8l7.9-6.2z"/>
          <path fill="#34A853" d="M24 48c6.1 0 11.3-2 15-5.4l-7.4-5.7c-2 1.4-4.6 2.2-7.6 2.2-6.2 0-11.5-4.2-13.4-9.8l-7.9 6.2C6.7 42.5 14.7 48 24 48z"/>
        </svg>
        Continuer avec Google
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
        <p class="ob-card-title">Codes d'accès</p>
        <div class="ob-form-field">
          <label class="ob-label" for="joinFamilyCode">
            Code famille
            <span style="font-weight:400;color:var(--c-txt-m)">(8 caractères)</span>
          </label>
          <input class="ob-input ob-code-input" id="joinFamilyCode" type="text"
                 maxlength="8" placeholder="ABCD1234"
                 autocomplete="off" style="text-transform:uppercase;letter-spacing:5px"
                 bind:value={joinFamilyCode}>
        </div>
        <div class="ob-form-field ob-mb0">
          <label class="ob-label" for="joinInviteCode">
            Code d'invitation
            <span style="font-weight:400;color:var(--c-txt-m)">(6 chiffres — valable 15 min)</span>
          </label>
          <input class="ob-input ob-code-input otp-input" id="joinInviteCode"
                 type="tel" inputmode="numeric"
                 maxlength="6" placeholder="••••••"
                 autocomplete="one-time-code" style="letter-spacing:8px"
                 bind:value={joinInviteCode}>
        </div>
      </div>

      <div class="ob-card-auth-title ob-mb12">Créer votre compte</div>

      <button class="ob-btn-google ob-mb16" onclick={handleJoinGoogle} disabled={loadingJoin}>
        <svg width="20" height="20" viewBox="0 0 48 48" aria-hidden="true">
          <path fill="#EA4335" d="M24 9.5c3.5 0 6.4 1.2 8.7 3.1l6.5-6.5C35.4 2.5 30.1 0 24 0 14.7 0 6.7 5.5 2.9 13.5l7.6 5.9C12.4 13.3 17.8 9.5 24 9.5z"/>
          <path fill="#4285F4" d="M46.5 24.5c0-1.6-.1-3.2-.4-4.7H24v9h12.7c-.6 3-2.3 5.5-4.8 7.2l7.4 5.7c4.3-4 6.8-9.9 6.8-17.2h.4z"/>
          <path fill="#FBBC05" d="M10.5 28.6A14.8 14.8 0 0 1 9.5 24c0-1.6.3-3.1.7-4.6l-7.6-5.9A24 24 0 0 0 0 24c0 3.9.9 7.6 2.6 10.8l7.9-6.2z"/>
          <path fill="#34A853" d="M24 48c6.1 0 11.3-2 15-5.4l-7.4-5.7c-2 1.4-4.6 2.2-7.6 2.2-6.2 0-11.5-4.2-13.4-9.8l-7.9 6.2C6.7 42.5 14.7 48 24 48z"/>
        </svg>
        Continuer avec Google
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
</style>
