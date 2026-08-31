<template>
  <section class="grid grid-cols-2 gap-3">
    <StatTile
      label="Canciones"
      :value="kpiTracks"
      badge="Semana"
      :delta="kpiTracksChangePct"
      :hint="hintCanciones"
      glow="from-sky-500/12"
    />
    <StatTile
      label="Artistas"
      :value="kpiArtists"
      badge="Semana"
      :delta="kpiArtistsChangePct"
      :hint="hintArtistas"
      glow="from-teal-500/12"
    />
  </section>
</template>

<script setup>
import { computed } from 'vue'
import StatTile from '@/components/StatTile.vue'
import { useAnalytics } from '@/composables/useAnalytics'

const {
  kpiTracks,
  kpiArtists,
  kpiTracksChangePct,
  kpiArtistsChangePct,
  kpiTracksPrevWeek,
  kpiArtistsPrevWeek
} = useAnalytics()

/**
 * La pista aclara contra qué se compara la pastilla de porcentaje. Sin semana
 * anterior no hay comparación posible y se dice, en vez de fingir un +100 %.
 */
function pista (previo, adjetivo) {
  return previo
    ? `${previo} ${adjetivo} la semana anterior`
    : 'Aún no hay semana anterior con la que comparar'
}

const hintCanciones = computed(() => pista(kpiTracksPrevWeek.value, 'distintas'))
const hintArtistas = computed(() => pista(kpiArtistsPrevWeek.value, 'distintos'))
</script>
