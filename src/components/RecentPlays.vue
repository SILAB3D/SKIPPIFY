<template>
  <section class="sk-card sk-card-lit overflow-hidden p-5">
    <div class="flex flex-col lg:flex-row lg:items-center lg:justify-between gap-3 mb-4">
      <div>
        <h2 class="sk-title">Historial de reproducciones</h2>
        <p class="sk-subtitle">Todo lo que Skippify ha registrado, buscable y filtrable por mes</p>
      </div>
      <div class="flex flex-wrap items-center gap-2">
        <span class="sk-chip">{{ visibleEvents.length }} eventos</span>
        <button
          @click="openModal"
          class="sk-btn sk-btn-danger sk-btn-sm"
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
        class="sk-input pl-9 pr-8"
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
          class="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-brand-400/80"
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
          class="sk-input month-filter-select pl-9 pr-9 text-left font-medium"
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
              :class="selectedMonth === 'all' ? 'bg-brand-500/15 text-brand-200' : 'text-slate-200 hover:bg-slate-800'"
            >
              Todos
            </button>
            <button
              v-for="item in monthIndex"
              :key="`month-opt-${item.key}`"
              type="button"
              @click="selectMonth(item.key)"
              class="w-full text-left px-3 py-2 text-sm transition-colors"
              :class="selectedMonth === item.key ? 'bg-brand-500/15 text-brand-200' : 'text-slate-200 hover:bg-slate-800'"
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
        <thead class="sticky top-0 z-10 bg-slate-900/95 backdrop-blur">
          <tr class="border-b border-white/[0.07] text-left text-[11px] uppercase tracking-wider text-slate-500">
            <th class="text-left py-2 pr-4">Canción</th>
            <th class="text-left py-2 pr-4">Artista</th>
            <th class="text-left py-2 w-px whitespace-nowrap">Fecha</th>
          </tr>
        </thead>
        <tbody>
          <tr
            v-for="e in visibleRows"
            :key="e.key"
            class="border-b border-white/[0.04] transition-colors hover:bg-white/[0.03]"
          >
            <td class="py-2 pr-4">{{ e.track }}</td>
            <td class="py-2 pr-4 text-slate-300">{{ e.artist }}</td>
            <td class="py-2 w-px text-slate-400 text-xs leading-tight">
              <div>{{ e.date }}</div>
              <div class="text-slate-500">{{ e.time }}</div>
            </td>
          </tr>
          <tr v-if="!filteredEvents.length">
            <td colspan="3" class="py-3 text-slate-400">{{ search ? 'Sin resultados para "' + search + '"' : 'No hay reproducciones registradas' }}</td>
          </tr>
        </tbody>
      </table>
    </div>

    <div v-if="hasMore" class="mt-3 flex items-center justify-center gap-3">
      <span class="text-xs text-slate-500">
        Mostrando {{ visibleRows.length }} de {{ filteredEvents.length }}
      </span>
      <button
        @click="showMore"
        class="sk-btn sk-btn-ghost sk-btn-sm"
      >
        Mostrar más
      </button>
    </div>
  </section>

  <!-- Delete history modal -->
  <Transition name="modal">
    <div
      v-if="showModal"
      class="fixed inset-0 z-50 flex items-center justify-center p-4"
    >
      <div class="absolute inset-0 bg-black/60 backdrop-blur-sm" @click="showModal = false" />
      <div class="sk-card sk-card-lit relative w-full max-w-sm p-6">

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
            class="sk-btn sk-btn-ghost flex-1"
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
import { ref, computed, watch, watchEffect, onMounted, onBeforeUnmount } from 'vue'
import { useEventStore } from '@/stores/events'

const { events, clearEvents, deleteOlderThan } = useEventStore()

const showModal  = ref(false)
const feedback   = ref('')
const sliderIndex = ref(0)
const search = ref('')
const selectedMonth = ref('all')
const monthMenuOpen = ref(false)
const monthFilterRef = ref(null)

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

// La tabla renderizaba TODO el historial de golpe y formateaba cada fecha dos
// veces por fila. Con miles de reproducciones el Inicio tardaba en abrir en el
// móvil. Ahora se pagina y se formatea una sola vez por fila visible.
const PAGE_SIZE = 100
const visibleCount = ref(PAGE_SIZE)

const visibleRows = computed(() =>
  filteredEvents.value.slice(0, visibleCount.value).map(e => {
    const parts = formatDateParts(e.played_at)
    return {
      key: `${e.played_at}|${e.track}|${e.artist}`,
      track: e.track,
      artist: e.artist,
      date: parts.date,
      time: parts.time
    }
  })
)

const hasMore = computed(() => filteredEvents.value.length > visibleRows.value.length)

function showMore () {
  visibleCount.value += PAGE_SIZE
}

// Al cambiar de filtro se vuelve a la primera página.
watch([search, selectedMonth], () => { visibleCount.value = PAGE_SIZE })

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
})

onBeforeUnmount(() => {
  document.removeEventListener('click', handleOutsideMonthMenu)
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
