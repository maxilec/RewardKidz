<script lang="ts">
  import type { HistoryEntry } from '$lib/firebase/types';

  interface Props {
    entries: HistoryEntry[];
    compact?: boolean;   // true pour 30 jours (affiche juste le numéro du jour)
  }

  let { entries, compact = false }: Props = $props();

  const MAX_H   = 90;  // hauteur max barre en px
  const MAX_PTS = 5;   // points max (axe Y fixe)

  let selectedIdx = $state<number | null>(null);

  function formatDayLabel(dateStr: string, isToday: boolean): string {
    if (isToday) return 'Auj.';
    const [y, m, d] = dateStr.split('-').map(Number);
    const date  = new Date(y, m - 1, d);
    const names = ['Di', 'Lu', 'Ma', 'Me', 'Je', 'Ve', 'Sa'];
    return compact ? String(date.getDate()) : `${names[date.getDay()]} ${date.getDate()}`;
  }

  const bars = $derived(entries.map(e => {
    const empty  = e.missing || e.ignored;
    const h      = empty ? 0 : Math.round((e.points / MAX_PTS) * MAX_H);
    const barCls = [e.isToday ? 'today' : '', empty ? 'empty' : ''].filter(Boolean).join(' ');
    return { e, h, barCls, label: formatDayLabel(e.date, e.isToday ?? false) };
  }));

  // Lignes de grille pour 1, 2, 3, 4, 5 points
  const gridLines = [1, 2, 3, 4, 5].map(pt => ({
    pt,
    bottom: Math.round((pt / MAX_PTS) * MAX_H),
  }));

  function toggleBar(idx: number) {
    selectedIdx = selectedIdx === idx ? null : idx;
  }
</script>

<!-- Wrapper gère le scroll horizontal sans bloquer le débordement vertical des tooltips -->
<div class="histogram-scroll" role="presentation" onclick={() => (selectedIdx = null)}>
  <div class="histogram-chart">

    <!-- Grille horizontale (axe Y discret) -->
    <div class="histogram-grid" aria-hidden="true">
      {#each gridLines as { pt, bottom }}
        <div class="histogram-gridline" style="bottom:{bottom}px">
          <span class="histogram-y-label">{pt}</span>
        </div>
      {/each}
    </div>

    <!-- Barres -->
    {#each bars as { e, h, barCls, label }, idx}
      <div
        class="histogram-bar-group"
        role="button"
        tabindex="0"
        onclick={(ev) => { ev.stopPropagation(); toggleBar(idx); }}
        onkeydown={(ev) => ev.key === 'Enter' && toggleBar(idx)}
      >
        <div class="histogram-bar-wrap">
          {#if selectedIdx === idx && !e.missing}
            <span class="histogram-val">{e.ignored ? '—' : String(e.points)}</span>
          {/if}
          <div class="histogram-bar {barCls}" style="height:{h}px"></div>
        </div>
        <span class="histogram-label {e.isToday ? 'today' : ''}">{label}</span>
      </div>
    {/each}

  </div>
</div>

<style>
  /* ── Scroll wrapper ─────────────────────────────────────── */
  .histogram-scroll {
    overflow-x: auto;
    overflow-y: visible;
    width: 100%;
    padding-top: 28px; /* espace pour le tooltip au-dessus des barres */
  }

  /* ── Chart principal ─────────────────────────────────────── */
  .histogram-chart {
    display: flex;
    align-items: flex-end;
    gap: 4px;
    height: 90px;
    overflow: visible;
    position: relative;
    min-width: 100%;
  }

  /* ── Grille Y ────────────────────────────────────────────── */
  .histogram-grid {
    position: absolute;
    left: 0; right: 0; bottom: 0;
    height: 90px;
    pointer-events: none;
    z-index: 0;
  }
  .histogram-gridline {
    position: absolute;
    left: 0; right: 0;
    display: flex;
    align-items: center;
    gap: 4px;
    /* translateY(50%) : ancre le centre du div (= la ligne) à `bottom: X` */
    transform: translateY(50%);
  }
  .histogram-gridline::after {
    content: '';
    flex: 1;
    border-top: 1px dashed rgba(0, 0, 0, 0.13);
  }
  .histogram-y-label {
    font-size: 8px;
    font-weight: 600;
    color: var(--c-txt-m);
    line-height: 1;
    min-width: 8px;
    text-align: right;
    opacity: 0.65;
  }

  /* ── Tooltip valeur ─────────────────────────────────────── */
  .histogram-val {
    position: absolute;
    bottom: calc(100% + 4px);
    left: 50%;
    transform: translateX(-50%);
    background: var(--c-primary);
    color: #fff;
    font-size: 11px;
    font-weight: 700;
    padding: 2px 6px;
    border-radius: 8px;
    white-space: nowrap;
    pointer-events: none;
    z-index: 10;
  }
</style>
