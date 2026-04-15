<script lang="ts">
  import { onMount, onDestroy } from 'svelte';
  import { goto } from '$app/navigation';
  import { page } from '$app/stores';
  import { authUser, userDoc } from '$lib/stores';
  import { familyDoc, members, children as childMembers } from '$lib/stores';
  import { drawerOpen } from '$lib/stores';
  import {
    getOrCreateDayScore, addPoint, removePoint,
    setScoreValidated, setDayIgnored, subscribeToScore,
    updateChildName, deleteChild,
    getActiveChildOTP, generateChildOTP,
    getFamily, getChildHistory
  } from '$lib/firebase';
  import type { ScoreDoc, HistoryEntry } from '$lib/firebase/types';
  import ScoreControls from '$lib/components/ScoreControls.svelte';
  import Histogram     from '$lib/components/Histogram.svelte';
  import AppDrawer     from '$lib/components/AppDrawer.svelte';
  import AppModal      from '$lib/components/AppModal.svelte';

  // ── Paramètre URL ────────────────────────────────────────
  let memberId   = $derived($page.params.memberId);
  let familyId   = $derived($userDoc?.familyId ?? '');
  let familyName = $derived($familyDoc?.name ?? '');
  let familyCode = $derived($familyDoc?.familyCode ?? '—');
  let byUid      = $derived($authUser?.uid ?? '');
  let byName     = $derived($userDoc?.displayName ?? $authUser?.displayName ?? 'Parent');

  // Données de l'enfant depuis le store members
  let childMember = $derived($members.find(m => m.memberId === memberId));
  let displayName = $derived(childMember?.displayName ?? '');

  // ── Score ────────────────────────────────────────────────
  let score = $state<ScoreDoc | null>(null);
  let unsub: (() => void) | null = null;

  async function loadScore() {
    if (!familyId || !memberId) return;
    score = await getOrCreateDayScore(familyId, memberId);
    unsub?.();
    unsub = subscribeToScore(familyId, memberId, s => { score = s; });
  }

  // ── Historique ───────────────────────────────────────────
  let histDays      = $state<7 | 30>(7);
  let histEntries   = $state<HistoryEntry[]>([]);
  let hist30Cache   = $state<HistoryEntry[] | null>(null);
  let histLoading   = $state(false);

  // Stats dérivées
  let avg7 = $derived(() => {
    const validated = histEntries.slice(-7).filter(d => !d.missing && d.validated);
    return validated.length > 0
      ? (validated.reduce((s, d) => s + d.points, 0) / validated.length).toFixed(1) + ' / 5'
      : '—';
  });
  let trend30 = $derived(() => {
    const real = histEntries.filter(d => !d.missing && !d.ignored);
    if (real.length < 4) return '—';
    const half   = Math.floor(real.length / 2);
    const avg1st = real.slice(0, half).reduce((s, d) => s + d.points, 0) / half;
    const avg2nd = real.slice(half).reduce((s, d) => s + d.points, 0) / (real.length - half);
    const delta  = avg2nd - avg1st;
    return delta > 0.3 ? '↑ Hausse' : delta < -0.3 ? '↓ Baisse' : '→ Stable';
  });

  async function loadHistory(days: 7 | 30) {
    if (!familyId || !memberId || !score) return;
    histLoading = true;
    histDays    = days;
    try {
      if (days === 7) {
        histEntries = await getChildHistory(familyId, memberId, 7, score);
      } else {
        if (!hist30Cache) hist30Cache = await getChildHistory(familyId, memberId, 30, score);
        histEntries = hist30Cache!;
      }
    } finally { histLoading = false; }
  }

  // ── OTP modal ────────────────────────────────────────────
  let otpModalOpen  = $state(false);
  let otpCode       = $state('');
  let otpGenerating = $state(false);

  async function openOtpModal() {
    otpModalOpen = true;
    try {
      const existing = await getActiveChildOTP(familyId, memberId);
      if (existing) otpCode = existing;
    } catch { otpCode = ''; }
  }
  async function generateOtp() {
    otpGenerating = true;
    otpCode = '…';
    try {
      otpCode = await generateChildOTP(familyId, memberId, displayName);
    } catch (e: any) {
      otpCode = '';
      console.error(e);
    } finally { otpGenerating = false; }
  }

  // ── Renommer l'enfant ────────────────────────────────────
  let editingChildName  = $state(false);
  let editedChildName   = $state('');

  function startRename() {
    editedChildName  = displayName;
    editingChildName = true;
  }
  async function saveChildName() {
    const name = editedChildName.trim();
    if (!name || name === displayName) { editingChildName = false; return; }
    try {
      await updateChildName(familyId, memberId, name);
      editingChildName = false;
    } catch (e: any) { console.error(e); }
  }

  // ── Supprimer l'enfant ───────────────────────────────────
  async function handleDelete() {
    if (!confirm(`Supprimer ${displayName} ? Cette action est irréversible.`)) return;
    try {
      await deleteChild(familyId, memberId);
      goto('/parent');
    } catch (e: any) { alert('Erreur : ' + e.message); }
  }

  // ── Actions score ────────────────────────────────────────
  async function add()        { try { await addPoint(familyId, memberId, byUid, byName); } catch (e: any) { console.error(e); } }
  async function remove()     { try { await removePoint(familyId, memberId, byUid, byName); } catch (e: any) { console.error(e); } }
  async function validate()   { try { await setScoreValidated(familyId, memberId, true, byUid, byName); } catch (e: any) { console.error(e); } }
  async function unvalidate() { try { await setScoreValidated(familyId, memberId, false, byUid, byName); } catch (e: any) { console.error(e); } }
  async function doIgnore()   { try { await setDayIgnored(familyId, memberId, true, byUid, byName); } catch (e: any) { console.error(e); } }
  async function unignore()   { try { await setDayIgnored(familyId, memberId, false, byUid, byName); } catch (e: any) { console.error(e); } }

  // ── Lifecycle ────────────────────────────────────────────
  onMount(async () => {
    await loadScore();
    await loadHistory(7);
  });

  onDestroy(() => { unsub?.(); });

  // Recharger si memberId change (navigation drawer)
  $effect(() => {
    const id = memberId;
    if (id && familyId) {
      loadScore();
      hist30Cache = null;
      loadHistory(7);
    }
  });

  // Charger l'historique après que score soit disponible
  $effect(() => {
    if (score && histEntries.length === 0 && familyId && memberId) {
      loadHistory(histDays);
    }
  });
</script>

<!-- Drawer -->
<AppDrawer
  open={$drawerOpen}
  {familyId}
  {familyName}
  {familyCode}
  childMembers={$childMembers}
  currentMemberId={memberId}
  isDashboard={false}
  onClose={() => drawerOpen.set(false)}
  onNavigate={(id) => goto(`/parent/${id}`)}
  onDashboard={() => goto('/parent')}
/>

<!-- Modale OTP -->
<AppModal open={otpModalOpen} title="Code de connexion" onClose={() => otpModalOpen = false}>
  {#snippet children()}
    <p class="app-hint">
      Code famille : <strong>{familyCode}</strong><br>
      Donnez ce code + le code OTP à {displayName} pour connecter son appareil.
    </p>
    {#if otpCode && otpCode !== '…'}
      <div class="otp-code-block">
        <div class="code-value">Code famille&nbsp;: <strong>{familyCode}</strong></div>
        <div class="otp-value">{otpCode}</div>
        <div class="otp-expiry">⏱ Valable 10 minutes</div>
      </div>
    {/if}
    <button class="app-btn-prim full" onclick={generateOtp} disabled={otpGenerating}>
      {otpCode ? '🔄 Nouveau code' : '🔑 Générer un code'}
    </button>
  {/snippet}
</AppModal>

<!-- Page détail enfant -->
<div class="page-dashboard">

  <!-- Header -->
  <header class="detail-header">
    <button class="detail-back" onclick={() => goto('/parent')} aria-label="Retour">←</button>

    {#if editingChildName}
      <form style="flex:1;display:flex;gap:8px" onsubmit={(e) => { e.preventDefault(); saveChildName(); }}>
        <input
          class="ob-input"
          style="flex:1;height:40px"
          type="text"
          bind:value={editedChildName}
          onkeydown={(e) => e.key === 'Escape' && (editingChildName = false)}
        />
        <button type="submit" class="app-btn-prim sm">✓</button>
      </form>
    {:else}
      <h1>
        🧒
        <button
          class="detail-name-clickable"
          style="background:none;border:none;cursor:pointer;font:inherit;color:inherit;padding:0"
          onclick={startRename}
          title="Cliquer pour renommer"
        >{displayName}</button>
      </h1>
      <span class="child-status {childMember?.linkedAuthUid ? 'connected' : 'pending'}">
        {childMember?.linkedAuthUid ? 'Connecté' : 'En attente'}
      </span>
    {/if}

    <button class="app-burger app-burger--header" style="background:transparent;box-shadow:none;color:var(--c-primary)" onclick={() => drawerOpen.set(true)} aria-label="Menu">☰</button>
  </header>

  <!-- Corps scrollable -->
  <div class="s-detail-body">

    <!-- Score du jour -->
    <div class="detail-card">
      <h2>Score du jour</h2>
      {#if score}
        <ScoreControls
          {score}
          {memberId}
          onAdd={add}
          onRemove={remove}
          onValidate={validate}
          onUnvalidate={unvalidate}
          onIgnore={doIgnore}
          {onUnignore}
        />
      {:else}
        <p class="app-hint">Chargement…</p>
      {/if}
    </div>

    <!-- Statistiques -->
    <div class="detail-card">
      <h2>Statistiques</h2>
      <div class="stats-row">
        <div class="stat-box">
          <span class="stat-label">Moy. 7j validés</span>
          <span class="stat-value">{avg7()}</span>
        </div>
        <div class="stat-box">
          <span class="stat-label">Tendance 30j</span>
          <span class="stat-value" style="font-size:16px">{trend30()}</span>
        </div>
      </div>
    </div>

    <!-- Historique -->
    <div class="detail-card">
      <div style="display:flex;align-items:center;justify-content:space-between;margin-bottom:12px">
        <h2 style="margin:0">Historique</h2>
        <div class="app-hist-toggle">
          <button
            class="hist-tab"
            class:active={histDays === 7}
            onclick={() => loadHistory(7)}
          >7 jours</button>
          <button
            class="hist-tab"
            class:active={histDays === 30}
            onclick={() => loadHistory(30)}
          >30 jours</button>
        </div>
      </div>

      {#if histLoading}
        <p class="app-hint">Chargement…</p>
      {:else if histEntries.length > 0}
        <Histogram entries={histEntries} compact={histDays === 30} />
      {:else}
        <p class="app-hint">Aucune donnée pour cette période.</p>
      {/if}
    </div>

    <!-- Gestion -->
    <div class="detail-card">
      <h2>Gestion</h2>
      <div class="detail-actions-row">
        <button class="icon-btn" onclick={openOtpModal}>🔑 Code connexion</button>
        <button class="icon-btn" onclick={startRename}>✏️ Renommer</button>
        <button class="icon-btn danger" onclick={handleDelete}>🗑 Supprimer</button>
      </div>
    </div>

  </div>
</div>
