<template>
  <section class="grid grid-cols-1 gap-4 mb-6">
    <div class="rounded-2xl border border-slate-800 bg-slate-900 p-5 flex flex-col">
      <div class="flex items-start justify-between gap-2 mb-1">
        <p class="text-slate-400 text-sm">Escuchas hoy</p>
        <span class="inline-flex rounded-md border border-slate-700 bg-slate-800/80 px-2 py-0.5 text-[10px] uppercase tracking-wide text-slate-400">Diario</span>
      </div>
      <p class="text-4xl font-bold mt-auto">{{ kpiToday }}</p>
      <p class="mt-1 text-xs" :class="todayDeltaClass">{{ todayDeltaLabel }}</p>
    </div>
  </section>
</template>

<script setup>
import { computed } from 'vue'
import { useAnalytics } from '@/composables/useAnalytics'

const { kpiToday, kpiTodayChangePct } = useAnalytics()

const todayDeltaLabel = computed(() => {
  const value = Number(kpiTodayChangePct.value || 0)
  const sign = value > 0 ? '+' : ''
  return `${sign}${value}% respecto ayer`
})

const todayDeltaClass = computed(() => {
  const value = Number(kpiTodayChangePct.value || 0)
  if (value > 0) return 'text-emerald-300'
  if (value < 0) return 'text-rose-300'
  return 'text-slate-400'
})
</script>
