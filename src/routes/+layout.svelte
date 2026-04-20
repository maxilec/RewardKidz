<script lang="ts">
  import '../app.css';
  import { onMount } from 'svelte';
  import { initAuthListener, initFamilyListener, userDoc } from '$lib/stores';
  import { onForegroundMessage } from '$lib/firebase/notifications';
  import { pwaPrompt } from '$lib/stores';
  import PwaBanner from '$lib/components/PwaBanner.svelte';

  let { children } = $props();

  // In-app notification banner state
  let notifTitle = $state('');
  let notifBody = $state('');
  let notifVisible = $state(false);
  let notifTimer: ReturnType<typeof setTimeout> | null = null;

  function showNotif(title: string, body: string) {
    notifTitle = title;
    notifBody = body;
    notifVisible = true;
    if (notifTimer) clearTimeout(notifTimer);
    notifTimer = setTimeout(() => { notifVisible = false; }, 5000);
  }

  // Démarre / nettoie le listener famille dès que familyId change
  $effect(() => {
    const fid = $userDoc?.familyId ?? null;
    return initFamilyListener(fid);
  });

  onMount(() => {
    const cleanupAuth = initAuthListener();

    const cleanupFCM = onForegroundMessage((payload) => {
      const n = payload.notification ?? {};
      showNotif(n.title ?? 'RewardKidz', n.body ?? '');
    });

    // Capture PWA install prompt
    const handleInstallPrompt = (e: Event) => {
      e.preventDefault();
      pwaPrompt.set(e);
    };
    window.addEventListener('beforeinstallprompt', handleInstallPrompt);
    window.addEventListener('appinstalled', () => pwaPrompt.set(null));

    return () => {
      cleanupAuth();
      cleanupFCM();
      window.removeEventListener('beforeinstallprompt', handleInstallPrompt);
    };
  });
</script>

<!-- Foreground notification banner -->
<div class="app-notif-banner" class:visible={notifVisible}>
  <div class="app-notif-content">
    <strong class="app-notif-title">{notifTitle}</strong>
    <span class="app-notif-body">{notifBody}</span>
  </div>
  <button class="app-notif-close" aria-label="Fermer" onclick={() => { notifVisible = false; }}>✕</button>
</div>

<PwaBanner />

{@render children()}

<style>
  .app-notif-banner {
    position: fixed;
    top: 0; left: 0; right: 0;
    background: linear-gradient(90deg, var(--c-primary), var(--c-primary-end));
    color: #fff;
    padding: 0.875rem 1rem;
    display: flex;
    align-items: center;
    gap: 0.75rem;
    z-index: 400;
    transform: translateY(-110%);
    transition: transform 0.3s cubic-bezier(0.16, 1, 0.3, 1);
    box-shadow: 0 3px 12px rgba(0,0,0,0.2);
  }
  .app-notif-banner.visible { transform: translateY(0); }
  .app-notif-content { flex: 1; display: flex; flex-direction: column; gap: 2px; }
  .app-notif-title  { font-size: 0.95rem; font-weight: 700; }
  .app-notif-body   { font-size: 0.85rem; opacity: 0.9; }
  .app-notif-close  {
    background: transparent; border: none; color: rgba(255,255,255,0.8);
    font-size: 1rem; cursor: pointer; padding: 0.25rem; line-height: 1;
  }
</style>
