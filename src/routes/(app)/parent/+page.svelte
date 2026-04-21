<script lang="ts">
  import { onMount, onDestroy } from 'svelte';
  import { goto } from '$app/navigation';
  import { authUser, userDoc } from '$lib/stores';
  import { familyDoc, members, children as childMembers } from '$lib/stores';
  import { drawerOpen } from '$lib/stores';
  import { scores, subscribeChildScore, unsubscribeAll } from '$lib/stores';
  import {
    getFamily, getFamilyMembers, getOrCreateDayScore,
    addPoint, removePoint, setScoreValidated, setDayIgnored,
    getActiveInvite, createInvite, createParentInviteLink, subscribeToScore
  } from '$lib/firebase';
  import type { ScoreDoc, MemberDoc } from '$lib/firebase/types';
  import QRCode       from 'qrcode';
  import ScoreControls from '$lib/components/ScoreControls.svelte';
  import AppDrawer    from '$lib/components/AppDrawer.svelte';
  import AppModal     from '$lib/components/AppModal.svelte';

  // ── État ────────────────────────────────────────────────
  let familyId    = $derived($userDoc?.familyId ?? '');
  let familyName  = $derived($familyDoc?.name ?? '');
  let familyCode  = $derived($familyDoc?.familyCode ?? '—');
  let byUid       = $derived($authUser?.uid ?? '');
  let byName      = $derived($userDoc?.displayName ?? $authUser?.displayName ?? 'Parent');

  let parentMembers = $derived($members.filter(m => m.role === 'parent'));

  // Scores locaux par enfant (clé = memberId)
  let localScores = $state<Record<string, ScoreDoc>>({});
  let unsubscribers = new Map<string, () => void>();

  // Invite parent
  let inviteModalOpen  = $state(false);
  let inviteCode       = $state('');
  let inviteQR         = $state('');
  let generatingInvite = $state(false);

  // ── Chargement initial des scores + abonnements realtime ─
  async function loadChildScores() {
    if (!familyId) return;
    const children = $childMembers;
    await Promise.all(children.map(async c => {
      const score = await getOrCreateDayScore(familyId, c.memberId);
      localScores = { ...localScores, [c.memberId]: score };
    }));

    // Abonnements realtime
    unsubscribers.forEach(u => u());
    unsubscribers.clear();
    children.forEach(c => {
      const unsub = subscribeToScore(familyId, c.memberId, score => {
        localScores = { ...localScores, [c.memberId]: score };
      });
      unsubscribers.set(c.memberId, unsub);
    });
  }

  onMount(() => { loadChildScores(); });
  onDestroy(() => { unsubscribers.forEach(u => u()); });

  // Recharger si la liste d'enfants change
  $effect(() => {
    const ids = $childMembers.map(c => c.memberId).join(',');
    if (ids && familyId) loadChildScores();
  });

  // ── Actions score ───────────────────────────────────────
  async function add(memberId: string) {
    try { await addPoint(familyId, memberId, byUid, byName); }
    catch (e: any) { console.error(e); }
  }
  async function remove(memberId: string) {
    try { await removePoint(familyId, memberId, byUid, byName); }
    catch (e: any) { console.error(e); }
  }
  async function validate(memberId: string) {
    try { await setScoreValidated(familyId, memberId, true, byUid, byName); }
    catch (e: any) { console.error(e); }
  }
  async function unvalidate(memberId: string) {
    try { await setScoreValidated(familyId, memberId, false, byUid, byName); }
    catch (e: any) { console.error(e); }
  }
  async function ignore(memberId: string) {
    try { await setDayIgnored(familyId, memberId, true, byUid, byName); }
    catch (e: any) { console.error(e); }
  }
  async function unignore(memberId: string) {
    try { await setDayIgnored(familyId, memberId, false, byUid, byName); }
    catch (e: any) { console.error(e); }
  }

  // ── Modale invitation parent ─────────────────────────────
  async function genQR(url: string) {
    inviteQR = url ? await QRCode.toDataURL(url, { width: 180, margin: 1, color: { dark: '#5B21B6', light: '#fff' } }) : '';
  }

  async function openInviteModal() {
    inviteModalOpen = true;
    try {
      const existing = await getActiveInvite(familyId);
      inviteCode = existing ?? '';
      if (inviteCode) {
        const token = await createParentInviteLink(familyId);
        await genQR(`${window.location.origin}/rejoindre?token=${token}`);
      } else {
        inviteQR = '';
      }
    } catch { inviteCode = ''; inviteQR = ''; }
  }
  async function generateInvite() {
    generatingInvite = true;
    try {
      const active = await getActiveInvite(familyId);
      inviteCode = active ?? await createInvite(familyId);
      const token = await createParentInviteLink(familyId);
      await genQR(`${window.location.origin}/rejoindre?token=${token}`);
    } catch (e: any) { console.error(e); }
    finally { generatingInvite = false; }
  }
</script>

<!-- Drawer -->
<AppDrawer
  open={$drawerOpen}
  {familyId}
  {familyName}
  {familyCode}
  childMembers={$childMembers}
  isDashboard={true}
  onClose={() => drawerOpen.set(false)}
  onNavigate={(memberId) => goto(`/parent/${memberId}`)}
  onChildAdded={loadChildScores}
  onDashboard={() => {}}
/>

<!-- Modale invitation parent -->
<AppModal open={inviteModalOpen} title="🔗 Inviter un co-parent" onClose={() => inviteModalOpen = false}>
  {#snippet children()}
    <p class="app-hint">Partagez ce code à un autre parent pour qu'il rejoigne votre famille.</p>
    {#if inviteCode}
      <div class="app-invite-code">{inviteCode}</div>
      {#if inviteQR}
        <img src={inviteQR} alt="QR code invitation" style="display:block;margin:12px auto 0;width:140px;height:140px;border-radius:12px" />
      {/if}
    {/if}
    <button class="app-btn-prim full" onclick={generateInvite} disabled={generatingInvite}>
      {inviteCode ? '🔄 Nouveau code' : '✉️ Générer un code'}
    </button>
    <div class="app-modal-divider"></div>
    <div style="text-align:center;padding:4px 0 2px">
      <div class="app-drawer-code-label" style="margin-bottom:6px">Code famille permanent (rappel)</div>
      <div class="app-drawer-code-val" style="font-size:18px;letter-spacing:3px">{familyCode}</div>
    </div>
  {/snippet}
</AppModal>

<!-- Page -->
<div class="page-dashboard">

  <!-- Header gradient -->
  <header class="app-header">
    <button class="app-burger app-burger--header" onclick={() => drawerOpen.set(true)} aria-label="Menu">☰</button>
    <div class="app-header-info">
      <div class="app-header-title">Famille {familyName}</div>
      <div class="app-header-sub">Tableau de bord parent</div>
    </div>
    <span class="app-header-emoji">👨‍👩‍👧</span>
  </header>

  <!-- Corps scrollable -->
  <main class="app-body">

    <!-- Section parents -->
    {#if parentMembers.length > 0}
      <div class="app-section-hd">
        <span class="app-section-title">Parents</span>
        <button class="app-btn-outline sm" onclick={openInviteModal}>+ Inviter</button>
      </div>
      {#each parentMembers as p}
        <div class="child-member-row">
          <span class="child-name">👤 {p.displayName || '—'}</span>
          <span class="child-status connected">{p.uid === byUid ? 'Vous' : 'Membre'}</span>
        </div>
      {/each}
    {/if}

    <!-- Section enfants -->
    <div class="app-section-hd" style="margin-top:24px">
      <span class="app-section-title">Enfants</span>
    </div>

    {#if $childMembers.length === 0}
      <p class="app-hint">Aucun enfant pour l'instant. Ajoutez-en via le menu ☰.</p>
    {:else}
      {#each $childMembers as child}
        {@const score = localScores[child.memberId]}
        <div
          class="child-score-card"
          role="button"
          tabindex="0"
          onclick={() => goto(`/parent/${child.memberId}`)}
          onkeydown={(e) => e.key === 'Enter' && goto(`/parent/${child.memberId}`)}
        >
          <div class="child-card-header">
            <span class="child-name">🧒 {child.displayName}</span>
            <span class="child-card-chevron">›</span>
          </div>

          {#if score}
            <!-- stopper la propagation du clic vers la carte pour les boutons score -->
            <div role="presentation" onclick={(e) => e.stopPropagation()} onkeydown={(e) => e.stopPropagation()}>
              <ScoreControls
                {score}
                memberId={child.memberId}
                onAdd={() => add(child.memberId)}
                onRemove={() => remove(child.memberId)}
                onValidate={() => validate(child.memberId)}
                onUnvalidate={() => unvalidate(child.memberId)}
                onIgnore={() => ignore(child.memberId)}
                onUnignore={() => unignore(child.memberId)}
              />
            </div>
          {:else}
            <p class="app-hint">Chargement…</p>
          {/if}
        </div>
      {/each}
    {/if}

  </main>

  <!-- Barre basse -->
  <div class="app-bottom-bar">
    <span class="app-bottom-hint">
      <strong>Famille {familyName}</strong> · espace parent
    </span>
    <button class="app-burger" onclick={() => drawerOpen.set(true)} aria-label="Menu">☰</button>
  </div>
</div>
