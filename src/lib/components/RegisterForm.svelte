<script lang="ts">
  import EyeIcon from '$lib/components/icons/EyeIcon.svelte';

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
        <EyeIcon closed={!showPwd} />
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
        <EyeIcon closed={!showConfirm} />
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
