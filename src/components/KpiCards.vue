<template>
  <section class="grid grid-cols-1 gap-4 mb-6">
    <div class="rounded-2xl border border-slate-800 bg-slate-900 p-5 flex flex-col">
      <div class="flex items-start justify-between gap-2 mb-1">
        <p class="text-slate-400 text-sm">Escuchas hoy</p>
        <span class="inline-flex rounded-md border border-slate-700 bg-slate-800/80 px-2 py-0.5 text-[10px] uppercase tracking-wide text-slate-400">Diario</span>
      </div>
      <p class="text-4xl font-bold mt-auto">{{ kpiToday }}</p>
    </div>
  </section>
</template>

<script setup>
import { useAnalytics } from '@/composables/useAnalytics'

const { kpiToday } = useAnalytics()
</script>
