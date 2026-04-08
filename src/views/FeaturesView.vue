<template>
  <div>
    <div class="space-y-4">

      <!-- Saltar duplicadas -->
      <div
        class="rounded-2xl border bg-slate-900 p-5 transition-colors"
        :class="features.skipDuplicates ? 'border-emerald-500/30' : 'border-slate-800'"
      >
        <div class="flex flex-col sm:flex-row sm:items-start sm:justify-between gap-4">
          <div class="flex-1">
            <div class="flex flex-wrap items-center gap-2 mb-2">
              <span class="text-lg">🔁</span>
              <span class="font-semibold text-sm">Saltar duplicadas</span>
              <span
                class="px-2 py-0.5 rounded-full text-xs font-medium transition-colors"
                :class="features.skipDuplicates
                  ? 'bg-emerald-500/20 text-emerald-300 border border-emerald-500/30'
                  : 'bg-slate-700 text-slate-400 border border-slate-600'"
              >
                {{ features.skipDuplicates ? 'Activado' : 'Desactivado' }}
              </span>
            </div>
            <p class="text-xs text-slate-400">
              Si una canción ya fue reproducida dentro del intervalo configurado,
              Skippify la saltará automáticamente al detectar su inicio.
            </p>
            <p class="text-xs text-slate-500 mt-1">Recomendado · Requiere acceso a notificaciones</p>
            <p v-if="skipDuplicatesLocked" class="text-xs text-amber-300 mt-2">
              {{ skipDuplicatesLockReason }}
            </p>

            <!-- Interval selector: only visible when feature is ON -->
            <Transition name="fade">
              <div v-if="features.skipDuplicates" class="mt-4 pt-3 border-t border-slate-800">
                <p class="text-xs text-slate-400 mb-2 font-medium">No repetir si fue escuchada en los últimos:</p>
                <div class="flex flex-wrap gap-2">
                  <button
                    v-for="opt in intervalOptions"
                    :key="opt.value"
                    @click="setSkipDuplicatesInterval(opt.value)"
                    :disabled="skipDuplicatesLocked"
                    class="px-3 py-1 rounded-full text-xs font-medium border transition-colors"
                    :class="features.skipDuplicatesInterval === opt.value
                      ? 'bg-emerald-500/20 text-emerald-300 border-emerald-500/40'
                      : 'bg-slate-800 text-slate-400 border-slate-700 hover:border-slate-500 hover:text-slate-200'"
                  >
                    {{ opt.label }}
                  </button>
                </div>
              </div>
            </Transition>
          </div>
          <!-- Toggle switch -->
          <div class="shrink-0 flex items-center pt-0.5">
            <button
              role="switch"
              :aria-checked="features.skipDuplicates"
              :aria-disabled="skipDuplicatesLocked"
              @click="toggleSkipDuplicates"
              :disabled="skipDuplicatesLocked"
              class="relative inline-flex h-6 w-11 items-center rounded-full transition-colors focus:outline-none focus-visible:ring-2 focus-visible:ring-emerald-500"
              :class="[
                features.skipDuplicates ? 'bg-emerald-500' : 'bg-slate-700',
                skipDuplicatesLocked ? 'opacity-60 cursor-not-allowed' : ''
              ]"
            >
              <span
                class="inline-block h-4 w-4 transform rounded-full bg-white shadow-sm transition-transform"
                :class="features.skipDuplicates ? 'translate-x-6' : 'translate-x-1'"
              />
            </button>
          </div>
        </div>
      </div>

      <!-- Silencia anuncios -->
      <div
        class="rounded-2xl border bg-slate-900 p-5 transition-colors"
        :class="features.silenceAds ? 'border-emerald-500/30' : 'border-slate-800'"
      >
        <div class="flex flex-col sm:flex-row sm:items-start sm:justify-between gap-4">
          <div class="flex-1">
            <div class="flex flex-wrap items-center gap-2 mb-2">
              <span class="text-lg">🚫</span>
              <span class="font-semibold text-sm">Silencia anuncios</span>
              <span class="px-2 py-0.5 rounded-full text-xs font-medium bg-slate-700 text-slate-400 border border-slate-600">
                Solo para cuentas gratuitas
              </span>
              <span
                class="px-2 py-0.5 rounded-full text-xs font-medium transition-colors"
                :class="features.silenceAds
                  ? 'bg-emerald-500/20 text-emerald-300 border border-emerald-500/30'
                  : 'bg-slate-700 text-slate-400 border border-slate-600'"
              >
                {{ features.silenceAds ? 'Activado' : 'Desactivado' }}
              </span>
            </div>
            <p class="text-xs text-slate-400">
              Cuando la notificación de Spotify contiene alguna palabra clave (por defecto: "publicidad", "anuncio", "anuncios"), Skippify
              silencia temporalmente el volumen multimedia durante su reproducción.
              Exclusivo para usuarios con cuenta gratuita.
            </p>
            <p class="text-xs text-slate-500 mt-1">Experimental · Requiere acceso a notificaciones</p>

            <div class="mt-4 pt-3 border-t border-slate-800">
              <p class="text-xs text-slate-400 mb-2 font-medium">Palabras clave detectadas:</p>
              <div class="flex flex-wrap gap-2 mb-3">
                <span
                  v-for="kw in features.silenceAdsKeywords"
                  :key="kw"
                  class="inline-flex items-center gap-1 px-2 py-1 rounded-full text-xs border bg-slate-800 text-slate-200 border-slate-700"
                >
                  {{ kw }}
                  <button
                    v-if="!requiredKeywords.includes(kw)"
                    @click="removeKeyword(kw)"
                    class="text-slate-400 hover:text-rose-300"
                    aria-label="Quitar palabra"
                  >
                    ×
                  </button>
                </span>
              </div>

              <div class="flex flex-col sm:flex-row gap-2">
                <input
                  v-model="newKeyword"
                  @keydown.enter.prevent="addKeyword"
                  type="text"
                  placeholder="Añadir palabra personalizada"
                  class="flex-1 rounded-lg bg-slate-800 border border-slate-700 px-3 py-2 text-xs text-slate-100 placeholder-slate-500 focus:outline-none focus:border-emerald-500"
                >
                <button
                  @click="addKeyword"
                  class="rounded-lg px-3 py-2 text-xs font-medium border border-emerald-500/40 text-emerald-300 bg-emerald-500/10 hover:bg-emerald-500/20"
                >
                  Añadir
                </button>
              </div>
              <p class="text-[11px] text-slate-500 mt-2">
                Las palabras por defecto no se pueden eliminar.
              </p>
            </div>
          </div>
          <!-- Toggle switch -->
          <div class="shrink-0 flex items-center pt-0.5">
            <button
              role="switch"
              :aria-checked="features.silenceAds"
              @click="features.silenceAds = !features.silenceAds"
              class="relative inline-flex h-6 w-11 items-center rounded-full transition-colors focus:outline-none focus-visible:ring-2 focus-visible:ring-emerald-500"
              :class="features.silenceAds ? 'bg-emerald-500' : 'bg-slate-700'"
            >
              <span
                class="inline-block h-4 w-4 transform rounded-full bg-white shadow-sm transition-transform"
                :class="features.silenceAds ? 'translate-x-6' : 'translate-x-1'"
              />
            </button>
          </div>
        </div>
      </div>

    </div>
  </div>
</template>

<script setup>
import { useFeatures } from '@/composables/useFeatures'
import { computed, ref } from 'vue'
const { state: features, isSkipDuplicatesLocked, getSkipDuplicatesLockReason } = useFeatures()
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
  { value: '1w',  label: '1 semana'  },
  { value: '2w',  label: '2 semanas' },
  { value: '1m',  label: '1 mes'     },
  { value: '3m',  label: '3 meses'   },
  { value: '6m',  label: '6 meses'   },
  { value: '1y',  label: '1 año'     },
]
</script>

<style scoped>
.fade-enter-active, .fade-leave-active {
  transition: opacity 0.2s ease, max-height 0.25s ease;
  overflow: hidden;
  max-height: 200px;
}
.fade-enter-from, .fade-leave-to {
  opacity: 0;
  max-height: 0;
}
</style>
