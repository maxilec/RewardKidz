<script lang="ts">
  interface Props {
    /** Erreur API transmise par le parent (tentative précédente) */
    error?: string;
    loading?: boolean;
    submitLabel?: string;
    onSubmit: (email: string, password: string) => void;
  }

  let {
    error      = '',
    loading    = false,
    submitLabel = 'Créer un compte',
    onSubmit
  }: Props = $props();

  let email           = $state('');
  let password        = $state('');
  let confirmPassword = $state('');
  let localError      = $state('');
  let showPwd         = $state(false);
  let showConfirm     = $state(false);

  function handleSubmit(e: SubmitEvent) {
    e.preventDefault();
    localError = '';
    if (!email.trim())  { localError = 'Saisis ton adresse email.'; return; }
    if (!password)      { localError = 'Saisis un mot de passe.'; return; }
    if (password !== confirmPassword) {
      localError = 'Les mots de passe ne correspondent pas.';
      return;
    }
    onSubmit(email.trim(), password);
  }

  $effect(() => { if (!error) localError = ''; });
</script>

{#if localError}
  <div class="ob-error ob-mb12">{localError}</div>
{/if}

<form novalidate onsubmit={handleSubmit}>
  <div class="ob-form-field">
    <label class="ob-label" for="rf-email">Email</label>
    <input
      class="ob-input"
      id="rf-email"
      type="email"
      placeholder="votre@email.com"
      required
      autocomplete="email"
      bind:value={email}
    >
  </div>

  <div class="ob-form-field">
    <label class="ob-label" for="rf-password">Mot de passe</label>
    <div class="ob-input-pwd">
      <input
        class="ob-input"
        id="rf-password"
        type={showPwd ? 'text' : 'password'}
        placeholder="6 caractères minimum"
        required
        autocomplete="new-password"
        bind:value={password}
      >
      <button type="button" class="ob-pwd-toggle" onclick={() => showPwd = !showPwd} aria-label={showPwd ? 'Masquer' : 'Afficher'}>
        {#if showPwd}
          <svg xmlns="http://www.w3.org/2000/svg" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M17.94 17.94A10.07 10.07 0 0 1 12 20c-7 0-11-8-11-8a18.45 18.45 0 0 1 5.06-5.94"/><path d="M9.9 4.24A9.12 9.12 0 0 1 12 4c7 0 11 8 11 8a18.5 18.5 0 0 1-2.16 3.19m-6.72-1.07a3 3 0 1 1-4.24-4.24"/><line x1="1" y1="1" x2="23" y2="23"/></svg>
        {:else}
          <svg xmlns="http://www.w3.org/2000/svg" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z"/><circle cx="12" cy="12" r="3"/></svg>
        {/if}
      </button>
    </div>
  </div>

  <div class="ob-form-field ob-mb8">
    <label class="ob-label" for="rf-confirm">Confirmer le mot de passe</label>
    <div class="ob-input-pwd">
      <input
        class="ob-input"
        id="rf-confirm"
        type={showConfirm ? 'text' : 'password'}
        placeholder="Répète ton mot de passe"
        required
        autocomplete="new-password"
        bind:value={confirmPassword}
      >
      <button type="button" class="ob-pwd-toggle" onclick={() => showConfirm = !showConfirm} aria-label={showConfirm ? 'Masquer' : 'Afficher'}>
        {#if showConfirm}
          <svg xmlns="http://www.w3.org/2000/svg" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M17.94 17.94A10.07 10.07 0 0 1 12 20c-7 0-11-8-11-8a18.45 18.45 0 0 1 5.06-5.94"/><path d="M9.9 4.24A9.12 9.12 0 0 1 12 4c7 0 11 8 11 8a18.5 18.5 0 0 1-2.16 3.19m-6.72-1.07a3 3 0 1 1-4.24-4.24"/><line x1="1" y1="1" x2="23" y2="23"/></svg>
        {:else}
          <svg xmlns="http://www.w3.org/2000/svg" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z"/><circle cx="12" cy="12" r="3"/></svg>
        {/if}
      </button>
    </div>
  </div>

  <button type="submit" class="ob-btn-primary" disabled={loading}>
    {loading ? 'Création…' : submitLabel}
  </button>
</form>

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
