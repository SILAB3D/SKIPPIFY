<template>
  <article class="sk-card sk-card-hover group overflow-hidden p-4">
    <!-- Tinte propio de cada métrica: da a la rejilla un ritmo de color sin
         llegar a competir con el panel de reproducción. -->
    <div class="pointer-events-none absolute inset-x-0 top-0 h-16 bg-gradient-to-b to-transparent opacity-70" :class="glow" />

    <div class="relative">
      <div class="flex items-start justify-between gap-2">
        <p class="sk-eyebrow">{{ label }}</p>
        <span v-if="badge" class="sk-chip !px-2 !py-0.5 !text-[10px] uppercase tracking-wide">{{ badge }}</span>
      </div>

      <div class="mt-2 flex items-baseline gap-2">
        <p class="text-[28px] font-bold leading-none tracking-tight" :class="tone">{{ value }}</p>
        <span v-if="unit" class="text-xs font-medium text-slate-500">{{ unit }}</span>
        <span
          v-if="delta !== null && delta !== undefined"
          class="ml-auto rounded-md px-1.5 py-0.5 text-[11px] font-semibold"
          :class="delta >= 0 ? 'bg-brand-500/12 text-brand-300' : 'bg-rose-500/12 text-rose-300'"
        >{{ delta >= 0 ? '+' : '' }}{{ delta }}%</span>
      </div>

      <p v-if="hint" class="sk-stat-hint">{{ hint }}</p>
    </div>
  </article>
</template>

<script setup>
defineProps({
  label: { type: String, required: true },
  value: { type: [String, Number], required: true },
  unit: { type: String, default: '' },
  hint: { type: String, default: '' },
  badge: { type: String, default: '' },
  /** Variación porcentual opcional; se pinta como pastilla verde/roja. */
  delta: { type: Number, default: null },
  tone: { type: String, default: 'text-slate-50' },
  glow: { type: String, default: 'from-brand-500/10' }
})
</script>
