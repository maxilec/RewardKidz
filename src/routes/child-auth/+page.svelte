<script lang="ts">
  import { goto }    from '$app/navigation';
  import { onMount } from 'svelte';
  import { auth, loginAsChild } from '$lib/firebase/auth';
  import { connectChildDevice, resolveInviteLink, connectChildDeviceViaToken, logout } from '$lib/firebase';
  import QrScanner from '$lib/components/QrScanner.svelte';
  import QrIcon    from '$lib/components/icons/QrIcon.svelte';

  let familyCode    = $state('');
  let otpCode       = $state('');
  let error         = $state('');
  let loading       = $state(false);
  let scannerOpen   = $state(false);
  let sessionReady  = $state(false);

  onMount(async () => {
    if (!auth.currentUser) {
      await loginAsChild();
    }
    sessionReady = true;
  });

  async function goBack() {
    await logout();
    goto('/');
  }

  // ── Connexion par codes ──────────────────────────────────────

  async function connect() {
    error = '';
    const code = familyCode.trim().toUpperCase();
    const otp  = otpCode.trim();

    if (!code)              { error = 'Entre le code famille.'; return; }
    if (!/^\d{6}$/.test(otp)) { error = 'Le code enfant doit contenir 6 chiffres.'; return; }

    const user = auth.currentUser;
    if (!user) { error = 'Session invalide, retourne en arrière.'; return; }

    loading = true;
    try {
      await connectChildDevice(user, code, otp);
      goto('/child');
    } catch (e) {
      error = (e as { message?: string }).message || 'Erreur de connexion.';
    } finally {
      loading = false;
    }
  }

  // ── Connexion par QR code ────────────────────────────────────

  async function handleScan(raw: string) {
    scannerOpen = false;
    error = '';
    loading = true;
    try {
      // Extraire le token depuis l'URL scannée
      let token: string | null = null;
      try { token = new URL(raw).searchParams.get('token'); } catch { /* pas une URL */ }
      if (!token) { error = 'QR code non reconnu — ce code n\'appartient pas à RewardKidz.'; return; }

      // S'assurer qu'une session anonyme existe
      let user = auth.currentUser;
      if (!user) user = await loginAsChild();

      const link = await resolveInviteLink(token);
      if (!link)                 { error = 'QR code expiré. Demande un nouveau code à ton parent.'; return; }
      if (link.type !== 'child') { error = 'Ce QR code est destiné aux parents, pas aux enfants.'; return; }

      await connectChildDeviceViaToken(user, token);
      goto('/child');
    } catch (e: any) {
      error = e.message || 'Erreur de connexion.';
    } finally {
      loading = false;
    }
  }
</script>

<div class="page child-auth">

  <div class="ob-blobs" aria-hidden="true">
    <div class="ob-blob ob-blob-1"></div>
    <div class="ob-blob ob-blob-2"></div>
  </div>

  <button class="ob-btn-back" aria-label="Retour" onclick={goBack}>←</button>

  <div class="ob-content ob-content--pad-top">

    <div class="ob-illus ob-mb16" style="height:90px">
      <span class="ob-illus-emoji" style="font-size:76px">🧒</span>
    </div>

    <h1 class="ob-title ob-mb8">Connexion enfant</h1>
    <p class="ob-subtitle ob-mb24">Entre les deux codes que ton parent t'a donnés.</p>

    {#if !sessionReady}
      <div class="ob-session-init">Préparation de ta session…</div>
    {:else}

    {#if error}
      <div class="ob-error ob-mb16">{error}</div>
    {/if}

    <div class="ob-form-field">
      <label class="ob-label" for="childFamilyCode">
        Code famille
        <span style="font-weight:400;color:var(--c-txt-m)">(8 caractères)</span>
      </label>
      <input
        class="ob-input ob-code-input"
        id="childFamilyCode"
        type="text"
        maxlength="8"
        placeholder="ABCD1234"
        autocomplete="off"
        style="text-transform:uppercase;letter-spacing:5px"
        bind:value={familyCode}
      >
    </div>

    <div class="ob-form-field ob-mb8">
      <label class="ob-label" for="childOtpInput">
        Code enfant
        <span style="font-weight:400;color:var(--c-txt-m)">(6 chiffres — valable 30 min)</span>
      </label>
      <input
        class="ob-input ob-code-input otp-input"
        id="childOtpInput"
        type="tel"
        inputmode="numeric"
        maxlength="6"
        placeholder="••••••"
        autocomplete="one-time-code"
        style="letter-spacing:8px"
        bind:value={otpCode}
      >
    </div>

    <div class="ob-warn-box ob-mb8">
      ⚠️ Si tu te déconnectes, tu auras besoin de ces deux codes pour revenir. Demande-les à ton parent.
    </div>

    <div class="ob-btn-stack ob-mt-a">
      <button class="ob-btn-primary" onclick={connect} disabled={loading}>
        {loading ? 'Connexion…' : 'Me connecter'}
      </button>
    </div>

    <!-- Séparateur QR code -->
    <div class="ob-sep ob-mt16">ou par QR code</div>

    <button class="btn-qr" onclick={() => scannerOpen = true} disabled={loading}>
      <QrIcon /> Scanner un QR code
    </button>

    {/if}<!-- /sessionReady -->

  </div><!-- /.ob-content -->

</div><!-- /.page.child-auth -->

{#if scannerOpen}
  <QrScanner onScan={handleScan} onClose={() => scannerOpen = false} />
{/if}

<style>
  .ob-error {
    background: rgba(239, 68, 68, 0.1);
    border: 1px solid rgba(239, 68, 68, 0.3);
    color: #dc2626;
    border-radius: 8px;
    padding: 0.625rem 0.875rem;
    font-size: 0.875rem;
  }

  .ob-mt16 { margin-top: 1rem; }

  .ob-session-init {
    text-align: center;
    color: var(--c-txt-m, #6b7280);
    font-size: 0.875rem;
    padding: 2rem 0;
  }

  .btn-qr {
    width: 100%;
    padding: 0.875rem;
    border-radius: 12px;
    border: 1.5px dashed var(--c-border, #d1d5db);
    background: transparent;
    color: var(--c-txt, #1e1b4b);
    font-size: 0.95rem;
    font-weight: 600;
    cursor: pointer;
    display: flex;
    align-items: center;
    justify-content: center;
    gap: 10px;
    transition: background 0.15s, border-color 0.15s;
  }
  .btn-qr:hover:not(:disabled) {
    background: var(--c-bg-alt, #f1f0f9);
    border-color: var(--c-purple, #7c3aed);
    color: var(--c-purple, #7c3aed);
  }
  .btn-qr:disabled { opacity: 0.5; cursor: default; }
</style>
