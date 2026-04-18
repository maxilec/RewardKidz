<script lang="ts">
  import type { HistoryEntry } from '$lib/firebase/types';

  interface Props {
    entries: HistoryEntry[];
    compact?: boolean;
  }

  let { entries, compact = false }: Props = $props();

  const MAX_H   = 90;
  const MAX_PTS = 5;

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

  const gridLines = [1, 2, 3, 4, 5].map(pt => ({
    pt,
    bottom: Math.round((pt / MAX_PTS) * MAX_H),
  }));

  function toggleBar(idx: number) {
    selectedIdx = selectedIdx === idx ? null : idx;
  }
</script>

<div class="histogram-scroll" role="presentation" onclick={() => (selectedIdx = null)}>
  <div class="histogram-outer">

    <!-- Zone des barres (90px exact = MAX_H) -->
    <div class="histogram-chart">

      <!-- Grille Y — positionnée depuis chart-bottom, même référence que les barres -->
      <div class="histogram-grid" aria-hidden="true">
        {#each gridLines as { pt, bottom }}
          <div class="histogram-gridline" style="bottom:{bottom}px">
            <span class="histogram-y-label">{pt}</span>
          </div>
        {/each}
      </div>

      <!-- Barres -->
      {#each bars as { e, h, barCls }, idx}
        <div
          class="histogram-bar-wrap"
          role="button"
          tabindex="0"
          onclick={(ev) => { ev.stopPropagation(); toggleBar(idx); }}
          onkeydown={(ev) => ev.key === 'Enter' && toggleBar(idx)}
        >
          {#if selectedIdx === idx && !e.missing}
            <span class="histogram-val">{e.ignored ? '—' : String(e.points)}</span>
          {/if}
          <div class="histogram-bar {barCls}" style="height:{h}px"></div>
        </div>
      {/each}

    </div><!-- /.histogram-chart -->

    <!-- Étiquettes X — rangée séparée, n'affecte pas la hauteur des barres -->
    <div class="histogram-xlabels">
      {#each bars as { e, label }}
        <span class="histogram-label {e.isToday ? 'today' : ''}">{label}</span>
      {/each}
    </div>

  </div><!-- /.histogram-outer -->
</div>

<style>
  /* ── Scroll wrapper ──────────────────────────────────────── */
  .histogram-scroll {
    overflow-x: auto;
    overflow-y: visible;
    width: 100%;
    padding-top: 28px; /* espace pour le tooltip au-dessus des barres */
  }

  /* ── Conteneur vertical (barres + étiquettes) ────────────── */
  .histogram-outer {
    display: flex;
    flex-direction: column;
    min-width: 100%;
  }

  /* ── Zone des barres — 90px EXACT ────────────────────────── */
  .histogram-chart {
    display: flex;
    align-items: flex-end; /* bas du bar-wrap = bas du chart */
    gap: 4px;
    height: 90px;         /* = MAX_H */
    overflow: visible;
    position: relative;
  }

  /* ── Colonne barre (enfant direct du chart) ──────────────── */
  .histogram-bar-wrap {
    flex: 1;
    min-width: 0;
    height: 100%;         /* = 90px = MAX_H — aligné sur chart-bottom */
    display: flex;
    align-items: flex-end;
    position: relative;
    cursor: pointer;
  }

  /* ── Grille Y ────────────────────────────────────────────── */
  .histogram-grid {
    position: absolute;
    left: 0; right: 0; bottom: 0;
    height: 90px;         /* = MAX_H */
    pointer-events: none;
    z-index: 0;
  }
  .histogram-gridline {
    position: absolute;
    left: 0; right: 0;
    display: flex;
    align-items: center;
    gap: 4px;
    /* Centre le div (et donc le border-top de ::after) sur bottom: X */
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

  /* ── Tooltip valeur ──────────────────────────────────────── */
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

  /* ── Étiquettes X (rangée sous le chart) ─────────────────── */
  .histogram-xlabels {
    display: flex;
    gap: 4px;
    margin-top: 4px;
  }
  .histogram-label {
    flex: 1;
    min-width: 0;
    font-size: 9px;
    font-weight: 700;
    color: var(--c-txt-m);
    text-align: center;
    white-space: nowrap;
    overflow: hidden;
    text-overflow: ellipsis;
  }
  .histogram-label.today { color: var(--c-accent); }
</style>
