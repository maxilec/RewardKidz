<script lang="ts">
  import { goto } from '$app/navigation';
  import { auth } from '$lib/firebase/auth';
  import { connectChildDevice } from '$lib/firebase';
  import { logout } from '$lib/firebase';

  let familyCode = $state('');
  let otpCode    = $state('');
  let error      = $state('');
  let loading    = $state(false);

  async function goBack() {
    await logout();
    goto('/');
  }

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

    <div class="ob-warn-box ob-mb24">
      ⚠️ Si tu te déconnectes, tu auras besoin de ces deux codes pour revenir. Demande-les à ton parent.
    </div>

    <div class="ob-btn-stack ob-mt-a">
      <button class="ob-btn-primary" onclick={connect} disabled={loading}>
        {loading ? 'Connexion…' : 'Me connecter'}
      </button>
    </div>

  </div><!-- /.ob-content -->

</div><!-- /.page.child-auth -->

<style>
  .ob-error {
    background: rgba(239, 68, 68, 0.1);
    border: 1px solid rgba(239, 68, 68, 0.3);
    color: #dc2626;
    border-radius: 8px;
    padding: 0.625rem 0.875rem;
    font-size: 0.875rem;
  }
</style>
