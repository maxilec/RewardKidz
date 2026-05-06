<script lang="ts">
  import { goto }    from '$app/navigation';
  import { page }    from '$app/stores';
  import { applyPasswordReset, translateAuthError } from '$lib/firebase/auth';
  import EyeIcon from '$lib/components/icons/EyeIcon.svelte';

  const mode    = $page.url.searchParams.get('mode') ?? '';
  const oobCode = $page.url.searchParams.get('oobCode') ?? '';

  let newPwd     = $state('');
  let confirmPwd = $state('');
  let showPwd    = $state(false);
  let loading    = $state(false);
  let error      = $state('');
  let done       = $state(false);

  const validMode = mode === 'resetPassword' && oobCode !== '';

  async function handleSubmit(e: SubmitEvent) {
    e.preventDefault();
    error = '';
    if (newPwd.length < 6) { error = 'Le mot de passe doit faire au moins 6 caractères.'; return; }
    if (newPwd !== confirmPwd) { error = 'Les deux mots de passe ne correspondent pas.'; return; }
    loading = true;
    try {
      await applyPasswordReset(oobCode, newPwd);
      done = true;
    } catch (e) {
      error = translateAuthError(e);
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
      <span class="ob-illus-emoji" style="font-size:76px">{done ? '✅' : '🔑'}</span>
    </div>

    {#if !validMode}

      <h1 class="ob-title ob-mb8">Lien invalide</h1>
      <p class="ob-subtitle ob-mb24">Ce lien est expiré, déjà utilisé, ou incorrect.</p>
      <button class="ob-btn-primary" onclick={() => goto('/parent-auth?tab=signin')}>
        Retour à la connexion
      </button>

    {:else if done}

      <h1 class="ob-title ob-mb8">Mot de passe modifié</h1>
      <p class="ob-subtitle ob-mb24">Vous pouvez maintenant vous connecter avec votre nouveau mot de passe.</p>
      <button class="ob-btn-primary" onclick={() => goto('/parent-auth?tab=signin')}>
        Se connecter
      </button>

    {:else}

      <h1 class="ob-title ob-mb8">Nouveau mot de passe</h1>
      <p class="ob-subtitle ob-mb24">Choisissez un nouveau mot de passe pour votre compte.</p>

      {#if error}
        <div class="ob-error ob-mb16">{error}</div>
      {/if}

      <form novalidate onsubmit={handleSubmit}>
        <div class="ob-form-field">
          <label class="ob-label" for="ar-new-pwd">Nouveau mot de passe</label>
          <div class="ob-input-pwd">
            <input
              class="ob-input"
              id="ar-new-pwd"
              type={showPwd ? 'text' : 'password'}
              placeholder="••••••••"
              autocomplete="new-password"
              bind:value={newPwd}
            >
            <button type="button" class="ob-pwd-toggle"
                    onclick={() => showPwd = !showPwd}
                    aria-label={showPwd ? 'Masquer' : 'Afficher'}>
              <EyeIcon closed={!showPwd} />
            </button>
          </div>
        </div>

        <div class="ob-form-field ob-mb8">
          <label class="ob-label" for="ar-confirm-pwd">Confirmer le mot de passe</label>
          <input
            class="ob-input"
            id="ar-confirm-pwd"
            type={showPwd ? 'text' : 'password'}
            placeholder="••••••••"
            autocomplete="new-password"
            bind:value={confirmPwd}
          >
        </div>

        <div class="ob-btn-stack ob-mt-a">
          <button type="submit" class="ob-btn-primary" disabled={loading}>
            {loading ? 'Modification…' : 'Enregistrer le mot de passe'}
          </button>
        </div>
      </form>

    {/if}

  </div>
</div>

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
