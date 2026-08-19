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

const incompleteHint = computed(() => {
  const { tracked, count, unmeasured } = incompletePlays.value
  if (!tracked) return 'Todavía sin reproducciones medidas'
  const base = `${count} de ${tracked} entre el 25 % y el 80 %`
  // Las reproducciones que la app dejó de seguir (servicio caído en segundo
  // plano) quedan fuera del porcentaje: contarlas lo inflaba.
  return unmeasured ? `${base} · ${unmeasured} sin medir` : base
})
</script>
