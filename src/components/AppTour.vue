<template>
  <Transition name="tour-fade">
    <div v-if="modelValue" class="fixed inset-0 z-[100]" @keydown.esc.prevent="handleSkip">
      <div class="absolute inset-0 bg-slate-950/72" />

      <div
        v-if="highlightRect"
        class="tour-spotlight"
        :style="spotlightStyle"
      />

      <div class="absolute inset-0 pointer-events-none">
        <div ref="tourCardRef" class="tour-card pointer-events-auto" :style="cardStyle">
          <div :key="stepIndex" class="tour-step-content">
            <div class="flex items-start justify-between gap-3 mb-3">
              <div>
                <p class="text-[11px] uppercase tracking-[0.2em] text-brand-300/80 font-semibold">Guía rápida</p>
                <h3 class="text-lg font-semibold text-white leading-tight">{{ currentStep.title }}</h3>
              </div>
              <span class="text-xs text-slate-400 whitespace-nowrap">{{ stepIndex + 1 }} / {{ steps.length }}</span>
            </div>

            <p class="text-sm text-slate-200/90 leading-relaxed mb-4">{{ currentStep.description }}</p>

            <div class="mb-4 h-1.5 w-full overflow-hidden rounded-full border border-white/[0.07] bg-white/[0.04]">
              <div class="h-full bg-gradient-to-r from-brand-400 to-teal-400 transition-all duration-300" :style="progressStyle" />
            </div>

            <div class="flex items-center justify-between gap-2">
              <button
                class="text-xs text-slate-400 hover:text-slate-200 transition-colors px-2 py-1"
                @click="handleSkip"
              >
                Omitir
              </button>

              <div class="flex items-center gap-2">
                <button
                  class="sk-btn sk-btn-ghost sk-btn-sm"
                  :disabled="stepIndex === 0"
                  @click="prevStep"
                >
                  Atrás
                </button>

                <button
                  class="sk-btn sk-btn-primary sk-btn-sm"
                  @click="nextStep"
                >
                  {{ isLastStep ? 'Finalizar' : 'Siguiente' }}
                </button>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  </Transition>
</template>

<script setup>
import { computed, nextTick, onBeforeUnmount, onMounted, ref, watch } from 'vue'
import { useRouter } from 'vue-router'

const props = defineProps({
  modelValue: {
    type: Boolean,
    default: false
  }
})

const emit = defineEmits(['update:modelValue', 'complete', 'step-change', 'toggle-sidebar'])
const router = useRouter()

/**
 * Guion del tutorial inicial. Cada paso lleva a su pestaña, abre el menú si el
 * elemento vive ahí y resalta lo que se está explicando.
 */
const steps = [
  {
    title: 'Bienvenido a Skippify',
    description: 'Skippify escucha lo que suena en Spotify y lo convierte en estadísticas claras y automatismos que te ahorran tocar el móvil. Este recorrido dura menos de un minuto.',
    route: '/',
    selector: '[data-tour="app-header"]',
    openSidebar: false
  },
  {
    title: 'Reproducción en directo',
    description: 'Este panel es el pulso de la app: estado, avance real de la canción, duración y álbum, actualizados al vuelo aunque la pantalla esté en segundo plano.',
    route: '/',
    selector: '[data-tour="now-playing"]',
    openSidebar: false
  },
  {
    title: 'Inicio',
    description: 'Bajo el panel tienes tus métricas del día, la curva de la semana y el historial completo, buscable y filtrable por mes.',
    route: '/',
    selector: '[data-tour="dashboard-nav"]',
    openSidebar: true
  },
  {
    title: 'Estadísticas',
    description: 'Rankings por período, rachas de escucha, horas por mes y un mapa de calor que marca tus horas punta de todo el año.',
    route: '/stats',
    selector: '[data-tour="stats-nav"]',
    openSidebar: true
  },
  {
    title: 'Funciones',
    description: 'Una sola pantalla con las dos automatizaciones: arriba el salto de canciones duplicadas —modo de escucha e intervalo incluidos— y abajo el silenciado de anuncios para cuentas gratuitas.',
    route: '/features',
    selector: '[data-tour="features-nav"]',
    openSidebar: true
  },
  {
    title: 'Modos de escucha',
    description: 'El interruptor maestro del salto: Descubrimiento evita repetir nada en un año, Casual desactiva los filtros y Personalizado te devuelve tus ajustes.',
    route: '/features',
    selector: '[data-tour="listening-modes"]',
    openSidebar: false
  },
  {
    title: 'Calibración del salto',
    description: 'Si el salto de duplicadas se comporta raro (se oye un trozo, salta la que no era, se queda en pausa…), este asistente monta una prueba controlada y ajusta el motor contigo hasta resolverlo.',
    route: '/features',
    selector: '[data-tour="calibration-cta"]',
    openSidebar: false
  },
  {
    title: 'Friendly-Wrapped',
    description: 'Tu resumen de escucha compartido: entra en uno o varios grupos de amigos y cada semana se publica el ranking con lo que habéis escuchado.',
    route: '/friendly-wrapped',
    selector: '[data-tour="league-nav"]',
    openSidebar: true
  },
  {
    title: 'Configuración',
    description: 'El último paso importante: concede aquí el acceso a las notificaciones —sin él Skippify no detecta nada— y gestiona respaldos y pestañas visibles.',
    route: '/settings',
    selector: '[data-tour="settings-nav"]',
    openSidebar: true
  }
]

const stepIndex = ref(0)
const highlightRect = ref(null)
const tourCardRef = ref(null)
let refreshRunId = 0

const currentStep = computed(() => steps[stepIndex.value])
const isLastStep = computed(() => stepIndex.value === steps.length - 1)
const progressStyle = computed(() => ({ width: `${((stepIndex.value + 1) / steps.length) * 100}%` }))

const spotlightStyle = computed(() => {
  if (!highlightRect.value) return {}

  return {
    left: `${highlightRect.value.left}px`,
    top: `${highlightRect.value.top}px`,
    width: `${highlightRect.value.width}px`,
    height: `${highlightRect.value.height}px`
  }
})

const cardStyle = computed(() => {
  const viewportPadding = 12
  const estimatedCardHeight = tourCardRef.value?.offsetHeight || 280
  const maxWidth = Math.min(420, window.innerWidth - 24)

  if (!highlightRect.value) {
    return {
      width: `${maxWidth}px`,
      left: `${Math.max(viewportPadding, (window.innerWidth - maxWidth) / 2)}px`,
      top: `${Math.max(viewportPadding, window.innerHeight - estimatedCardHeight - viewportPadding)}px`,
      maxHeight: `calc(100vh - ${viewportPadding * 2}px)`
    }
  }

  const margin = 14
  const preferredLeft = highlightRect.value.left
  const clampedLeft = Math.min(Math.max(viewportPadding, preferredLeft), window.innerWidth - maxWidth - viewportPadding)
  const belowTop = highlightRect.value.top + highlightRect.value.height + margin
  const aboveTop = highlightRect.value.top - estimatedCardHeight - margin
  const preferredTop = belowTop + estimatedCardHeight <= window.innerHeight - viewportPadding ? belowTop : aboveTop
  const topMax = Math.max(viewportPadding, window.innerHeight - estimatedCardHeight - viewportPadding)
  const clampedTop = Math.min(
    Math.max(viewportPadding, preferredTop),
    topMax
  )

  return {
    width: `${maxWidth}px`,
    left: `${clampedLeft}px`,
    top: `${clampedTop}px`,
    maxHeight: `calc(100vh - ${viewportPadding * 2}px)`
  }
})

function getVisibleElement (selector) {
  const nodes = Array.from(document.querySelectorAll(selector))
  return nodes.find((node) => {
    const rect = node.getBoundingClientRect()
    return rect.width > 0 && rect.height > 0
  }) || null
}

function delay (ms) {
  return new Promise(resolve => setTimeout(resolve, ms))
}

async function findElementWithRetry (selector, attempts = 10, intervalMs = 50) {
  for (let i = 0; i < attempts; i++) {
    const target = getVisibleElement(selector)
    if (target) return target
    await delay(intervalMs)
  }
  return null
}

async function refreshHighlight () {
  if (!props.modelValue) return

  const runId = ++refreshRunId

  const step = currentStep.value
  emit('step-change', stepIndex.value)
  emit('toggle-sidebar', !!step.openSidebar)

  if (step.route && router.currentRoute.value.path !== step.route) {
    await router.push(step.route)
  }

  await nextTick()
  if (step.openSidebar) {
    await new Promise(resolve => setTimeout(resolve, 180))
  }

  if (runId !== refreshRunId) return

  if (!step.selector) {
    highlightRect.value = null
    return
  }

  const target = await findElementWithRetry(step.selector)
  if (runId !== refreshRunId) return
  if (!target) {
    highlightRect.value = null
    return
  }

  const rect = target.getBoundingClientRect()
  highlightRect.value = {
    left: Math.max(8, rect.left - 8),
    top: Math.max(8, rect.top - 8),
    width: rect.width + 16,
    height: rect.height + 16
  }
}

async function nextStep () {
  if (isLastStep.value) {
    emit('complete')
    emit('update:modelValue', false)
    return
  }

  stepIndex.value += 1
  await refreshHighlight()
}

async function prevStep () {
  if (stepIndex.value === 0) return
  stepIndex.value -= 1
  await refreshHighlight()
}

function handleSkip () {
  emit('complete')
  emit('toggle-sidebar', false)
  emit('update:modelValue', false)
}

function onWindowChange () {
  refreshHighlight()
}

watch(() => props.modelValue, async (open) => {
  if (!open) {
    emit('toggle-sidebar', false)
    return
  }
  stepIndex.value = 0
  await refreshHighlight()
})

onMounted(() => {
  window.addEventListener('resize', onWindowChange)
  window.addEventListener('scroll', onWindowChange, true)
})

onBeforeUnmount(() => {
  window.removeEventListener('resize', onWindowChange)
  window.removeEventListener('scroll', onWindowChange, true)
})
</script>

<style scoped>
.tour-card {
  position: fixed;
  border-radius: 16px;
  border: 1px solid rgba(52, 211, 153, 0.3);
  background: linear-gradient(150deg, rgba(12, 18, 29, 0.97), rgba(2, 6, 23, 0.98));
  box-shadow: 0 20px 70px rgba(0, 0, 0, 0.5), 0 0 0 1px rgba(148, 163, 184, 0.06) inset;
  padding: 16px;
  overflow-y: auto;
  transition: left 320ms cubic-bezier(0.22, 1, 0.36, 1), top 320ms cubic-bezier(0.22, 1, 0.36, 1), width 260ms ease;
}

.tour-step-content {
  animation: tour-step-fade 260ms ease;
}

.tour-spotlight {
  position: fixed;
  border-radius: 14px;
  border: 1px solid rgba(52, 211, 153, 0.6);
  box-shadow: 0 0 0 9999px rgba(2, 6, 23, 0.62), 0 0 0 1px rgba(16, 185, 129, 0.35) inset, 0 0 24px rgba(16, 185, 129, 0.45);
  backdrop-filter: blur(0px);
  -webkit-backdrop-filter: blur(0px);
  transition: left 340ms cubic-bezier(0.22, 1, 0.36, 1), top 340ms cubic-bezier(0.22, 1, 0.36, 1), width 280ms ease, height 280ms ease;
  pointer-events: none;
}

.tour-fade-enter-active,
.tour-fade-leave-active {
  transition: opacity 0.25s ease;
}

.tour-fade-enter-from,
.tour-fade-leave-to {
  opacity: 0;
}

@keyframes tour-step-fade {
  from {
    opacity: 0;
    transform: translateY(4px);
  }
  to {
    opacity: 1;
    transform: translateY(0);
  }
}
</style>
