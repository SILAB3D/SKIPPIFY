<template>
  <svg
    :viewBox="BRAND_VIEWBOX"
    xmlns="http://www.w3.org/2000/svg"
    fill="none"
    aria-hidden="true"
  >
    <defs v-if="gradient">
      <linearGradient :id="gradientId" x1="0" y1="0" x2="1" y2="1">
        <stop offset="0%" stop-color="#6EE7B7" />
        <stop offset="55%" stop-color="#10B981" />
        <stop offset="100%" stop-color="#2DD4BF" />
      </linearGradient>
    </defs>

    <path
      class="sk-mark-trail"
      :d="BRAND_TRAIL_PATH"
      :stroke="gradient ? '#2DD4BF' : 'currentColor'"
      :stroke-width="BRAND_TRAIL_WIDTH"
      stroke-linecap="round"
      :opacity="trailOpacity"
    />
    <path
      class="sk-mark-s"
      :d="BRAND_S_PATH"
      :stroke="gradient ? `url(#${gradientId})` : 'currentColor'"
      :stroke-width="BRAND_S_WIDTH"
      stroke-linecap="round"
      stroke-linejoin="round"
    />
  </svg>
</template>

<script setup>
/**
 * Marca de Skippify. El trazo viene de `src/lib/brandMark.js`, generado por
 * `scripts/generate-brand-assets.mjs` a partir de la misma geometría que el
 * icono del launcher y el de notificación: así los tres no pueden divergir.
 */
import { useId } from 'vue'
import {
  BRAND_VIEWBOX,
  BRAND_S_PATH,
  BRAND_TRAIL_PATH,
  BRAND_S_WIDTH,
  BRAND_TRAIL_WIDTH
} from '@/lib/brandMark'

defineProps({
  /** Con degradado esmeralda→teal; si no, hereda `currentColor`. */
  gradient: { type: Boolean, default: false },
  trailOpacity: { type: [Number, String], default: 0.6 }
})

// Un id por instancia: varios logos en pantalla con el mismo id de degradado
// harían que todos usaran la definición del primero que se monta.
const gradientId = `sk-mark-${useId()}`
</script>
