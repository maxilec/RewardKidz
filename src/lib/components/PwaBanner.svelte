<script lang="ts">
  import { pwaPrompt } from '$lib/stores';

  let visible = $state(false);
  let timer: ReturnType<typeof setTimeout> | null = null;

  $effect(() => {
    if ($pwaPrompt) {
      timer = setTimeout(() => { visible = true; }, 3000);
    } else {
      visible = false;
      if (timer) { clearTimeout(timer); timer = null; }
    }
  });

  async function install() {
    const prompt = $pwaPrompt;
    if (!prompt) return;
    prompt.prompt();
    const { outcome } = await prompt.userChoice;
    if (outcome === 'accepted') pwaPrompt.set(null);
    visible = false;
  }
</script>

{#if visible}
  <div class="pwa-banner" role="banner">
    <span class="pwa-banner-text">📲 Installer RewardKidz sur cet appareil</span>
    <button class="pwa-banner-btn" onclick={install}>Installer</button>
    <button class="pwa-banner-close" aria-label="Fermer" onclick={() => { visible = false; }}>✕</button>
  </div>
{/if}

<style>
  .pwa-banner {
    position: fixed;
    bottom: 80px;
    left: 50%;
    transform: translateX(-50%);
    width: calc(100% - 32px);
    max-width: 398px;
    background: var(--c-surface);
    border: 1.5px solid #EDE9FE;
    border-radius: 16px;
    box-shadow: 0 8px 24px rgba(124, 58, 237, 0.15);
    display: flex;
    align-items: center;
    gap: 10px;
    padding: 12px 14px;
    z-index: 200;
    animation: slide-up 0.3s cubic-bezier(0.16, 1, 0.3, 1);
  }
  @keyframes slide-up {
    from { opacity: 0; transform: translateX(-50%) translateY(20px); }
    to   { opacity: 1; transform: translateX(-50%) translateY(0); }
  }
  .pwa-banner-text {
    flex: 1;
    font-size: 13px;
    font-weight: 600;
    color: var(--c-txt-h);
  }
  .pwa-banner-btn {
    background: linear-gradient(135deg, var(--c-primary), var(--c-primary-end));
    color: #fff;
    border: none;
    border-radius: 20px;
    padding: 6px 14px;
    font-size: 13px;
    font-weight: 700;
    cursor: pointer;
    white-space: nowrap;
  }
  .pwa-banner-close {
    background: transparent;
    border: none;
    color: var(--c-txt-m);
    font-size: 14px;
    cursor: pointer;
    padding: 4px;
    line-height: 1;
  }
</style>
