<script lang="ts">
  import { onMount } from 'svelte';
  import { goto }    from '$app/navigation';
  import { page }    from '$app/stores';
  import { authUser, authReady, userDoc, pendingOnboarding } from '$lib/stores';
  import {
    resolveInviteLink,
    connectChildDeviceViaToken,
    getUser,
    logout
  } from '$lib/firebase';
  import {
    loginAsChild,
    registerWithEmail,
    loginWithGoogle,
    translateAuthError
  } from '$lib/firebase/auth';
  import { auth } from '$lib/firebase/auth';
  import type { InviteLink } from '$lib/firebase/types';
  import RegisterForm from '$lib/components/RegisterForm.svelte';
  import GoogleIcon   from '$lib/components/icons/GoogleIcon.svelte';

  // ── État principal ──────────────────────────────────────────
  type Step = 'loading' | 'invalid' | 'expired' | 'child' | 'parent';
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
  let authLoading = $state(false);

  function proceedToSetup() {
    pendingOnboarding.set({ action: 'token', familyId: link!.familyId, token });
    goto('/parent-setup');
  }

  async function handleRegister(regEmail: string, regPassword: string) {
    authLoading = true;
    error = '';
    try {
      await registerWithEmail(regEmail, regPassword);
      proceedToSetup();
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
      const user = auth.currentUser;
      if (!user) return;
      const existing = await getUser(user.uid);
      if (existing?.familyId) {
        await logout();
        error = 'Vous êtes déjà associé(e) à une famille. Vous ne pouvez pas en rejoindre une nouvelle.';
        return;
      }
      proceedToSetup();
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

  // ── Auto-proceed si parent déjà authentifié sans famille ───────
  $effect(() => {
    if (!$authReady || !link || link.type !== 'parent' || step !== 'parent') return;
    const user = $authUser;
    if (!user || user.isAnonymous) return;
    if ($userDoc?.familyId) {
      goto($userDoc.role === 'parent' ? '/parent' : '/child');
      return;
    }
    proceedToSetup();
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
        Créez votre compte pour rejoindre la famille <strong>{link.familyName}</strong>.
      </p>

      {#if error}
        <div class="ob-error ob-mb16">{error}</div>
      {/if}

      <button class="ob-btn-google ob-mb16" onclick={handleGoogle} disabled={authLoading}>
        <GoogleIcon /> Continuer avec Google
      </button>

      <div class="ob-sep">ou par email</div>

      <RegisterForm
        {error}
        loading={authLoading}
        submitLabel="Créer un compte et rejoindre"
        onSubmit={handleRegister}
      />

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
    display: flex;
    align-items: center;
    justify-content: center;
    gap: 10px;
    transition: background 0.15s;
  }
  .ob-btn-google:hover:not(:disabled) { background: var(--c-bg-alt); }
  .ob-btn-google:disabled { opacity: 0.6; cursor: default; }
</style>
