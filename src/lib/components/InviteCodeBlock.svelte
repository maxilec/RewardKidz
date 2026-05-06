<script lang="ts">
  interface Props {
    code:         string;    // code affiché (vide = non encore généré)
    qrSrc:        string;    // data URL de l'image QR (vide = caché)
    qrAlt:        string;
    familyCode:   string;
    loading:      boolean;
    generateIcon: string;    // émoji bouton première génération (🔑, ✉️…)
    onGenerate:   () => void;
  }

  let { code, qrSrc, qrAlt, familyCode, loading, generateIcon, onGenerate }: Props = $props();
</script>

{#if code}
  <div class="app-invite-code">{code}</div>
  {#if qrSrc}
    <img src={qrSrc} alt={qrAlt}
         style="display:block;margin:12px auto 0;width:140px;height:140px;border-radius:12px" />
  {/if}
{/if}

<button class="app-btn-prim full" onclick={onGenerate} disabled={loading}>
  {#if loading}
    Génération…
  {:else if code}
    🔄 Nouveau code
  {:else}
    {generateIcon} Générer un code
  {/if}
</button>

<div class="app-modal-divider"></div>

<div style="text-align:center;padding:4px 0 2px">
  <div class="app-drawer-code-label" style="margin-bottom:6px">Code famille permanent (rappel)</div>
  <div class="app-drawer-code-val" style="font-size:18px;letter-spacing:3px">{familyCode}</div>
</div>
