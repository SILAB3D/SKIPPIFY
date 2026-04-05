<template>
  <section class="rounded-2xl border border-slate-800 bg-slate-900 p-5 mt-6 overflow-hidden">
    <div class="flex flex-col lg:flex-row lg:items-center lg:justify-between gap-3 mb-4">
      <h2 class="text-lg font-semibold">Historial de reproducciones</h2>
      <div class="flex flex-wrap items-center gap-2">
        <span class="text-xs text-slate-400">{{ visibleEvents.length }} eventos</span>
        <button
          @click="openModal"
          class="flex items-center gap-1.5 rounded-lg border border-red-600 bg-transparent hover:bg-red-600/10 active:bg-red-600/20 px-3 py-2 text-sm font-medium text-red-400 hover:text-red-300 transition-colors"
        >
          <svg xmlns="http://www.w3.org/2000/svg" class="h-4 w-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
            <polyline points="3 6 5 6 21 6"/><path d="M19 6l-1 14a2 2 0 0 1-2 2H8a2 2 0 0 1-2-2L5 6"/><path d="M10 11v6"/><path d="M14 11v6"/><path d="M9 6V4h6v2"/>
          </svg>
          Eliminar historial
        </button>
      </div>
    </div>

    <!-- Search bar -->
    <div class="relative mb-3">
      <svg xmlns="http://www.w3.org/2000/svg" class="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-slate-500 pointer-events-none" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
        <circle cx="11" cy="11" r="8"/><line x1="21" y1="21" x2="16.65" y2="16.65"/>
      </svg>
      <input
        v-model="search"
        type="text"
        placeholder="Buscar canción o artista…"
        class="w-full rounded-lg bg-slate-800 border border-slate-700 text-sm text-slate-100 placeholder-slate-500 pl-9 pr-8 py-2 focus:outline-none focus:ring-1 focus:ring-emerald-500/50 focus:border-emerald-500/50 transition-colors"
      />
      <button
        v-if="search"
        @click="search = ''"
        class="absolute right-2.5 top-1/2 -translate-y-1/2 text-slate-500 hover:text-slate-300 transition-colors"
        aria-label="Limpiar búsqueda"
      >
        <svg xmlns="http://www.w3.org/2000/svg" class="h-4 w-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg>
      </button>
    </div>

    <!-- Monthly index -->
    <div class="mb-4">
      <div ref="monthFilterRef" class="month-filter-shell relative max-w-xs">
        <svg
          xmlns="http://www.w3.org/2000/svg"
          class="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-emerald-400/80"
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          stroke-width="2"
          stroke-linecap="round"
          stroke-linejoin="round"
        >
          <rect x="3" y="4" width="18" height="18" rx="2" ry="2" />
          <line x1="16" y1="2" x2="16" y2="6" />
          <line x1="8" y1="2" x2="8" y2="6" />
          <line x1="3" y1="10" x2="21" y2="10" />
        </svg>
        <button
          type="button"
          @click="toggleMonthMenu"
          class="month-filter-select w-full text-left rounded-lg bg-slate-800/90 border border-slate-700/90 text-sm text-slate-100 font-medium pl-9 pr-9 py-2.5 hover:border-slate-500 focus:outline-none focus:ring-1 focus:ring-emerald-500/50 focus:border-emerald-500/50 transition-colors"
        >
          {{ selectedMonthLabel }}
        </button>
        <svg
          xmlns="http://www.w3.org/2000/svg"
          class="pointer-events-none absolute right-2.5 top-1/2 -translate-y-1/2 h-4 w-4 text-slate-400 transition-transform duration-150"
          :class="monthMenuOpen ? 'rotate-180' : ''"
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          stroke-width="2"
          stroke-linecap="round"
          stroke-linejoin="round"
        >
          <polyline points="6 9 12 15 18 9" />
        </svg>

        <Transition name="month-menu">
          <div
            v-if="monthMenuOpen"
            class="absolute z-20 mt-2 w-full rounded-xl border border-slate-700 bg-slate-900/95 backdrop-blur-sm shadow-2xl overflow-hidden"
          >
            <button
              type="button"
              @click="selectMonth('all')"
              class="w-full text-left px-3 py-2 text-sm transition-colors"
              :class="selectedMonth === 'all' ? 'bg-emerald-500/15 text-emerald-200' : 'text-slate-200 hover:bg-slate-800'"
            >
              Todos
            </button>
            <button
              v-for="item in monthIndex"
              :key="`month-opt-${item.key}`"
              type="button"
              @click="selectMonth(item.key)"
              class="w-full text-left px-3 py-2 text-sm transition-colors"
              :class="selectedMonth === item.key ? 'bg-emerald-500/15 text-emerald-200' : 'text-slate-200 hover:bg-slate-800'"
            >
              {{ item.label }} ({{ item.count }})
            </button>
          </div>
        </Transition>
      </div>
    </div>

    <p v-if="feedback" class="text-xs text-slate-400 mb-3">{{ feedback }}</p>

    <div class="overflow-x-auto overflow-y-auto max-h-[600px]">
      <table class="w-full text-sm">
        <thead class="sticky top-0 bg-slate-900 z-10">
          <tr class="text-slate-400 border-b border-slate-800">
            <th class="text-left py-2 pr-4">Canción</th>
            <th class="text-left py-2 pr-4">Artista</th>
            <th class="text-left py-2 w-px whitespace-nowrap">Fecha</th>
          </tr>
        </thead>
        <tbody>
          <tr
            v-for="e in filteredEvents"
            :key="e.played_at + e.track + e.artist"
            class="border-b border-slate-800/80"
          >
            <td class="py-2 pr-4">{{ e.track }}</td>
            <td class="py-2 pr-4 text-slate-300">
              <span v-if="!hasMultipleArtists(e.artist)">{{ firstArtistName(e.artist) }}</span>
              <button
                v-else
                type="button"
                class="inline-flex items-start gap-1 rounded px-1 -ml-1 select-none hover:bg-slate-800/70 active:bg-slate-700/80 transition-colors"
                :aria-label="`Mostrar artistas de ${e.track}`"
                @pointerdown="startArtistPress($event, e.artist)"
                @pointerup="endArtistPress"
                @pointercancel="endArtistPress"
                @pointerleave="endArtistPress"
              >
                <span>{{ firstArtistName(e.artist) }}</span>
                <sup class="text-[10px] text-slate-400 font-semibold">{{ artistCount(e.artist) }}</sup>
              </button>
            </td>
            <td class="py-2 w-px text-slate-400 text-xs leading-tight">
              <div>{{ formatDateParts(e.played_at).date }}</div>
              <div class="text-slate-500">{{ formatDateParts(e.played_at).time }}</div>
            </td>
          </tr>
          <tr v-if="!filteredEvents.length">
            <td colspan="3" class="py-3 text-slate-400">{{ search ? 'Sin resultados para "' + search + '"' : 'No hay reproducciones registradas' }}</td>
          </tr>
        </tbody>
      </table>
    </div>

    <Transition name="artist-tip">
      <div
        v-if="artistTooltip.visible"
        class="fixed z-40 max-w-xs rounded-lg border border-slate-600 bg-slate-950/95 px-2.5 py-1.5 text-[11px] text-slate-100 shadow-2xl pointer-events-none"
        :style="artistTooltipStyle"
      >
        {{ artistTooltip.text }}
      </div>
    </Transition>
  </section>

  <!-- Delete history modal -->
  <Transition name="modal">
    <div
      v-if="showModal"
      class="fixed inset-0 z-50 flex items-center justify-center p-4"
    >
      <div class="absolute inset-0 bg-black/60 backdrop-blur-sm" @click="showModal = false" />
      <div class="relative bg-slate-900 border border-slate-700 rounded-2xl shadow-2xl w-full max-w-sm p-6">

        <!-- Header -->
        <div class="flex items-center gap-3 mb-6">
          <div class="flex h-10 w-10 items-center justify-center rounded-full bg-red-600/20">
            <svg xmlns="http://www.w3.org/2000/svg" class="h-5 w-5 text-red-400" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
              <polyline points="3 6 5 6 21 6"/><path d="M19 6l-1 14a2 2 0 0 1-2 2H8a2 2 0 0 1-2-2L5 6"/><path d="M10 11v6"/><path d="M14 11v6"/><path d="M9 6V4h6v2"/>
            </svg>
          </div>
          <div>
            <h3 class="font-semibold text-white">Eliminar historial</h3>
            <p class="text-xs text-slate-400">Arrastra para seleccionar el rango</p>
          </div>
        </div>

        <!-- Selected label -->
        <div class="mb-4 text-center">
          <span
            class="inline-block rounded-lg px-4 py-1.5 text-sm font-semibold transition-colors"
            :class="sliderIndex === steps.length - 1
              ? 'bg-red-600/20 text-red-300 border border-red-600/40'
              : 'bg-slate-800 text-slate-100 border border-slate-700'"
          >
            {{ steps[sliderIndex].label }}
          </span>
        </div>

        <!-- Slider -->
        <div class="px-1 mb-3">
          <input
            v-model.number="sliderIndex"
            type="range"
            min="0"
            :max="steps.length - 1"
            step="1"
            class="slider w-full"
            :style="{ '--pct': sliderPct }"
          />
          <!-- Tick labels -->
          <div class="flex justify-between mt-2">
            <span
              v-for="(s, i) in steps"
              :key="i"
              class="text-[10px] text-center transition-colors"
              :class="i === sliderIndex ? 'text-slate-200 font-semibold' : 'text-slate-600'"
              :style="{ width: (100 / steps.length) + '%' }"
            >{{ s.tick }}</span>
          </div>
        </div>

        <!-- Warning for "all" -->
        <p v-if="sliderIndex === steps.length - 1" class="text-xs text-red-400/80 text-center mb-4">
          ⚠ Esta acción eliminará todo el historial y no se puede deshacer.
        </p>
        <p v-else class="text-xs text-slate-500 text-center mb-4">
          Se eliminarán los eventos anteriores a {{ steps[sliderIndex].label.toLowerCase() }}.
        </p>

        <!-- Actions -->
        <div class="flex gap-2">
          <button
            @click="showModal = false"
            class="flex-1 rounded-lg bg-slate-800 hover:bg-slate-700 px-4 py-2.5 text-sm text-slate-300 transition-colors"
          >
            Cancelar
          </button>
          <button
            @click="confirmDelete"
            class="flex-1 rounded-lg px-4 py-2.5 text-sm font-semibold transition-colors"
            :class="sliderIndex === steps.length - 1
              ? 'bg-red-600 hover:bg-red-500 text-white'
              : 'bg-red-600/20 hover:bg-red-600/35 text-red-300 border border-red-600/40'"
          >
            Eliminar
          </button>
        </div>
      </div>
    </div>
  </Transition>
</template>

<script setup>
import { ref, computed, watchEffect, onMounted, onBeforeUnmount } from 'vue'
import { useEventStore } from '@/stores/events'

const { events, clearEvents, deleteOlderThan } = useEventStore()

const showModal  = ref(false)
const feedback   = ref('')
const sliderIndex = ref(0)
const search = ref('')
const selectedMonth = ref('all')
const monthMenuOpen = ref(false)
const monthFilterRef = ref(null)
const artistTooltip = ref({ visible: false, text: '', x: 0, y: 0 })
const activeArtistTrigger = ref(null)

let artistPressTimer = null
const LONG_PRESS_MS = 420

function normalizeText (value) {
  return (value || '')
    .toString()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, ' ')
    .trim()
}

function isExcludedEntry (event) {
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

function splitArtists (artistValue) {
  return (artistValue || '')
    .split(',')
    .map(name => name.trim())
    .filter(Boolean)
}

function firstArtistName (artistValue) {
  const artists = splitArtists(artistValue)
  return artists[0] || 'Desconocido'
}

function artistCount (artistValue) {
  const count = splitArtists(artistValue).length
  return count || 1
}

function hasMultipleArtists (artistValue) {
  return artistCount(artistValue) > 1
}

const artistTooltipStyle = computed(() => ({
  left: `${artistTooltip.value.x}px`,
  top: `${artistTooltip.value.y}px`,
  transform: 'translate(-50%, -110%)'
}))

function startArtistPress (event, artistValue) {
  clearArtistPressTimer()
  const artists = splitArtists(artistValue)
  if (artists.length <= 1) return

  const target = event.currentTarget
  artistPressTimer = setTimeout(() => {
    const rect = target.getBoundingClientRect()
    activeArtistTrigger.value = target
    artistTooltip.value = {
      visible: true,
      text: artists.join(', '),
      x: rect.left + (rect.width / 2),
      y: rect.top
    }
    artistPressTimer = null
  }, LONG_PRESS_MS)
}

function endArtistPress () {
  clearArtistPressTimer()
}

function clearArtistPressTimer () {
  if (artistPressTimer) {
    clearTimeout(artistPressTimer)
    artistPressTimer = null
  }
}

function hideArtistTooltip () {
  artistTooltip.value.visible = false
  activeArtistTrigger.value = null
}

function handleOutsideArtistTooltip (event) {
  if (!artistTooltip.value.visible) return
  if (activeArtistTrigger.value?.contains(event.target)) return
  hideArtistTooltip()
}

const visibleEvents = computed(() => events.value.filter(e => !isExcludedEntry(e)))

function monthKeyFromIso (iso) {
  const d = new Date(iso)
  if (!Number.isFinite(d.getTime())) return ''
  const m = String(d.getMonth() + 1).padStart(2, '0')
  return `${d.getFullYear()}-${m}`
}

const monthIndex = computed(() => {
  const map = new Map()
  for (const e of visibleEvents.value) {
    const key = monthKeyFromIso(e.played_at)
    if (!key) continue
    map.set(key, (map.get(key) || 0) + 1)
  }

  return [...map.entries()]
    .sort((a, b) => b[0].localeCompare(a[0]))
    .map(([key, count]) => {
      const [y, m] = key.split('-').map(Number)
      const labelRaw = new Date(y, m - 1, 1).toLocaleDateString('es-ES', {
        month: 'long',
        year: 'numeric'
      })
      const label = labelRaw.charAt(0).toUpperCase() + labelRaw.slice(1)
      return { key, label, count }
    })
})

watchEffect(() => {
  if (selectedMonth.value === 'all') return
  if (!monthIndex.value.some(item => item.key === selectedMonth.value)) {
    selectedMonth.value = 'all'
  }
})

const filteredEvents = computed(() => {
  const q = search.value.trim().toLowerCase()
  return visibleEvents.value.filter(e => {
    const sameMonth = selectedMonth.value === 'all' || monthKeyFromIso(e.played_at) === selectedMonth.value
    if (!sameMonth) return false
    if (!q) return true
    return e.track?.toLowerCase().includes(q) || e.artist?.toLowerCase().includes(q)
  })
})

const selectedMonthLabel = computed(() => {
  if (selectedMonth.value === 'all') return 'Todos'
  const item = monthIndex.value.find(x => x.key === selectedMonth.value)
  return item ? `${item.label} (${item.count})` : 'Todos'
})

function toggleMonthMenu () {
  monthMenuOpen.value = !monthMenuOpen.value
}

function selectMonth (value) {
  selectedMonth.value = value
  monthMenuOpen.value = false
}

function handleOutsideMonthMenu (event) {
  if (!monthMenuOpen.value) return
  const root = monthFilterRef.value
  if (!root) return
  if (root.contains(event.target)) return
  monthMenuOpen.value = false
}

onMounted(() => {
  document.addEventListener('click', handleOutsideMonthMenu)
  document.addEventListener('pointerdown', handleOutsideArtistTooltip)
})

onBeforeUnmount(() => {
  document.removeEventListener('click', handleOutsideMonthMenu)
  document.removeEventListener('pointerdown', handleOutsideArtistTooltip)
  endArtistPress()
  hideArtistTooltip()
})

const sliderPct = computed(() =>
  (sliderIndex.value / (steps.length - 1)) * 100
)

const steps = [
  { value: 1,     label: '1 mes',           tick: '1m'  },
  { value: 3,     label: '3 meses',          tick: '3m'  },
  { value: 5,     label: '5 meses',          tick: '5m'  },
  { value: 10,    label: '10 meses',         tick: '10m' },
  { value: 'all', label: 'Todo el historial', tick: 'Todo' },
]

function openModal () {
  sliderIndex.value = 0
  showModal.value = true
}

function formatDateParts (iso) {
  const d = new Date(iso)
  if (!Number.isFinite(d.getTime())) {
    return { date: '-', time: '--:--' }
  }

  return {
    date: d.toLocaleDateString('es-ES', {
      day: '2-digit', month: '2-digit', year: 'numeric'
    }),
    time: d.toLocaleTimeString('es-ES', {
      hour: '2-digit', minute: '2-digit', hour12: false
    })
  }
}

function confirmDelete () {
  const step = steps[sliderIndex.value]
  showModal.value = false
  if (step.value === 'all') {
    const before = events.value.length
    clearEvents()
    feedback.value = `Se eliminaron ${before} eventos. Quedan 0.`
  } else {
    const removed = deleteOlderThan(step.value)
    feedback.value = `Se eliminaron ${removed} eventos. Quedan ${events.value.length}.`
  }
}
</script>

<style scoped>
.month-filter-shell {
  border-radius: 0.75rem;
  box-shadow: 0 0 0 1px rgba(16, 185, 129, 0.08) inset;
}

.month-filter-select {
  letter-spacing: 0.01em;
  box-shadow: 0 8px 24px rgba(2, 6, 23, 0.28), 0 0 0 1px rgba(148, 163, 184, 0.04) inset;
}

.month-menu-enter-active,
.month-menu-leave-active {
  transition: opacity 0.15s ease, transform 0.15s ease;
}

.month-menu-enter-from,
.month-menu-leave-to {
  opacity: 0;
  transform: translateY(-4px);
}

.artist-tip-enter-active,
.artist-tip-leave-active {
  transition: opacity 0.14s ease, transform 0.14s ease;
}

.artist-tip-enter-from,
.artist-tip-leave-to {
  opacity: 0;
  transform: translate(-50%, -90%);
}

/* Slider track */
.slider {
  -webkit-appearance: none;
  appearance: none;
  width: 100%;
  height: 4px;
  border-radius: 9999px;
  background: linear-gradient(
    to right,
    #ef4444 0%,
    #ef4444 calc(var(--pct) * 1%),
    #334155 calc(var(--pct) * 1%),
    #334155 100%
  );
  outline: none;
  cursor: pointer;
}

.slider::-webkit-slider-thumb {
  -webkit-appearance: none;
  appearance: none;
  width: 20px;
  height: 20px;
  border-radius: 50%;
  background: #ef4444;
  border: 2px solid #fca5a5;
  box-shadow: 0 0 0 4px rgba(239, 68, 68, 0.15);
  cursor: pointer;
  transition: box-shadow 0.15s ease;
}

.slider::-webkit-slider-thumb:hover {
  box-shadow: 0 0 0 6px rgba(239, 68, 68, 0.25);
}

.slider::-moz-range-thumb {
  width: 20px;
  height: 20px;
  border-radius: 50%;
  background: #ef4444;
  border: 2px solid #fca5a5;
  box-shadow: 0 0 0 4px rgba(239, 68, 68, 0.15);
  cursor: pointer;
}

.modal-enter-active,
.modal-leave-active {
  transition: opacity 0.2s ease;
}
.modal-enter-from,
.modal-leave-to {
  opacity: 0;
}
.modal-enter-active .relative,
.modal-leave-active .relative {
  transition: transform 0.2s ease, opacity 0.2s ease;
}
.modal-enter-from .relative,
.modal-leave-to .relative {
  transform: scale(0.95);
  opacity: 0;
}
</style>
