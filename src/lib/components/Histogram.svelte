<script lang="ts">
  import type { HistoryEntry } from '$lib/firebase/types';

  interface Props {
    entries: HistoryEntry[];
    compact?: boolean;   // true pour 30 jours (affiche juste le numéro du jour)
  }

  let { entries, compact = false }: Props = $props();

  const MAX_H = 90; // hauteur max barre en px

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
    const h      = empty ? 0 : Math.round((e.points / 5) * MAX_H);
    const barCls = [e.isToday ? 'today' : '', empty ? 'empty' : ''].filter(Boolean).join(' ');
    return { e, h, barCls, label: formatDayLabel(e.date, e.isToday ?? false) };
  }));

  function toggleBar(idx: number) {
    selectedIdx = selectedIdx === idx ? null : idx;
  }
</script>

<div class="histogram-chart" role="presentation" onclick={() => (selectedIdx = null)}>
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
          <span class="histogram-val">{e.ignored ? '—' : e.points + '/5'}</span>
        {/if}
        <div class="histogram-bar {barCls}" style="height:{h}px"></div>
      </div>
      <span class="histogram-label {e.isToday ? 'today' : ''}">{label}</span>
    </div>
  {/each}
</div>

<style>
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
  }
</style>
