<template>
  <section class="grid grid-cols-2 gap-3">
    <StatTile
      label="Duración media sesión"
      :value="sessionsYear.averageMinutes"
      unit="min"
      badge="Año"
      hint="Una sesión termina tras 30 min sin escuchar"
      glow="from-brand-500/12"
    />
    <StatTile
      label="Número de sesiones"
      :value="sessionsYear.count"
      badge="Año"
      :hint="hintSesiones"
      glow="from-indigo-500/12"
    />
  </section>
</template>

<script setup>
import { computed } from 'vue'
import StatTile from '@/components/StatTile.vue'
import { useAnalytics } from '@/composables/useAnalytics'

const { sessionsYear, yearEvents } = useAnalytics()

const hintSesiones = computed(() => (
  sessionsYear.value.count
    ? `${yearEvents.value.length} escuchas en el último año`
    : 'Todavía sin escuchas registradas'
))
</script>
