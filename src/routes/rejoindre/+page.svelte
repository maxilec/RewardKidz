<script lang="ts">
  import { onMount } from 'svelte';
  import { goto }    from '$app/navigation';
  import { page }    from '$app/stores';
  import { authUser, authReady, userDoc } from '$lib/stores';
  import {
    resolveInviteLink,
    connectChildDeviceViaToken,
    joinFamilyAsAuthenticated
  } from '$lib/firebase';
  import {
    loginAsChild,
    loginWithEmail,
    registerWithEmail,
    loginWithGoogle,
    translateAuthError
  } from '$lib/firebase/auth';
  import { auth } from '$lib/firebase/auth';
  import type { InviteLink } from '$lib/firebase/types';

  // ── État principal ──────────────────────────────────────────
  type Step = 'loading' | 'invalid' | 'expired' | 'child' | 'parent' | 'joining';
  let step  = $state<Step>('loading');
  let link  = $state<InviteLink | null>(null);
  let error = $state('');

  let token = $derived($page.url.searchParams.get('token') ?? '');

  // ── Flux enfant ─────────────────────────────────────────────
  let childLoading = $state(false);

  async function connectChild() {
    if (!link || link.type !== 'child') return;
    childLoading = true;
    error = '';
    try {
      let user = auth.currentUser;
      if (!user || !user.isAnonymous) {
        user = await loginAsChild();
      }
      await connectChildDeviceViaToken(user, token);
      goto('/child');
    } catch (e: any) {
      error = e.message || 'Erreur de connexion.';
    } finally {
      childLoading = false;
    }
  }

  // ── Flux parent ─────────────────────────────────────────────
  type AuthMode = 'choose' | 'signin' | 'register';
  let authMode    = $state<AuthMode>('choose');
  let email       = $state('');
  let password    = $state('');
  let nickname    = $state('');
  let authLoading = $state(false);

  async function joinAsParent() {
    const user = auth.currentUser;
    if (!user || user.isAnonymous) { error = 'Connexion requise'; return; }
    step = 'joining';
    error = '';
    try {
      await joinFamilyAsAuthenticated(user, link!.familyId, nickname || undefined);
      goto('/parent');
    } catch (e: any) {
      error = e.message || 'Erreur lors de la jonction.';
      step = 'parent';
    }
  }

  async function handleSignin() {
    if (!email || !password) { error = 'Email et mot de passe requis.'; return; }
    authLoading = true;
    error = '';
    try {
      await loginWithEmail(email, password);
      await joinAsParent();
    } catch (e: any) {
      error = translateAuthError(e);
    } finally {
      authLoading = false;
    }
  }

  async function handleRegister() {
    if (!email || !password) { error = 'Email et mot de passe requis.'; return; }
    authLoading = true;
    error = '';
    try {
      await registerWithEmail(email, password, nickname || undefined);
      await joinAsParent();
    } catch (e: any) {
      error = translateAuthError(e);
    } finally {
      authLoading = false;
    }
  }

  async function handleGoogle() {
    authLoading = true;
    error = '';
    try {
      await loginWithGoogle();
      await joinAsParent();
    } catch (e: any) {
      error = translateAuthError(e);
    } finally {
      authLoading = false;
    }
  }

  // ── Résolution du token au montage ──────────────────────────
  onMount(async () => {
    if (!token) { step = 'invalid'; return; }
    try {
      const resolved = await resolveInviteLink(token);
      if (!resolved) { step = 'expired'; return; }
      link = resolved;
      step = resolved.type === 'child' ? 'child' : 'parent';
    } catch {
      step = 'invalid';
    }
  });

  // ── Auto-join si parent déjà authentifié sans famille ───────
  $effect(() => {
    if (!$authReady || !link || link.type !== 'parent' || step !== 'parent') return;
    const user = $authUser;
    if (!user || user.isAnonymous) return;
    if ($userDoc?.familyId) {
      goto($userDoc.role === 'parent' ? '/parent' : '/child');
      return;
    }
    joinAsParent();
  });
</script>

<div class="page rejoindre">

  <div class="ob-blobs" aria-hidden="true">
    <div class="ob-blob ob-blob-1"></div>
    <div class="ob-blob ob-blob-2"></div>
  </div>

  <div class="ob-content ob-content--pad-top">

    <!-- ── Chargement ── -->
    {#if step === 'loading'}
      <div class="ob-illus ob-mb16" style="height:80px">
        <span class="ob-illus-emoji" style="font-size:64px">⏳</span>
      </div>
      <h1 class="ob-title ob-mb8">Vérification du lien…</h1>

    <!-- ── Lien invalide ── -->
    {:else if step === 'invalid'}
      <div class="ob-illus ob-mb16" style="height:80px">
        <span class="ob-illus-emoji" style="font-size:64px">❌</span>
      </div>
      <h1 class="ob-title ob-mb8">Lien invalide</h1>
      <p class="ob-subtitle ob-mb24">Ce lien d'invitation n'existe pas. Demande un nouveau QR code.</p>
      <button class="ob-btn-primary" onclick={() => goto('/')}>Retour à l'accueil</button>

    <!-- ── Lien expiré ── -->
    {:else if step === 'expired'}
      <div class="ob-illus ob-mb16" style="height:80px">
        <span class="ob-illus-emoji" style="font-size:64px">⌛</span>
      </div>
      <h1 class="ob-title ob-mb8">Lien expiré</h1>
      <p class="ob-subtitle ob-mb24">Ce QR code n'est plus valide. Demande au parent de générer un nouveau code.</p>
      <button class="ob-btn-primary" onclick={() => goto('/')}>Retour à l'accueil</button>

    <!-- ── Connexion enfant ── -->
    {:else if step === 'child' && link}
      <div class="ob-illus ob-mb16" style="height:90px">
        <span class="ob-illus-emoji" style="font-size:76px">🧒</span>
      </div>
      <h1 class="ob-title ob-mb8">Bonjour {link.displayName} !</h1>
      <p class="ob-subtitle ob-mb8">Famille <strong>{link.familyName}</strong></p>
      <p class="ob-subtitle ob-mb24" style="font-size:0.85rem;opacity:0.7">
        Ce lien est valable 2 heures. Il connectera cet appareil à ton compte.
      </p>

      {#if error}
        <div class="ob-error ob-mb16">{error}</div>
      {/if}

      <div class="ob-warn-box ob-mb24">
        ⚠️ Une fois connecté(e), cet appareil sera lié à ton compte. Si tu changes d'appareil, demande un nouveau code à ton parent.
      </div>

      <div class="ob-btn-stack ob-mt-a">
        <button class="ob-btn-primary" onclick={connectChild} disabled={childLoading}>
          {childLoading ? 'Connexion…' : 'Connecter cet appareil'}
        </button>
        <button class="ob-btn-secondary" onclick={() => goto('/')}>Annuler</button>
      </div>

    <!-- ── Rejoindre famille (parent) ── -->
    {:else if step === 'parent' && link}
      <div class="ob-illus ob-mb16" style="height:90px">
        <span class="ob-illus-emoji" style="font-size:76px">👨‍👩‍👧</span>
      </div>
      <h1 class="ob-title ob-mb8">Rejoindre la famille</h1>
      <p class="ob-subtitle ob-mb24">
        Vous êtes invité(e) à rejoindre la famille <strong>{link.familyName}</strong>.
      </p>

      {#if error}
        <div class="ob-error ob-mb16">{error}</div>
      {/if}

      <!-- Choix du mode d'auth -->
      {#if authMode === 'choose'}
        <div class="ob-btn-stack">
          <button class="ob-btn-primary" onclick={() => authMode = 'register'}>
            Créer un compte
          </button>
          <button class="ob-btn-secondary" onclick={() => authMode = 'signin'}>
            J'ai déjà un compte
          </button>
          <div class="ob-divider">ou</div>
          <button class="ob-btn-google" onclick={handleGoogle} disabled={authLoading}>
            {authLoading ? '…' : 'Continuer avec Google'}
          </button>
        </div>

      <!-- Connexion email -->
      {:else if authMode === 'signin'}
        <div class="ob-form-field">
          <label class="ob-label" for="joinEmail">Email</label>
          <input class="ob-input" id="joinEmail" type="email" bind:value={email} autocomplete="email" />
        </div>
        <div class="ob-form-field ob-mb8">
          <label class="ob-label" for="joinPassword">Mot de passe</label>
          <input class="ob-input" id="joinPassword" type="password" bind:value={password} autocomplete="current-password" />
        </div>
        <div class="ob-btn-stack">
          <button class="ob-btn-primary" onclick={handleSignin} disabled={authLoading}>
            {authLoading ? 'Connexion…' : 'Se connecter et rejoindre'}
          </button>
          <button class="ob-btn-secondary" onclick={() => { authMode = 'choose'; error = ''; }}>
            ← Retour
          </button>
        </div>

      <!-- Inscription email -->
      {:else if authMode === 'register'}
        <div class="ob-form-field">
          <label class="ob-label" for="regNickname">Votre prénom (affiché dans la famille)</label>
          <input class="ob-input" id="regNickname" type="text" bind:value={nickname} autocomplete="nickname" placeholder="Ex : Sophie" />
        </div>
        <div class="ob-form-field">
          <label class="ob-label" for="regEmail">Email</label>
          <input class="ob-input" id="regEmail" type="email" bind:value={email} autocomplete="email" />
        </div>
        <div class="ob-form-field ob-mb8">
          <label class="ob-label" for="regPassword">Mot de passe</label>
          <input class="ob-input" id="regPassword" type="password" bind:value={password} autocomplete="new-password" />
        </div>
        <div class="ob-btn-stack">
          <button class="ob-btn-primary" onclick={handleRegister} disabled={authLoading}>
            {authLoading ? 'Création…' : 'Créer un compte et rejoindre'}
          </button>
          <button class="ob-btn-secondary" onclick={() => { authMode = 'choose'; error = ''; }}>
            ← Retour
          </button>
        </div>
      {/if}

    <!-- ── Jonction en cours ── -->
    {:else if step === 'joining'}
      <div class="ob-illus ob-mb16" style="height:80px">
        <span class="ob-illus-emoji" style="font-size:64px">⏳</span>
      </div>
      <h1 class="ob-title ob-mb8">Connexion à la famille…</h1>
    {/if}

  </div><!-- /.ob-content -->

</div><!-- /.page.rejoindre -->

<style>
  .ob-error {
    background: rgba(239, 68, 68, 0.1);
    border: 1px solid rgba(239, 68, 68, 0.3);
    color: #dc2626;
    border-radius: 8px;
    padding: 0.625rem 0.875rem;
    font-size: 0.875rem;
  }
  .ob-divider {
    text-align: center;
    color: var(--c-txt-m);
    font-size: 0.85rem;
    margin: 0.25rem 0;
  }
  .ob-btn-google {
    width: 100%;
    padding: 0.875rem;
    border-radius: 12px;
    border: 1.5px solid var(--c-border);
    background: #fff;
    color: var(--c-txt);
    font-size: 1rem;
    font-weight: 600;
    cursor: pointer;
    transition: background 0.15s;
  }
  .ob-btn-google:hover:not(:disabled) { background: var(--c-bg-alt); }
  .ob-btn-google:disabled { opacity: 0.6; cursor: default; }
</style>
