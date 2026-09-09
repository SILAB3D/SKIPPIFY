<template>
  <Transition name="tour-slide">
    <div
      v-if="modelValue"
      class="fixed inset-x-0 bottom-0 z-[100] px-3 pb-3 sm:px-4 sm:pb-4"
      role="dialog"
      aria-label="Guía rápida de Skippify"
      @keydown.esc.prevent="handleSkip"
    >
      <div class="tour-panel mx-auto w-full max-w-2xl">
        <!-- Barra de progreso: primero, porque es lo que sitúa al usuario -->
        <div class="h-1 w-full overflow-hidden rounded-t-2xl bg-white/[0.06]">
          <div
            class="h-full bg-gradient-to-r from-brand-400 to-teal-400 transition-all duration-300"
            :style="{ width: `${((stepIndex + 1) / steps.length) * 100}%` }"
          />
        </div>

        <div class="p-4 sm:p-5">
          <div class="mb-3 flex items-start justify-between gap-3">
            <div class="flex min-w-0 items-center gap-3">
              <span
                class="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl border border-brand-400/25 bg-brand-500/12 text-lg"
              >{{ currentStep.icon }}</span>
              <div class="min-w-0">
                <p class="text-[10px] font-semibold uppercase tracking-[0.2em] text-brand-300/80">
                  {{ currentStep.eyebrow }}
                </p>
                <h3 class="truncate text-base font-semibold leading-tight text-white">{{ currentStep.title }}</h3>
              </div>
            </div>
            <span class="shrink-0 whitespace-nowrap text-xs text-slate-400">{{ stepIndex + 1 }} / {{ steps.length }}</span>
          </div>

          <!-- Cuerpo: descripción, elección de modo o estado de permisos -->
          <div class="tour-body">
            <p v-if="!currentStep.permissions" class="text-sm leading-relaxed text-slate-200/90">
              {{ currentStep.description }}
            </p>

            <!-- Paso obligatorio: sin modo elegido no se pasa de aquí. Se
                 resuelve dentro del panel para no depender de que la tarjeta de
                 Funciones quede visible detrás en pantallas pequeñas. -->
            <template v-if="currentStep.requiereModo">
              <div class="mt-3 grid gap-2 sm:grid-cols-3">
                <button
                  v-for="modo in modosEscucha"
                  :key="modo.id"
                  type="button"
                  class="rounded-xl border p-3 text-left transition-all duration-200"
                  :class="modoElegido === modo.id
                    ? 'border-brand-400/45 bg-brand-500/[0.10]'
                    : 'border-white/[0.07] bg-white/[0.03] hover:border-white/[0.18]'"
                  @click="elegirModoEscucha(modo.id)"
                >
                  <p class="text-sm font-semibold" :class="modoElegido === modo.id ? 'text-brand-100' : 'text-white'">
                    {{ modo.icon }} {{ modo.title }}
                  </p>
                  <p class="mt-1 text-[11px] leading-relaxed text-slate-400">{{ modo.detail }}</p>
                </button>
              </div>

              <p
                class="mt-2.5 text-[11px] leading-relaxed"
                :class="modoElegido ? 'text-brand-300' : 'text-amber-300'"
              >
                <template v-if="modoElegido">
                  Listo: has elegido {{ tituloModo(modoElegido) }}. Puedes cambiarlo cuando
                  quieras desde Funciones o desde la notificación persistente.
                </template>
                <template v-else>
                  Elige uno para continuar.
                </template>
              </p>
            </template>

            <template v-else>
              <p class="text-sm leading-relaxed text-slate-200/90">{{ currentStep.description }}</p>

              <ul v-if="isCapacitor" class="mt-3 space-y-2">
                <li
                  v-for="permiso in permisos"
                  :key="permiso.id"
                  class="flex items-start gap-3 rounded-xl border px-3 py-2.5"
                  :class="permiso.granted
                    ? 'border-brand-400/25 bg-brand-500/[0.07]'
                    : 'border-amber-400/25 bg-amber-500/[0.06]'"
                >
                  <span class="mt-0.5 text-base">{{ permiso.granted ? '✅' : '⚠️' }}</span>
                  <div class="min-w-0 flex-1">
                    <p class="text-sm font-medium text-slate-100">{{ permiso.title }}</p>
                    <p class="mt-0.5 text-[11px] leading-relaxed text-slate-400">{{ permiso.detail }}</p>
                  </div>
                  <span
                    class="shrink-0 self-center rounded-md px-1.5 py-0.5 text-[10px] font-semibold uppercase tracking-wide"
                    :class="permiso.granted ? 'bg-brand-500/15 text-brand-300' : 'bg-amber-500/15 text-amber-300'"
                  >{{ permiso.granted ? 'Concedido' : 'Pendiente' }}</span>
                </li>
              </ul>

              <p v-else class="mt-3 rounded-xl border border-white/[0.07] bg-white/[0.03] px-3 py-2.5 text-[11px] leading-relaxed text-slate-400">
                Estás viendo Skippify en el navegador: aquí no hay permisos que conceder.
                En la app de Android este último paso te dice cuáles faltan.
              </p>
              <button
                v-if="isCapacitor && faltanPermisos"
                class="sk-btn sk-btn-primary sk-btn-sm mt-3 w-full"
                @click="irAConfiguracion"
              >
                Conceder los permisos que faltan
              </button>
            </template>
          </div>

          <div class="mt-4 flex items-center justify-between gap-2">
            <button
              v-if="!currentStep.requiereModo"
              class="px-2 py-1 text-xs text-slate-400 transition-colors hover:text-slate-200"
              @click="handleSkip"
            >
              Omitir
            </button>
            <span v-else />

            <div class="flex items-center gap-2">
              <button class="sk-btn sk-btn-ghost sk-btn-sm" :disabled="stepIndex === 0" @click="prevStep">
                Atrás
              </button>
              <button
                class="sk-btn sk-btn-primary sk-btn-sm disabled:opacity-40"
                :disabled="!puedeAvanzar"
                @click="nextStep"
              >
                {{ isLastStep ? 'Finalizar' : 'Siguiente' }}
              </button>
            </div>
          </div>
        </div>
      </div>
    </div>
  </Transition>
</template>

<script setup>
/**
 * Guía rápida de Skippify.
 *
 * Antes era un recorrido con foco: un recuadro que perseguía elementos por la
 * pantalla y una tarjeta que saltaba de sitio en cada paso. En un móvil eso se
 * traducía en texto reposicionándose y en pasos que fallaban cuando el elemento
 * resaltado no llegaba a tiempo o quedaba fuera de la vista.
 *
 * Ahora el panel está anclado abajo y no se mueve: cada paso cambia de pestaña
 * detrás para que se vea de lo que se habla, y el último resume qué permisos
 * hacen falta y cuáles están concedidos ahora mismo, que es la información con
 * la que conviene terminar.
 */
import { computed, onMounted, ref, watch } from 'vue'
import { useRouter } from 'vue-router'
import { useNotifListener } from '@/composables/useNotifListener'
import { useFeatures } from '@/composables/useFeatures'

const props = defineProps({
  modelValue: { type: Boolean, default: false }
})

const emit = defineEmits(['update:modelValue', 'complete', 'step-change', 'toggle-sidebar'])
const router = useRouter()
const { notifEnabled, isCapacitor, getPlugin } = useNotifListener()
const { state: features, setListeningMode } = useFeatures()

/** Los mismos tres modos que la pestaña Funciones, en versión corta. */
const modosEscucha = [
  { id: 'discovery', icon: '🧭', title: 'Descubrimiento', detail: 'No repetir nada en un año.' },
  { id: 'casual', icon: '🎧', title: 'Casual', detail: 'Sin filtros: no se salta nada.' },
  { id: 'custom', icon: '🛠️', title: 'Personalizado', detail: 'Tú decides cada cuánto se repite.' }
]

/** Vacío mientras no se haya elegido nunca: el valor por defecto no cuenta. */
const modoElegido = computed(() => (features.listeningModeChosen ? features.listeningMode : ''))

function tituloModo (id) {
  return modosEscucha.find(m => m.id === id)?.title || id
}

function elegirModoEscucha (id) {
  // Personalizado entra con la frecuencia que ya hubiera guardada; afinarla es
  // cosa de la pestaña Funciones, no de un paso de la guía.
  setListeningMode(id)
}

const postNotifGranted = ref(true)
const batteryOptimizationIgnored = ref(false)

/** Un paso por pestaña, más la bienvenida y el cierre con los permisos. */
const PASOS = [
  {
    id: 'bienvenida',
    icon: '👋',
    eyebrow: 'Guía rápida',
    title: 'Bienvenido a Skippify',
    description: 'Skippify escucha lo que suena en Spotify y lo convierte en estadísticas claras y en automatismos que te ahorran tocar el móvil. Este recorrido dura menos de un minuto.',
    route: '/'
  },
  {
    id: 'inicio',
    icon: '🏠',
    eyebrow: 'Pestaña',
    title: 'Inicio',
    description: 'El pulso del día: qué suena ahora, cuántas canciones y artistas distintos llevas esta semana (y si subes o bajas respecto a la anterior), cuántas duplicadas se han detectado y saltado, la curva de escuchas por día y el historial completo, buscable y filtrable.',
    route: '/'
  },
  {
    id: 'estadisticas',
    icon: '📊',
    eyebrow: 'Pestaña',
    title: 'Estadísticas',
    description: 'La vista larga: rankings de canciones y artistas por período, rachas de escucha, horas por mes y un mapa de calor que marca tus horas punta del último año.',
    route: '/stats'
  },
  {
    id: 'funciones',
    icon: '⚙️',
    eyebrow: 'Pestaña',
    title: 'Funciones',
    description: 'Las dos automatizaciones. El salto de duplicadas se configura con un modo predefinido —Descubrimiento o Casual— o eligiendo tú cada cuánto se puede repetir una canción; debajo está la calibración por si el salto se comporta raro. Y aparte, el silenciado de anuncios para cuentas gratuitas.',
    route: '/features'
  },
  {
    id: 'modo-escucha',
    icon: '🎚️',
    eyebrow: 'Elige uno',
    title: 'Tu modo de escucha',
    description: 'Antes de seguir, dile a Skippify cada cuánto puedes repetir una canción. Es lo que gobierna el salto de duplicadas, así que sin esto la función no sabe qué hacer.',
    route: '/features',
    requiereModo: true
  },
  {
    id: 'comunidad',
    icon: '🏆',
    eyebrow: 'Pestaña',
    title: 'Comunidad',
    description: 'Crea un grupo o únete con un código de 6 caracteres. Cada domingo se publica el ranking de lo que habéis escuchado durante la semana.',
    route: '/comunidad'
  },
  {
    id: 'macros',
    icon: '⚡',
    eyebrow: 'Pestaña',
    title: 'Macros',
    description: 'Automatiza tu biblioteca encadenando origen, acción y destino: por ejemplo, «las novedades de esta playlist → copiarlas → a Tus me gusta». Se ejecutan con la app abierta y recuerdan por dónde iban.',
    route: '/macros'
  },
  {
    id: 'configuracion',
    icon: '🛡️',
    eyebrow: 'Pestaña',
    title: 'Configuración',
    description: 'Permisos, respaldo e importación de tu historial, limpieza de datos antiguos y qué pestañas quieres ver en el menú.',
    route: '/settings'
  },
  {
    id: 'permisos',
    icon: '🔐',
    eyebrow: 'Para terminar',
    title: 'Permisos necesarios',
    description: 'Sin estos permisos Skippify no puede detectar lo que suena. Este es su estado ahora mismo:',
    route: '/settings',
    permissions: true
  }
]

/** Los pasos de pestañas ocultas se omiten: contarlas confundiría. */
const steps = computed(() => PASOS)

const stepIndex = ref(0)
const currentStep = computed(() => steps.value[stepIndex.value] || steps.value[0])
const isLastStep = computed(() => stepIndex.value === steps.value.length - 1)

const permisos = computed(() => [
  {
    id: 'notif-access',
    title: 'Acceso a notificaciones',
    detail: 'Es el permiso imprescindible: sin él Skippify no ve qué canción suena.',
    granted: notifEnabled.value
  },
  {
    id: 'post-notifications',
    title: 'Mostrar notificaciones',
    detail: 'Necesario en Android 13 o superior para la notificación persistente con los modos.',
    granted: postNotifGranted.value
  },
  {
    id: 'battery',
    title: 'Sin optimización de batería',
    detail: 'Evita que Android detenga el servicio y se pierdan escuchas en segundo plano.',
    granted: batteryOptimizationIgnored.value
  }
])

const faltanPermisos = computed(() => permisos.value.some(p => !p.granted))

/** El paso del modo de escucha no deja avanzar hasta que se elige uno. */
const puedeAvanzar = computed(() => !currentStep.value?.requiereModo || !!modoElegido.value)

async function refrescarPermisos () {
  const NL = getPlugin()
  if (!NL?.getPermissionsState) return
  try {
    const result = await NL.getPermissionsState()
    postNotifGranted.value = !!result?.postNotificationsGranted
    batteryOptimizationIgnored.value = !!result?.batteryOptimizationIgnored
  } catch { /* ignored */ }
}

async function irAPaso (indice) {
  stepIndex.value = indice
  const paso = currentStep.value
  emit('step-change', indice)
  if (paso?.route && router.currentRoute.value.path !== paso.route) {
    await router.push(paso.route)
  }
  if (paso?.permissions) await refrescarPermisos()
}

async function nextStep () {
  if (!puedeAvanzar.value) return
  if (isLastStep.value) {
    emit('complete')
    emit('update:modelValue', false)
    return
  }
  await irAPaso(stepIndex.value + 1)
}

async function prevStep () {
  if (stepIndex.value === 0) return
  await irAPaso(stepIndex.value - 1)
}

function handleSkip () {
  emit('complete')
  emit('update:modelValue', false)
}

function irAConfiguracion () {
  emit('complete')
  emit('update:modelValue', false)
  router.push('/settings')
}

watch(() => props.modelValue, async (open) => {
  // El menú lateral ya no se abre durante la guía: el panel explica la pestaña
  // y la pestaña se ve detrás, sin nada que tape la pantalla.
  emit('toggle-sidebar', false)
  if (!open) return
  await irAPaso(0)
})

onMounted(() => {
  if (props.modelValue) irAPaso(0)
})
</script>

<style scoped>
.tour-panel {
  border-radius: 18px;
  border: 1px solid rgba(52, 211, 153, 0.28);
  background: linear-gradient(150deg, rgba(12, 18, 29, 0.98), rgba(2, 6, 23, 0.99));
  box-shadow: 0 -12px 60px rgba(0, 0, 0, 0.55), 0 0 0 1px rgba(148, 163, 184, 0.06) inset;
  overflow: hidden;
}

/* El cuerpo crece con el contenido pero nunca se come la pantalla: en el paso
   de permisos son tres tarjetas y en un móvil bajo hay que poder desplazarlas. */
.tour-body {
  max-height: min(46vh, 340px);
  overflow-y: auto;
}

.tour-slide-enter-active,
.tour-slide-leave-active {
  transition: opacity 0.25s ease, transform 0.28s cubic-bezier(0.22, 1, 0.36, 1);
}

.tour-slide-enter-from,
.tour-slide-leave-to {
  opacity: 0;
  transform: translateY(16px);
}

@media (prefers-reduced-motion: reduce) {
  .tour-slide-enter-active,
  .tour-slide-leave-active {
    transition: none;
  }
}
</style>
