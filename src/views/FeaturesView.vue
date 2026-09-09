<template>
  <div class="sk-stagger space-y-6">

    <!-- ══ 1 · Salto de duplicadas ═══════════════════════════════════════════ -->
    <section class="space-y-4">
      <header class="flex items-center gap-3">
        <span class="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl border border-brand-400/25 bg-brand-500/12 text-base">🔁</span>
        <div class="min-w-0">
          <h2 class="text-base font-semibold text-white">Salto de duplicadas</h2>
          <p class="text-[11px] text-slate-500">Cuánto tiempo tiene que pasar para volver a oír la misma canción</p>
        </div>
      </header>

      <!-- ── Elección de familia: predefinidos o personalizado ─────────────── -->
      <article data-tour="listening-modes" class="sk-card p-5">
        <div class="flex flex-wrap items-center justify-between gap-2">
          <p class="sk-eyebrow">{{ vistaSubmodos ? submodoTitulo : 'Modo de escucha' }}</p>
          <span class="sk-chip sk-chip-accent">{{ resumenActivo }}</span>
        </div>

        <!-- ── Familias: predefinidos o personalizado ────────────────────────
             Sólo se ve una cosa a la vez —las familias o sus submodos— para que
             la pantalla no cambie de alto al elegir. -->
        <div v-if="!vistaSubmodos" class="mt-4 grid gap-2.5 sm:grid-cols-2">
          <button
            v-for="familia in familias"
            :key="familia.id"
            type="button"
            class="relative overflow-hidden rounded-xl border p-4 text-left transition-all duration-200"
            :class="familiaActiva === familia.id
              ? 'border-brand-400/45 bg-brand-500/[0.07] shadow-[0_0_0_1px_rgba(34,197,94,0.10)]'
              : 'border-white/[0.06] bg-white/[0.02] hover:border-white/[0.16] hover:bg-white/[0.05]'"
            @click="abrirSubmodos(familia.id)"
          >
            <div
              v-if="familiaActiva === familia.id"
              class="pointer-events-none absolute inset-0 bg-gradient-to-br from-brand-500/10 to-transparent"
            />
            <div class="relative flex items-center gap-2.5">
              <span
                class="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl border text-base transition-colors"
                :class="familiaActiva === familia.id
                  ? 'border-brand-400/35 bg-brand-500/15'
                  : 'border-white/[0.07] bg-white/[0.03]'"
              >{{ familia.icon }}</span>
              <span class="text-sm font-semibold" :class="familiaActiva === familia.id ? 'text-brand-100' : 'text-white'">
                {{ familia.title }}
              </span>
              <span class="ml-auto shrink-0 text-[11px] text-slate-500">›</span>
            </div>
            <p class="relative mt-2 text-[11px] leading-relaxed text-slate-400">{{ familia.description }}</p>
          </button>
        </div>

        <!-- ── Submodos: descubrimiento/casual o frecuencia ─────────────────── -->
        <div v-else-if="vistaSubmodos === 'preset'" class="mt-4 grid gap-2.5 sm:grid-cols-2">
          <button
            v-for="mode in modosPredefinidos"
            :key="mode.id"
            type="button"
            class="relative overflow-hidden rounded-xl border p-3.5 text-left transition-all duration-200"
            :class="features.listeningMode === mode.id
              ? 'border-brand-400/45 bg-brand-500/[0.07]'
              : 'border-white/[0.06] bg-white/[0.02] hover:border-white/[0.16] hover:bg-white/[0.05]'"
            @click="elegirPredefinido(mode.id)"
          >
            <div class="flex items-center gap-2">
              <span
                class="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg border text-base transition-colors"
                :class="features.listeningMode === mode.id
                  ? 'border-brand-400/35 bg-brand-500/15'
                  : 'border-white/[0.07] bg-white/[0.03]'"
              >{{ mode.icon }}</span>
              <span class="text-sm font-semibold" :class="features.listeningMode === mode.id ? 'text-brand-100' : 'text-white'">
                {{ mode.title }}
              </span>
              <span
                class="ml-auto flex h-4 w-4 shrink-0 items-center justify-center rounded-full border transition-colors"
                :class="features.listeningMode === mode.id ? 'border-brand-400/60 text-brand-300' : 'border-white/15'"
                aria-hidden="true"
              >
                <span v-if="features.listeningMode === mode.id" class="h-1.5 w-1.5 rounded-full bg-current" />
              </span>
            </div>
            <p class="mt-2 text-[11px] leading-relaxed text-slate-400">{{ mode.description }}</p>
            <p class="mt-1.5 text-[11px] leading-relaxed text-slate-500">{{ mode.detail }}</p>
          </button>
        </div>

        <div v-else class="mt-4">
          <div class="grid grid-cols-2 gap-2 sm:grid-cols-5">
            <button
              v-for="opt in intervalOptions"
              :key="opt.value"
              type="button"
              class="rounded-xl border px-3 py-2.5 text-center text-xs font-semibold transition-all duration-200"
              :class="features.skipDuplicatesInterval === opt.value && features.listeningMode === 'custom'
                ? 'border-brand-400/45 bg-brand-500/[0.12] text-brand-100'
                : 'border-white/[0.06] bg-white/[0.02] text-slate-300 hover:border-white/[0.16] hover:bg-white/[0.05]'"
              @click="elegirIntervalo(opt.value)"
            >{{ opt.label }}</button>
          </div>
          <p class="mt-2.5 text-[11px] leading-relaxed text-slate-500">
            Se guarda como tu configuración propia: al elegir «Personalizado» desde la
            notificación persistente se recupera exactamente esto.
          </p>
        </div>

        <button
          v-if="vistaSubmodos"
          type="button"
          class="sk-btn sk-btn-ghost sk-btn-sm mt-3"
          @click="vistaSubmodos = ''"
        >
          ← Volver a los modos
        </button>
      </article>

      <!-- ── Calibración del salto ────────────────────────────────────────── -->
      <article data-tour="calibration-cta" class="sk-card p-5">
        <div class="flex flex-wrap items-center gap-3">
          <span class="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl border border-violet-400/25 bg-violet-500/12 text-lg">🩺</span>
          <div class="min-w-0 flex-1">
            <h3 class="sk-title">Calibración del salto</h3>
            <p class="mt-0.5 text-[11px] leading-relaxed text-slate-400">
              ¿Se salta canciones que no toca, o deja pasar duplicadas? El asistente monta una
              prueba controlada, identifica el síntoma y ajusta el motor contigo.
            </p>
          </div>
          <button class="sk-btn sk-btn-primary sk-btn-sm shrink-0" @click="abrirCalibracion">
            Calibrar
          </button>
        </div>
      </article>
    </section>

    <div class="sk-divider" />

    <!-- ══ 2 · Silenciamiento de anuncios ════════════════════════════════════ -->
    <section class="space-y-4">
      <header class="flex items-center gap-3">
        <span class="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl border border-amber-400/25 bg-amber-500/12 text-base">🔇</span>
        <div class="min-w-0">
          <h2 class="text-base font-semibold text-white">Silenciamiento de anuncios</h2>
          <p class="text-[11px] text-slate-500">Solo tiene efecto en cuentas gratuitas de Spotify</p>
        </div>
      </header>

      <article class="sk-card sk-card-lit p-5" :class="features.silenceAds ? 'border-brand-500/25' : ''">
        <div class="flex items-start gap-4">
          <span
            class="flex h-11 w-11 shrink-0 items-center justify-center rounded-2xl border text-xl transition-colors"
            :class="features.silenceAds ? 'border-brand-400/30 bg-brand-500/12' : 'border-white/[0.07] bg-white/[0.03]'"
          >🚫</span>

          <div class="min-w-0 flex-1">
            <div class="flex flex-wrap items-center gap-2">
              <h3 class="sk-title">Silenciar anuncios</h3>
              <span class="sk-chip" :class="features.silenceAds ? 'sk-chip-accent' : ''">
                {{ features.silenceAds ? 'Activado' : 'Desactivado' }}
              </span>
            </div>
            <p class="sk-subtitle">
              Cuando la notificación de Spotify contiene alguna palabra clave, Skippify baja
              el volumen multimedia mientras dura el anuncio y lo restaura al terminar.
            </p>
            <p class="mt-1 text-[11px] text-slate-500">Experimental · Requiere acceso a notificaciones</p>
          </div>

          <button
            role="switch"
            :aria-checked="features.silenceAds"
            class="sk-switch mt-1"
            :class="features.silenceAds ? 'border-brand-400/50 bg-brand-500' : 'border-white/10 bg-white/[0.08]'"
            @click="features.silenceAds = !features.silenceAds"
          >
            <span class="sk-switch-knob" :class="features.silenceAds ? 'translate-x-6' : 'translate-x-1'" />
          </button>
        </div>

        <Transition name="desplegar">
          <div v-if="features.silenceAds" class="mt-4 border-t border-white/[0.06] pt-4">
            <p class="sk-eyebrow">Palabras clave detectadas</p>
            <div class="mt-2 flex flex-wrap gap-1.5">
              <span v-for="kw in features.silenceAdsKeywords" :key="kw" class="sk-chip">
                {{ kw }}
                <button
                  v-if="!requiredKeywords.includes(kw)"
                  class="text-slate-500 transition-colors hover:text-rose-300"
                  aria-label="Quitar palabra"
                  @click="removeKeyword(kw)"
                >×</button>
              </span>
            </div>

            <div class="mt-3 flex flex-col gap-2 sm:flex-row">
              <input
                v-model="newKeyword"
                type="text"
                placeholder="Añadir palabra personalizada"
                class="sk-input flex-1"
                @keydown.enter.prevent="addKeyword"
              >
              <button class="sk-btn sk-btn-primary sk-btn-sm" @click="addKeyword">Añadir</button>
            </div>
            <p class="mt-2 text-[11px] text-slate-500">Las palabras por defecto no se pueden eliminar.</p>
          </div>
        </Transition>
      </article>
    </section>

  </div>
</template>

<script setup>
/**
 * Funciones — las dos automatizaciones de Skippify en una sola pantalla.
 *
 * El salto de duplicadas se elige en dos pasos y sólo se ve uno a la vez: al
 * pulsar una familia (predefinidos o personalizado) la rejilla de familias deja
 * su sitio a los submodos, y al elegir un submodo se vuelve a las familias. Así
 * la tarjeta no cambia de alto y la vista se queda quieta. Los tres modos que
 * ofrece la notificación persistente —Descubrimiento, Casual y Personalizado—
 * siguen siendo los mismos de siempre.
 */
import { computed, ref } from 'vue'
import { useRouter } from 'vue-router'
import { useFeatures } from '@/composables/useFeatures'

const router = useRouter()
const { state: features, setListeningMode } = useFeatures()

const newKeyword = ref('')
const requiredKeywords = ['publicidad', 'anuncio', 'anuncios']

const familias = [
  {
    id: 'preset',
    icon: '🎚️',
    title: 'Modos predefinidos',
    description: 'Dos perfiles ya ajustados: uno para descubrir música nueva y otro para no filtrar nada.'
  },
  {
    id: 'custom',
    icon: '🛠️',
    title: 'Modo personalizado',
    description: 'Tú decides cada cuánto se permite repetir una canción.'
  }
]

const modosPredefinidos = [
  {
    id: 'discovery',
    icon: '🧭',
    title: 'Descubrimiento',
    description: 'Prioriza canciones fuera de tu repertorio habitual para fomentar una escucha más variada.',
    detail: 'Fija el salto de duplicadas en 1 año mientras esté activo.'
  },
  {
    id: 'casual',
    icon: '🎧',
    title: 'Casual',
    description: 'Escucha sin filtros: no se salta ninguna canción por haberla oído antes.',
    detail: 'Desactiva el salto de duplicadas mientras esté activo.'
  }
]

/** Frecuencias del modo personalizado. */
const intervalOptions = [
  { value: '1w', label: '1 semana' },
  { value: '2w', label: '2 semanas' },
  { value: '1m', label: '1 mes' },
  { value: '3m', label: '3 meses' },
  { value: '6m', label: '6 meses' }
]

/** «preset» agrupa Descubrimiento y Casual; «custom» es el modo personalizado. */
const familiaActiva = computed(() => (features.listeningMode === 'custom' ? 'custom' : 'preset'))

/**
 * '' cuando se ven las familias, o la familia cuyos submodos se están mirando.
 * Nunca se ven las dos cosas a la vez: la tarjeta mantiene su alto y la vista
 * no salta al elegir.
 */
const vistaSubmodos = ref('')

const submodoTitulo = computed(() => (vistaSubmodos.value === 'custom'
  ? 'No repetir una canción hasta pasados'
  : 'Elige el modo'))

const resumenActivo = computed(() => {
  if (features.listeningMode === 'discovery') return 'Descubrimiento'
  if (features.listeningMode === 'casual') return 'Casual'
  const opt = intervalOptions.find(o => o.value === features.skipDuplicatesInterval)
  return opt ? `Personalizado · ${opt.label}` : 'Personalizado'
})

/** Abrir una familia sólo cambia lo que se ve: el modo lo fija el submodo. */
function abrirSubmodos (id) {
  vistaSubmodos.value = id
}

function elegirPredefinido (id) {
  setListeningMode(id)
  vistaSubmodos.value = ''
}

function elegirIntervalo (value) {
  setListeningMode('custom')
  // En personalizado el salto siempre está activo: quien no quiera saltar nada
  // tiene el modo Casual, así que un interruptor extra aquí sólo confundiría.
  features.skipDuplicates = true
  features.skipDuplicatesInterval = value
  vistaSubmodos.value = ''
}

/** La calibración vive fuera de la navegación: sólo se entra desde aquí. */
function abrirCalibracion () {
  router.push({ path: '/calibration', query: { asistente: '1' } })
}

function normalizeKeyword (value) {
  return (value || '').toString().trim().toLowerCase()
}

function addKeyword () {
  const kw = normalizeKeyword(newKeyword.value)
  if (!kw) return
  if (!Array.isArray(features.silenceAdsKeywords)) {
    features.silenceAdsKeywords = [...requiredKeywords]
  }
  if (!features.silenceAdsKeywords.includes(kw)) {
    features.silenceAdsKeywords.push(kw)
  }
  newKeyword.value = ''
}

function removeKeyword (kw) {
  if (requiredKeywords.includes(kw)) return
  features.silenceAdsKeywords = (features.silenceAdsKeywords || []).filter(item => item !== kw)
}
</script>

<style scoped>
.desplegar-enter-active, .desplegar-leave-active {
  transition: opacity 0.2s ease, max-height 0.25s ease;
  overflow: hidden;
  max-height: 420px;
}
.desplegar-enter-from, .desplegar-leave-to {
  opacity: 0;
  max-height: 0;
}
</style>
