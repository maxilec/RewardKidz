<script lang="ts">
  import { goto } from '$app/navigation';
  import { authUser, userDoc } from '$lib/stores';
  import { updateParentProfile } from '$lib/firebase';

  let firstName     = $state($userDoc?.displayName ?? '');
  let displayedName = $state('');
  let loading       = $state(false);
  let error         = $state('');

  async function handleSubmit(e: SubmitEvent) {
    e.preventDefault();
    error = '';
    const fn = firstName.trim();
    const dn = displayedName.trim();
    if (!fn) { error = 'Votre prénom est requis.'; return; }
    if (!dn) { error = 'Votre titre pour les enfants est requis.'; return; }
    const user = $authUser;
    const doc  = $userDoc;
    if (!user || !doc?.familyId) { error = 'Session invalide.'; return; }
    loading = true;
    try {
      await updateParentProfile(user.uid, doc.familyId, fn, dn);
      goto('/parent');
    } catch (e: any) {
      error = e.message || 'Erreur lors de la sauvegarde.';
    } finally {
      loading = false;
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
        <button type="submit" class="ob-btn-primary" disabled={loading}>
          {loading ? 'Enregistrement…' : 'Continuer →'}
        </button>
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
