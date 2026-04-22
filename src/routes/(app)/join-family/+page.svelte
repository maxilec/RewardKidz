<script lang="ts">
  /**
   * Page de jonction famille pour un parent déjà authentifié.
   * Deux codes requis pour la sécurité :
   *   - Code d'invitation (court, éphémère) → transmis par un co-parent
   *   - Code famille permanent              → confirme qu'ils appartiennent à la même famille
   */
  import { goto } from '$app/navigation';
  import { page } from '$app/stores';
  import { pendingOnboarding } from '$lib/stores';
  import { resolveInvite, resolveByFamilyCode } from '$lib/firebase';

  let inviteCode = $state($page.url.searchParams.get('code') ?? '');
  let familyCode = $state('');
  let loading    = $state(false);
  let error      = $state('');

  async function handleJoin(
    code    = inviteCode.trim().toUpperCase(),
    famCode = familyCode.trim().toUpperCase()
  ) {
    error   = '';
    loading = true;
    try {
      const [familyId1, familyId2] = await Promise.all([
        resolveInvite(code),
        resolveByFamilyCode(famCode)
      ]);
      if (familyId1 !== familyId2) {
        throw new Error("Le code d'invitation et le code famille ne correspondent pas.");
      }
      pendingOnboarding.set({ action: 'join', familyId: familyId1 });
      goto('/parent-setup');
    } catch (e: any) {
      error = e.message ?? 'Impossible de rejoindre la famille.';
    } finally {
      loading = false;
    }
  }

  function submit() {
    if (!inviteCode.trim()) { error = "Entrez le code d'invitation."; return; }
    if (!familyCode.trim()) { error = 'Entrez le code famille.'; return; }
    handleJoin();
  }
</script>

<div class="ob-page">
  <div class="ob-blobs" aria-hidden="true">
    <div class="ob-blob ob-blob-1"></div>
    <div class="ob-blob ob-blob-2"></div>
  </div>

  <button class="ob-btn-back" onclick={() => goto('/onboarding')} aria-label="Retour">←</button>

  <div class="ob-content ob-content--pad-top">
    <div class="ob-illus ob-mb20" style="height:80px">
      <span class="ob-illus-emoji" style="font-size:64px">🏠</span>
    </div>

    <h1 class="ob-title ob-mb8">Rejoindre une famille</h1>
    <p class="ob-subtitle ob-mb24">
      Entrez les deux codes reçus d'un co-parent.
    </p>

    <div class="ob-form-field">
      <label class="ob-label" for="joinInviteCode">Code d'invitation</label>
      <input
        id="joinInviteCode"
        class="ob-input ob-code-input"
        type="text"
        placeholder="XXXXXX"
        maxlength="8"
        autocomplete="off"
        bind:value={inviteCode}
        oninput={(e) => { inviteCode = (e.currentTarget as HTMLInputElement).value.toUpperCase(); }}
      />
    </div>

    <div class="ob-form-field ob-mb8">
      <label class="ob-label" for="joinFamilyCode">Code famille permanent</label>
      <input
        id="joinFamilyCode"
        class="ob-input ob-code-input"
        type="text"
        placeholder="ABCD1234"
        maxlength="8"
        autocomplete="off"
        bind:value={familyCode}
        oninput={(e) => { familyCode = (e.currentTarget as HTMLInputElement).value.toUpperCase(); }}
      />
    </div>

    {#if error}
      <p class="ob-hint" style="color:var(--c-error);margin-bottom:12px">{error}</p>
    {/if}

    <button class="ob-btn-primary" onclick={submit} disabled={loading}>
      {loading ? 'Connexion…' : 'Rejoindre la famille'}
    </button>
  </div>
</div>
