<template>
  <div class="flex min-h-screen">
    <!-- ── Splash de arranque (1,5 s) ─────────────────────────────────────── -->
    <Transition name="splash-fade">
      <div
        v-if="showSplash"
        class="splash fixed inset-0 z-[90] flex items-center justify-center overflow-hidden bg-ink-900"
      >
        <div class="splash-aurora absolute inset-0" />
        <div class="splash-grid absolute inset-0" />

        <div class="relative z-10 flex flex-col items-center px-6 text-center">
          <!-- El logo se dibuja de un trazo y después se enciende. -->
          <div class="relative mb-7 flex h-24 w-24 items-center justify-center">
            <span class="splash-ring absolute inset-0 rounded-[28px] border border-brand-400/35" />
            <span class="splash-ring splash-ring--delay absolute inset-0 rounded-[28px] border border-brand-400/20" />
            <span class="splash-disc relative flex h-[72px] w-[72px] items-center justify-center rounded-[22px] border border-brand-400/35 bg-gradient-to-br from-brand-400/25 to-teal-500/5 shadow-glow">
              <BrandMark gradient class="splash-mark h-10 w-10" :trail-opacity="0.75" />
            </span>
          </div>

          <p class="splash-in splash-in--1 text-[10px] font-semibold uppercase tracking-[0.34em] text-brand-300/80">
            Bienvenido
          </p>

          <h1 class="mt-2.5 flex text-5xl font-extrabold tracking-tight sm:text-6xl">
            <span
              v-for="(char, i) in splashLetters"
              :key="i"
              class="splash-letter bg-gradient-to-b from-white via-brand-50 to-brand-300 bg-clip-text text-transparent"
              :style="{ animationDelay: `${120 + i * 40}ms` }"
            >{{ char }}</span>
          </h1>

          <p class="splash-in splash-in--2 mt-3 text-sm text-slate-300/90">
            Funcionalidades premium para tu Spotify
          </p>

          <!-- La barra recorre exactamente los 1,5 s que dura la pantalla. -->
          <div class="splash-in splash-in--2 mt-7 h-[3px] w-40 overflow-hidden rounded-full bg-white/10">
            <span class="splash-progress block h-full rounded-full bg-gradient-to-r from-brand-400 to-teal-300" />
          </div>
        </div>
      </div>
    </Transition>

    <AppSidebar v-model:open="sidebarOpen" />

    <div class="flex-1 min-w-0">
      <!-- ── Aviso de permisos en el primer arranque ──────────────────────── -->
      <Transition name="modal">
        <div
          v-if="notif.showPermissionsModal.value"
          class="fixed inset-0 z-50 flex items-center justify-center bg-black/70 p-4 backdrop-blur-sm"
        >
          <div class="sk-card sk-card-lit w-full max-w-md border-amber-400/30 p-6">
            <div class="mb-4 flex items-center gap-3">
              <span class="flex h-11 w-11 items-center justify-center rounded-2xl border border-amber-400/30 bg-amber-500/12 text-xl">🔔</span>
              <div>
                <h2 class="text-base font-semibold text-amber-100">Permisos requeridos</h2>
                <p class="text-[11px] text-amber-200/60">Acceso a notificaciones</p>
              </div>
            </div>
            <p class="mb-2 text-sm leading-relaxed text-slate-300">
              Skippify necesita acceso a las notificaciones del sistema para detectar
              automáticamente las canciones que escuchas en Spotify.
            </p>
            <p class="mb-5 text-sm text-slate-400">
              Dirígete a la pestaña <span class="font-semibold text-slate-200">Configuración</span> para
              revisar y conceder los permisos necesarios.
            </p>
            <div class="flex flex-wrap gap-2">
              <button
                class="sk-btn flex-1 border-amber-400/40 bg-amber-500/20 text-amber-100 hover:bg-amber-500/30"
                @click="goToSettings"
              >
                Ir a Configuración
              </button>
              <button class="sk-btn sk-btn-ghost sk-btn-sm" @click="notif.dismissPermissionsModal()">
                Ahora no
              </button>
            </div>
          </div>
        </div>
      </Transition>

      <div class="mx-auto max-w-7xl px-4 pb-14 pt-6 sm:px-6">
        <header class="mb-7" data-tour="app-header">
          <div class="flex items-center gap-3">
            <button
              class="rounded-xl border border-white/[0.08] bg-white/[0.03] p-2.5 text-slate-400 transition-all hover:bg-white/[0.08] hover:text-white md:hidden"
              aria-label="Abrir menú"
              @click="sidebarOpen = true"
            >
              <svg xmlns="http://www.w3.org/2000/svg" class="h-5 w-5" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round">
                <line x1="3" y1="12" x2="21" y2="12" /><line x1="3" y1="6" x2="21" y2="6" /><line x1="3" y1="18" x2="21" y2="18" />
              </svg>
            </button>

            <div class="hidden h-11 w-11 shrink-0 items-center justify-center rounded-2xl border border-brand-500/25 bg-gradient-to-br from-brand-500/20 to-teal-500/5 shadow-lg shadow-brand-500/10 sm:flex">
              <BrandMark gradient class="h-6 w-6" />
            </div>

            <div class="min-w-0 flex-1">
              <h1 class="truncate bg-gradient-to-r from-white via-slate-100 to-slate-400 bg-clip-text text-2xl font-extrabold leading-tight tracking-tight text-transparent sm:text-[28px]">
                {{ currentTabTitle }}
              </h1>
              <p class="mt-0.5 line-clamp-2 text-xs text-slate-500 sm:text-[13px]">{{ currentTabDescription }}</p>
            </div>

            <!-- Estado en vivo, siempre visible sin volver a Inicio. -->
            <span
              class="hidden shrink-0 items-center gap-2 rounded-full border px-3 py-1.5 text-[11px] font-medium lg:inline-flex"
              :class="statusPill.classes"
            >
              <span class="h-1.5 w-1.5 rounded-full" :class="statusPill.dot" />
              {{ statusPill.label }}
            </span>
          </div>

          <div class="sk-divider mt-5" />
        </header>

        <router-view v-slot="{ Component }">
          <Transition name="view" mode="out-in">
            <component
              :is="Component"
              :now-playing="nowPlaying"
              @update-now-playing="setNowPlaying"
            />
          </Transition>
        </router-view>
      </div>

      <AppTour
        v-model="showTour"
        @complete="completeTour"
        @toggle-sidebar="handleTourSidebarToggle"
      />
    </div>
  </div>
</template>

<script setup>
import { ref, computed, onMounted, onBeforeUnmount, watch } from 'vue'
import { useRouter, useRoute } from 'vue-router'
import AppSidebar from '@/components/AppSidebar.vue'
import AppTour from '@/components/AppTour.vue'
import BrandMark from '@/components/BrandMark.vue'
import { useNotifListener } from '@/composables/useNotifListener'
import { useFeatures } from '@/composables/useFeatures'

const sidebarOpen = ref(false)
const notif = useNotifListener()
const { initializeNativeFeatures } = useFeatures()
const nowPlaying = ref({ mode: 'stopped' })
const router = useRouter()
const route = useRoute()
const showTour = ref(false)
const showSplash = ref(true)
const TOUR_DONE_KEY = `skippify.tour.build.${__APP_BUILD_ID__}.completed`
const SPLASH_MS = 1500
const splashLetters = 'Skippify'.split('')

const currentTabTitle = computed(() => route.meta?.title || 'Skippify')
const currentTabDescription = computed(() => route.meta?.description || 'Funcionalidades premium para tu Spotify')

const statusPill = computed(() => {
  const mode = nowPlaying.value?.mode
  if (mode === 'playing') {
    return {
      label: 'Reproduciendo',
      classes: 'border-brand-400/30 bg-brand-500/12 text-brand-200',
      dot: 'bg-brand-400 animate-pulse'
    }
  }
  if (mode === 'paused') {
    return {
      label: 'En pausa',
      classes: 'border-amber-400/30 bg-amber-500/12 text-amber-200',
      dot: 'bg-amber-400'
    }
  }
  return {
    label: 'Sin reproducción',
    classes: 'border-white/10 bg-white/[0.03] text-slate-400',
    dot: 'bg-slate-600'
  }
})

let splashTimer = null
let tourTimer = null

function setNowPlaying (state) {
  nowPlaying.value = state
}

function handleTourSidebarToggle (open) {
  sidebarOpen.value = !!open
}

function goToSettings () {
  notif.dismissPermissionsModal()
  router.push('/settings')
}

function completeTour () {
  localStorage.setItem(TOUR_DONE_KEY, '1')
}

let userNavigated = false

// Si el usuario (o la notificación nativa) navega durante el splash, no se le
// devuelve a Inicio a la fuerza.
const stopNavWatch = router.afterEach(() => { userNavigated = true })

onMounted(async () => {
  splashTimer = setTimeout(() => {
    if (!userNavigated && router.currentRoute.value.path !== '/') {
      router.replace('/')
    }
    showSplash.value = false
  }, SPLASH_MS)

  await initializeNativeFeatures()
  await notif.checkAndInit(setNowPlaying)

  const requestedRoute = notif.consumePendingOpenRoute()
  if (requestedRoute) router.replace(requestedRoute)

  const tourCompleted = localStorage.getItem(TOUR_DONE_KEY) === '1'
  if (!tourCompleted) {
    tourTimer = setTimeout(() => {
      showTour.value = true
    }, SPLASH_MS + 350)
  }
})

watch(() => notif.pendingOpenRoute.value, (route) => {
  if (!route) return
  notif.consumePendingOpenRoute()
  if (router.currentRoute.value.path !== route) router.replace(route)
})

onBeforeUnmount(() => {
  if (splashTimer) clearTimeout(splashTimer)
  if (tourTimer) clearTimeout(tourTimer)
  stopNavWatch()
})
</script>

<style>
.modal-enter-active,
.modal-leave-active {
  transition: opacity 0.2s ease, transform 0.2s ease;
}
.modal-enter-from,
.modal-leave-to {
  opacity: 0;
  transform: scale(0.96);
}

/* Cambio de pestaña: un desplazamiento corto, sin llegar a parecer una carga. */
.view-enter-active {
  transition: opacity 0.22s ease, transform 0.22s cubic-bezier(0.22, 1, 0.36, 1);
}
.view-leave-active {
  transition: opacity 0.12s ease;
}
.view-enter-from {
  opacity: 0;
  transform: translateY(8px);
}
.view-leave-to {
  opacity: 0;
}

.splash-fade-enter-active,
.splash-fade-leave-active {
  transition: opacity 0.35s ease, transform 0.35s ease;
}

.splash-fade-enter-from,
.splash-fade-leave-to {
  opacity: 0;
}

.splash-fade-leave-to {
  transform: scale(1.05);
}

/* ── Splash de 1,5 s ──────────────────────────────────────────────────────
   Todos los tiempos caben dentro de la ventana: el trazo del logo termina a los
   0,62 s, el texto entra hasta 0,58 s y la barra cierra justo al desaparecer.
   ────────────────────────────────────────────────────────────────────────── */
.splash-aurora {
  background:
    radial-gradient(circle at 20% 24%, rgba(16, 185, 129, 0.32), transparent 46%),
    radial-gradient(circle at 80% 76%, rgba(45, 212, 191, 0.20), transparent 44%),
    radial-gradient(circle at 58% 10%, rgba(56, 189, 248, 0.14), transparent 40%);
  animation: splash-aurora 1.5s ease-out both;
}

.splash-grid {
  background-image:
    linear-gradient(rgba(148, 163, 184, 0.07) 1px, transparent 1px),
    linear-gradient(90deg, rgba(148, 163, 184, 0.07) 1px, transparent 1px);
  background-size: 44px 44px;
  mask-image: radial-gradient(circle at 50% 45%, #000 0%, transparent 68%);
  -webkit-mask-image: radial-gradient(circle at 50% 45%, #000 0%, transparent 68%);
  animation: splash-grid 1.1s ease-out forwards;
}

.splash-disc {
  animation: splash-disc 0.7s cubic-bezier(0.34, 1.45, 0.64, 1) both;
}

.splash-ring {
  animation: splash-ring 1.2s ease-out infinite;
}

.splash-ring--delay {
  animation-delay: 0.6s;
}

/* 70 supera holgadamente la longitud real del trazo de la «S» y de la estela:
   basta para recorrer el contorno entero sin medirlo por JS. */
.splash-mark .sk-mark-s {
  stroke-dasharray: 70;
  stroke-dashoffset: 70;
  animation: splash-draw 0.62s ease-out 0.06s forwards;
}

.splash-mark .sk-mark-trail {
  opacity: 0;
  animation: splash-trail 0.4s ease-out 0.34s forwards;
}

.splash-letter {
  display: inline-block;
  white-space: pre;
  opacity: 0;
  animation: splash-letter 0.4s cubic-bezier(0.22, 1.2, 0.36, 1) both;
}

.splash-in {
  opacity: 0;
  animation: splash-in 0.4s ease-out both;
}

.splash-in--1 { animation-delay: 0.06s; }
.splash-in--2 { animation-delay: 0.5s; }

.splash-progress {
  width: 0;
  animation: splash-progress 1.5s cubic-bezier(0.35, 0.6, 0.3, 1) forwards;
}

@keyframes splash-aurora {
  from { opacity: 0.35; transform: scale(1); }
  to   { opacity: 0.9; transform: scale(1.08); }
}

@keyframes splash-grid {
  from { opacity: 0; transform: scale(1.2); }
  to   { opacity: 1; transform: scale(1); }
}

@keyframes splash-disc {
  0%   { opacity: 0; transform: scale(0.55) rotate(-14deg); }
  65%  { opacity: 1; transform: scale(1.07) rotate(3deg); }
  100% { opacity: 1; transform: scale(1) rotate(0deg); }
}

@keyframes splash-ring {
  0%   { opacity: 0.6; transform: scale(0.82); }
  100% { opacity: 0; transform: scale(1.3); }
}

@keyframes splash-draw {
  from { stroke-dashoffset: 70; opacity: 0.4; }
  to   { stroke-dashoffset: 0; opacity: 1; }
}

@keyframes splash-trail {
  from { opacity: 0; transform: translateX(-4px); }
  to   { opacity: 0.75; transform: translateX(0); }
}

@keyframes splash-letter {
  from { opacity: 0; transform: translateY(14px); filter: blur(5px); }
  to   { opacity: 1; transform: translateY(0); filter: blur(0); }
}

@keyframes splash-in {
  from { opacity: 0; transform: translateY(8px); }
  to   { opacity: 1; transform: translateY(0); }
}

@keyframes splash-progress {
  from { width: 0; }
  to   { width: 100%; }
}

/* Respeta la preferencia del sistema: sin movimiento, sólo aparición. */
@media (prefers-reduced-motion: reduce) {
  .splash-aurora,
  .splash-grid,
  .splash-disc,
  .splash-ring,
  .splash-letter,
  .splash-in,
  .splash-progress,
  .splash-mark .sk-mark-s,
  .splash-mark .sk-mark-trail {
    animation: none !important;
    opacity: 1;
  }
  .splash-progress { width: 100%; }
  .splash-mark .sk-mark-s { stroke-dashoffset: 0; }
}
</style>
