<template>
  <div class="sk-stagger space-y-3">
    <button
      v-for="mode in modes"
      :key="mode.id"
      type="button"
      class="sk-card w-full overflow-hidden p-5 text-left transition-all duration-200"
      :class="state.listeningMode === mode.id ? mode.activeClass : 'sk-card-hover'"
      @click="setListeningMode(mode.id)"
    >
      <div
        v-if="state.listeningMode === mode.id"
        class="pointer-events-none absolute inset-0 bg-gradient-to-br to-transparent"
        :class="mode.washClass"
      />

      <div class="relative flex items-start gap-4">
        <span
          class="flex h-11 w-11 shrink-0 items-center justify-center rounded-2xl border text-xl transition-colors"
          :class="state.listeningMode === mode.id ? mode.iconClass : 'border-white/[0.07] bg-white/[0.03]'"
        >{{ mode.icon }}</span>

        <div class="min-w-0 flex-1">
          <div class="flex flex-wrap items-center gap-2">
            <span class="text-base font-semibold text-white">{{ mode.title }}</span>
            <span
              class="sk-chip"
              :class="state.listeningMode === mode.id ? mode.badgeClass : ''"
            >{{ state.listeningMode === mode.id ? 'Seleccionado' : 'Disponible' }}</span>
          </div>
          <p class="mt-1.5 text-sm leading-relaxed text-slate-300">{{ mode.description }}</p>
          <p class="mt-2 text-[11px] leading-relaxed text-slate-500">{{ mode.detail }}</p>
        </div>

        <span
          class="mt-1 flex h-5 w-5 shrink-0 items-center justify-center rounded-full border transition-colors"
          :class="state.listeningMode === mode.id ? mode.radioClass : 'border-white/15'"
          aria-hidden="true"
        >
          <span v-if="state.listeningMode === mode.id" class="h-2 w-2 rounded-full bg-current" />
        </span>
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
    activeClass: 'border-cyan-400/35 shadow-[0_0_0_1px_rgba(34,211,238,0.14),0_18px_44px_-24px_rgba(34,211,238,0.45)]',
    washClass: 'from-cyan-500/10',
    iconClass: 'border-cyan-400/30 bg-cyan-500/12',
    badgeClass: 'border-cyan-400/30 bg-cyan-500/12 text-cyan-200',
    radioClass: 'border-cyan-400/50 text-cyan-300'
  },
  {
    id: 'casual',
    icon: '🎧',
    title: 'Casual',
    description: 'Permite escuchar música sin filtros para mantener una experiencia libre de automatizaciones en duplicadas.',
    detail: 'Saltar duplicadas permanece desactivado y bloqueado mientras este modo esté activo.',
    activeClass: 'border-amber-400/35 shadow-[0_0_0_1px_rgba(251,191,36,0.14),0_18px_44px_-24px_rgba(251,191,36,0.45)]',
    washClass: 'from-amber-500/10',
    iconClass: 'border-amber-400/30 bg-amber-500/12',
    badgeClass: 'border-amber-400/30 bg-amber-500/12 text-amber-200',
    radioClass: 'border-amber-400/50 text-amber-300'
  },
  {
    id: 'custom',
    icon: '🛠️',
    title: 'Personalizado',
    description: 'Te permite ajustar las funcionalidades de escucha según tus preferencias, sin restricciones de modo.',
    detail: 'Recupera tu configuración personalizada de saltar duplicadas para que puedas modificarla libremente.',
    activeClass: 'border-brand-400/35 shadow-glow',
    washClass: 'from-brand-500/10',
    iconClass: 'border-brand-400/30 bg-brand-500/12',
    badgeClass: 'sk-chip-accent',
    radioClass: 'border-brand-400/50 text-brand-300'
  }
]
</script>
