<script lang="ts">
  /**
   * Page de jonction famille pour un parent déjà authentifié.
   * Accessible via /join-family?code=XXXXXX ou directement depuis
   * l'onboarding quand un pendingJoin est en attente.
   *
   * Flux : parent déjà connecté (Google/email) → saisit le code d'invitation
   * → resolveInvite + joinFamilyAsAuthenticated → redirect /parent
   */
  import { goto } from '$app/navigation';
  import { page } from '$app/stores';
  import { authUser, userDoc, pendingJoin } from '$lib/stores';
  import { resolveInvite, joinFamilyAsAuthenticated } from '$lib/firebase';

  // Pré-remplir le code depuis l'URL ou le store pendingJoin
  let inviteCode  = $state($page.url.searchParams.get('code') ?? $pendingJoin?.code ?? '');
  let displayName = $state($userDoc?.displayName ?? $authUser?.displayName ?? '');
  let loading     = $state(false);
  let error       = $state('');

  // Si un pendingJoin est déjà complet, tenter automatiquement
  $effect(() => {
    const pj = $pendingJoin;
    if (pj?.code && pj?.name && $authUser && !$authUser.isAnonymous && !loading) {
      handleJoin(pj.code, pj.name);
    }
  });

  async function handleJoin(code = inviteCode.trim().toUpperCase(), name = displayName.trim()) {
    error   = '';
    loading = true;
    try {
      const familyId = await resolveInvite(code);
      await joinFamilyAsAuthenticated($authUser!, familyId, name || 'Membre');
      pendingJoin.set(null);
      goto('/parent');
    } catch (e: any) {
      error = e.message ?? 'Impossible de rejoindre la famille.';
    } finally {
      loading = false;
    }
  }

  function submit() {
    if (!inviteCode.trim()) { error = 'Entrez le code d\'invitation.'; return; }
    if (!displayName.trim()) { error = 'Entrez votre prénom.'; return; }
    handleJoin();
  }
</script>

<div class="ob-page">
  <div class="ob-blobs" aria-hidden="true">
    <div class="ob-blob ob-blob-1"></div>
    <div class="ob-blob ob-blob-2"></div>
  </div>

  <button class="ob-btn-back" onclick={() => goto('/onboarding')} aria-label="Retour">←</button>

  <div class="ob-content ob-content--pad-top">
    <div class="ob-illus ob-mb20" style="height:80px">
      <span class="ob-illus-emoji" style="font-size:64px">🏠</span>
    </div>

    <h1 class="ob-title ob-mb8">Rejoindre une famille</h1>
    <p class="ob-subtitle ob-mb24">
      Entrez le code d'invitation reçu d'un co-parent.
    </p>

    <div class="ob-form-field">
      <label class="ob-label" for="joinCode">Code d'invitation</label>
      <input
        id="joinCode"
        class="ob-input ob-code-input"
        type="text"
        placeholder="XXXXXXXX"
        maxlength="8"
        autocomplete="off"
        bind:value={inviteCode}
        oninput={(e) => { inviteCode = (e.currentTarget as HTMLInputElement).value.toUpperCase(); }}
      />
    </div>

    <div class="ob-form-field">
      <label class="ob-label" for="joinName">Votre prénom</label>
      <input
        id="joinName"
        class="ob-input"
        type="text"
        placeholder="Ex : Marie"
        bind:value={displayName}
      />
    </div>

    {#if error}
      <p class="ob-hint" style="color:var(--c-error);margin-bottom:12px">{error}</p>
    {/if}

    <button class="ob-btn-primary" onclick={submit} disabled={loading}>
      {loading ? 'Connexion…' : 'Rejoindre la famille'}
    </button>
  </div>
</div>
