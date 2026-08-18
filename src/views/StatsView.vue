<template>
  <div class="sk-stagger space-y-5">
    <!-- ── Rankings ────────────────────────────────────────────────────────── -->
    <section class="grid grid-cols-1 gap-5 xl:grid-cols-2">
      <article
        v-for="board in boards"
        :key="board.id"
        class="sk-card sk-card-lit p-5"
      >
        <header class="mb-4 flex flex-wrap items-start justify-between gap-2">
          <div>
            <h2 class="sk-title">{{ board.title }}</h2>
            <p class="sk-subtitle">{{ board.subtitle }}</p>
          </div>
          <span class="sk-chip">Top {{ TOP_LIMIT }}</span>
        </header>

        <div class="sk-segment mb-4">
          <button
            v-for="opt in rangeOptions"
            :key="`${board.id}-${opt.key}`"
            type="button"
            class="sk-segment-item"
            :class="board.range.value === opt.key ? 'sk-segment-item-active' : ''"
            @click="board.range.value = opt.key"
          >
            {{ opt.short }}
          </button>
        </div>

        <ul class="space-y-1.5">
          <li
            v-for="(item, i) in board.items.value"
            :key="item.name"
            class="relative overflow-hidden rounded-xl border border-white/[0.05] bg-white/[0.02] px-3 py-2.5"
          >
            <!-- Barra proporcional al líder: da escala sin añadir un gráfico -->
            <div
              class="absolute inset-y-0 left-0 bg-gradient-to-r from-brand-500/16 to-transparent"
              :style="{ width: `${leadShare(board.items.value, item)}%` }"
            />
            <div class="relative flex items-center gap-3">
              <span
                class="flex h-6 w-6 shrink-0 items-center justify-center rounded-lg text-[11px] font-bold"
                :class="i === 0 ? 'bg-brand-500/22 text-brand-200' : 'bg-white/[0.05] text-slate-400'"
              >{{ i + 1 }}</span>
              <span class="min-w-0 flex-1 truncate text-sm text-slate-100">{{ item.name }}</span>
              <span class="shrink-0 font-mono text-sm font-semibold text-brand-300">{{ item.count }}</span>
            </div>
          </li>
          <li v-if="!board.items.value.length" class="rounded-xl border border-dashed border-white/[0.08] px-3 py-6 text-center text-xs text-slate-500">
            Sin datos en este período
          </li>
        </ul>
      </article>
    </section>

    <!-- ── Rachas ──────────────────────────────────────────────────────────── -->
    <section class="sk-card sk-card-lit p-5">
      <header class="mb-4 flex flex-wrap items-start justify-between gap-2">
        <div>
          <h2 class="sk-title">Rachas de escucha</h2>
          <p class="sk-subtitle">Cuánto mantienes el hábito de escuchar música día tras día</p>
        </div>
        <span class="sk-chip">Último año</span>
      </header>

      <div class="grid grid-cols-1 gap-3 sm:grid-cols-3">
        <div
          v-for="streak in streakCards"
          :key="streak.label"
          class="rounded-xl border border-white/[0.06] bg-white/[0.02] px-4 py-3.5"
        >
          <p class="sk-eyebrow">{{ streak.label }}</p>
          <p class="mt-1.5 flex items-baseline gap-1.5">
            <span class="text-3xl font-bold leading-none text-brand-300">{{ streak.value }}</span>
            <span class="text-xs text-slate-500">días</span>
          </p>
          <p class="sk-stat-hint">{{ streak.hint }}</p>
        </div>
      </div>
    </section>

    <!-- ── Horas por mes ───────────────────────────────────────────────────── -->
    <section class="sk-card sk-card-lit p-5">
      <header class="mb-4 flex flex-wrap items-start justify-between gap-2">
        <div>
          <h2 class="sk-title">Horas de escucha por mes</h2>
          <p class="sk-subtitle">Tiempo reproducido agregado mes a mes</p>
        </div>
        <span class="sk-chip">12 meses</span>
      </header>

      <div class="h-72 sm:h-80">
        <Bar :data="monthlyHoursData" :options="monthlyHoursOptions" />
      </div>
    </section>

    <!-- ── Heatmap ─────────────────────────────────────────────────────────── -->
    <section class="sk-card sk-card-lit p-5">
      <header class="mb-4 flex flex-wrap items-start justify-between gap-2">
        <div>
          <h2 class="sk-title">Distribución por hora</h2>
          <p class="sk-subtitle">
            Intensidad de escucha por hora y día de la semana, con el tiempo reproducido de los últimos 12 meses
          </p>
        </div>
        <span class="sk-chip">
          <span class="h-1.5 w-1.5 animate-pulse rounded-full bg-brand-400" />
          En vivo
        </span>
      </header>

      <!-- Resumen global: cuándo escuchas más, sin tener que leer la rejilla -->
      <div class="mb-4 flex flex-wrap gap-2">
        <span
          v-for="(peak, i) in peakHours"
          :key="peak.hour"
          class="sk-chip"
          :class="i === 0 ? 'sk-chip-accent' : ''"
        >
          {{ i === 0 ? '🔥' : '·' }} {{ peak.label }} — {{ peak.hours }} h
        </span>
        <span v-if="!peakHours.length" class="sk-chip">Sin escuchas registradas todavía</span>
      </div>

      <div class="overflow-x-auto pb-1">
        <div class="min-w-[420px]">
          <div class="grid gap-1" style="grid-template-columns: 30px repeat(7, minmax(0, 1fr)) 46px;">
            <div />
            <div
              v-for="day in heatmapDays"
              :key="`day-head-${day}`"
              class="flex h-5 items-center justify-center text-[10px] font-medium text-slate-400"
            >{{ day }}</div>
            <div class="flex h-5 items-center justify-center text-[9px] uppercase tracking-wider text-slate-500">Global</div>

            <template v-for="(row, rowIdx) in hourlyHeatmapRows" :key="`row-${row.hour}`">
              <!-- La etiqueta de la hora se enciende si es una de las punta -->
              <div
                class="flex h-5 items-center text-[9px] tabular-nums transition-colors"
                :class="row.isPeak ? 'font-bold text-brand-300' : 'text-slate-500'"
              >{{ row.hourLabel }}</div>
              <div
                v-for="(cell, dayIdx) in row.cells"
                :key="`cell-${rowIdx}-${dayIdx}`"
                class="h-5 rounded-[4px] border border-white/[0.04]"
                :style="{ backgroundColor: heatColor(cell.level) }"
                :title="`${heatmapDays[dayIdx]} ${row.hourLabel}:00 — ${cell.hours} h`"
              />
              <!-- Columna global: el total de esa hora en toda la semana -->
              <div
                class="relative h-5 overflow-hidden rounded-[4px] border"
                :class="row.isPeak ? 'border-brand-400/45' : 'border-white/[0.06]'"
                :title="`Total ${row.hourLabel}:00 — ${row.totalHours} h`"
              >
                <div
                  class="absolute inset-y-0 left-0"
                  :style="{ width: `${row.globalLevel * 100}%`, backgroundColor: heatColor(row.globalLevel) }"
                />
              </div>
            </template>
          </div>
        </div>
      </div>

      <div class="mt-4 flex items-center justify-end gap-2">
        <span class="text-[10px] text-slate-500">Menos</span>
        <span
          v-for="step in [0, 0.25, 0.5, 0.75, 1]"
          :key="`legend-${step}`"
          class="h-3 w-5 rounded-[3px] border border-white/[0.05]"
          :style="{ backgroundColor: heatColor(step) }"
        />
        <span class="text-[10px] text-slate-500">Más</span>
      </div>
    </section>
  </div>
</template>

<script setup>
import { computed, onBeforeUnmount, onMounted, ref } from 'vue'
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
const PEAK_COUNT = 3
const heatmapDays = ['Lun', 'Mar', 'Mié', 'Jue', 'Vie', 'Sáb', 'Dom']

const rangeOptions = [
  { key: 'week', label: 'Última semana', short: '7 d', days: 7 },
  { key: 'month', label: 'Último mes', short: '30 d', days: 30 },
  { key: 'sixMonths', label: 'Últimos 6 meses', short: '6 m', days: 182 },
  { key: 'year', label: 'Último año', short: '1 año', days: 365 }
]

const artistsRange = ref('week')
const tracksRange = ref('week')

/**
 * Reloj compartido de la vista. Sin él, todo lo que dependía de `Date.now()`
 * dentro de un `computed` quedaba cacheado para siempre: ni la ventana de 12
 * meses ni el mapa de calor avanzaban con la app abierta.
 */
const nowTick = ref(Date.now())
let clockTimer = null

function refreshClock () {
  nowTick.value = Date.now()
}

onMounted(() => {
  clockTimer = setInterval(refreshClock, 60_000)
  // Al volver del segundo plano el intervalo puede haberse ralentizado.
  document.addEventListener('visibilitychange', onVisibility)
})

onBeforeUnmount(() => {
  if (clockTimer) clearInterval(clockTimer)
  document.removeEventListener('visibilitychange', onVisibility)
})

function onVisibility () {
  if (document.visibilityState === 'visible') refreshClock()
}

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
    .replace(/\p{Diacritic}/gu, '')
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
  const cutoff = new Date(nowTick.value - (opt.days * MS_IN_DAY))
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

const topArtistsRange = computed(() => topFromEvents(eventsByRange(artistsRange.value), e => e.artist))
const topTracksRange = computed(() => topFromEvents(eventsByRange(tracksRange.value), e => e.track))

const boards = [
  {
    id: 'artists',
    title: 'Top artistas',
    subtitle: 'Quién domina tu rotación en el período elegido',
    range: artistsRange,
    items: topArtistsRange
  },
  {
    id: 'tracks',
    title: 'Top canciones',
    subtitle: 'Las que más veces han sonado en el período elegido',
    range: tracksRange,
    items: topTracksRange
  }
]

function leadShare (items, item) {
  const max = items[0]?.count || 0
  return max ? Math.round((item.count / max) * 100) : 0
}

const monthsWindow = computed(() => {
  const labels = []
  const buckets = []
  const now = new Date(nowTick.value)

  for (let i = MONTHS_WINDOW - 1; i >= 0; i--) {
    const start = new Date(now.getFullYear(), now.getMonth() - i, 1)
    const end = new Date(start.getFullYear(), start.getMonth() + 1, 1)
    labels.push(start.toLocaleDateString('es-ES', { month: 'short', year: '2-digit' }))
    buckets.push({ start, end })
  }

  return { labels, buckets }
})

/** Nº de días desde 1970 en hora local (inmune a cambios de horario/DST). */
function localDayNumber (date) {
  return Math.floor(
    (Date.UTC(date.getFullYear(), date.getMonth(), date.getDate()) / MS_IN_DAY)
  )
}

const listeningStreak = computed(() => {
  const now = new Date(nowTick.value)
  const cutoff = new Date(now.getTime() - (365 * MS_IN_DAY))
  // Antes se comparaban timestamps de medianoche local con `=== 86400000`.
  // En los cambios de hora (Europe/Madrid) la diferencia real es de 23 h o 25 h,
  // así que la racha se rompía dos veces al año sin motivo.
  const dayNumbers = new Set()

  for (const e of events.value) {
    const d = new Date(e.played_at)
    if (Number.isNaN(d.getTime()) || d < cutoff) continue
    dayNumbers.add(localDayNumber(d))
  }

  const sorted = [...dayNumbers].sort((a, b) => a - b)
  if (!sorted.length) return { current: 0, best: 0, activeDays: 0 }

  let best = 1
  let run = 1
  for (let i = 1; i < sorted.length; i++) {
    if (sorted[i] - sorted[i - 1] === 1) {
      run += 1
      if (run > best) best = run
    } else {
      run = 1
    }
  }

  const today = localDayNumber(now)
  let current = 0
  // La racha sigue viva si hubo escucha hoy o ayer (a las 00:30 aún no hay
  // reproducciones de "hoy" y la racha se mostraba como 0).
  const anchor = dayNumbers.has(today) ? today : (dayNumbers.has(today - 1) ? today - 1 : null)
  if (anchor !== null) {
    current = 1
    let cursor = anchor - 1
    while (dayNumbers.has(cursor)) {
      current += 1
      cursor -= 1
    }
  }

  return { current, best, activeDays: dayNumbers.size }
})

const streakCards = computed(() => [
  { label: 'Racha actual', value: listeningStreak.value.current, hint: 'Días consecutivos contando desde hoy' },
  { label: 'Mejor racha', value: listeningStreak.value.best, hint: 'Récord histórico de días consecutivos' },
  { label: 'Días activos', value: listeningStreak.value.activeDays, hint: 'Total con escucha en el último año' }
])

const monthlyHoursData = computed(() => {
  const { labels, buckets } = monthsWindow.value
  // Un solo recorrido de los eventos en lugar de 12 (uno por mes).
  const totals = new Array(buckets.length).fill(0)
  const firstStart = buckets[0]?.start
  const lastEnd = buckets[buckets.length - 1]?.end
  const bucketIndexByKey = new Map(
    buckets.map(({ start }, i) => [`${start.getFullYear()}-${start.getMonth()}`, i])
  )

  for (const e of events.value) {
    const playedAt = new Date(e.played_at)
    if (Number.isNaN(playedAt.getTime())) continue
    if (firstStart && playedAt < firstStart) continue
    if (lastEnd && playedAt >= lastEnd) continue
    const idx = bucketIndexByKey.get(`${playedAt.getFullYear()}-${playedAt.getMonth()}`)
    if (idx === undefined) continue
    totals[idx] += getEventMs(e)
  }

  return {
    labels,
    datasets: [{
      label: 'Horas',
      data: totals.map(totalMs => Math.round(totalMs / MS_IN_HOUR)),
      backgroundColor: 'rgba(16, 185, 129, 0.55)',
      hoverBackgroundColor: 'rgba(52, 211, 153, 0.85)',
      borderWidth: 0,
      borderRadius: 6,
      categoryPercentage: 0.9,
      barPercentage: 0.82
    }]
  }
})

const monthlyHoursOptions = {
  responsive: true,
  maintainAspectRatio: false,
  plugins: {
    legend: { display: false },
    tooltip: {
      backgroundColor: 'rgba(5, 11, 20, 0.95)',
      borderColor: 'rgba(52, 211, 153, 0.3)',
      borderWidth: 1,
      titleColor: '#e2e8f0',
      bodyColor: '#a7f3d0',
      padding: 10,
      displayColors: false
    }
  },
  scales: {
    x: {
      ticks: { color: '#64748b', font: { size: 11 } },
      grid: { display: false },
      border: { display: false }
    },
    y: {
      beginAtZero: true,
      ticks: { color: '#64748b', precision: 0, font: { size: 11 }, maxTicksLimit: 6 },
      grid: { color: 'rgba(148,163,184,0.08)' },
      border: { display: false }
    }
  }
}

/**
 * Matriz día × hora de los últimos 12 meses.
 *
 * Depende de `events` y de `nowTick`, así que se recalcula tanto cuando entra
 * una reproducción nueva como cuando avanza el reloj: antes la ventana de corte
 * se congelaba en el instante en que se abría la pestaña.
 *
 * Además del nivel por celda se calcula el total global de cada hora (sumando
 * los siete días) para poder destacar las horas de mayor escucha del conjunto.
 */
const hourlyHeatmap = computed(() => {
  const dayHourMatrix = Array.from({ length: 7 }, () => new Array(24).fill(0))
  const hourTotals = new Array(24).fill(0)

  const cutoff = nowTick.value - (365 * MS_IN_DAY)
  let maxCellMs = 0

  for (const e of events.value) {
    const playedAt = new Date(e.played_at)
    if (Number.isNaN(playedAt.getTime()) || playedAt.getTime() < cutoff) continue

    const ms = getEventMs(e)
    if (ms <= 0) continue

    const dayIndex = (playedAt.getDay() + 6) % 7
    const hour = playedAt.getHours()

    dayHourMatrix[dayIndex][hour] += ms
    hourTotals[hour] += ms
    if (dayHourMatrix[dayIndex][hour] > maxCellMs) maxCellMs = dayHourMatrix[dayIndex][hour]
  }

  const maxHourMs = Math.max(...hourTotals)

  // Las horas punta son globales (todos los días juntos): es lo que se pide
  // resaltar, y no coincide necesariamente con la celda individual más intensa.
  const peakHourIndexes = new Set(
    hourTotals
      .map((ms, hour) => ({ ms, hour }))
      .filter(item => item.ms > 0)
      .sort((a, b) => b.ms - a.ms)
      .slice(0, PEAK_COUNT)
      .map(item => item.hour)
  )

  const rows = Array.from({ length: 24 }, (_, hour) => ({
    hour,
    hourLabel: hour.toString().padStart(2, '0'),
    isPeak: peakHourIndexes.has(hour),
    totalHours: Math.round((hourTotals[hour] / MS_IN_HOUR) * 10) / 10,
    globalLevel: maxHourMs > 0 ? hourTotals[hour] / maxHourMs : 0,
    cells: heatmapDays.map((_, dayIndex) => {
      const totalMs = dayHourMatrix[dayIndex][hour]
      return {
        hours: Math.round((totalMs / MS_IN_HOUR) * 10) / 10,
        level: maxCellMs > 0 ? totalMs / maxCellMs : 0
      }
    })
  }))

  const peaks = [...peakHourIndexes]
    .sort((a, b) => hourTotals[b] - hourTotals[a])
    .map(hour => ({
      hour,
      label: `${hour.toString().padStart(2, '0')}:00`,
      hours: Math.round((hourTotals[hour] / MS_IN_HOUR) * 10) / 10
    }))

  return { rows, peaks }
})

const hourlyHeatmapRows = computed(() => hourlyHeatmap.value.rows)
const peakHours = computed(() => hourlyHeatmap.value.peaks)

function heatColor (level) {
  // La curva raíz evita que sólo la hora récord se vea: con escuchas muy
  // concentradas, una escala lineal dejaba el resto de la rejilla casi negra.
  const eased = Math.sqrt(Math.min(1, Math.max(0, level)))
  const alpha = 0.08 + (eased * 0.84)
  return `rgba(16, 185, 129, ${alpha})`
}
</script>
