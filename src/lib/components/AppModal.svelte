<script lang="ts">
  import type { Snippet } from 'svelte';

  interface Props {
    open:      boolean;
    title?:    string;
    shareUrl?: string;
    onClose:   () => void;
    children:  Snippet;
  }

  let { open, title, shareUrl, onClose, children }: Props = $props();

  let copied = $state(false);
  let copyTimer: ReturnType<typeof setTimeout> | null = null;

  async function handleShare() {
    if (!shareUrl) return;
    if (navigator.share) {
      try {
        await navigator.share({ url: shareUrl, title: 'RewardKidz — invitation' });
        return;
      } catch { /* annulé par l'utilisateur */ }
    }
    // Fallback : copier dans le presse-papier
    try {
      await navigator.clipboard.writeText(shareUrl);
      copied = true;
      if (copyTimer) clearTimeout(copyTimer);
      copyTimer = setTimeout(() => { copied = false; }, 2000);
    } catch { /* silencieux */ }
  }

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
  {#if shareUrl}
    <button
      class="app-modal-share"
      class:copied
      aria-label="Partager le lien"
      onclick={handleShare}
      title={copied ? 'Lien copié !' : 'Partager le lien'}
    >
      {#if copied}
        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round">
          <polyline points="20 6 9 17 4 12"/>
        </svg>
      {:else}
        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
          <path d="M4 12v8a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2v-8"/>
          <polyline points="16 6 12 2 8 6"/>
          <line x1="12" y1="2" x2="12" y2="15"/>
        </svg>
      {/if}
    </button>
  {/if}

  <button class="app-modal-close" aria-label="Fermer" onclick={onClose}>✕</button>

  {#if title}
    <p class="app-modal-title">{title}</p>
    <div class="app-modal-divider"></div>
  {/if}

  {@render children()}
</div>

<style>
  .app-modal-share {
    position: absolute; top: 16px; right: 56px;
    width: 32px; height: 32px; border-radius: 50%;
    background: #F3F0FF; border: none; cursor: pointer;
    color: var(--c-primary); font-size: 14px;
    display: flex; align-items: center; justify-content: center;
    transition: background .12s, color .12s;
  }
  .app-modal-share:hover  { background: #EDE9FE; }
  .app-modal-share:active { transform: scale(.93); }
  .app-modal-share.copied { background: #D1FAE5; color: #059669; }
</style>
