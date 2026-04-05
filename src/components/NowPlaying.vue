<template>
  <section
    class="rounded-2xl border p-5 mb-6 transition-all"
    :class="cardClasses"
  >
    <div class="flex items-start justify-between gap-4">
      <div>
        <div class="flex items-center gap-2 mb-2">
          <span class="text-base" :class="iconColor">{{ icon }}</span>
          <h2 class="text-lg font-semibold">Reproducción actual</h2>
        </div>
        <p class="text-xl font-semibold">{{ trackLabel }}</p>
        <p class="text-slate-300 mt-1">{{ artistLabel }}</p>
        <p v-if="showProgress" class="mt-2 inline-flex rounded-md border border-slate-700/70 bg-slate-900/55 px-2 py-0.5 text-[11px] text-slate-400">
          {{ progressLabel }}
        </p>
        <p v-if="meta" class="text-xs text-slate-400 mt-2">{{ meta }}</p>
      </div>

      <!-- Wave animation (playing only) -->
      <div
        v-if="state.mode === 'playing'"
        class="flex items-end justify-center gap-1 h-14 w-24"
      >
        <span
          v-for="(h, i) in waveBars"
          :key="i"
          class="sk-wave-bar"
          :style="{
            height: h + 'px',
            animationDelay: (i * 0.09) + 's'
          }"
        />
      </div>
    </div>
  </section>
</template>

<script setup>
import { computed, onBeforeUnmount, onMounted, ref } from 'vue'

const props = defineProps({
  state: {
    type: Object,
    default: () => ({ mode: 'stopped' })
  }
})

const waveBars = [8, 18, 12, 22, 14, 10]
const nowTick = ref(Date.now())
let tickTimer = null

const cardClasses = computed(() => {
  const m = props.state.mode
  if (m === 'playing') return 'bg-gradient-to-br from-emerald-500/30 via-slate-900 to-slate-900 border-emerald-500/30'
  if (m === 'paused') return 'bg-gradient-to-br from-amber-500/30 via-slate-900 to-slate-900 border-amber-500/30'
  return 'bg-gradient-to-br from-rose-500/30 via-slate-900 to-slate-900 border-rose-500/30'
})

const icon = computed(() => {
  if (props.state.mode === 'playing') return '▶'
  if (props.state.mode === 'paused') return '⏸'
  return '⏹'
})

const iconColor = computed(() => {
  if (props.state.mode === 'playing') return 'text-emerald-300'
  if (props.state.mode === 'paused') return 'text-amber-300'
  return 'text-rose-300'
})

const trackLabel = computed(() => props.state.track || (props.state.mode === 'paused' ? 'Reproducción en pausa' : 'Sin música'))
const artistLabel = computed(() => props.state.artist || '-')
const meta = computed(() => (props.state.meta || '').trim())
const progressPct = computed(() => {
  const raw = Number(props.state?.progressPct)
  if (!Number.isFinite(raw)) return null

  const durationMs = Number(props.state?.durationMs)
  const syncedAt = Number(props.state?.progressSyncedAt)
  const canEstimate = props.state?.mode === 'playing' && Number.isFinite(durationMs) && durationMs > 0 && Number.isFinite(syncedAt)

  let pct = raw
  if (canEstimate) {
    const elapsedMs = Math.max(0, nowTick.value - syncedAt)
    pct = raw + ((elapsedMs / durationMs) * 100)
  }

  const stepped = Math.floor(pct / 5) * 5
  return Math.max(0, Math.min(100, stepped))
})
const showProgress = computed(() => progressPct.value !== null && props.state.mode !== 'stopped')
const progressLabel = computed(() => `${progressPct.value}% escuchado`)

onMounted(() => {
  tickTimer = setInterval(() => {
    nowTick.value = Date.now()
  }, 1000)
})

onBeforeUnmount(() => {
  if (tickTimer) clearInterval(tickTimer)
})
</script>

<style scoped>
.sk-wave-bar {
  width: 5px;
  min-height: 6px;
  border-radius: 3px;
  background: #34d399;
  opacity: 0.85;
  animation: sk-eq-bounce 1s ease-in-out infinite;
}

@keyframes sk-eq-bounce {
  0%, 100% {
    transform: scaleY(0.55);
    opacity: 0.55;
  }
  50% {
    transform: scaleY(1);
    opacity: 1;
  }
}
</style>
