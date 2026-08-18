<template>
  <section class="grid grid-cols-2 gap-3 lg:grid-cols-3">
    <StatTile
      label="Duplicadas"
      :value="duplicatesMonth.dupeEntries"
      badge="Mes"
      :hint="duplicatesHint"
      tone="text-violet-200"
      glow="from-violet-500/12"
    />
    <StatTile
      label="Sesión media"
      :value="sessions.averageMinutes"
      unit="min"
      badge="General"
      :hint="`${sessions.count} sesiones detectadas`"
      glow="from-brand-500/12"
    />
    <StatTile
      class="col-span-2 lg:col-span-1"
      label="Escuchas incompletas"
      :value="`${incompletePlays.rate}%`"
      badge="General"
      :hint="incompleteHint"
      tone="text-amber-200"
      glow="from-amber-500/12"
    />
  </section>
</template>

<script setup>
import { computed } from 'vue'
import StatTile from '@/components/StatTile.vue'
import { useAnalytics } from '@/composables/useAnalytics'

const { duplicatesMonth, sessions, incompletePlays } = useAnalytics()

const duplicatesHint = computed(() => (
  duplicatesMonth.value.total
    ? `${duplicatesMonth.value.duplicateRate}% del total registrado este mes`
    : 'Sin reproducciones este mes'
))

const incompleteHint = computed(() => (
  incompletePlays.value.tracked
    ? `${incompletePlays.value.count} de ${incompletePlays.value.tracked} sin llegar al 90 %`
    : 'Todavía sin duraciones registradas'
))
</script>
