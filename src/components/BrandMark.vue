<template>
  <svg
    :viewBox="BRAND_VIEWBOX"
    xmlns="http://www.w3.org/2000/svg"
    fill="none"
    aria-hidden="true"
  >
    <defs v-if="gradient">
      <!-- De abajo-izquierda a arriba-derecha: el azul nace en la base de la
           «S» y el lima sale por donde apunta el glifo de salto. -->
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
      v-for="(line, i) in strokes"
      :key="i"
      :class="`sk-mark-${line.role}`"
      :d="line.d"
      :stroke="gradient ? `url(#${gradientId})` : 'currentColor'"
      :stroke-width="line.width"
      stroke-linecap="round"
      stroke-linejoin="round"
      :opacity="line.role === 'wave' ? waveOpacity : 1"
    />
    <path
      class="sk-mark-skip"
      :d="BRAND_FILL"
      :fill="gradient ? `url(#${gradientId})` : 'currentColor'"
    />
  </svg>
</template>

<script setup>
/**
 * Marca de Skippify. El trazo viene de `src/lib/brandMark.js`, generado por
 * `scripts/generate-brand-assets.mjs` a partir de la misma geometría que el
 * icono del launcher y el de notificación: así los tres no pueden divergir.
 *
 * Cada trazo llega etiquetado con su papel —`ribbon`, `wave` o `skip`—, que se
 * traslada a la clase CSS para que el splash pueda animarlos por separado.
 */
import { computed, useId } from 'vue'
import {
  BRAND_VIEWBOX,
  BRAND_STROKES,
  BRAND_STROKES_COMPACT,
  BRAND_FILL,
  BRAND_GRADIENT
} from '@/lib/brandMark'

const props = defineProps({
  /** Con el degradado azul→lima; si no, hereda `currentColor`. */
  gradient: { type: Boolean, default: false },
  /** Las barras de onda son un acento: van por detrás del trazo principal. */
  waveOpacity: { type: [Number, String], default: 0.6 },
  /** Sin barras de onda, para tamaños por debajo de unos 24 px. */
  compact: { type: Boolean, default: false }
})

const strokes = computed(() => (props.compact ? BRAND_STROKES_COMPACT : BRAND_STROKES))

// Un id por instancia: varios logos en pantalla con el mismo id de degradado
// harían que todos usaran la definición del primero que se monta.
const gradientId = `sk-mark-${useId()}`
</script>
