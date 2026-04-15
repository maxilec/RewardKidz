<script lang="ts">
  import type { ScoreDoc } from '$lib/firebase/types';
  import LinearGauge from './LinearGauge.svelte';

  interface Props {
    score:    ScoreDoc;
    memberId: string;
    onAdd?:        () => void;
    onRemove?:     () => void;
    onValidate?:   () => void;
    onUnvalidate?: () => void;
    onIgnore?:     () => void;
    onUnignore?:   () => void;
  }

  let {
    score, memberId,
    onAdd, onRemove, onValidate, onUnvalidate, onIgnore, onUnignore
  }: Props = $props();

  // Confirmation inline pour Valider
  let confirming = $state(false);

  function handleValidateClick() {
    confirming = true;
  }
  function handleConfirmYes() {
    confirming = false;
    onValidate?.();
  }
  function handleConfirmNo() {
    confirming = false;
  }
</script>

<div class="score-section">
  <LinearGauge {score} {memberId} {onAdd} {onRemove} />

  <div class="score-controls">
    {#if score.validated}
      <span class="score-status-badge validated">✓ Journée validée</span>
      <button class="score-btn unvalidate" onclick={onUnvalidate}>↩ Annuler</button>

    {:else if score.ignored}
      <span class="score-status-badge ignored">Journée ignorée</span>
      <button class="score-btn unignore" onclick={onUnignore}>↩ Rétablir</button>

    {:else if confirming}
      <div class="score-confirm-wrap">
        <button class="score-confirm-yes" onclick={handleConfirmYes} aria-label="Confirmer">✓</button>
        <button class="score-confirm-no"  onclick={handleConfirmNo}  aria-label="Annuler">✗</button>
      </div>

    {:else}
      <button class="score-btn ignore"   onclick={onIgnore}>Ignorer</button>
      <button class="score-btn validate" onclick={handleValidateClick}>✓ Valider</button>
    {/if}
  </div>
</div>
