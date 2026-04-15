<script lang="ts">
  interface Props {
    points:    number;
    maxPoints?: number;
  }

  let { points, maxPoints = 5 }: Props = $props();

  // SVG arc: départ à 150° (8h), balayage 240° (sens horaire) → arrivée à 30° (4h)
  const cx = 80, cy = 80, r = 60, sw = 12;
  const toRad = (d: number) => d * Math.PI / 180;
  const pt    = (d: number) => ({ x: cx + r * Math.cos(toRad(d)), y: cy + r * Math.sin(toRad(d)) });
  const f     = (n: number) => n.toFixed(2);

  const startDeg   = 150;
  const totalSweep = 240;

  const sP = pt(startDeg);
  const eP = pt(startDeg + totalSweep);

  const trackPath = `M ${f(sP.x)} ${f(sP.y)} A ${r} ${r} 0 1 1 ${f(eP.x)} ${f(eP.y)}`;

  const fillPath = $derived(() => {
    const fillSweep  = (points / maxPoints) * totalSweep;
    const fillEndDeg = startDeg + fillSweep;
    const fillP      = pt(fillEndDeg);
    const fillLarge  = fillSweep > 180 ? 1 : 0;
    return points > 0
      ? `M ${f(sP.x)} ${f(sP.y)} A ${r} ${r} 0 ${fillLarge} 1 ${f(fillP.x)} ${f(fillP.y)}`
      : '';
  });
</script>

<svg viewBox="0 0 160 160" class="circ-gauge-svg" aria-hidden="true">
  <defs>
    <linearGradient id="cgFill" x1="0%" y1="0%" x2="100%" y2="100%">
      <stop offset="0%"   stop-color="var(--c-primary)" />
      <stop offset="100%" stop-color="var(--c-primary-end)" />
    </linearGradient>
  </defs>

  <path class="circ-gauge-track" d={trackPath} stroke-width={sw} />

  {#if fillPath()}
    <path class="circ-gauge-fill" d={fillPath()} stroke="url(#cgFill)" stroke-width={sw} />
  {/if}

  <text x={cx} y={cy - 6}  class="circ-gauge-num">{points}</text>
  <text x={cx} y={cy + 14} class="circ-gauge-max">/ {maxPoints}</text>
</svg>
