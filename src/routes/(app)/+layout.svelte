<script lang="ts">
  import { authReady, authUser, userDoc } from '$lib/stores';
  import { goto } from '$app/navigation';
  import { page } from '$app/stores';

  let { children } = $props();

  // Routes inside (app) that don't require a familyId yet
  const noFamilyRequired = ['/onboarding', '/create-family', '/join-family', '/parent-setup'];

  $effect(() => {
    if (!$authReady) return; // wait for auth resolution

    if (!$authUser) {
      goto('/');
      return;
    }

    const currentPath = $page.url.pathname;
    const onExemptPage = noFamilyRequired.some(p => currentPath.startsWith(p));

    // Authenticated but no family — redirect to onboarding unless already there
    if (!$userDoc?.familyId && !onExemptPage) {
      goto('/onboarding');
      return;
    }

    // Parent with family but profile not yet completed → account setup
    if (
      $userDoc?.familyId &&
      $userDoc?.role === 'parent' &&
      !$userDoc?.displayedName &&
      !currentPath.startsWith('/parent-setup')
    ) {
      goto('/parent-setup');
      return;
    }

    // Guard rôle : un enfant ne peut pas accéder aux routes parent (et vice-versa)
    // Reprend les mêmes règles que la branche main (loadPage guard)
    const role = $userDoc?.role;
    if (role === 'child' && (currentPath.startsWith('/parent') || onExemptPage)) {
      goto('/child');
      return;
    }
    if (role === 'parent' && currentPath.startsWith('/child')) {
      goto('/parent');
      return;
    }
  });
</script>

{#if !$authReady}
  <!-- Loading spinner while Firebase Auth resolves -->
  <div class="auth-loading">
    <div class="auth-spinner" aria-label="Chargement…"></div>
  </div>
{:else}
  {@render children()}
{/if}

<style>
  .auth-loading {
    min-height: 100dvh;
    min-height: 100svh;
    display: flex;
    align-items: center;
    justify-content: center;
    background: var(--c-bg, #f8fafc);
  }

  .auth-spinner {
    width: 40px;
    height: 40px;
    border: 3px solid rgba(0, 0, 0, 0.1);
    border-top-color: var(--c-primary, #6366f1);
    border-radius: 50%;
    animation: spin 0.75s linear infinite;
  }

  @keyframes spin {
    to { transform: rotate(360deg); }
  }
</style>
