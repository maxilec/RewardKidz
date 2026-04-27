<script lang="ts">
  import { onMount } from 'svelte';
  import jsQR from 'jsqr';

  interface Props {
    onScan:  (result: string) => void;
    onClose: () => void;
  }

  let { onScan, onClose }: Props = $props();

  let videoEl:  HTMLVideoElement;
  let canvasEl: HTMLCanvasElement;
  let stream:   MediaStream | null = null;
  let rafId     = 0;
  let scanning  = false;
  let camError  = $state('');

  // ── Caméra ──────────────────────────────────────────────────

  async function startCamera() {
    camError = '';
    try {
      stream = await navigator.mediaDevices.getUserMedia({
        video: { facingMode: { ideal: 'environment' }, width: { ideal: 1280 } }
      });
      videoEl.srcObject = stream;
      await videoEl.play();
      scanning = true;
      scanLoop();
    } catch (e: any) {
      camError = e?.name === 'NotAllowedError'
        ? 'Accès à la caméra refusé. Autorise l\'accès dans tes réglages.'
        : 'Impossible d\'ouvrir la caméra.';
    }
  }

  function stopCamera() {
    scanning = false;
    cancelAnimationFrame(rafId);
    stream?.getTracks().forEach(t => t.stop());
    stream = null;
  }

  // ── Boucle de scan (requestAnimationFrame) ──────────────────

  function scanLoop() {
    if (!scanning) return;
    rafId = requestAnimationFrame(() => {
      if (!scanning || !videoEl || !canvasEl) return;

      if (videoEl.readyState >= HTMLMediaElement.HAVE_ENOUGH_DATA) {
        const w = videoEl.videoWidth;
        const h = videoEl.videoHeight;
        if (w > 0 && h > 0) {
          canvasEl.width  = w;
          canvasEl.height = h;
          const ctx = canvasEl.getContext('2d', { willReadFrequently: true })!;
          ctx.drawImage(videoEl, 0, 0, w, h);
          const pixels = ctx.getImageData(0, 0, w, h);
          const code   = jsQR(pixels.data, w, h, { inversionAttempts: 'dontInvert' });
          if (code?.data) {
            stopCamera();
            onScan(code.data);
            return;
          }
        }
      }
      scanLoop();
    });
  }

  // ── Fermeture ────────────────────────────────────────────────

  function handleClose() {
    stopCamera();
    onClose();
  }

  onMount(() => {
    startCamera();
    return () => stopCamera();
  });
</script>

<!-- svelte-ignore a11y_no_noninteractive_element_interactions -->
<div
  class="qrs-overlay"
  role="dialog"
  aria-modal="true"
  aria-label="Scanner un QR code"
  onkeydown={(e) => e.key === 'Escape' && handleClose()}
>
  <div class="qrs-sheet">

    <div class="qrs-header">
      <span class="qrs-title">Scanner un QR code</span>
      <button class="qrs-btn-close" onclick={handleClose} aria-label="Fermer">✕</button>
    </div>

    <div class="qrs-viewport">
      {#if camError}
        <div class="qrs-error">{camError}</div>
      {:else}
        <video
          bind:this={videoEl}
          class="qrs-video"
          playsinline
          muted
          aria-hidden="true"
        ></video>
        <div class="qrs-frame" aria-hidden="true">
          <span class="qrs-corner qrs-corner--tl"></span>
          <span class="qrs-corner qrs-corner--tr"></span>
          <span class="qrs-corner qrs-corner--bl"></span>
          <span class="qrs-corner qrs-corner--br"></span>
        </div>
      {/if}
      <!-- canvas caché : traitement des frames -->
      <canvas bind:this={canvasEl} class="qrs-canvas" aria-hidden="true"></canvas>
    </div>

    <p class="qrs-hint">Pointe la caméra vers le QR code de connexion</p>

    <button class="ob-btn-secondary" onclick={handleClose}>Annuler</button>

  </div>
</div>

<style>
  /* ── Overlay ── */
  .qrs-overlay {
    position: fixed;
    inset: 0;
    z-index: 200;
    background: rgba(0, 0, 0, 0.65);
    display: flex;
    align-items: flex-end;
    justify-content: center;
    /* slide-up animation */
    animation: qrs-fade-in 0.2s ease;
  }
  @keyframes qrs-fade-in {
    from { opacity: 0; }
    to   { opacity: 1; }
  }

  /* ── Bottom-sheet ── */
  .qrs-sheet {
    background: var(--c-bg, #fff);
    border-radius: 20px 20px 0 0;
    width: 100%;
    max-width: 480px;
    padding: 1.25rem 1.25rem env(safe-area-inset-bottom, 1.5rem);
    display: flex;
    flex-direction: column;
    gap: 0.875rem;
    animation: qrs-slide-up 0.25s cubic-bezier(0.4, 0, 0.2, 1);
  }
  @keyframes qrs-slide-up {
    from { transform: translateY(100%); }
    to   { transform: translateY(0); }
  }

  /* ── Header ── */
  .qrs-header {
    display: flex;
    align-items: center;
    justify-content: space-between;
  }
  .qrs-title {
    font-size: 1rem;
    font-weight: 700;
    color: var(--c-txt, #1e1b4b);
  }
  .qrs-btn-close {
    background: var(--c-bg-alt, #f1f0f9);
    border: none;
    font-size: 0.9rem;
    color: var(--c-txt-m, #6b7280);
    cursor: pointer;
    padding: 4px 10px;
    border-radius: 8px;
    line-height: 1.6;
  }

  /* ── Viewport caméra ── */
  .qrs-viewport {
    position: relative;
    width: 100%;
    aspect-ratio: 1;
    border-radius: 16px;
    overflow: hidden;
    background: #000;
  }
  .qrs-video {
    width: 100%;
    height: 100%;
    object-fit: cover;
    display: block;
  }
  .qrs-canvas {
    display: none;
  }

  /* ── Cadre de visée ── */
  .qrs-frame {
    position: absolute;
    inset: 18%;
    /* fond semi-transparent autour du cadre */
    box-shadow: 0 0 0 9999px rgba(0, 0, 0, 0.45);
    border-radius: 8px;
    pointer-events: none;
  }
  .qrs-corner {
    position: absolute;
    width: 22px;
    height: 22px;
    border-color: #fff;
    border-style: solid;
    border-width: 0;
  }
  .qrs-corner--tl { top: -2px;    left: -2px;    border-top-width: 3px; border-left-width: 3px;  border-radius: 4px 0 0 0; }
  .qrs-corner--tr { top: -2px;    right: -2px;   border-top-width: 3px; border-right-width: 3px; border-radius: 0 4px 0 0; }
  .qrs-corner--bl { bottom: -2px; left: -2px;    border-bottom-width: 3px; border-left-width: 3px;  border-radius: 0 0 0 4px; }
  .qrs-corner--br { bottom: -2px; right: -2px;   border-bottom-width: 3px; border-right-width: 3px; border-radius: 0 0 4px 0; }

  /* ── Erreur caméra ── */
  .qrs-error {
    display: flex;
    align-items: center;
    justify-content: center;
    height: 100%;
    padding: 1.5rem;
    color: #fff;
    font-size: 0.875rem;
    text-align: center;
    line-height: 1.5;
  }

  /* ── Hint ── */
  .qrs-hint {
    text-align: center;
    font-size: 0.825rem;
    color: var(--c-txt-m, #6b7280);
    margin: 0;
  }
</style>
