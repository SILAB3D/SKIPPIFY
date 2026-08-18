<template>
  <div class="sk-stagger space-y-5">
    <!-- Sin motor nativo no hay nada que calibrar -->
    <div v-if="!available" class="sk-card border-amber-500/25 p-5">
      <p class="text-sm font-semibold text-amber-200">El motor sólo existe en la app de Android</p>
      <p class="mt-1 text-xs text-amber-200/70">
        En el navegador no hay MediaSession al que engancharse, así que esta pantalla
        no tiene nada que medir ni que ajustar.
      </p>
    </div>

    <template v-else>
      <!-- ── Resumen del día ───────────────────────────────────────────────── -->
      <section class="grid grid-cols-2 gap-3 lg:grid-cols-4">
        <article v-for="card in statusCards" :key="card.label" class="sk-card overflow-hidden p-4">
          <div class="pointer-events-none absolute inset-x-0 top-0 h-14 bg-gradient-to-b to-transparent" :class="card.glow" />
          <div class="relative">
            <p class="sk-eyebrow">{{ card.label }}</p>
            <p class="sk-stat-value" :class="card.tone">{{ card.value }}</p>
            <p class="sk-stat-hint">{{ card.hint }}</p>
          </div>
        </article>
      </section>

      <!-- ── Elección de vía ───────────────────────────────────────────────── -->
      <section v-if="!mode" class="grid gap-3 sm:grid-cols-2">
        <button
          type="button"
          class="sk-card sk-card-hover group p-5 text-left"
          @click="mode = 'wizard'"
        >
          <span class="flex h-11 w-11 items-center justify-center rounded-2xl border border-violet-400/25 bg-violet-500/12 text-xl">🩺</span>
          <h2 class="sk-title mt-3.5">Asistente de calibración</h2>
          <p class="sk-subtitle">
            Guiado paso a paso: preparas una playlist de prueba, eliges el síntoma que sufres y
            el asistente propone, aplica y verifica el ajuste hasta resolverlo.
          </p>
          <span class="sk-chip sk-chip-accent mt-4">Recomendado si algo va mal</span>
        </button>

        <button
          type="button"
          class="sk-card sk-card-hover group p-5 text-left"
          @click="mode = 'manual'"
        >
          <span class="flex h-11 w-11 items-center justify-center rounded-2xl border border-brand-400/25 bg-brand-500/12 text-xl">🎛️</span>
          <h2 class="sk-title mt-3.5">Ajuste manual</h2>
          <p class="sk-subtitle">
            Control directo de cada parámetro del motor, con la explicación de qué implica subirlo
            o bajarlo, los interruptores, los puntos de restauración y el registro de decisiones.
          </p>
          <span class="sk-chip mt-4">Para afinar con criterio</span>
        </button>
      </section>

      <!-- ── Asistente ─────────────────────────────────────────────────────── -->
      <CalibrationWizard v-else-if="mode === 'wizard'" @close="mode = null" />

      <!-- ── Ajuste manual ─────────────────────────────────────────────────── -->
      <template v-else>
        <div class="flex flex-wrap items-center justify-between gap-2">
          <h2 class="sk-title">Ajuste manual del motor</h2>
          <button class="sk-btn sk-btn-ghost sk-btn-sm" @click="mode = null">Volver</button>
        </div>

        <!-- Protocolo de prueba -->
        <section class="sk-card border-sky-500/20 p-5">
          <div class="flex items-start gap-3">
            <span class="mt-0.5 flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-sky-500/12 text-base">🧪</span>
            <div class="min-w-0">
              <h3 class="text-sm font-semibold text-sky-100">Cómo probar cada cambio</h3>
              <p class="mt-1 text-xs leading-relaxed text-slate-300">
                Pon en cola <strong class="text-sky-200">al menos 10 canciones que ya hayas escuchado</strong>
                dentro del periodo configurado para saltar ({{ intervalLabel }}) y reprodúcelas enteras
                cada vez que toques un ajuste. Sin ese lote fijo no hay forma de saber si una mejora
                es real o casualidad: cada canción es una medición.
              </p>
              <p class="mt-2 text-[11px] text-slate-400">
                Guarda un punto de restauración antes de empezar y compara los contadores de arriba
                tras cada pasada. Si prefieres no hacerlo a mano,
                <button class="font-semibold text-sky-300 underline underline-offset-2" @click="mode = 'wizard'">usa el asistente</button>.
              </p>
            </div>
          </div>
        </section>

        <!-- Parámetros -->
        <section class="sk-card sk-card-lit p-5">
          <header class="flex flex-wrap items-center gap-2">
            <span class="flex h-8 w-8 items-center justify-center rounded-lg bg-brand-500/12 text-sm">🎛️</span>
            <h3 class="sk-title">Parámetros del motor</h3>
            <button class="sk-btn sk-btn-ghost sk-btn-sm ml-auto" :disabled="busy" @click="resetConfig">
              Valores por defecto
            </button>
          </header>

          <div class="mt-5 space-y-6">
            <div v-for="param in params" :key="param.key">
              <div class="flex flex-wrap items-baseline justify-between gap-2">
                <label class="text-sm font-medium text-slate-200">{{ param.label }}</label>
                <span class="font-mono text-sm font-semibold text-brand-400">
                  {{ config[param.key] }} {{ param.unit }}
                </span>
              </div>
              <p class="mt-0.5 text-[11px] text-slate-500">{{ param.summary }}</p>

              <div class="mt-2.5 flex items-center gap-2.5">
                <button
                  type="button"
                  class="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg border border-white/[0.08] bg-white/[0.04] text-lg font-semibold leading-none text-slate-300 transition-colors hover:border-amber-400/45 hover:bg-amber-500/15 hover:text-amber-200 disabled:opacity-40"
                  :disabled="busy || config[param.key] <= param.min"
                  :title="`−${stepOf(param)} ${param.unit}`"
                  @click="nudge(param, -1)"
                >−</button>

                <input
                  type="range"
                  :min="param.min"
                  :max="param.max"
                  :step="param.step"
                  :value="config[param.key]"
                  class="w-full accent-brand-500"
                  :disabled="busy"
                  @change="apply({ [param.key]: Number($event.target.value) })"
                >

                <button
                  type="button"
                  class="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg border border-white/[0.08] bg-white/[0.04] text-lg font-semibold leading-none text-slate-300 transition-colors hover:border-brand-400/45 hover:bg-brand-500/15 hover:text-brand-200 disabled:opacity-40"
                  :disabled="busy || config[param.key] >= param.max"
                  :title="`+${stepOf(param)} ${param.unit}`"
                  @click="nudge(param, 1)"
                >+</button>
              </div>

              <!-- Qué implica moverlo en cada sentido -->
              <div class="mt-2.5 grid gap-2 sm:grid-cols-2">
                <p class="rounded-lg border border-brand-500/18 bg-brand-500/[0.06] px-2.5 py-2 text-[11px] leading-relaxed text-brand-100/80">
                  <span class="font-semibold text-brand-300">+{{ stepOf(param) }} {{ param.unit }} · </span>{{ param.up }}
                </p>
                <p class="rounded-lg border border-amber-500/18 bg-amber-500/[0.06] px-2.5 py-2 text-[11px] leading-relaxed text-amber-100/80">
                  <span class="font-semibold text-amber-300">−{{ stepOf(param) }} {{ param.unit }} · </span>{{ param.down }}
                </p>
              </div>
            </div>
          </div>

          <!-- Interruptores -->
          <div class="mt-6 space-y-2.5 border-t border-white/[0.06] pt-5">
            <label
              v-for="toggle in toggles"
              :key="toggle.key"
              class="flex cursor-pointer items-start gap-3 rounded-xl border p-3 transition-colors"
              :class="config[toggle.key]
                ? 'border-brand-500/25 bg-brand-500/[0.06]'
                : 'border-white/[0.06] bg-white/[0.02] hover:border-white/[0.14]'"
            >
              <input
                type="checkbox"
                class="mt-0.5 accent-brand-500"
                :checked="config[toggle.key]"
                :disabled="busy"
                @change="apply({ [toggle.key]: $event.target.checked })"
              >
              <span class="min-w-0">
                <span class="flex flex-wrap items-center gap-2">
                  <span class="text-sm font-medium text-slate-200">{{ toggle.label }}</span>
                  <span
                    v-if="toggle.legacy"
                    class="rounded bg-amber-500/15 px-1.5 py-0.5 text-[10px] font-semibold uppercase text-amber-400"
                  >heredado</span>
                  <span
                    v-else-if="toggle.recommended"
                    class="rounded bg-brand-500/15 px-1.5 py-0.5 text-[10px] font-semibold uppercase text-brand-400"
                  >recomendado</span>
                </span>
                <span class="mt-0.5 block text-[11px] leading-relaxed text-slate-500">{{ toggle.summary }}</span>
              </span>
            </label>
          </div>
        </section>

        <!-- Puntos de restauración -->
        <section class="sk-card p-5">
          <header class="flex flex-wrap items-center gap-2">
            <span class="flex h-8 w-8 items-center justify-center rounded-lg bg-sky-500/12 text-sm">💾</span>
            <h3 class="sk-title">Puntos de restauración</h3>
            <span class="ml-auto text-[11px] text-slate-500">{{ checkpoints.length }} / 8 guardados</span>
          </header>
          <p class="sk-subtitle">
            Guarda la configuración que tengas ahora para poder volver a ella si los siguientes
            ajustes empeoran el resultado.
          </p>

          <div class="mt-3.5 flex flex-wrap gap-2">
            <input
              v-model="checkpointName"
              type="text"
              maxlength="40"
              placeholder="Nombre (p. ej. «base estable»)"
              class="sk-input min-w-0 flex-1"
              @keyup.enter="onSaveCheckpoint"
            >
            <button class="sk-btn sk-btn-ghost sk-btn-sm" @click="onSaveCheckpoint">Guardar actual</button>
          </div>

          <p v-if="!checkpoints.length" class="mt-3.5 text-xs text-slate-500">
            Todavía no hay ninguno guardado.
          </p>

          <ul v-else class="mt-3.5 space-y-2">
            <li
              v-for="point in checkpoints"
              :key="point.id"
              class="flex flex-wrap items-center gap-2 rounded-xl border border-white/[0.06] bg-white/[0.02] p-3"
            >
              <div class="min-w-0 flex-1">
                <p class="truncate text-sm font-medium text-slate-200">{{ point.name }}</p>
                <p class="mt-0.5 font-mono text-[10px] text-slate-500">{{ formatCheckpoint(point) }}</p>
              </div>
              <button class="sk-btn sk-btn-ghost sk-btn-sm" :disabled="busy" @click="onRestoreCheckpoint(point)">Restaurar</button>
              <button class="sk-btn sk-btn-danger sk-btn-sm" @click="deleteCheckpoint(point.id)">Borrar</button>
            </li>
          </ul>

          <p v-if="checkpointMessage" class="mt-3 text-[11px] text-brand-300">{{ checkpointMessage }}</p>
        </section>

        <!-- Reproducción en curso -->
        <section v-if="session.key" class="sk-card p-5">
          <h3 class="sk-title">Reproducción en curso</h3>
          <p class="mt-2 truncate text-base text-slate-100">{{ session.track || '—' }}</p>
          <p class="truncate text-sm text-slate-400">{{ session.artist || '—' }}</p>

          <div class="mt-3 flex flex-wrap gap-2">
            <span class="sk-chip">decisión: {{ session.decided ? 'cerrada' : 'pendiente' }}</span>
            <span class="sk-chip">registrada: {{ session.committed ? 'sí' : 'todavía no' }}</span>
            <span v-if="session.muted" class="sk-chip border-amber-400/30 bg-amber-500/10 text-amber-300">
              🔇 silenciada mientras decide
            </span>
            <span class="sk-chip">
              sonando {{ fmtMs(session.playedMs) }} / {{ fmtMs(session.requiredMs) }} para contar
            </span>
          </div>
        </section>

        <!-- Registro -->
        <section class="sk-card p-5">
          <header class="flex flex-wrap items-center justify-between gap-3">
            <h3 class="sk-title">
              Últimas decisiones <span class="text-slate-500">({{ log.length }})</span>
            </h3>
            <div class="flex items-center gap-2">
              <label class="flex items-center gap-1.5 text-[11px] text-slate-400">
                <input type="checkbox" v-model="autoRefresh" class="accent-brand-500">
                Auto
              </label>
              <button class="sk-btn sk-btn-ghost sk-btn-sm" @click="refresh">Actualizar</button>
              <button class="sk-btn sk-btn-ghost sk-btn-sm" @click="clearLog">Vaciar</button>
            </div>
          </header>

          <p v-if="!log.length" class="mt-4 text-xs text-slate-500">
            Sin decisiones registradas todavía. Pon música en Spotify y vuelve aquí.
          </p>

          <ul v-else class="mt-4 space-y-2">
            <li v-for="(entry, i) in log" :key="i" class="rounded-xl border border-white/[0.05] bg-slate-950/40 p-3">
              <div class="flex flex-wrap items-center gap-2">
                <span class="rounded px-1.5 py-0.5 text-[10px] font-semibold uppercase" :class="actionClass(entry.action)">
                  {{ entry.action }}
                </span>
                <span class="text-[11px] text-slate-400">{{ reasonLabel(entry.reason) }}</span>
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
        <section class="sk-card border-rose-900/40 bg-rose-950/10 p-5">
          <h3 class="text-sm font-semibold text-rose-300">Zona de riesgo</h3>
          <p class="mt-1 text-[11px] text-slate-500">
            Borra el historial que el motor usa para decidir si una canción es duplicada.
            No afecta a tus estadísticas, pero durante un tiempo no se saltará nada.
          </p>
          <button class="sk-btn sk-btn-danger sk-btn-sm mt-3" :disabled="busy" @click="onResetHistory">
            {{ confirmReset ? '¿Seguro? Pulsa otra vez' : 'Borrar historial de duplicadas' }}
          </button>
        </section>
      </template>
    </template>
  </div>
</template>

<script setup>
import { computed, onMounted, onUnmounted, ref } from 'vue'
import { useRoute } from 'vue-router'
import CalibrationWizard from '@/components/CalibrationWizard.vue'
import {
  useCalibration,
  CALIBRATION_PARAMS,
  CALIBRATION_TOGGLES,
  stepFor
} from '@/composables/useCalibration'

const REASONS = {
  duplicada: 'ya sonaba en la ventana → saltada',
  no_duplicada: 'sin escucha previa en la ventana',
  fuera_de_ventana: 'la canción ya iba muy avanzada',
  sin_posicion: 'el MediaSession no dio posición fiable',
  estabilizando: 'esperando a que asienten los metadatos',
  indice_cargando: 'el índice aún se estaba cargando',
  funcion_desactivada: 'saltar duplicadas está desactivado',
  sin_metadatos: 'sin canción/artista utilizable',
  pista_cambiada: 'la pista viva ya no coincidía',
  esperando_decision: 'silenciada mientras se decide',
  cambio_de_pista: 'cambió la canción',
  tras_salto: 'tras completar el salto',
  salto_abortado: 'el salto se canceló',
  failsafe: 'venció el silencio de seguridad',
  premute_desactivado: 'silenciado desactivado por el usuario',
  detach: 'se perdió la conexión con Spotify',
  sin_transporte: 'sin acceso al reproductor'
}

const INTERVAL_LABELS = {
  '1h': 'última hora',
  '1d': 'último día',
  '1w': 'última semana',
  '2w': 'últimas 2 semanas',
  '1m': 'último mes',
  '3m': 'últimos 3 meses',
  '6m': 'últimos 6 meses',
  '1y': 'último año'
}

const {
  diagnostics, available, busy, config, session, log, today, checkpoints,
  refresh, apply, resetConfig, clearLog, resetHistory,
  saveCheckpoint, restoreCheckpoint, deleteCheckpoint
} = useCalibration()

const route = useRoute()
const rawDiag = computed(() => diagnostics.value || {})

const params = CALIBRATION_PARAMS
const toggles = CALIBRATION_TOGGLES

/** `null` = pantalla de elección; el resto son las dos vías de calibración. */
const mode = ref(route.query.asistente === '1' ? 'wizard' : null)

const autoRefresh = ref(true)
const confirmReset = ref(false)
const checkpointName = ref('')
const checkpointMessage = ref('')
let timer = null
let messageTimer = null

const intervalLabel = computed(() => INTERVAL_LABELS[config.value.interval] || 'periodo configurado')

const statusCards = computed(() => {
  const d = { ...config.value }
  const diag = { ...(today.value || {}) }
  return [
    {
      label: 'Duplicadas hoy',
      value: diag.duplicates ?? 0,
      tone: 'text-slate-50',
      glow: 'from-violet-500/12',
      hint: 'detectadas desde las 00:00'
    },
    {
      label: 'Saltadas hoy',
      value: diag.skipped ?? 0,
      tone: 'text-brand-400',
      glow: 'from-brand-500/12',
      hint: efficiencyHint(diag)
    },
    {
      label: 'Silenciado previo',
      value: d.premute ? 'activo' : 'apagado',
      tone: d.premute ? 'text-brand-400' : 'text-amber-400',
      glow: d.premute ? 'from-brand-500/12' : 'from-amber-500/12',
      hint: d.restartOnKeep ? 'con reinicio si no era duplicada' : 'sin reinicio de pista'
    },
    {
      label: 'Índice',
      value: rawDiag.value.indexReady ? 'listo' : 'cargando…',
      tone: rawDiag.value.indexReady ? 'text-brand-400' : 'text-amber-400',
      glow: 'from-sky-500/12',
      hint: `${rawDiag.value.indexSize ?? 0} canciones · ${rawDiag.value.dbFailed ? 'BD con fallos' : 'BD correcta'}`
    }
  ]
})

function efficiencyHint (diag) {
  const total = Number(diag.duplicates || 0)
  const skipped = Number(diag.skipped || 0)
  if (!total) return 'sin duplicadas todavía'
  return `${Math.round((skipped / total) * 100)}% de acierto`
}

function stepOf (param) {
  return stepFor(param)
}

function nudge (param, direction) {
  const next = Number(config.value[param.key]) + direction * stepFor(param)
  apply({ [param.key]: Math.min(param.max, Math.max(param.min, next)) })
}

function onSaveCheckpoint () {
  const saved = saveCheckpoint(checkpointName.value)
  checkpointName.value = ''
  showMessage(`Guardado «${saved.name}».`)
}

async function onRestoreCheckpoint (point) {
  await restoreCheckpoint(point.id)
  showMessage(`Restaurada la configuración «${point.name}».`)
}

function showMessage (text) {
  checkpointMessage.value = text
  if (messageTimer) clearTimeout(messageTimer)
  messageTimer = setTimeout(() => { checkpointMessage.value = '' }, 5000)
}

async function onResetHistory () {
  // Doble pulsación: es irreversible y la pantalla se usa con música sonando.
  if (!confirmReset.value) {
    confirmReset.value = true
    setTimeout(() => { confirmReset.value = false }, 4000)
    return
  }
  confirmReset.value = false
  await resetHistory()
}

function formatCheckpoint (point) {
  const when = new Date(point.savedAt)
  const stamp = Number.isNaN(when.getTime()) ? '—' : when.toLocaleString('es-ES')
  const cfg = point.config || {}
  return `${stamp} · ventana ${cfg.decisionWindowMs ?? '—'}ms · espera ${cfg.minStableMs ?? '—'}ms`
}

function actionClass (action) {
  if (action === 'saltada') return 'bg-rose-500/15 text-rose-300'
  if (action === 'salto_abortado') return 'bg-amber-500/15 text-amber-300'
  if (action === 'silenciada') return 'bg-violet-500/15 text-violet-300'
  if (action === 'pista_reiniciada') return 'bg-sky-500/15 text-sky-300'
  if (action === 'sonido_restaurado') return 'bg-brand-500/15 text-brand-300'
  return 'bg-white/[0.06] text-slate-300'
}

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

onMounted(() => {
  refresh()
  timer = setInterval(() => { if (autoRefresh.value) refresh() }, 2000)
})

onUnmounted(() => {
  if (timer) clearInterval(timer)
  if (messageTimer) clearTimeout(messageTimer)
})
</script>
