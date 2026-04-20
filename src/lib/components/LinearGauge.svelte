<script lang="ts">
  import type { ScoreDoc } from '$lib/firebase/types';

  interface Props {
    score: ScoreDoc;
    memberId?: string;         // si fourni → affiche boutons +/-
    onAdd?:    () => void;
    onRemove?: () => void;
  }

  let { score, memberId, onAdd, onRemove }: Props = $props();

  const pct = $derived((score.points / 5 * 100).toFixed(1));
  const canAdd    = $derived(!score.validated && !score.ignored && score.points < 5);
  const canRemove = $derived(!score.validated && !score.ignored && score.points > 0);
  const showBtns  = $derived(!!memberId && !score.validated && !score.ignored);
</script>

<div class="score-gauge-row">
  <div class="score-gauge-track">
    <div class="score-gauge-fill" style="width:{pct}%"></div>
  </div>
  <span class="score-points-label">{score.points}/5</span>

  {#if showBtns}
    <div class="child-quick-btns">
      <button
        class="child-quick-remove"
        disabled={!canRemove}
        aria-label="Retirer un point"
        onclick={onRemove}
      >−</button>
      <button
        class="child-quick-add"
        disabled={!canAdd}
        aria-label="Ajouter un point"
        onclick={onAdd}
      >+</button>
    </div>
  {/if}
</div>
