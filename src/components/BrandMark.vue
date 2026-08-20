<template>
  <svg
    :viewBox="BRAND_VIEWBOX"
    xmlns="http://www.w3.org/2000/svg"
    fill="none"
    aria-hidden="true"
  >
    <defs v-if="gradient">
      <!-- De abajo-izquierda a arriba-derecha: el azul nace en la base de la
           «S» y el lima sale por su remate. -->
      <linearGradient :id="gradientId" x1="0" y1="1" x2="1" y2="0">
        <stop
          v-for="stop in BRAND_GRADIENT"
          :key="stop.offset"
          :offset="`${stop.offset * 100}%`"
          :stop-color="stop.color"
        />
      </linearGradient>
    </defs>

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
  BRAND_S_WIDTH,
  BRAND_GRADIENT
} from '@/lib/brandMark'

defineProps({
  /** Con el degradado azul→lima; si no, hereda `currentColor`. */
  gradient: { type: Boolean, default: false }
})

// Un id por instancia: varios logos en pantalla con el mismo id de degradado
// harían que todos usaran la definición del primero que se monta.
const gradientId = `sk-mark-${useId()}`
</script>
