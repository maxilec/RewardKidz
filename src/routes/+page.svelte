<script lang="ts">
  import { authUser, userDoc, authReady } from '$lib/stores';
  import { loginAsChild } from '$lib/firebase';
  import { goto } from '$app/navigation';

  // After auth resolves, redirect authenticated users with a family
  $effect(() => {
    if (!$authReady) return;
    if (!$authUser) return; // show landing

    if (!$userDoc?.familyId) {
      // Anonymous without family → child-auth; authenticated without family → onboarding
      goto($authUser.isAnonymous ? '/child-auth' : '/onboarding');
    } else {
      goto($userDoc.role === 'parent' ? '/parent' : '/child');
    }
  });

  async function goParent() {
    if ($authUser && !$authUser.isAnonymous) {
      const doc = $userDoc;
      if (doc?.familyId) {
        goto(doc.role === 'parent' ? '/parent' : '/onboarding');
        return;
      }
    }
    goto('/parent-auth');
  }

  async function goChild() {
    if ($authUser?.isAnonymous) {
      const doc = $userDoc;
      goto(!doc?.familyId ? '/child-auth' : '/child');
      return;
    }
    // Sign in anonymously first
    try {
      await loginAsChild();
      // onAuthStateChanged will handle routing via $effect above
    } catch (e) {
      console.error('Anonymous login failed', e);
    }
  }
</script>

<div class="ob-page">
  <div class="ob-blobs" aria-hidden="true">
    <div class="ob-blob ob-blob-1"></div>
    <div class="ob-blob ob-blob-2"></div>
    <div class="ob-blob ob-blob-3"></div>
  </div>

  <div class="ob-content ob-landing-content">
    <div style="margin-bottom:28px;padding-top:10px">
      <span class="ob-logo">Reward<em>Kidz</em></span>
    </div>

    <div class="ob-illus ob-mb20" style="height:118px">
      <span class="ob-illus-emoji" style="font-size:88px">👨‍👩‍👧‍👦</span>
    </div>

    <h1 class="ob-title ob-title-xl ob-title-gradient ob-mb8">
      Bienvenue sur<br><em>RewardKidz</em>
    </h1>
    <p class="ob-subtitle ob-mb24">La famille qui avance ensemble</p>

    <div class="ob-choices">
      <div
        class="ob-role-card ob-role-card--primary"
        role="button"
        tabindex="0"
        onclick={goChild}
        onkeydown={(e) => e.key === 'Enter' && goChild()}
      >
        <span class="ob-role-card-emoji">🧒</span>
        <div class="ob-role-card-title">Je suis un enfant</div>
        <div class="ob-role-card-desc">Connecter cet appareil avec mon code.</div>
        <button class="ob-btn-primary" tabindex="-1" onclick={(e) => { e.stopPropagation(); goChild(); }}>Espace enfant</button>
      </div>
      <div
        class="ob-role-card"
        role="button"
        tabindex="0"
        onclick={goParent}
        onkeydown={(e) => e.key === 'Enter' && goParent()}
      >
        <span class="ob-role-card-emoji">👨‍👩‍👧</span>
        <div class="ob-role-card-title">Je suis un parent</div>
        <div class="ob-role-card-desc">S'identifier ou gérer l'espace famille.</div>
        <button class="ob-btn-outline" tabindex="-1" onclick={(e) => { e.stopPropagation(); goParent(); }}>Espace parent</button>
      </div>
    </div>
  </div>
</div>

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
  .ob-landing-content {
    max-width: 430px;
    margin: 0 auto;
    width: 100%;
  }
</style>
