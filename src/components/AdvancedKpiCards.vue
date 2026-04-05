<template>
  <section class="grid grid-cols-1 md:grid-cols-3 gap-4 mb-6">

    <!-- Canciones duplicadas -->
    <div class="rounded-2xl border border-slate-800 bg-slate-900 p-5">
      <div class="flex items-start justify-between gap-2">
        <p class="text-slate-400 text-sm">Canciones duplicadas</p>
        <span class="inline-flex rounded-md border border-slate-700 bg-slate-800/80 px-2 py-0.5 text-[10px] uppercase tracking-wide text-slate-400">Mensual</span>
      </div>
      <p class="text-3xl font-semibold mt-2">{{ duplicatesMonth.dupeEntries }}</p>
      <p class="text-xs text-slate-400 mt-1">
        <span v-if="duplicatesMonth.total">
          {{ duplicatesMonth.duplicateRate }}% del total registrado
        </span>
        <span v-else>Sin reproducciones este mes</span>
      </p>
    </div>

    <!-- Tiempo medio de sesión -->
    <div class="rounded-2xl border border-slate-800 bg-slate-900 p-5">
      <div class="flex items-start justify-between gap-2">
        <p class="text-slate-400 text-sm">Tiempo medio de sesión</p>
        <span class="inline-flex rounded-md border border-slate-700 bg-slate-800/80 px-2 py-0.5 text-[10px] uppercase tracking-wide text-slate-400">General</span>
      </div>
      <p class="text-3xl font-semibold mt-2">{{ sessions.averageMinutes }} min</p>
    </div>

  </section>
</template>

<script setup>
import { useAnalytics } from '@/composables/useAnalytics'

const { duplicatesMonth, sessions } = useAnalytics()
</script>
