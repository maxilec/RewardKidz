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

  // Réinitialise l'erreur locale quand le parent efface son erreur
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
    <input
      class="ob-input"
      id="rf-password"
      type="password"
      placeholder="6 caractères minimum"
      required
      autocomplete="new-password"
      bind:value={password}
    >
  </div>
  <div class="ob-form-field ob-mb8">
    <label class="ob-label" for="rf-confirm">Confirmer le mot de passe</label>
    <input
      class="ob-input"
      id="rf-confirm"
      type="password"
      placeholder="Répète ton mot de passe"
      required
      autocomplete="new-password"
      bind:value={confirmPassword}
    >
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
