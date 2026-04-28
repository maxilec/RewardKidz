<script lang="ts">
  interface Props {
    firstName:      string;
    displayedName?: string;   // absent → titre field hidden
  }

  let { firstName = $bindable(), displayedName = $bindable() }: Props = $props();
  let showTitle = $derived(displayedName !== undefined);
</script>

<div class="profile-card">
  <div class="pc-field">
    <label class="pc-label" for="pc-firstname">Prénom</label>
    <input
      class="pc-input"
      id="pc-firstname"
      type="text"
      placeholder="Sophie, Marc, Léa…"
      autocomplete="given-name"
      bind:value={firstName}
    >
  </div>

  {#if showTitle}
    <div class="pc-field">
      <label class="pc-label" for="pc-title">
        Titre pour les enfants
        <span class="pc-label-hint">— Papa, Maman, Mamie…</span>
      </label>
      <input
        class="pc-input"
        id="pc-title"
        type="text"
        placeholder="Papa, Maman, Mamie…"
        autocomplete="off"
        bind:value={displayedName}
      >
    </div>
  {/if}
</div>

<style>
  .profile-card { display: flex; flex-direction: column; gap: 0.875rem; }
</style>
