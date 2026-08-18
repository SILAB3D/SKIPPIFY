<template>
  <section class="sk-card sk-card-lit p-5">
    <header class="mb-4 flex flex-wrap items-start justify-between gap-2">
      <div>
        <h2 class="sk-title">Escuchas por día</h2>
        <p class="sk-subtitle">Ritmo de la última semana, día a día</p>
      </div>
      <div class="flex items-center gap-2">
        <span class="sk-chip sk-chip-accent">{{ weekTotal }} escuchas</span>
        <span class="sk-chip">7 días</span>
      </div>
    </header>

    <div class="h-56 sm:h-64">
      <Line :data="data" :options="options" />
    </div>
  </section>
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

const weekTotal = computed(() => chartData.value.data.reduce((a, b) => a + b, 0))

const data = computed(() => ({
  labels: chartData.value.labels,
  datasets: [{
    label: 'Escuchas',
    data: chartData.value.data,
    borderColor: '#34d399',
    borderWidth: 2.5,
    // Degradado vertical: el relleno plano aplanaba visualmente los picos.
    backgroundColor: (ctx) => {
      const { chart } = ctx
      if (!chart.chartArea) return 'rgba(52, 211, 153, 0.16)'
      const g = chart.ctx.createLinearGradient(0, chart.chartArea.top, 0, chart.chartArea.bottom)
      g.addColorStop(0, 'rgba(52, 211, 153, 0.34)')
      g.addColorStop(1, 'rgba(52, 211, 153, 0)')
      return g
    },
    fill: true,
    tension: 0.38,
    pointRadius: 3,
    pointHoverRadius: 6,
    pointBackgroundColor: '#050b14',
    pointBorderColor: '#34d399',
    pointBorderWidth: 2
  }]
}))

const options = {
  responsive: true,
  maintainAspectRatio: false,
  interaction: { mode: 'index', intersect: false },
  plugins: {
    legend: { display: false },
    tooltip: {
      backgroundColor: 'rgba(5, 11, 20, 0.95)',
      borderColor: 'rgba(52, 211, 153, 0.3)',
      borderWidth: 1,
      titleColor: '#e2e8f0',
      bodyColor: '#a7f3d0',
      padding: 10,
      displayColors: false
    }
  },
  scales: {
    x: {
      ticks: { color: '#64748b', font: { size: 11 } },
      grid: { display: false },
      border: { display: false }
    },
    y: {
      min: 0,
      ticks: { color: '#64748b', precision: 0, font: { size: 11 }, maxTicksLimit: 5 },
      grid: { color: 'rgba(148,163,184,0.08)' },
      border: { display: false }
    }
  }
}
</script>
