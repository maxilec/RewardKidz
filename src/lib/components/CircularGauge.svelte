<script lang="ts">
  import { tweened } from 'svelte/motion';
  import { cubicOut } from 'svelte/easing';

  interface Props {
    points:    number;
    maxPoints?: number;
    validated?: boolean;
    ignored?:   boolean;
  }
  let { points, maxPoints = 5, validated = false, ignored = false }: Props = $props();

  // ── Géométrie SVG ─────────────────────────────────────────
  const SIZE   = 320;
  const MARGIN = 20;          // espace pour que le glow ne soit pas rogné aux bords
  const cx     = SIZE / 2;   // 160
  const cy     = SIZE / 2;   // 160
  const SW     = 44;
  const R      = cx - SW / 2 - 8;  // 130

  const START  = 230;
  const SWEEP  = 260;
  const GAP    = 4;

  // Longueur géométrique de l'arc total
  const arcLength = (SWEEP / 360) * 2 * Math.PI * R;

  // ── Helpers arc ───────────────────────────────────────────
  function polar(deg: number) {
    const rad = ((deg - 90) * Math.PI) / 180;
    return { x: cx + R * Math.cos(rad), y: cy + R * Math.sin(rad) };
  }

  // Arc sens horaire (CW) : le dash commence au point `from` → dashoffset remplit depuis le début
  function arcCW(from: number, to: number): string {
    const s = polar(from);
    const e = polar(to);
    const large = (to - from) > 180 ? 1 : 0;
    return `M ${s.x.toFixed(2)} ${s.y.toFixed(2)} A ${R} ${R} 0 ${large} 1 ${e.x.toFixed(2)} ${e.y.toFixed(2)}`;
  }

  // Arc sens anti-horaire (CCW) : utilisé uniquement pour le masque segmenté
  function arcCCW(from: number, to: number): string {
    const s = polar(to);
    const e = polar(from);
    const large = (to - from) > 180 ? 1 : 0;
    return `M ${s.x.toFixed(2)} ${s.y.toFixed(2)} A ${R} ${R} 0 ${large} 0 ${e.x.toFixed(2)} ${e.y.toFixed(2)}`;
  }

  // ── Chemins statiques ─────────────────────────────────────
  const fullArc = arcCW(START, START + SWEEP);

  // ── Chemins réactifs ──────────────────────────────────────
  const segPaths = $derived(
    Array.from({ length: maxPoints }, (_, i) => {
      const segAngle = SWEEP / maxPoints;
      const sa = START + i * segAngle + GAP / 2;
      return arcCCW(sa, sa + segAngle - GAP);
    })
  );

  const ratio = $derived(points / maxPoints);
  const state = $derived(
    points >= maxPoints ? 'special' :
    ratio >= 0.5        ? 'positive' :
                          'negative'
  );

  // ── Animation de remplissage ──────────────────────────────
  // Durée adaptative : saut de >1 pt → immédiat (150ms) ; 1 pt → fluide (600ms)
  const animRatio = tweened(0, { duration: 600, easing: cubicOut });
  let _prevTarget = 0;
  $effect(() => {
    const delta = Math.abs(ratio - _prevTarget);
    _prevTarget = ratio;
    animRatio.set(ratio, { duration: delta > 1.5 / maxPoints ? 150 : 600 });
  });
  const dashOffset = $derived(arcLength * (1 - $animRatio));

  // ── Contenu central ───────────────────────────────────────
  const label = $derived(
    validated           ? 'Journée validée !' :
    ignored             ? 'Non comptabilisée' :
    points >= maxPoints ? 'Score parfait !'   :
    ratio >= 0.8        ? 'Super !'           :
    ratio >= 0.6        ? 'Bien joué !'       :
    ratio >= 0.4        ? 'Continue !'        :
    points > 0          ? "C'est parti !"     :
                          'Bonne journée !'
  );
</script>

<div class="gw">
  <svg
    viewBox="{-MARGIN} {-MARGIN} {SIZE + MARGIN * 2} {SIZE + MARGIN * 2}"
    class="gw-svg"
    aria-hidden="true"
    xmlns="http://www.w3.org/2000/svg"
  >
    <defs>
      <!-- Dégradé négatif (<50%) -->
      <linearGradient id="cg-neg" x1="40" y1="280" x2="280" y2="40" gradientUnits="userSpaceOnUse">
        <stop offset="0%"   stop-color="var(--c-gauge-neg-a)" />
        <stop offset="100%" stop-color="var(--c-gauge-neg-b)" />
      </linearGradient>

      <!-- Dégradé positif (>=50%) -->
      <linearGradient id="cg-pos" x1="40" y1="280" x2="280" y2="40" gradientUnits="userSpaceOnUse">
        <stop offset="0%"   stop-color="var(--c-gauge-pos-a)" />
        <stop offset="100%" stop-color="var(--c-gauge-pos-b)" />
      </linearGradient>

      <!-- Dégradé spécial (100%) — hue-rotate CSS fait l'animation arc-en-ciel -->
      <linearGradient id="cg-spec" x1="40" y1="280" x2="280" y2="40" gradientUnits="userSpaceOnUse">
        <stop offset="0%"   stop-color="var(--c-gauge-spec-a)" />
        <stop offset="50%"  stop-color="var(--c-gauge-spec-b)" />
        <stop offset="100%" stop-color="var(--c-gauge-spec-c)" />
      </linearGradient>

      <!-- Masque segmenté : 5 arcs avec extrémités angulaires (butt caps) -->
      <mask id="cg-mask">
        {#each segPaths as d}
          <path {d} fill="none" stroke="white" stroke-width={SW} stroke-linecap="butt" />
        {/each}
      </mask>
    </defs>

    <!-- 1. Fond des segments (track) -->
    <g mask="url(#cg-mask)">
      <path
        d={fullArc}
        fill="none"
        stroke="var(--c-gauge-track)"
        stroke-width={SW}
        stroke-linecap="butt"
      />
    </g>

    <!-- 2. Progression — trois couches de gradient, opacité croisée selon l'état -->
    <g mask="url(#cg-mask)" class="gw-progress gw-progress--{state}">
      <path
        class="gw-arc"
        d={fullArc}
        fill="none"
        stroke="url(#cg-neg)"
        stroke-width={SW}
        stroke-linecap="butt"
        stroke-dasharray={arcLength}
        stroke-dashoffset={dashOffset}
        opacity={state === 'negative' ? 1 : 0}
      />
      <path
        class="gw-arc"
        d={fullArc}
        fill="none"
        stroke="url(#cg-pos)"
        stroke-width={SW}
        stroke-linecap="butt"
        stroke-dasharray={arcLength}
        stroke-dashoffset={dashOffset}
        opacity={state === 'positive' ? 1 : 0}
      />
      <path
        class="gw-arc"
        d={fullArc}
        fill="none"
        stroke="url(#cg-spec)"
        stroke-width={SW}
        stroke-linecap="butt"
        stroke-dasharray={arcLength}
        stroke-dashoffset={dashOffset}
        opacity={state === 'special' ? 1 : 0}
      />
      <!-- Reflet verre (shimmer) -->
      <path
        d={fullArc}
        fill="none"
        stroke="rgba(255,255,255,0.38)"
        stroke-width={10}
        stroke-linecap="butt"
        stroke-dasharray={arcLength}
        stroke-dashoffset={dashOffset}
      />
    </g>
  </svg>

  <!-- Contenu central — superposé au SVG -->
  <div class="gw-center">
    <div class="gw-score">
      <span class="gw-num">{points}</span><span class="gw-den">/{maxPoints}</span>
    </div>
    <div class="gw-label gw-label--{state}">{label}</div>
  </div>
</div>

<style>
  /* ── Conteneur racine ────────────────────────────────────── */
  .gw {
    position: relative;
    width: 100%;
    height: 100%;
  }

  .gw-svg {
    width: 100%;
    height: 100%;
    overflow: visible;
  }

  /* ── Transition de couleur entre états ──────────────────── */
  .gw-arc {
    transition: opacity 0.5s ease;
  }

  /* ── Glow selon l'état ──────────────────────────────────── */
  .gw-progress {
    transition: filter 0.6s ease;
  }
  .gw-progress--negative {
    filter: drop-shadow(0 0 7px var(--c-gauge-neg-b));
  }
  .gw-progress--positive {
    filter: drop-shadow(0 0 9px var(--c-gauge-pos-a));
  }

  /* État spécial : hue-rotate anime l'arc-en-ciel + glow pulsant */
  .gw-progress--special {
    animation: gw-fairy 5s linear infinite;
  }
  @keyframes gw-fairy {
    0%   { filter: hue-rotate(0deg)   drop-shadow(0 0 12px var(--c-gauge-spec-a)); }
    50%  { filter: hue-rotate(180deg) drop-shadow(0 0 20px var(--c-gauge-spec-b)); }
    100% { filter: hue-rotate(360deg) drop-shadow(0 0 12px var(--c-gauge-spec-a)); }
  }

  /* ── Overlay central ────────────────────────────────────── */
  .gw-center {
    position: absolute;
    inset: 0;
    display: flex;
    flex-direction: column;
    align-items: center;
    justify-content: center;
    pointer-events: none;
    gap: 2px;
    padding-top: 6%;
  }

  .gw-score {
    display: flex;
    align-items: baseline;
    line-height: 1;
  }
  .gw-num {
    font-family: var(--f-head);
    font-size: clamp(3.5rem, 19vw, 6rem);
    font-weight: 700;
    color: var(--c-txt-h);
    line-height: 1;
  }
  .gw-den {
    font-family: var(--f-head);
    font-size: clamp(1.3rem, 7vw, 2.2rem);
    color: var(--c-txt-m);
    line-height: 1;
    margin-left: 2px;
  }

  /* Badge de statut */
  .gw-label {
    font-size: clamp(0.7rem, 3.5vw, 1.05rem);
    font-weight: 700;
    padding: 4px 16px;
    border-radius: 20px;
    margin-top: 6px;
    letter-spacing: 0.02em;
  }
  .gw-label--negative {
    background: rgba(251, 191, 36, 0.15);
    color: #B45309;
  }
  .gw-label--positive {
    background: rgba(124, 58, 237, 0.12);
    color: var(--c-gauge-pos-a);
  }
  .gw-label--special {
    background: linear-gradient(90deg, var(--c-gauge-spec-a), var(--c-gauge-spec-b));
    color: #fff;
    animation: gw-fairy-label 5s linear infinite;
  }
  @keyframes gw-fairy-label {
    from { filter: hue-rotate(0deg);   }
    to   { filter: hue-rotate(360deg); }
  }
</style>
