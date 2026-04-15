<script lang="ts">
  import type { Snippet } from 'svelte';

  interface Props {
    open:   boolean;
    title?: string;
    onClose: () => void;
    children: Snippet;
  }

  let { open, title, onClose, children }: Props = $props();

  // Fermer sur Escape
  function onKeydown(e: KeyboardEvent) {
    if (e.key === 'Escape' && open) onClose();
  }
</script>

<svelte:window onkeydown={onKeydown} />

<!-- Overlay -->
<div
  class="app-modal-overlay"
  class:on={open}
  role="presentation"
  onclick={onClose}
></div>

<!-- Bottom-sheet -->
<div class="app-modal" class:open role="dialog" aria-modal="true" aria-label={title}>
  <button class="app-modal-close" aria-label="Fermer" onclick={onClose}>✕</button>

  {#if title}
    <p class="app-modal-title">{title}</p>
    <div class="app-modal-divider"></div>
  {/if}

  {@render children()}
</div>
