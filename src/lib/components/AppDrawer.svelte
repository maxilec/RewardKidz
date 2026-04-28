<script lang="ts">
  import type { MemberDoc } from '$lib/firebase/types';
  import { addChild, updateFamilyName, logout } from '$lib/firebase';
  import { goto } from '$app/navigation';

  interface Props {
    open:            boolean;
    familyId:        string;
    familyName:      string;
    familyCode:      string;
    childMembers:    MemberDoc[];           // liste des enfants (role=child)
    parentMembers:   MemberDoc[];           // liste des parents (role=parent)
    currentMemberId?: string;              // enfant actif dans la vue détail
    onClose:         () => void;
    onNavigate:      (memberId: string, name: string) => void;
    onChildAdded?:   () => void;
    onDashboard?:    () => void;
    isDashboard?:    boolean;              // true = on est sur le dashboard (lien actif)
  }

  let {
    open, familyId, familyName, familyCode, childMembers, parentMembers,
    currentMemberId, onClose, onNavigate, onChildAdded, onDashboard, isDashboard = false
  }: Props = $props();

  // ── États locaux ─────────────────────────────────────────
  let editingName  = $state(false);
  let editedName   = $state('');
  let addingChild  = $state(false);
  let newChildName = $state('');
  let saving       = $state(false);
  let error        = $state('');

  function startEditName() {
    editedName  = familyName;
    editingName = true;
  }
  function cancelEditName() { editingName = false; }

  async function saveFamily() {
    const name = editedName.trim();
    if (!name) return;
    saving = true;
    try {
      await updateFamilyName(familyId, name);
      editingName = false;
    } catch (e: any) {
      error = e.message;
    } finally { saving = false; }
  }

  function startAddChild() { addingChild = true; newChildName = ''; }
  function cancelAddChild() { addingChild = false; newChildName = ''; }

  async function submitAddChild() {
    const name = newChildName.trim();
    if (!name) return;
    saving = true;
    try {
      await addChild(familyId, name);
      addingChild  = false;
      newChildName = '';
      onChildAdded?.();
    } catch (e: any) {
      error = e.message;
    } finally { saving = false; }
  }

  async function handleLogout() {
    onClose();
    await logout();
  }

  function handleSettings() {
    goto('/parent/settings');
    onClose();
  }

  async function copyCode() {
    try { await navigator.clipboard.writeText(familyCode); }
    catch { /* silencieux si refusé */ }
  }

  function handleOverlayClick(e: MouseEvent) {
    if (e.target === e.currentTarget) onClose();
  }
</script>

<!-- Overlay -->
<div
  class="app-overlay"
  class:on={open}
  role="presentation"
  onclick={handleOverlayClick}
></div>

<!-- Drawer -->
<div class="app-drawer" class:open role="navigation" aria-label="Menu principal">

  <!-- En-tête gradient -->
  <div class="app-drawer-head">
    <span class="app-drawer-emoji">👨‍👩‍👧</span>

    {#if editingName}
      <div class="drawer-edit-form">
        <div class="drawer-edit-row">
          <input
            type="text"
            bind:value={editedName}
            placeholder="Nom de la famille"
            onkeydown={(e) => { if (e.key === 'Escape') cancelEditName(); }}
            onblur={() => setTimeout(() => cancelEditName(), 150)}
          />
          <button class="drawer-edit-save" onclick={saveFamily} disabled={saving} aria-label="Valider">✓</button>
        </div>
      </div>
    {:else}
      <div class="drawer-title-row">
        <div class="app-drawer-title">Famille {familyName}</div>
        <button class="app-edit-btn" onclick={startEditName} aria-label="Renommer la famille">✏️</button>
      </div>
    {/if}

    <div class="app-drawer-sub">Espace parent</div>
  </div>

  <!-- Corps -->
  <div class="app-drawer-body">

    <!-- Lien tableau de bord -->
    <div
      class="drawer-nav-item"
      class:drawer-nav-item--active={isDashboard}
      role="button"
      tabindex="0"
      onclick={() => { onDashboard?.(); onClose(); }}
      onkeydown={(e) => e.key === 'Enter' && (onDashboard?.(), onClose())}
    >
      <span class="drawer-nav-item-icon">🏠</span>
      Tableau de bord
    </div>

    <div class="app-drawer-sep"></div>

    <!-- Section enfants -->
    <div class="drawer-section-label">Enfants</div>

    {#if childMembers.length === 0}
      <p class="drawer-section-hint">Aucun enfant.</p>
    {:else}
      {#each childMembers as child}
        <div
          class="drawer-child-row"
          class:drawer-child-row--active={child.memberId === currentMemberId}
          role="button"
          tabindex="0"
          onclick={() => { onNavigate(child.memberId, child.displayName); onClose(); }}
          onkeydown={(e) => e.key === 'Enter' && (onNavigate(child.memberId, child.displayName), onClose())}
        >
          <span class="drawer-child-name">🧒 {child.displayName}</span>
        </div>
      {/each}
    {/if}

    <!-- Ajouter un enfant -->
    {#if addingChild}
      <div class="drawer-add-form">
        <input
          type="text"
          placeholder="Prénom de l'enfant"
          bind:value={newChildName}
          onkeydown={(e) => e.key === 'Escape' && cancelAddChild()}
          onblur={() => setTimeout(() => { if (!saving) cancelAddChild(); }, 150)}
        />
        <button class="drawer-add-save" onclick={submitAddChild} disabled={saving} aria-label="Valider">✓</button>
      </div>
    {:else}
      <button class="drawer-add-btn" onclick={startAddChild}>+ Ajouter un enfant</button>
    {/if}

    {#if error}
      <p class="drawer-section-hint" style="color:var(--c-error)">{error}</p>
    {/if}
  </div>

  <!-- Actions bas de drawer -->
  <div class="app-drawer-danger-zone">
    <div
      class="app-drawer-item"
      role="button"
      tabindex="0"
      onclick={handleSettings}
      onkeydown={(e) => e.key === 'Enter' && handleSettings()}
    >
      <span class="app-drawer-item-icon">⚙️</span>Paramètres
    </div>

    <div class="app-drawer-sep"></div>

    <div
      class="app-drawer-item danger"
      role="button"
      tabindex="0"
      onclick={handleLogout}
      onkeydown={(e) => e.key === 'Enter' && handleLogout()}
    >
      <span class="app-drawer-item-icon">🚪</span>Se déconnecter
    </div>
  </div>

  <!-- Pied : code famille + version -->
  <div class="app-drawer-foot">
    <button class="app-drawer-code" onclick={copyCode} title="Appuyer pour copier" style="width:100%;text-align:left;border:none;cursor:pointer;">
      <div>
        <div class="app-drawer-code-label">Code famille permanent</div>
        <div class="app-drawer-code-val">{familyCode}</div>
      </div>
      <span style="font-size:16px">📋</span>
    </button>
    <div class="app-drawer-version">RewardKidz v2.0</div>
  </div>
</div>
