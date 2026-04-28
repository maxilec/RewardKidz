<script lang="ts">
  import { goto } from '$app/navigation';
  import { authUser, userDoc, familyDoc, children as childMembers, members } from '$lib/stores';
  import { auth } from '$lib/firebase/auth';
  import {
    updateParentProfile, updateFamilyName,
    deleteParentAccount, deleteFamily
  } from '$lib/firebase';
  import ProfileCard from '$lib/components/ProfileCard.svelte';

  let familyId = $derived($userDoc?.familyId ?? '');

  // ── Valeurs initiales (capturées à l'ouverture) ─────────
  let initialFirstName     = $state($userDoc?.displayName ?? '');
  let initialDisplayedName = $state($userDoc?.displayedName ?? '');
  let initialFamilyName    = $state($familyDoc?.name ?? '');

  // ── Champs modifiables ──────────────────────────────────
  let firstName     = $state(initialFirstName);
  let displayedName = $state(initialDisplayedName);
  let familyName    = $state(initialFamilyName);

  // ── État UI ─────────────────────────────────────────────
  let saving  = $state(false);
  let saved   = $state(false);
  let error   = $state('');

  let dirty = $derived(
    firstName.trim()     !== initialFirstName     ||
    displayedName.trim() !== initialDisplayedName ||
    familyName.trim()    !== initialFamilyName
  );

  let parentMembers = $derived($members.filter(m => m.role === 'parent'));

  // ── Enregistrement global ───────────────────────────────
  async function handleSave() {
    if (!dirty || saving) return;
    const fn = firstName.trim();
    const dn = displayedName.trim();
    const fn2 = familyName.trim();
    if (!fn) { error = 'Le prénom est requis.'; return; }
    if (!dn) { error = 'Le titre est requis.'; return; }
    if (!fn2) { error = 'Le nom de la famille est requis.'; return; }

    const user = auth.currentUser;
    if (!user) return;

    saving = true;
    saved  = false;
    error  = '';
    try {
      const tasks: Promise<void>[] = [];
      if (fn !== initialFirstName || dn !== initialDisplayedName)
        tasks.push(updateParentProfile(user.uid, familyId, fn, dn));
      if (fn2 !== initialFamilyName)
        tasks.push(updateFamilyName(familyId, fn2));
      await Promise.all(tasks);

      initialFirstName     = fn;
      initialDisplayedName = dn;
      initialFamilyName    = fn2;

      saved = true;
      setTimeout(() => { saved = false; }, 2000);
    } catch (e: any) {
      error = e.message || 'Erreur lors de l\'enregistrement.';
    } finally {
      saving = false;
    }
  }

  // ── Suppression compte ──────────────────────────────────
  async function handleDeleteAccount() {
    if (!confirm('Supprimer votre compte ? Cette action est irréversible. Confirmer ?')) return;
    const user = auth.currentUser;
    if (!user) return;
    error = '';
    try {
      await deleteParentAccount(user, familyId);
    } catch (e: any) {
      error = (e as { message?: string }).message ?? 'Erreur inconnue.';
    }
  }

  // ── Suppression famille ─────────────────────────────────
  async function handleDeleteFamily() {
    if ($childMembers.length > 0) {
      error = 'Retirez tous les enfants avant de supprimer la famille.';
      return;
    }
    if (parentMembers.length > 1) {
      error = 'Retirez tous les co-parents avant de supprimer la famille.';
      return;
    }
    if (!confirm('Supprimer la famille entière ? Cette action est irréversible. Confirmer ?')) return;
    error = '';
    try {
      await deleteFamily(familyId);
    } catch (e: any) {
      error = e.message ?? String(e);
    }
  }
</script>

<div class="page-settings">

  <!-- Header gradient -->
  <header class="app-header">
    <button class="app-burger app-burger--header" onclick={() => goto('/parent')} aria-label="Retour">←</button>
    <div class="app-header-info">
      <div class="app-header-title">Paramètres</div>
    </div>
    <span class="app-header-emoji">⚙️</span>
  </header>

  <!-- Corps scrollable -->
  <main class="app-body">

    <!-- Section Mon compte -->
    <div class="s-section-label">Mon compte</div>
    <div class="s-card">
      <ProfileCard bind:firstName bind:displayedName />
    </div>

    <!-- Section Ma famille -->
    <div class="s-section-label">Ma famille</div>
    <div class="s-card">
      <div class="pc-field">
        <label class="pc-label" for="s-famname">Nom de la famille</label>
        <input
          class="pc-input"
          id="s-famname"
          type="text"
          placeholder="Les Dupont…"
          maxlength="40"
          autocomplete="off"
          bind:value={familyName}
        >
      </div>
    </div>

    <!-- Zone danger -->
    <div class="s-section-label s-section-label--danger">Zone danger</div>
    <div class="s-card s-card--danger">
      <button class="app-btn-outline danger-outline full" onclick={handleDeleteAccount}>
        Supprimer mon compte
      </button>
      <button class="app-btn-outline danger-outline full" onclick={handleDeleteFamily}>
        Supprimer la famille
      </button>
    </div>

    {#if error}
      <div class="s-error">{error}</div>
    {/if}

    <!-- Espace pour la pastille flottante -->
    <div style="height:80px"></div>

  </main>

  <!-- Pastille Enregistrer flottante -->
  <div class="s-save-bar">
    <button
      class="s-save-pill"
      class:s-save-pill--saved={saved}
      onclick={handleSave}
      disabled={!dirty || saving}
    >
      {#if saving}
        Enregistrement…
      {:else if saved}
        ✓ Enregistré
      {:else}
        Enregistrer
      {/if}
    </button>
  </div>

</div>

<style>
  .page-settings {
    display: flex;
    flex-direction: column;
    min-height: 100dvh;
    background: var(--c-bg, #f8f7ff);
  }

  /* ── Sections ── */
  .s-section-label {
    font-size: 0.7rem;
    font-weight: 700;
    letter-spacing: 0.08em;
    text-transform: uppercase;
    color: var(--c-txt-m, #6b7280);
    margin: 20px 0 6px;
  }
  .s-section-label--danger { color: #dc2626; }

  /* ── Cards ── */
  .s-card {
    background: var(--c-surface, #fff);
    border: 1.5px solid var(--c-border, #e5e7eb);
    border-radius: 14px;
    padding: 1rem;
    display: flex;
    flex-direction: column;
    gap: 0.875rem;
  }
  .s-card--danger {
    border-color: rgba(220, 38, 38, 0.25);
    background: rgba(254, 242, 242, 0.5);
    gap: 10px;
  }

  /* Champs (partagés avec ProfileCard via variables CSS) */
  :global(.pc-field) { display: flex; flex-direction: column; gap: 4px; }
  :global(.pc-label) {
    font-size: 0.75rem; font-weight: 700;
    color: var(--c-txt-m, #6b7280); letter-spacing: 0.04em;
  }
  :global(.pc-label-hint) { font-weight: 400; }
  :global(.pc-input) {
    height: 44px; border-radius: 10px;
    border: 1.5px solid var(--c-border, #e5e7eb);
    background: var(--c-bg, #fff);
    padding: 0 12px; font-size: 15px;
    font-family: var(--f-body, sans-serif);
    color: var(--c-txt-h, #1e1b4b); outline: none;
    transition: border-color 0.15s;
    width: 100%; box-sizing: border-box;
  }
  :global(.pc-input:focus) { border-color: var(--c-primary, #7c3aed); }

  /* ── Erreur ── */
  .s-error {
    margin-top: 12px;
    background: rgba(239, 68, 68, 0.1);
    border: 1px solid rgba(239, 68, 68, 0.3);
    color: #dc2626;
    border-radius: 8px;
    padding: 0.625rem 0.875rem;
    font-size: 0.875rem;
  }

  /* ── Pastille Enregistrer flottante ── */
  .s-save-bar {
    position: fixed;
    bottom: calc(env(safe-area-inset-bottom, 0px) + 16px);
    left: 50%;
    transform: translateX(-50%);
    z-index: 40;
    pointer-events: none;
  }
  .s-save-pill {
    pointer-events: auto;
    height: 48px;
    padding: 0 28px;
    border-radius: 999px;
    border: none;
    background: linear-gradient(135deg, var(--c-primary, #7c3aed), var(--c-primary-end, #6d28d9));
    color: #fff;
    font-size: 0.95rem;
    font-weight: 700;
    font-family: var(--f-head, sans-serif);
    cursor: pointer;
    box-shadow: 0 4px 20px rgba(124, 58, 237, 0.4);
    transition: opacity 0.15s, transform 0.1s, background 0.2s;
    white-space: nowrap;
  }
  .s-save-pill:hover:not(:disabled) { opacity: 0.9; transform: scale(1.03); }
  .s-save-pill:active:not(:disabled) { transform: scale(0.97); }
  .s-save-pill:disabled {
    background: var(--c-border, #d1d5db);
    color: var(--c-txt-m, #9ca3af);
    box-shadow: none;
    cursor: default;
  }
  .s-save-pill--saved {
    background: linear-gradient(135deg, #10b981, #059669) !important;
    box-shadow: 0 4px 20px rgba(16, 185, 129, 0.35) !important;
  }
</style>
