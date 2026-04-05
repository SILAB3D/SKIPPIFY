<template>
  <div class="xl:col-span-2 rounded-2xl border border-slate-800 bg-slate-900 p-5">
    <div class="mb-3 flex items-start justify-between gap-2">
      <h2 class="text-lg font-semibold">Escuchas por día</h2>
      <span class="inline-flex rounded-md border border-slate-700 bg-slate-800/80 px-2 py-0.5 text-[10px] uppercase tracking-wide text-slate-400">7 días</span>
    </div>
    <Line :data="data" :options="options" />
  </div>
</template>

<script setup>
import { computed } from 'vue'
import { Line } from 'vue-chartjs'
import {
  Chart as ChartJS,
  CategoryScale,
  LinearScale,
  PointElement,
  LineElement,
  Filler,
  Tooltip,
  Legend
} from 'chart.js'
import { useAnalytics } from '@/composables/useAnalytics'

ChartJS.register(CategoryScale, LinearScale, PointElement, LineElement, Filler, Tooltip, Legend)

const { chartData } = useAnalytics()

const data = computed(() => ({
  labels: chartData.value.labels,
  datasets: [{
    label: 'Escuchas',
    data: chartData.value.data,
    borderColor: '#34d399',
    backgroundColor: 'rgba(52, 211, 153, 0.2)',
    fill: true,
    tension: 0.3
  }]
}))

const options = {
  responsive: true,
  maintainAspectRatio: true,
  plugins: { legend: { display: false } },
  scales: {
    x: { ticks: { color: '#94a3b8' }, grid: { color: 'rgba(148,163,184,0.12)' } },
    y: {
      min: 0,
      ticks: { color: '#94a3b8', precision: 0 },
      grid: { color: 'rgba(148,163,184,0.12)' }
    }
  }
}
</script>
