<script lang="ts">
  import { goto } from '$app/navigation';
  import { page } from '$app/stores';
  import { loginWithGoogle, loginWithEmail, registerWithEmail, translateAuthError } from '$lib/firebase';
  import { resolveInvite, joinFamilyAsAuthenticated } from '$lib/firebase';
  import { pendingJoin, authReady, authUser, userDoc } from '$lib/stores';
  import { auth } from '$lib/firebase/auth';
  import { getUser } from '$lib/firebase';

  // ── Tab state ──────────────────────────────────────────────
  type Tab = 'signin' | 'register' | 'join';
  const _urlTab = $page.url.searchParams.get('tab');
  let activeTab = $state<Tab>(
    _urlTab === 'register' ? 'register' : _urlTab === 'join' ? 'join' : 'signin'
  );

  // ── Error messages per panel ───────────────────────────────
  let errorSignin   = $state('');
  let errorRegister = $state('');
  let errorJoin     = $state('');

  // ── Loading flags ──────────────────────────────────────────
  let loadingSignin   = $state(false);
  let loadingRegister = $state(false);
  let loadingJoin     = $state(false);

  // ── Form fields — Sign in ──────────────────────────────────
  let signinEmail    = $state('');
  let signinPassword = $state('');

  // ── Form fields — Register ─────────────────────────────────
  let registerEmail           = $state('');
  let registerPassword        = $state('');
  let registerPasswordConfirm = $state('');
  let registerNickname        = $state('');

  // ── Form fields — Join ─────────────────────────────────────
  let joinInviteCode = $state('');
  let joinNickname   = $state('');
  let joinEmail      = $state('');
  let joinPassword   = $state('');

  // ── Redirect once authenticated ────────────────────────────
  $effect(() => {
    if (!$authReady) return;
    if (!$authUser || $authUser.isAnonymous) return;

    // Déjà membre d'une famille → toujours rediriger
    if ($userDoc?.familyId) {
      goto($userDoc.role === 'parent' ? '/parent' : '/child');
      return;
    }

    // Pas encore de famille : si on est sur l'onglet "Rejoindre", laisser
    // le flow du handler gérer la navigation (pour éviter la course async)
    if (activeTab !== 'join') {
      goto('/onboarding');
    }
  });

  // ── Back to landing ────────────────────────────────────────
  async function goBack() {
    const user = auth.currentUser;
    if (user) {
      const { logout } = await import('$lib/firebase');
      await logout();
    }
    goto('/');
  }

  // ── Sign in with Google ────────────────────────────────────
  async function handleLoginGoogle() {
    errorSignin = '';
    loadingSignin = true;
    try {
      await loginWithGoogle();
      // onAuthStateChanged in root layout handles routing
    } catch (e) {
      errorSignin = translateAuthError(e);
    } finally {
      loadingSignin = false;
    }
  }

  // ── Sign in with email ─────────────────────────────────────
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

  // ── Register with Google ───────────────────────────────────
  async function handleRegisterGoogle() {
    errorRegister = '';
    loadingRegister = true;
    try {
      await loginWithGoogle();
    } catch (e) {
      errorRegister = translateAuthError(e);
    } finally {
      loadingRegister = false;
    }
  }

  // ── Register with email ────────────────────────────────────
  async function handleRegister(e: SubmitEvent) {
    e.preventDefault();
    errorRegister = '';
    if (!registerEmail.trim()) { errorRegister = 'Saisis ton adresse email.'; return; }
    if (!registerPassword)     { errorRegister = 'Saisis un mot de passe.'; return; }
    if (registerPassword !== registerPasswordConfirm) {
      errorRegister = 'Les mots de passe ne correspondent pas.';
      return;
    }
    loadingRegister = true;
    try {
      await registerWithEmail(
        registerEmail.trim(),
        registerPassword,
        registerNickname.trim() || undefined
      );
      // onAuthStateChanged → no family → routes to /onboarding
    } catch (err) {
      errorRegister = translateAuthError(err);
    } finally {
      loadingRegister = false;
    }
  }

  // ── Join with Google ───────────────────────────────────────
  async function handleJoinGoogle() {
    errorJoin = '';
    const code = joinInviteCode.trim().toUpperCase();
    const name = joinNickname.trim();
    if (!code) { errorJoin = "Entre le code d'invitation."; return; }
    pendingJoin.set({ code, name });
    loadingJoin = true;
    try {
      await loginWithGoogle();
      // After login, root layout auth listener will see pendingJoin and handle it
      // Actually pendingJoin is consumed by the auth listener in auth.store — but in SvelteKit
      // we handle it here directly after the Google popup resolves.
      const user = auth.currentUser;
      if (user) {
        const pj = { code, name };
        pendingJoin.set(null);
        const familyId = await resolveInvite(pj.code);
        await joinFamilyAsAuthenticated(user, familyId, pj.name || user.displayName || 'Membre');
        // Rafraîchir userDoc pour que le guard de layout voie le familyId
        const fresh = await getUser(user.uid);
        userDoc.set(fresh);
        goto('/parent');
      }
    } catch (err) {
      pendingJoin.set(null);
      errorJoin = (err as { message?: string }).message || translateAuthError(err);
    } finally {
      loadingJoin = false;
    }
  }

  // ── Join with email/password ───────────────────────────────
  async function handleJoin(e: SubmitEvent) {
    e.preventDefault();
    errorJoin = '';
    const code = joinInviteCode.trim().toUpperCase();
    const name = joinNickname.trim();
    const email = joinEmail.trim();
    const pass  = joinPassword;
    if (!code)  { errorJoin = "Entre le code d'invitation."; return; }
    if (!email) { errorJoin = 'Saisis ton adresse email.'; return; }
    if (!pass)  { errorJoin = 'Saisis un mot de passe.'; return; }

    loadingJoin = true;
    try {
      const user = await registerWithEmail(email, pass, name || undefined);
      const familyId = await resolveInvite(code);
      await joinFamilyAsAuthenticated(user, familyId, name || user.displayName || 'Membre');
      const fresh = await getUser(user.uid);
      userDoc.set(fresh);
      goto('/parent');
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
        class:active={activeTab === 'register'}
        role="tab"
        aria-selected={activeTab === 'register'}
        aria-controls="panel-register"
        onclick={() => { activeTab = 'register'; errorRegister = ''; }}
      >Créer un compte</button>
      <button
        class="ob-tab"
        class:active={activeTab === 'join'}
        role="tab"
        aria-selected={activeTab === 'join'}
        aria-controls="panel-join"
        onclick={() => { activeTab = 'join'; errorJoin = ''; }}
      >Rejoindre</button>
    </div>

    <!-- Panel: S'identifier -->
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
          <input class="ob-input" id="signinPassword" type="password"
                 placeholder="••••••••" required autocomplete="current-password"
                 bind:value={signinPassword}>
        </div>
        <button type="submit" class="ob-btn-primary" disabled={loadingSignin}>
          {loadingSignin ? 'Connexion…' : 'Se connecter'}
        </button>
      </form>

    </div><!-- /#panel-signin -->

    <!-- Panel: Créer un compte -->
    <div id="panel-register" class="ob-panel" class:hidden={activeTab !== 'register'} role="tabpanel">

      <p class="ob-hint ob-mb16">Créez votre compte parent pour démarrer une nouvelle famille.</p>

      {#if errorRegister}
        <div class="ob-error ob-mb12">{errorRegister}</div>
      {/if}

      <button class="ob-btn-google ob-mb16" onclick={handleRegisterGoogle} disabled={loadingRegister}>
        <svg width="20" height="20" viewBox="0 0 48 48" aria-hidden="true">
          <path fill="#EA4335" d="M24 9.5c3.5 0 6.4 1.2 8.7 3.1l6.5-6.5C35.4 2.5 30.1 0 24 0 14.7 0 6.7 5.5 2.9 13.5l7.6 5.9C12.4 13.3 17.8 9.5 24 9.5z"/>
          <path fill="#4285F4" d="M46.5 24.5c0-1.6-.1-3.2-.4-4.7H24v9h12.7c-.6 3-2.3 5.5-4.8 7.2l7.4 5.7c4.3-4 6.8-9.9 6.8-17.2h.4z"/>
          <path fill="#FBBC05" d="M10.5 28.6A14.8 14.8 0 0 1 9.5 24c0-1.6.3-3.1.7-4.6l-7.6-5.9A24 24 0 0 0 0 24c0 3.9.9 7.6 2.6 10.8l7.9-6.2z"/>
          <path fill="#34A853" d="M24 48c6.1 0 11.3-2 15-5.4l-7.4-5.7c-2 1.4-4.6 2.2-7.6 2.2-6.2 0-11.5-4.2-13.4-9.8l-7.9 6.2C6.7 42.5 14.7 48 24 48z"/>
        </svg>
        Continuer avec Google
      </button>

      <div class="ob-sep">ou par email</div>

      <form novalidate onsubmit={handleRegister}>
        <div class="ob-form-field">
          <label class="ob-label" for="registerEmail">Email</label>
          <input class="ob-input" id="registerEmail" type="email"
                 placeholder="votre@email.com" required autocomplete="email"
                 bind:value={registerEmail}>
        </div>
        <div class="ob-form-field">
          <label class="ob-label" for="registerPassword">Mot de passe</label>
          <input class="ob-input" id="registerPassword" type="password"
                 placeholder="6 caractères minimum" required autocomplete="new-password"
                 bind:value={registerPassword}>
        </div>
        <div class="ob-form-field">
          <label class="ob-label" for="registerPasswordConfirm">Confirmer le mot de passe</label>
          <input class="ob-input" id="registerPasswordConfirm" type="password"
                 placeholder="Répète ton mot de passe" required autocomplete="new-password"
                 bind:value={registerPasswordConfirm}>
        </div>
        <div class="ob-form-field ob-mb8">
          <label class="ob-label" for="registerNickname">
            Comment vous appelle-t-on ?
            <span style="font-weight:400;color:var(--c-txt-m)">(optionnel)</span>
          </label>
          <input class="ob-input" id="registerNickname" type="text"
                 placeholder="Papa, Maman, Alex…" autocomplete="given-name"
                 bind:value={registerNickname}>
        </div>
        <button type="submit" class="ob-btn-primary" disabled={loadingRegister}>
          {loadingRegister ? 'Création…' : 'Créer mon compte'}
        </button>
      </form>

    </div><!-- /#panel-register -->

    <!-- Panel: Rejoindre -->
    <div id="panel-join" class="ob-panel" class:hidden={activeTab !== 'join'} role="tabpanel">

      <p class="ob-hint ob-mb16">Un parent vous a transmis un code d'invitation à 6 caractères.</p>

      {#if errorJoin}
        <div class="ob-error ob-mb12">{errorJoin}</div>
      {/if}

      <div class="ob-form-field">
        <label class="ob-label" for="joinInviteCode">Code d'invitation</label>
        <input class="ob-input ob-code-input" id="joinInviteCode" type="text"
               maxlength="6" placeholder="AB4F9Z"
               autocomplete="off" style="text-transform:uppercase;letter-spacing:6px"
               bind:value={joinInviteCode}>
      </div>

      <div class="ob-form-field ob-mb16">
        <label class="ob-label" for="joinNickname">Comment souhaitez-vous être appelé ?</label>
        <input class="ob-input" id="joinNickname" type="text"
               placeholder="Papa, Maman, Marc…" autocomplete="given-name"
               bind:value={joinNickname}>
      </div>

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

      <form novalidate onsubmit={handleJoin}>
        <div class="ob-form-field">
          <label class="ob-label" for="joinEmail">Email</label>
          <input class="ob-input" id="joinEmail" type="email"
                 placeholder="votre@email.com" required autocomplete="email"
                 bind:value={joinEmail}>
        </div>
        <div class="ob-form-field ob-mb8">
          <label class="ob-label" for="joinPassword">Mot de passe</label>
          <input class="ob-input" id="joinPassword" type="password"
                 placeholder="6 caractères minimum" required autocomplete="new-password"
                 bind:value={joinPassword}>
        </div>
        <button type="submit" class="ob-btn-primary" disabled={loadingJoin}>
          {loadingJoin ? 'Connexion…' : 'Créer un compte et rejoindre'}
        </button>
      </form>

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
</style>
