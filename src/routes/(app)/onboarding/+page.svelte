<script lang="ts">
  import { goto } from '$app/navigation';
  import { authUser } from '$lib/stores';
</script>

<div class="ob-page">

  <div class="ob-blobs" aria-hidden="true">
    <div class="ob-blob ob-blob-1"></div>
    <div class="ob-blob ob-blob-2"></div>
    <div class="ob-blob ob-blob-3"></div>
  </div>

  <div class="ob-content">

    <div style="margin-bottom:28px;padding-top:10px">
      <span class="ob-logo">Reward<em>Kidz</em></span>
    </div>

    <div class="ob-illus ob-mb20" style="height:100px">
      <span class="ob-illus-emoji" style="font-size:80px">🏠</span>
    </div>

    <h1 class="ob-title ob-mb8">Votre famille</h1>
    <p class="ob-subtitle ob-mb24">Que souhaitez-vous faire ?</p>

    <div class="ob-choices">

      <div class="ob-role-card ob-role-card--primary">
        <span class="ob-role-card-emoji">👨‍👩‍👧</span>
        <div class="ob-role-card-title">Créer ma famille</div>
        <div class="ob-role-card-desc">Vous êtes parent et souhaitez démarrer un nouvel espace familial.</div>
        <button class="ob-btn-primary" onclick={() => goto('/create-family')}>Créer ma famille</button>
      </div>

      <div class="ob-role-card">
        <span class="ob-role-card-emoji">🔑</span>
        <div class="ob-role-card-title">J'ai un code d'invitation</div>
        <div class="ob-role-card-desc">Un parent vous a envoyé un code à 6 caractères pour rejoindre sa famille.</div>
        <button class="ob-btn-outline" onclick={() => goto('/parent-auth?tab=join')}>Rejoindre une famille</button>
      </div>

    </div>

  </div><!-- /.ob-content -->

</div><!-- /.ob-page -->

<style>
  .ob-page {
    position: relative;
    overflow: hidden;
    min-height: 100dvh;
    min-height: 100svh;
    display: flex;
    flex-direction: column;
    background: var(--c-bg);
  }
</style>
