<template>
  <div class="space-y-6">

    <header class="rounded-2xl border border-slate-800/60 bg-slate-900/40 p-5">
      <h1 class="text-xl font-semibold text-slate-100">Desarrollo</h1>
      <p class="mt-1 text-sm text-slate-400">
        Diagnóstico en vivo del motor de saltado de duplicadas. Cada decisión queda
        registrada con su motivo, la posición de la canción y el tiempo que costó
        consultar el historial.
      </p>
      <p v-if="!available" class="mt-3 text-sm text-amber-400">
        El motor solo existe en la app de Android. En el navegador esta pantalla no
        tiene nada que mostrar.
      </p>
    </header>

    <!-- Estado -->
    <section v-if="available" class="grid grid-cols-2 gap-3 lg:grid-cols-4">
      <div
        v-for="card in statusCards"
        :key="card.label"
        class="rounded-xl border border-slate-800/60 bg-slate-900/40 p-4"
      >
        <p class="text-[11px] uppercase tracking-wide text-slate-500">{{ card.label }}</p>
        <p class="mt-1 text-lg font-semibold" :class="card.tone">{{ card.value }}</p>
        <p v-if="card.hint" class="mt-0.5 text-[11px] text-slate-500">{{ card.hint }}</p>
      </div>
    </section>

    <!-- Sesión en curso -->
    <section v-if="available && session.key" class="rounded-2xl border border-slate-800/60 bg-slate-900/40 p-5">
      <h2 class="text-sm font-semibold text-slate-200">Reproducción en curso</h2>
      <p class="mt-2 text-base text-slate-100">{{ session.track || '—' }}</p>
      <p class="text-sm text-slate-400">{{ session.artist || '—' }}</p>

      <div class="mt-3 flex flex-wrap gap-2 text-[11px]">
        <span class="rounded-md bg-slate-800 px-2 py-1 text-slate-300">
          decisión: {{ session.decided ? 'cerrada' : 'pendiente' }}
        </span>
        <span class="rounded-md bg-slate-800 px-2 py-1 text-slate-300">
          registrada: {{ session.committed ? 'sí' : 'todavía no' }}
        </span>
        <span class="rounded-md bg-slate-800 px-2 py-1 text-slate-300">
          sonando {{ fmtMs(session.playedMs) }} / {{ fmtMs(session.requiredMs) }} para contar
        </span>
      </div>
      <p class="mt-2 font-mono text-[11px] text-slate-600 break-all">{{ session.key }}</p>
    </section>

    <!-- Ajustes -->
    <section v-if="available" class="rounded-2xl border border-slate-800/60 bg-slate-900/40 p-5">
      <div class="flex items-center justify-between gap-3">
        <h2 class="text-sm font-semibold text-slate-200">Parámetros del motor</h2>
        <button
          class="rounded-lg border border-slate-700 px-3 py-1.5 text-xs text-slate-300 hover:bg-slate-800"
          :disabled="busy"
          @click="resetConfig"
        >
          Valores por defecto
        </button>
      </div>

      <div class="mt-4 space-y-5">
        <div>
          <div class="flex items-center justify-between">
            <label class="text-sm text-slate-300">Ventana de decisión</label>
            <span class="font-mono text-sm text-emerald-400">{{ config.decisionWindowMs }} ms</span>
          </div>
          <input
            type="range" min="1000" max="15000" step="500"
            :value="config.decisionWindowMs"
            class="mt-2 w-full accent-emerald-500"
            :disabled="busy"
            @change="apply({ decisionWindowMs: Number($event.target.value) })"
          >
          <p class="mt-1 text-[11px] text-slate-500">
            Pasada esta posición de la canción ya no se salta nunca. Es la guarda contra
            los saltos que llegaban tarde.
          </p>
        </div>

        <div>
          <div class="flex items-center justify-between">
            <label class="text-sm text-slate-300">Espera de estabilización</label>
            <span class="font-mono text-sm text-emerald-400">{{ config.minStableMs }} ms</span>
          </div>
          <input
            type="range" min="0" max="2000" step="100"
            :value="config.minStableMs"
            class="mt-2 w-full accent-emerald-500"
            :disabled="busy"
            @change="apply({ minStableMs: Number($event.target.value) })"
          >
          <p class="mt-1 text-[11px] text-slate-500">
            Tiempo que se deja al MediaSession para asentar los metadatos antes de
            decidir. Subirlo si en tu móvil Spotify tarda en refrescar.
          </p>
        </div>

        <label class="flex items-start gap-3">
          <input
            type="checkbox" class="mt-1 accent-emerald-500"
            :checked="config.verifyBeforeSkip" :disabled="busy"
            @change="apply({ verifyBeforeSkip: $event.target.checked })"
          >
          <span>
            <span class="text-sm text-slate-300">Verificar la pista antes de saltar</span>
            <span class="block text-[11px] text-slate-500">
              Relee el MediaSession justo antes de mandar el salto y aborta si ya suena
              otra canción. Desactívalo solo para reproducir el fallo antiguo.
            </span>
          </span>
        </label>

        <label class="flex items-start gap-3">
          <input
            type="checkbox" class="mt-1 accent-emerald-500"
            :checked="config.pauseToSkip" :disabled="busy"
            @change="apply({ pauseToSkip: $event.target.checked })"
          >
          <span>
            <span class="text-sm text-slate-300">Pausar antes de saltar <span class="text-amber-500">(heredado)</span></span>
            <span class="block text-[11px] text-slate-500">
              Método antiguo. Era la causa de que las canciones se quedasen pausadas.
              Aquí la reanudación es incondicional, pero sigue siendo innecesario.
            </span>
          </span>
        </label>

        <label class="flex items-start gap-3">
          <input
            type="checkbox" class="mt-1 accent-emerald-500"
            :checked="config.telemetry" :disabled="busy"
            @change="apply({ telemetry: $event.target.checked })"
          >
          <span>
            <span class="text-sm text-slate-300">Registrar decisiones</span>
            <span class="block text-[11px] text-slate-500">Alimenta el registro de abajo.</span>
          </span>
        </label>
      </div>
    </section>

    <!-- Registro -->
    <section v-if="available" class="rounded-2xl border border-slate-800/60 bg-slate-900/40 p-5">
      <div class="flex flex-wrap items-center justify-between gap-3">
        <h2 class="text-sm font-semibold text-slate-200">
          Últimas decisiones <span class="text-slate-500">({{ log.length }})</span>
        </h2>
        <div class="flex items-center gap-2">
          <label class="flex items-center gap-1.5 text-xs text-slate-400">
            <input type="checkbox" v-model="autoRefresh" class="accent-emerald-500">
            Auto
          </label>
          <button
            class="rounded-lg border border-slate-700 px-3 py-1.5 text-xs text-slate-300 hover:bg-slate-800"
            @click="refresh"
          >Actualizar</button>
          <button
            class="rounded-lg border border-slate-700 px-3 py-1.5 text-xs text-slate-300 hover:bg-slate-800"
            @click="clearLog"
          >Vaciar</button>
        </div>
      </div>

      <p v-if="!log.length" class="mt-4 text-sm text-slate-500">
        Sin decisiones registradas todavía. Pon música en Spotify y vuelve aquí.
      </p>

      <ul v-else class="mt-4 space-y-2">
        <li
          v-for="(entry, i) in log"
          :key="i"
          class="rounded-lg border border-slate-800/60 bg-slate-950/40 p-3"
        >
          <div class="flex flex-wrap items-center gap-2">
            <span
              class="rounded px-1.5 py-0.5 text-[10px] font-semibold uppercase"
              :class="entry.action === 'saltada'
                ? 'bg-rose-500/15 text-rose-300'
                : entry.action === 'salto_abortado'
                  ? 'bg-amber-500/15 text-amber-300'
                  : 'bg-slate-700/40 text-slate-300'"
            >{{ entry.action }}</span>
            <span class="text-xs text-slate-400">{{ reasonLabel(entry.reason) }}</span>
            <span class="ml-auto font-mono text-[10px] text-slate-600">{{ fmtTime(entry.at) }}</span>
          </div>

          <p v-if="entry.track" class="mt-1.5 truncate text-sm text-slate-200">
            {{ entry.track }} <span class="text-slate-500">— {{ entry.artist }}</span>
          </p>

          <div class="mt-1.5 flex flex-wrap gap-x-3 gap-y-1 font-mono text-[10px] text-slate-500">
            <span>fuente={{ entry.source }}</span>
            <span v-if="entry.positionMs >= 0">pos={{ entry.positionMs }}ms</span>
            <span v-if="entry.sessionAgeMs != null">edad={{ entry.sessionAgeMs }}ms</span>
            <span v-if="entry.lookupUs">consulta={{ entry.lookupUs }}µs</span>
          </div>
        </li>
      </ul>
    </section>

    <!-- Zona destructiva -->
    <section v-if="available" class="rounded-2xl border border-rose-900/40 bg-rose-950/10 p-5">
      <h2 class="text-sm font-semibold text-rose-300">Zona de riesgo</h2>
      <p class="mt-1 text-[11px] text-slate-500">
        Borra el historial que el motor usa para decidir si una canción es duplicada.
        No afecta a tus estadísticas, pero durante un tiempo no se saltará nada.
      </p>
      <button
        class="mt-3 rounded-lg border border-rose-800/60 px-3 py-1.5 text-xs text-rose-300 hover:bg-rose-900/30"
        :disabled="busy"
        @click="resetHistory"
      >
        {{ confirmReset ? '¿Seguro? Pulsa otra vez' : 'Borrar historial de duplicadas' }}
      </button>
    </section>

  </div>
</template>

<script setup>
import { computed, onMounted, onUnmounted, ref } from 'vue'

const REASONS = {
  duplicada: 'ya sonaba en la ventana → saltada',
  no_duplicada: 'sin escucha previa en la ventana',
  fuera_de_ventana: 'la canción ya iba muy avanzada',
  sin_posicion: 'el MediaSession no dio posición fiable',
  estabilizando: 'esperando a que asienten los metadatos',
  indice_cargando: 'el índice aún se estaba cargando',
  funcion_desactivada: 'saltar duplicadas está desactivado',
  sin_metadatos: 'sin canción/artista utilizable',
  pista_cambiada: 'la pista viva ya no coincidía'
}

const diag = ref(null)
const busy = ref(false)
const autoRefresh = ref(true)
const confirmReset = ref(false)
let timer = null

const plugin = () => window.Capacitor?.Plugins?.NotifListener || null
const available = computed(() => !!plugin() && !!diag.value)

const config = computed(() => diag.value?.config || {
  decisionWindowMs: 5000, minStableMs: 400,
  verifyBeforeSkip: true, pauseToSkip: false, telemetry: true
})
const session = computed(() => diag.value?.session || {})
const log = computed(() => diag.value?.log || [])

const statusCards = computed(() => {
  const d = diag.value || {}
  return [
    {
      label: 'Índice',
      value: d.indexReady ? 'listo' : 'cargando…',
      tone: d.indexReady ? 'text-emerald-400' : 'text-amber-400',
      hint: `${d.indexSize ?? 0} canciones · ${d.indexLoadMs >= 0 ? d.indexLoadMs + ' ms' : '—'}`
    },
    {
      label: 'Motor',
      value: d.attached ? 'enganchado' : 'sin sesión',
      tone: d.attached ? 'text-emerald-400' : 'text-slate-400',
      hint: d.dbFailed ? 'la base de datos ha fallado' : 'base de datos correcta'
    },
    { label: 'Saltadas', value: d.skipCount ?? 0, tone: 'text-slate-100', hint: 'desde el último arranque' },
    { label: 'Registradas', value: d.commitCount ?? 0, tone: 'text-slate-100', hint: 'escuchas anotadas' }
  ]
})

function reasonLabel (reason) {
  return REASONS[reason] || reason || '—'
}

function fmtMs (ms) {
  const n = Number(ms || 0)
  if (!Number.isFinite(n) || n <= 0) return '0s'
  return n < 1000 ? `${n}ms` : `${(n / 1000).toFixed(1)}s`
}

function fmtTime (epochMs) {
  const d = new Date(Number(epochMs || 0))
  return Number.isNaN(d.getTime()) ? '—' : d.toLocaleTimeString('es-ES')
}

async function call (method, args = {}) {
  const NL = plugin()
  if (!NL || typeof NL[method] !== 'function') return null
  try {
    return await NL[method](args)
  } catch {
    return null
  }
}

async function refresh () {
  const result = await call('getDuplicateDiagnostics')
  if (result) diag.value = result
}

async function apply (patch) {
  busy.value = true
  const result = await call('setDuplicateDevConfig', patch)
  if (result) diag.value = result
  busy.value = false
}

async function resetConfig () {
  busy.value = true
  const result = await call('resetDuplicateDevConfig')
  if (result) diag.value = result
  busy.value = false
}

async function clearLog () {
  const result = await call('clearDuplicateLog')
  if (result) diag.value = result
}

async function resetHistory () {
  // Doble pulsación: es irreversible y la pantalla se usa con música sonando.
  if (!confirmReset.value) {
    confirmReset.value = true
    setTimeout(() => { confirmReset.value = false }, 4000)
    return
  }
  confirmReset.value = false
  busy.value = true
  const result = await call('resetDuplicateHistory')
  if (result) diag.value = result
  busy.value = false
}

onMounted(() => {
  refresh()
  timer = setInterval(() => { if (autoRefresh.value) refresh() }, 2000)
})

onUnmounted(() => {
  if (timer) clearInterval(timer)
})
</script>
