<script lang="ts">
  import { goto } from '$app/navigation';
  import { pendingOnboarding } from '$lib/stores';

  let familyName = $state('');
  let error      = $state('');

  function handleCreate() {
    error = '';
    const name = familyName.trim();
    if (!name) { error = 'Le nom de la famille est requis.'; return; }
    pendingOnboarding.set({ action: 'create', familyName: name });
    goto('/parent-setup');
  }
</script>

<div class="ob-page">

  <div class="ob-blobs" aria-hidden="true">
    <div class="ob-blob ob-blob-1"></div>
    <div class="ob-blob ob-blob-2"></div>
  </div>

  <button class="ob-btn-back" aria-label="Retour" onclick={() => goto('/onboarding')}>←</button>

  <div class="ob-content ob-content--pad-top">

    <div style="margin-bottom:20px">
      <span class="ob-logo">Reward<em>Kidz</em></span>
    </div>

    <div class="ob-illus ob-mb16" style="height:90px">
      <span class="ob-illus-emoji" style="font-size:76px">👨‍👩‍👧</span>
    </div>

    <h1 class="ob-title ob-mb8">Créer ma famille</h1>
    <p class="ob-subtitle ob-mb24">Donnez un nom à votre espace familial.</p>

    {#if error}
      <div class="ob-error ob-mb16">{error}</div>
    {/if}

    <div class="ob-form-field ob-mb8">
      <label class="ob-label" for="familyName">Nom de la famille</label>
      <input
        class="ob-input"
        id="familyName"
        type="text"
        placeholder="Les Dupont, Ma Super Famille…"
        maxlength="40"
        autocomplete="off"
        bind:value={familyName}
      >
    </div>

    <div class="ob-btn-stack ob-mt-a">
      <button class="ob-btn-primary" onclick={handleCreate}>
        Créer ma famille
      </button>
    </div>

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
