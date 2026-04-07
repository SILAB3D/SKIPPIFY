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
                    :disabled="skipDuplicatesLocked"
                    @click="features.skipDuplicatesInterval = opt.value"
                    class="px-3 py-1 rounded-full text-xs font-medium border transition-colors disabled:cursor-not-allowed disabled:opacity-60"
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
              :disabled="skipDuplicatesLocked"
              @click="features.skipDuplicates = !features.skipDuplicates"
              class="relative inline-flex h-6 w-11 items-center rounded-full transition-colors focus:outline-none focus-visible:ring-2 focus-visible:ring-emerald-500 disabled:cursor-not-allowed disabled:opacity-60"
              :class="features.skipDuplicates ? 'bg-emerald-500' : 'bg-slate-700'"
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
              Cuando la notificacion de Spotify contiene "Publicidad", "anuncio" o "anuncios", Skippify
              silencia temporalmente el volumen multimedia durante su reproducción.
              Exclusivo para usuarios con cuenta gratuita.
            </p>
            <p class="text-xs text-slate-500 mt-1">Experimental · Requiere acceso a notificaciones</p>
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
import { computed } from 'vue'

const { state: features, isSkipDuplicatesLocked, getSkipDuplicatesLockReason } = useFeatures()

const skipDuplicatesLocked = computed(() => isSkipDuplicatesLocked())
const skipDuplicatesLockReason = computed(() => getSkipDuplicatesLockReason())

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
