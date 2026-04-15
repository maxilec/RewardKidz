<script lang="ts">
  import type { HistoryEntry } from '$lib/firebase/types';

  interface Props {
    entries: HistoryEntry[];
    compact?: boolean;   // true pour 30 jours (affiche juste le numéro du jour)
  }

  let { entries, compact = false }: Props = $props();

  const MAX_H = 90; // hauteur max barre en px

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
    return { e, h, barCls, label: formatDayLabel(e.date, e.isToday) };
  }));
</script>

<div class="histogram-chart">
  {#each bars as { e, h, barCls, label }}
    <div class="histogram-bar-group">
      <div class="histogram-bar-wrap">
        <div class="histogram-bar {barCls}" style="height:{h}px"></div>
      </div>
      <span class="histogram-label {e.isToday ? 'today' : ''}">{label}</span>
    </div>
  {/each}
</div>
