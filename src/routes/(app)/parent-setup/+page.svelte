<script lang="ts">
  import { onMount }  from 'svelte';
  import { goto }     from '$app/navigation';
  import { authUser, userDoc, pendingOnboarding } from '$lib/stores';
  import { createFamily, joinFamilyAsAuthenticated, updateParentProfile, getUser, logout, deleteInviteLink } from '$lib/firebase';
  import { auth } from '$lib/firebase/auth';

  const pending        = $pendingOnboarding;
  const legacyFamilyId = $userDoc?.familyId ?? null;

  // Pré-remplir depuis le displayName Firebase Auth (Google le renseigne automatiquement)
  let firstName     = $state($authUser?.displayName ?? $userDoc?.displayName ?? '');
  let displayedName = $state('');
  let loading       = $state(false);
  let cancelling    = $state(false);
  let error         = $state('');

  onMount(() => {
    if (!pending && !legacyFamilyId) goto('/');
  });

  async function handleSubmit(e: SubmitEvent) {
    e.preventDefault();
    error = '';
    const fn = firstName.trim();
    const dn = displayedName.trim();
    if (!fn) { error = 'Votre prénom est requis.'; return; }
    if (!dn) { error = 'Votre titre pour les enfants est requis.'; return; }
    const user = $authUser;
    if (!user) { goto('/'); return; }
    loading = true;
    try {
      let familyId: string;
      if (pending?.action === 'create') {
        familyId = await createFamily(user, pending.familyName);
      } else if (pending?.action === 'join') {
        await joinFamilyAsAuthenticated(user, pending.familyId);
        familyId = pending.familyId;
      } else if (pending?.action === 'token') {
        await joinFamilyAsAuthenticated(user, pending.familyId);
        familyId = pending.familyId;
        try { await deleteInviteLink(pending.token); } catch { /* best-effort */ }
      } else {
        familyId = legacyFamilyId!;
      }
      await updateParentProfile(user.uid, familyId, fn, dn);
      const fresh = await getUser(user.uid);
      userDoc.set(fresh);
      pendingOnboarding.clear();
      goto('/parent');
    } catch (e: any) {
      error = e.message || 'Erreur lors de la sauvegarde.';
    } finally {
      loading = false;
    }
  }

  async function handleCancel() {
    if (!confirm("Annuler l'inscription ? Votre compte sera supprimé.")) return;
    cancelling = true;
    error = '';
    try {
      const user = auth.currentUser;
      if (user) {
        try {
          await user.delete();
        } catch {
          await logout();
        }
      }
      pendingOnboarding.clear();
      goto('/');
    } catch (e: any) {
      error = e.message || "Erreur lors de l'annulation.";
      cancelling = false;
    }
  }
</script>

<div class="ob-page">

  <div class="ob-blobs" aria-hidden="true">
    <div class="ob-blob ob-blob-1"></div>
    <div class="ob-blob ob-blob-2"></div>
  </div>

  <div class="ob-content ob-content--pad-top">

    <div style="margin-bottom:20px">
      <span class="ob-logo">Reward<em>Kidz</em></span>
    </div>

    <div class="ob-illus ob-mb16" style="height:90px">
      <span class="ob-illus-emoji" style="font-size:76px">👤</span>
    </div>

    <h1 class="ob-title ob-mb8">Votre profil parent</h1>
    <p class="ob-subtitle ob-mb24">Avant de commencer, personnalisez comment l'application vous connaît.</p>

    {#if error}
      <div class="ob-error ob-mb16">{error}</div>
    {/if}

    <form novalidate onsubmit={handleSubmit}>
      <div class="ob-form-field">
        <label class="ob-label" for="firstName">
          Votre prénom
          <span style="font-weight:400;color:var(--c-txt-m)"> — ex : Sophie, Marc…</span>
        </label>
        <input
          class="ob-input"
          id="firstName"
          type="text"
          placeholder="Sophie, Marc, Léa…"
          autocomplete="given-name"
          bind:value={firstName}
        >
      </div>

      <div class="ob-form-field ob-mb8">
        <label class="ob-label" for="displayedName">
          Votre titre pour les enfants
          <span style="font-weight:400;color:var(--c-txt-m)"> — ex : Papa, Maman, Mamie…</span>
        </label>
        <input
          class="ob-input"
          id="displayedName"
          type="text"
          placeholder="Papa, Maman, Mamie…"
          autocomplete="off"
          bind:value={displayedName}
        >
      </div>

      <div class="ob-btn-stack ob-mt-a">
        <button type="submit" class="ob-btn-primary" disabled={loading || cancelling}>
          {loading ? 'Enregistrement…' : 'Continuer →'}
        </button>
        {#if pending}
          <button
            type="button"
            class="ob-btn-secondary"
            onclick={handleCancel}
            disabled={loading || cancelling}
          >
            {cancelling ? 'Annulation…' : 'Annuler'}
          </button>
        {/if}
      </div>
    </form>

  </div><!-- /.ob-content -->

</div><!-- /.ob-page -->

<style>
  .ob-page {
    position: relative;
    overflow: hidden;
    min-height: 100dvh;
    min-height: 100svh;
    display: flex;
    flex-direction: column;
    background: var(--c-bg);
  }

  .ob-error {
    background: rgba(239, 68, 68, 0.1);
    border: 1px solid rgba(239, 68, 68, 0.3);
    color: #dc2626;
    border-radius: 8px;
    padding: 0.625rem 0.875rem;
    font-size: 0.875rem;
  }
</style>
