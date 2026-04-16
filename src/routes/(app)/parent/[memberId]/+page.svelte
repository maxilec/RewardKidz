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
  let memberId   = $derived($page.params.memberId ?? '');
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
    if (!familyId || !memberId) return;
    histLoading = true;
    histDays    = days;
    try {
      if (days === 7) {
        histEntries = await getChildHistory(familyId, memberId, 7);
      } else {
        if (!hist30Cache) hist30Cache = await getChildHistory(familyId, memberId, 30);
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
  // _prevMemberId n'est pas réactif → l'effet ne se re-souscrit pas dessus.
  // onMount le fixe avant le premier load, ce qui permet à l'effet de distinguer
  // le montage initial (id === _prevMemberId → skip) d'une navigation drawer
  // (nouvel id ≠ _prevMemberId → rechargement complet).
  let _prevMemberId = '';

  onMount(async () => {
    _prevMemberId = memberId; // fige l'id initial avant que l'effet ne tourne
    await loadScore();
    await loadHistory(7);
  });

  onDestroy(() => { unsub?.(); });

  // Recharger uniquement quand memberId change (navigation drawer)
  $effect(() => {
    const id  = memberId;
    const fid = familyId;
    if (id === _prevMemberId || !id || !fid) return;
    _prevMemberId = id;
    loadScore();
    hist30Cache = null;
    loadHistory(7);
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
<AppModal open={otpModalOpen} title="🔑 Code de connexion enfant" onClose={() => otpModalOpen = false}>
  {#snippet children()}
    <p class="app-hint">Code temporaire valable 10 min — à saisir sur l'appareil de {displayName} lors de la première connexion.</p>
    {#if otpCode && otpCode !== '…'}
      <div class="app-invite-code">{otpCode}</div>
    {/if}
    <button class="app-btn-prim full" onclick={generateOtp} disabled={otpGenerating}>
      {otpCode ? '🔄 Nouveau code' : '🔑 Générer un code'}
    </button>
    <div class="app-modal-divider"></div>
    <div style="text-align:center;padding:4px 0 2px">
      <div class="app-drawer-code-label" style="margin-bottom:6px">Code famille permanent (rappel)</div>
      <div class="app-drawer-code-val" style="font-size:18px;letter-spacing:3px">{familyCode}</div>
    </div>
  {/snippet}
</AppModal>

<!-- Page détail enfant -->
<div class="page-dashboard">

  <!-- Header gradient — prénom cliquable pour renommer -->
  <header class="app-header">
    <button class="app-burger app-burger--header" onclick={() => drawerOpen.set(true)} aria-label="Menu">☰</button>

    {#if editingChildName}
      <div style="flex:1;display:flex;gap:6px;align-items:center;min-width:0;padding:0 8px">
        <input
          class="ob-input"
          style="flex:1;height:36px;font-size:15px"
          type="text"
          bind:value={editedChildName}
          onkeydown={(e) => e.key === 'Escape' && (editingChildName = false)}
        />
        <button class="app-btn-prim sm" onclick={saveChildName} aria-label="Valider">✓</button>
      </div>
    {:else}
      <div
        class="app-header-info"
        style="cursor:pointer"
        onclick={startRename}
        title="Appuyer pour renommer"
      >
        <div class="app-header-title">
          {displayName} <span style="font-size:12px;opacity:0.55">✏️</span>
        </div>
      </div>
    {/if}

    <span class="app-header-emoji">🧒</span>
  </header>

  <!-- Lien retour sous l'en-tête (comme dans la branche main) -->
  <div class="detail-back-row">
    <button class="detail-back-link" onclick={() => goto('/parent')} aria-label="Retour">← Retour</button>
  </div>

  <!-- Corps scrollable -->
  <main class="app-body">

    <!-- Score du jour -->
    <div class="app-section-hd">
      <span class="app-section-title">Score du jour</span>
    </div>
    <div class="child-score-card">
      {#if score}
        <ScoreControls
          {score}
          {memberId}
          onAdd={add}
          onRemove={remove}
          onValidate={validate}
          onUnvalidate={unvalidate}
          onIgnore={doIgnore}
          onUnignore={unignore}
        />
      {:else}
        <p class="app-hint">Chargement…</p>
      {/if}
    </div>

    <!-- Statistiques -->
    <div class="app-section-hd" style="margin-top:24px">
      <span class="app-section-title">Statistiques</span>
    </div>
    <div class="child-score-card">
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
    <div class="app-section-hd" style="margin-top:24px">
      <div style="display:flex;align-items:center;gap:8px;width:100%">
        <span class="app-section-title" style="flex:1">Historique</span>
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
    </div>
    <div class="child-score-card">
      {#if histLoading}
        <p class="app-hint">Chargement…</p>
      {:else if histEntries.length > 0}
        <Histogram entries={histEntries} compact={histDays === 30} />
      {:else}
        <p class="app-hint">Aucune donnée pour cette période.</p>
      {/if}
    </div>

    <!-- Actions -->
    <div style="margin-top:32px;display:flex;flex-direction:column;gap:10px;padding-bottom:8px">
      <button class="app-btn-outline full" onclick={openOtpModal}>🔑 Code connexion</button>
      <button class="app-btn-outline danger-outline full" onclick={handleDelete}>🗑 Supprimer cet enfant</button>
    </div>

  </main>

  <!-- Barre basse -->
  <div class="app-bottom-bar">
    <span class="app-bottom-hint">
      <strong>{displayName}</strong> · Famille {familyName}
    </span>
    <button class="app-burger" onclick={() => drawerOpen.set(true)} aria-label="Menu">☰</button>
  </div>

</div>
