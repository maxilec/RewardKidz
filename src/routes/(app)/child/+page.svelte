<script lang="ts">
  import { onMount, onDestroy } from 'svelte';
  import { authUser, userDoc } from '$lib/stores';
  import { familyDoc } from '$lib/stores';
  import { subscribeToScore } from '$lib/firebase';
  import { sendConfigToSW, initNotifications } from '$lib/firebase/notifications';
  import { logout } from '$lib/firebase';
  import type { ScoreDoc } from '$lib/firebase/types';
  import CircularGauge from '$lib/components/CircularGauge.svelte';

  // ── Données depuis les stores ─────────────────────────────
  let familyId    = $derived($userDoc?.familyId   ?? '');
  let memberId    = $derived($userDoc?.memberId    ?? '');
  let displayName = $derived($userDoc?.displayName ?? '');
  let familyName  = $derived($familyDoc?.name ?? '');

  // ── Score realtime ────────────────────────────────────────
  let score = $state<ScoreDoc | null>(null);
  let unsub: (() => void) | null = null;

  // ── Drawer enfant ─────────────────────────────────────────
  let drawerOpen = $state(false);

  // ── Lifecycle ────────────────────────────────────────────
  onMount(() => {
    if (!familyId || !memberId) return;
    unsub = subscribeToScore(familyId, memberId, s => { score = s; });
    sendConfigToSW();
    initNotifications(familyId, memberId);
  });

  onDestroy(() => { unsub?.(); });

  $effect(() => {
    const fid = familyId;
    const mid = memberId;
    if (!fid || !mid) return;
    unsub?.();
    unsub = subscribeToScore(fid, mid, s => { score = s; });
  });
</script>

<!-- Overlay drawer -->
{#if drawerOpen}
  <div
    class="app-overlay on"
    role="presentation"
    onclick={() => (drawerOpen = false)}
  ></div>
{/if}

<!-- Drawer enfant (simplifié — déconnexion uniquement) -->
<div class="app-drawer" class:open={drawerOpen} role="navigation" aria-label="Menu enfant">
  <div class="app-drawer-head">
    <span class="app-drawer-emoji">🧒</span>
    <div class="app-drawer-title">{displayName || 'Mon espace'}</div>
    <div class="app-drawer-sub">Espace enfant</div>
  </div>

  <div class="app-drawer-body"></div>

  <div class="app-drawer-danger-zone">
    <div
      class="app-drawer-item danger"
      role="button"
      tabindex="0"
      onclick={() => { drawerOpen = false; logout(); }}
      onkeydown={(e) => e.key === 'Enter' && (drawerOpen = false, logout())}
    >
      <span class="app-drawer-item-icon">🚪</span>Se déconnecter
    </div>
  </div>

  <div class="app-drawer-foot">
    <div class="app-drawer-version">RewardKidz v2.0</div>
  </div>
</div>

<!-- Page enfant -->
<div class="page-dashboard">

  <!-- Header gradient — même visuel que le dashboard parent -->
  <header class="app-header">
    <button class="app-burger app-burger--header" onclick={() => (drawerOpen = true)} aria-label="Menu">☰</button>
    <div class="app-header-info">
      <div class="app-header-title">{displayName}</div>
      <div class="app-header-sub">Espace enfant</div>
    </div>
    <span class="app-header-emoji">🧒</span>
  </header>

  <!-- Corps -->
  <main class="app-body" style="display:flex;flex-direction:column;align-items:center;padding-top:24px">

    <!-- Carte score -->
    <div class="app-score-card" style="width:100%">
      {#if score}
        <CircularGauge points={score.points} />

        {#if score.validated}
          <div class="child-score-badge validated">✓ Journée validée</div>
        {:else if score.ignored}
          <div class="child-score-badge ignored">Non comptabilisée</div>
        {/if}
      {:else}
        <div class="app-spinner" style="margin:32px auto"></div>
      {/if}
    </div>

    <!-- Message d'encouragement -->
    {#if score}
      <p style="margin-top:20px;font-size:14px;color:var(--c-txt-m);text-align:center;padding:0 16px">
        {#if score.validated}
          🎉 Bravo ! Ta journée est validée.
        {:else if score.ignored}
          Journée non comptabilisée aujourd'hui.
        {:else if score.points >= 5}
          🌟 Score maximum ! Tu peux encore être validé par un parent.
        {:else if score.points >= 3}
          👍 Bien ! Continue comme ça.
        {:else if score.points > 0}
          💪 C'est un bon début, continue !
        {:else}
          Aucun point pour l'instant aujourd'hui.
        {/if}
      </p>
    {/if}

  </main>

  <!-- Barre basse — même visuel que le dashboard parent -->
  <div class="app-bottom-bar">
    <span class="app-bottom-hint">
      <strong>{displayName}</strong> · Famille {familyName}
    </span>
    <button class="app-burger" onclick={() => (drawerOpen = true)} aria-label="Menu">☰</button>
  </div>

</div>
