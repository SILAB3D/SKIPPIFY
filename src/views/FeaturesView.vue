<template>
  <div class="sk-stagger space-y-4">

    <!-- ── Saltar duplicadas ───────────────────────────────────────────────── -->
    <section class="sk-card sk-card-lit p-5" :class="features.skipDuplicates ? 'border-brand-500/25' : ''">
      <div class="flex items-start gap-4">
        <span
          class="flex h-11 w-11 shrink-0 items-center justify-center rounded-2xl border text-xl transition-colors"
          :class="features.skipDuplicates ? 'border-brand-400/30 bg-brand-500/12' : 'border-white/[0.07] bg-white/[0.03]'"
        >🔁</span>

        <div class="min-w-0 flex-1">
          <div class="flex flex-wrap items-center gap-2">
            <h2 class="sk-title">Saltar duplicadas</h2>
            <span class="sk-chip" :class="features.skipDuplicates ? 'sk-chip-accent' : ''">
              {{ features.skipDuplicates ? 'Activado' : 'Desactivado' }}
            </span>
          </div>
          <p class="sk-subtitle">
            Si una canción ya fue reproducida dentro del intervalo configurado,
            Skippify la saltará automáticamente al detectar su inicio.
          </p>
          <p class="mt-1 text-[11px] text-slate-500">Recomendado · Requiere acceso a notificaciones</p>
          <p v-if="skipDuplicatesLocked" class="mt-2 text-xs text-amber-300">{{ skipDuplicatesLockReason }}</p>
        </div>

        <button
          role="switch"
          :aria-checked="features.skipDuplicates"
          :aria-disabled="skipDuplicatesLocked"
          :disabled="skipDuplicatesLocked"
          class="sk-switch mt-1"
          :class="[
            features.skipDuplicates ? 'border-brand-400/50 bg-brand-500' : 'border-white/10 bg-white/[0.08]',
            skipDuplicatesLocked ? 'cursor-not-allowed opacity-60' : ''
          ]"
          @click="toggleSkipDuplicates"
        >
          <span class="sk-switch-knob" :class="features.skipDuplicates ? 'translate-x-6' : 'translate-x-1'" />
        </button>
      </div>

      <Transition name="fade">
        <div v-if="features.skipDuplicates" class="mt-4 border-t border-white/[0.06] pt-4">
          <p class="sk-eyebrow">No repetir si fue escuchada en los últimos</p>
          <div class="sk-segment mt-2">
            <button
              v-for="opt in intervalOptions"
              :key="opt.value"
              type="button"
              class="sk-segment-item"
              :class="features.skipDuplicatesInterval === opt.value ? 'sk-segment-item-active' : ''"
              :disabled="skipDuplicatesLocked"
              @click="setSkipDuplicatesInterval(opt.value)"
            >
              {{ opt.label }}
            </button>
          </div>
        </div>
      </Transition>

      <!-- Acceso al asistente: es aquí donde el usuario nota el fallo -->
      <div data-tour="calibration-cta" class="mt-4 rounded-xl border border-violet-400/22 bg-violet-500/[0.07] p-4">
        <div class="flex flex-wrap items-center gap-3">
          <span class="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-violet-500/15 text-base">🩺</span>
          <div class="min-w-0 flex-1">
            <p class="text-sm font-semibold text-violet-100">¿Se salta canciones raro?</p>
            <p class="mt-0.5 text-[11px] leading-relaxed text-slate-400">
              El asistente de calibración monta una prueba controlada, identifica el síntoma
              y ajusta el motor contigo hasta resolverlo.
            </p>
          </div>
          <button class="sk-btn sk-btn-primary sk-btn-sm shrink-0" @click="openWizard">
            Calibrar salto
          </button>
        </div>
      </div>
    </section>

    <!-- ── Silenciar anuncios ──────────────────────────────────────────────── -->
    <section class="sk-card sk-card-lit p-5" :class="features.silenceAds ? 'border-brand-500/25' : ''">
      <div class="flex items-start gap-4">
        <span
          class="flex h-11 w-11 shrink-0 items-center justify-center rounded-2xl border text-xl transition-colors"
          :class="features.silenceAds ? 'border-brand-400/30 bg-brand-500/12' : 'border-white/[0.07] bg-white/[0.03]'"
        >🚫</span>

        <div class="min-w-0 flex-1">
          <div class="flex flex-wrap items-center gap-2">
            <h2 class="sk-title">Silencia anuncios</h2>
            <span class="sk-chip">Solo cuentas gratuitas</span>
            <span class="sk-chip" :class="features.silenceAds ? 'sk-chip-accent' : ''">
              {{ features.silenceAds ? 'Activado' : 'Desactivado' }}
            </span>
          </div>
          <p class="sk-subtitle">
            Cuando la notificación de Spotify contiene alguna palabra clave, Skippify silencia
            temporalmente el volumen multimedia durante su reproducción.
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

      <div class="mt-4 border-t border-white/[0.06] pt-4">
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
    </section>

  </div>
</template>

<script setup>
import { computed, ref } from 'vue'
import { useRouter } from 'vue-router'
import { useFeatures } from '@/composables/useFeatures'
import { useAppSettings } from '@/composables/useAppSettings'

const router = useRouter()
const { state: features, isSkipDuplicatesLocked, getSkipDuplicatesLockReason } = useFeatures()
const { state: appSettings } = useAppSettings()

const newKeyword = ref('')
const requiredKeywords = ['publicidad', 'anuncio', 'anuncios']
const skipDuplicatesLocked = computed(() => isSkipDuplicatesLocked())
const skipDuplicatesLockReason = computed(() => getSkipDuplicatesLockReason())

function toggleSkipDuplicates () {
  if (skipDuplicatesLocked.value) return
  features.skipDuplicates = !features.skipDuplicates
}

function setSkipDuplicatesInterval (value) {
  if (skipDuplicatesLocked.value) return
  features.skipDuplicatesInterval = value
}

/**
 * La pestaña de calibración es opcional y puede estar oculta: al entrar desde
 * aquí se hace visible, o el usuario acabaría en una ruta sin acceso de vuelta.
 */
function openWizard () {
  appSettings.showCalibration = true
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

const intervalOptions = [
  { value: '1w', label: '1 semana' },
  { value: '2w', label: '2 semanas' },
  { value: '1m', label: '1 mes' },
  { value: '3m', label: '3 meses' },
  { value: '6m', label: '6 meses' },
  { value: '1y', label: '1 año' }
]
</script>

<style scoped>
.fade-enter-active, .fade-leave-active {
  transition: opacity 0.2s ease, max-height 0.25s ease;
  overflow: hidden;
  max-height: 220px;
}
.fade-enter-from, .fade-leave-to {
  opacity: 0;
  max-height: 0;
}
</style>
