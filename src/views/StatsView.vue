<template>
  <div>
    <section class="grid grid-cols-1 xl:grid-cols-2 gap-6">
      <article class="rounded-2xl border border-slate-800 bg-slate-900 p-5">
        <div class="mb-4">
          <div>
            <h2 class="text-lg font-semibold">Top artistas</h2>
            <p class="text-xs text-slate-400 mt-1">Rendimiento por período</p>
          </div>
        </div>

        <div class="flex flex-wrap gap-2 mb-4">
          <button
            v-for="opt in rangeOptions"
            :key="`artists-${opt.key}`"
            @click="artistsRange = opt.key"
            class="rounded-lg border px-3 py-1.5 text-xs transition-colors"
            :class="artistsRange === opt.key
              ? 'border-emerald-500/40 bg-emerald-500/15 text-emerald-200'
              : 'border-slate-700 bg-slate-800 text-slate-300 hover:bg-slate-700'"
          >
            {{ opt.label }}
          </button>
        </div>

        <ul class="space-y-2 text-sm">
          <li
            v-for="(item, i) in topArtistsRange"
            :key="item.name"
            class="flex items-center justify-between rounded-xl border border-slate-800 bg-slate-800/60 px-3 py-2"
          >
            <span class="text-slate-100">{{ i + 1 }}. {{ item.name }}</span>
            <span class="text-emerald-300 font-medium">{{ item.count }}</span>
          </li>
          <li v-if="!topArtistsRange.length" class="text-slate-400 text-sm">Sin datos en este período</li>
        </ul>
      </article>

      <article class="rounded-2xl border border-slate-800 bg-slate-900 p-5">
        <div class="mb-4">
          <div>
            <h2 class="text-lg font-semibold">Top canciones</h2>
            <p class="text-xs text-slate-400 mt-1">Rendimiento por período</p>
          </div>
        </div>

        <div class="flex flex-wrap gap-2 mb-4">
          <button
            v-for="opt in rangeOptions"
            :key="`tracks-${opt.key}`"
            @click="tracksRange = opt.key"
            class="rounded-lg border px-3 py-1.5 text-xs transition-colors"
            :class="tracksRange === opt.key
              ? 'border-emerald-500/40 bg-emerald-500/15 text-emerald-200'
              : 'border-slate-700 bg-slate-800 text-slate-300 hover:bg-slate-700'"
          >
            {{ opt.label }}
          </button>
        </div>

        <ul class="space-y-2 text-sm">
          <li
            v-for="(item, i) in topTracksRange"
            :key="item.name"
            class="flex items-center justify-between rounded-xl border border-slate-800 bg-slate-800/60 px-3 py-2"
          >
            <span class="text-slate-100">{{ i + 1 }}. {{ item.name }}</span>
            <span class="text-emerald-300 font-medium">{{ item.count }}</span>
          </li>
          <li v-if="!topTracksRange.length" class="text-slate-400 text-sm">Sin datos en este período</li>
        </ul>
      </article>
    </section>

    <section class="mt-6">
      <article class="rounded-2xl border border-slate-800 bg-slate-900 p-5">
        <div class="mb-4">
          <div class="flex items-start justify-between gap-2">
            <div class="pr-2">
            <h2 class="text-lg font-semibold">Rachas de escucha</h2>
            <p class="text-xs text-slate-400 mt-1">Resumen de continuidad: cuánto mantienes el hábito de escuchar música día tras día</p>
            </div>
            <span class="inline-flex whitespace-nowrap rounded-md border border-slate-700 bg-slate-800/80 px-2 py-0.5 text-[10px] uppercase tracking-wide text-slate-400">Último año</span>
          </div>
        </div>

        <div class="grid grid-cols-1 sm:grid-cols-3 gap-3">
          <div class="rounded-xl border border-slate-800 bg-slate-800/60 px-4 py-3">
            <p class="text-xs text-slate-400">Racha actual</p>
            <p class="text-2xl font-semibold text-emerald-300 mt-1">{{ listeningStreak.current }}</p>
            <p class="text-xs text-slate-500">Días consecutivos contando desde hoy</p>
          </div>
          <div class="rounded-xl border border-slate-800 bg-slate-800/60 px-4 py-3">
            <p class="text-xs text-slate-400">Mejor racha</p>
            <p class="text-2xl font-semibold text-emerald-300 mt-1">{{ listeningStreak.best }}</p>
            <p class="text-xs text-slate-500">Récord histórico de días consecutivos</p>
          </div>
          <div class="rounded-xl border border-slate-800 bg-slate-800/60 px-4 py-3">
            <p class="text-xs text-slate-400">Días activos</p>
            <p class="text-2xl font-semibold text-emerald-300 mt-1">{{ listeningStreak.activeDays }}</p>
            <p class="text-xs text-slate-500">Total de días con escucha en el último año</p>
          </div>
        </div>
      </article>
    </section>

    <section class="mt-6">
      <article class="rounded-2xl border border-slate-800 bg-slate-900 p-5">
        <div class="mb-4">
          <div class="flex items-start justify-between gap-2">
            <div>
            <h2 class="text-lg font-semibold">Horas de escucha por mes</h2>
            </div>
            <span class="inline-flex rounded-md border border-slate-700 bg-slate-800/80 px-2 py-0.5 text-[10px] uppercase tracking-wide text-slate-400">12 meses</span>
          </div>
        </div>

        <div class="h-[26rem] md:h-[30rem]">
          <Bar :data="monthlyHoursData" :options="monthlyHoursOptions" />
        </div>
      </article>
    </section>

    <section class="mt-6">
      <article class="rounded-2xl border border-slate-800 bg-slate-900 p-5">
        <div class="mb-4">
          <div>
            <h2 class="text-lg font-semibold">Distribución por hora</h2>
            <p class="text-xs text-slate-400 mt-1">Intensidad de escucha por hora del día y día de la semana, calculada con el tiempo reproducido de los últimos 12 meses</p>
          </div>
        </div>

        <div class="pb-1">
          <div>
            <div class="grid gap-1" style="grid-template-columns: 30px repeat(7, minmax(0, 1fr));">
              <div></div>
              <div
                v-for="day in heatmapDays"
                :key="`day-head-${day}`"
                class="h-5 flex items-center justify-center text-[10px] text-slate-400"
              >
                {{ day }}
              </div>
              <template v-for="(row, rowIdx) in hourlyHeatmapRows" :key="`row-${row.hour}`">
                <div class="h-5 flex items-center text-[9px] text-slate-400">{{ row.hourLabel }}</div>
                <div
                  v-for="(cell, dayIdx) in row.cells"
                  :key="`cell-${rowIdx}-${dayIdx}`"
                  class="h-5 rounded-[4px] border border-slate-800"
                  :style="{ backgroundColor: heatColor(cell.level) }"
                  :title="`${heatmapDays[dayIdx]} ${row.hourLabel} - ${cell.hours}h`"
                />
              </template>
            </div>
          </div>
        </div>
      </article>
    </section>
  </div>
</template>

<script setup>
import { computed, ref } from 'vue'
import { Bar } from 'vue-chartjs'
import {
  Chart as ChartJS,
  CategoryScale,
  LinearScale,
  BarElement,
  Tooltip,
  Legend
} from 'chart.js'
import { useEventStore } from '@/stores/events'

ChartJS.register(CategoryScale, LinearScale, BarElement, Tooltip, Legend)

const { events } = useEventStore()

const TOP_LIMIT = 5
const MS_IN_DAY = 86400000
const MS_IN_HOUR = 3600000
const MONTHS_WINDOW = 12
const heatmapDays = ['Lun', 'Mar', 'Mié', 'Jue', 'Vie', 'Sáb', 'Dom']

const rangeOptions = [
  { key: 'week', label: 'Última semana', days: 7 },
  { key: 'month', label: 'Último mes', days: 30 },
  { key: 'sixMonths', label: 'Últimos 6 meses', days: 182 },
  { key: 'year', label: 'Último año', days: 365 }
]

const artistsRange = ref('week')
const tracksRange = ref('week')

function getEventMs (event) {
  const msPlayed = Number(event?.ms_played)
  if (Number.isFinite(msPlayed) && msPlayed > 0) return msPlayed

  const durationMs = Number(event?.duration_ms)
  if (Number.isFinite(durationMs) && durationMs > 0) return durationMs

  return 0
}

function normalizeText (value) {
  return (value || '')
    .toString()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, ' ')
    .trim()
}

function isExcludedFromRankings (event) {
  const track = normalizeText(event?.track)
  const artist = normalizeText(event?.artist)
  const combined = `${track} ${artist}`.trim()
  if (!combined) return false
  if (combined.includes('publicidad')) return true
  if (combined.includes('anuncio')) return true
  if (combined.includes('spotify')) return true
  if (track.includes('dj x') || artist.includes('dj x')) return true
  return false
}

function eventsByRange (key) {
  const opt = rangeOptions.find(item => item.key === key) || rangeOptions[0]
  const cutoff = new Date(Date.now() - (opt.days * MS_IN_DAY))
  return events.value.filter(e => new Date(e.played_at) >= cutoff && !isExcludedFromRankings(e))
}

function topFromEvents (items, selector) {
  const map = new Map()
  for (const e of items) {
    const raw = selector(e)
    const name = (raw || '').toString().trim()
    if (!name) continue
    map.set(name, (map.get(name) || 0) + 1)
  }
  return [...map.entries()]
    .sort((a, b) => b[1] - a[1])
    .slice(0, TOP_LIMIT)
    .map(([name, count]) => ({ name, count }))
}

const monthsWindow = computed(() => {
  const labels = []
  const buckets = []
  const now = new Date()

  for (let i = MONTHS_WINDOW - 1; i >= 0; i--) {
    const start = new Date(now.getFullYear(), now.getMonth() - i, 1)
    const end = new Date(start.getFullYear(), start.getMonth() + 1, 1)
    labels.push(start.toLocaleDateString('es-ES', { month: 'short', year: '2-digit' }))
    buckets.push({ start, end })
  }

  return { labels, buckets }
})

const listeningStreak = computed(() => {
  const now = new Date()
  const cutoff = new Date(now.getTime() - (365 * MS_IN_DAY))
  const dayKeys = new Set()

  for (const e of events.value) {
    const d = new Date(e.played_at)
    if (Number.isNaN(d.getTime()) || d < cutoff) continue
    const day = new Date(d.getFullYear(), d.getMonth(), d.getDate())
    dayKeys.add(day.getTime())
  }

  const sorted = [...dayKeys].sort((a, b) => a - b)
  if (!sorted.length) return { current: 0, best: 0, activeDays: 0 }

  let best = 1
  let run = 1
  for (let i = 1; i < sorted.length; i++) {
    if (sorted[i] - sorted[i - 1] === MS_IN_DAY) {
      run += 1
      if (run > best) best = run
    } else {
      run = 1
    }
  }

  const today = new Date(now.getFullYear(), now.getMonth(), now.getDate()).getTime()
  let current = 0
  if (dayKeys.has(today)) {
    current = 1
    let cursor = today - MS_IN_DAY
    while (dayKeys.has(cursor)) {
      current += 1
      cursor -= MS_IN_DAY
    }
  }

  return {
    current,
    best,
    activeDays: dayKeys.size
  }
})

const monthlyHoursData = computed(() => {
  const { labels, buckets } = monthsWindow.value
  const monthlyHours = buckets.map(({ start, end }) => {
    let totalMs = 0
    for (const e of events.value) {
      const playedAt = new Date(e.played_at)
      if (Number.isNaN(playedAt.getTime()) || playedAt < start || playedAt >= end) continue
      totalMs += getEventMs(e)
    }
    return Math.round(totalMs / MS_IN_HOUR)
  })

  return {
    labels,
    datasets: [{
      label: 'Horas',
      data: monthlyHours,
      backgroundColor: 'rgba(16, 185, 129, 0.70)',
      borderColor: 'rgba(52, 211, 153, 1)',
      borderWidth: 0,
      borderRadius: 0,
      categoryPercentage: 1,
      barPercentage: 1
    }]
  }
})

const monthlyHoursOptions = {
  responsive: true,
  maintainAspectRatio: false,
  plugins: {
    legend: {
      display: false,
      labels: { color: '#cbd5e1', boxWidth: 10, boxHeight: 10 }
    }
  },
  scales: {
    x: {
      ticks: { color: '#94a3b8' },
      grid: { color: 'rgba(148,163,184,0.10)' }
    },
    y: {
      beginAtZero: true,
      ticks: { color: '#94a3b8', precision: 0 },
      grid: { color: 'rgba(148,163,184,0.12)' }
    }
  }
}

const hourlyHeatmapRows = computed(() => {
  const dayHourMatrix = Array.from({ length: 7 }, () => Array.from({ length: 24 }, () => 0))

  const cutoff = new Date(Date.now() - (365 * MS_IN_DAY))
  let maxMs = 0

  for (const e of events.value) {
    const playedAt = new Date(e.played_at)
    if (Number.isNaN(playedAt.getTime()) || playedAt < cutoff) continue

    const dayIndex = (playedAt.getDay() + 6) % 7
    const hour = playedAt.getHours()
    const ms = getEventMs(e)
    if (ms <= 0) continue

    dayHourMatrix[dayIndex][hour] += ms
    if (dayHourMatrix[dayIndex][hour] > maxMs) maxMs = dayHourMatrix[dayIndex][hour]
  }

  return Array.from({ length: 24 }, (_, hour) => ({
    hour,
    hourLabel: `${hour.toString().padStart(2, '0')}`,
    cells: heatmapDays.map((_, dayIndex) => {
      const totalMs = dayHourMatrix[dayIndex][hour]
      return {
        hours: Math.round((totalMs / MS_IN_HOUR) * 10) / 10,
        level: maxMs > 0 ? totalMs / maxMs : 0
      }
    })
  }))
})

function heatColor (level) {
  const alpha = 0.12 + (Math.min(1, Math.max(0, level)) * 0.78)
  return `rgba(16, 185, 129, ${alpha})`
}

const topArtistsRange = computed(() => {
  return topFromEvents(eventsByRange(artistsRange.value), e => e.artist)
})

const topTracksRange = computed(() => {
  return topFromEvents(eventsByRange(tracksRange.value), e => e.track)
})
</script>
