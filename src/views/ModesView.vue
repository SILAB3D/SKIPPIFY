<template>
  <div class="space-y-4">
    <button
      v-for="mode in modes"
      :key="mode.id"
      type="button"
      class="w-full rounded-2xl border p-5 text-left transition-all duration-200"
      :class="state.listeningMode === mode.id
        ? `${mode.activeClass} shadow-lg ${mode.shadowClass}`
        : 'border-slate-800 bg-slate-900 hover:border-slate-700 hover:bg-slate-900/90'"
      @click="setListeningMode(mode.id)"
    >
      <div class="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
        <div class="min-w-0 flex-1">
          <div class="mb-2 flex flex-wrap items-center gap-2">
            <span class="text-lg">{{ mode.icon }}</span>
            <span class="text-base font-semibold text-white">{{ mode.title }}</span>
            <span
              class="rounded-full border px-2 py-0.5 text-xs font-medium"
              :class="state.listeningMode === mode.id ? mode.badgeActiveClass : 'border-slate-700 bg-slate-800 text-slate-400'"
            >
              {{ state.listeningMode === mode.id ? 'Seleccionado' : 'Disponible' }}
            </span>
          </div>
          <p class="text-sm text-slate-300">{{ mode.description }}</p>
          <p class="mt-2 text-xs text-slate-500">{{ mode.detail }}</p>
        </div>

        <div class="flex shrink-0 items-center gap-2 text-xs text-slate-400">
          <span
            class="flex h-6 w-6 items-center justify-center rounded-full border transition-colors"
            :class="state.listeningMode === mode.id ? mode.radioClass : 'border-slate-700 bg-slate-800 text-transparent'"
            aria-hidden="true"
          >
            <span class="text-[11px]">●</span>
          </span>
        </div>
      </div>
    </button>
  </div>
</template>

<script setup>
import { useFeatures } from '@/composables/useFeatures'

const { state, setListeningMode } = useFeatures()

const modes = [
  {
    id: 'discovery',
    icon: '🧭',
    title: 'Descubrimiento',
    description: 'Prioriza canciones fuera de tu repertorio habitual para fomentar una escucha más variada.',
    detail: 'Saltar duplicadas queda activado con un intervalo fijo de 1 año mientras este modo esté activo.',
    activeClass: 'border-cyan-400/40 bg-cyan-500/10',
    badgeActiveClass: 'border-cyan-400/40 bg-cyan-500/15 text-cyan-200',
    radioClass: 'border-cyan-400/40 bg-cyan-500/15 text-cyan-200',
    shadowClass: 'shadow-cyan-500/10'
  },
  {
    id: 'casual',
    icon: '🎧',
    title: 'Casual',
    description: 'Permite escuchar música sin filtros para mantener una experiencia libre de automatizaciones en duplicadas.',
    detail: 'Saltar duplicadas permanece desactivado y bloqueado mientras este modo esté activo.',
    activeClass: 'border-amber-400/40 bg-amber-500/10',
    badgeActiveClass: 'border-amber-400/40 bg-amber-500/15 text-amber-200',
    radioClass: 'border-amber-400/40 bg-amber-500/15 text-amber-200',
    shadowClass: 'shadow-amber-500/10'
  },
  {
    id: 'custom',
    icon: '🛠️',
    title: 'Personalizado',
    description: 'Te permite ajustar las funcionalidades de escucha según tus preferencias, sin restricciones de modo.',
    detail: 'Recupera tu configuración personalizada de saltar duplicadas para que puedas modificarla libremente.',
    activeClass: 'border-emerald-400/40 bg-emerald-500/10',
    badgeActiveClass: 'border-emerald-400/40 bg-emerald-500/15 text-emerald-200',
    radioClass: 'border-emerald-400/40 bg-emerald-500/15 text-emerald-200',
    shadowClass: 'shadow-emerald-500/10'
  }
]
</script>
