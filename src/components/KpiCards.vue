<template>
  <section class="grid grid-cols-2 gap-3 lg:grid-cols-3">
    <StatTile
      label="Escuchas hoy"
      :value="kpiToday"
      badge="Hoy"
      :delta="kpiTodayChangePct"
      hint="Comparado con el mismo total de ayer"
      glow="from-brand-500/14"
    />
    <StatTile
      label="Artistas"
      :value="kpiArtists"
      badge="7 días"
      hint="Distintos en la última semana"
      glow="from-teal-500/12"
    />
    <StatTile
      class="col-span-2 lg:col-span-1"
      label="Canciones"
      :value="kpiTracks"
      badge="7 días"
      hint="Distintas en la última semana"
      glow="from-sky-500/12"
    />
  </section>
</template>

<script setup>
import StatTile from '@/components/StatTile.vue'
import { useAnalytics } from '@/composables/useAnalytics'

const { kpiToday, kpiTodayChangePct, kpiArtists, kpiTracks } = useAnalytics()
</script>
