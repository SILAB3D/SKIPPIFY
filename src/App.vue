<template>
  <div class="flex min-h-screen">
    <Transition name="splash-fade">
      <div
        v-if="showSplash"
        class="splash fixed inset-0 z-[90] flex items-center justify-center overflow-hidden"
      >
        <div class="absolute inset-0 bg-gradient-to-br from-slate-950 via-slate-900 to-emerald-950" />
        <div class="splash-aurora absolute inset-0" />
        <div class="splash-grid absolute inset-0" />

        <div class="relative z-10 flex flex-col items-center px-6 text-center">
          <!-- Disco + ondas: el logo late al ritmo mientras carga -->
          <div class="relative mb-8 flex h-28 w-28 items-center justify-center">
            <span class="splash-ring absolute inset-0 rounded-full border border-emerald-400/40" />
            <span class="splash-ring splash-ring--delay absolute inset-0 rounded-full border border-emerald-400/25" />
            <span class="splash-disc relative flex h-20 w-20 items-center justify-center rounded-full bg-gradient-to-br from-emerald-400/30 to-teal-500/10 border border-emerald-400/40 shadow-2xl shadow-emerald-500/25">
              <svg xmlns="http://www.w3.org/2000/svg" class="h-9 w-9 text-emerald-300" viewBox="0 0 24 24" fill="currentColor">
                <path d="M12 3v10.55A4 4 0 1 0 14 17V7h4V3h-6z"/>
              </svg>
            </span>
          </div>

          <p class="splash-in splash-in--1 text-[11px] uppercase tracking-[0.32em] text-emerald-300/80">Bienvenido</p>

          <!-- Letra a letra: cada carácter entra con su propio retardo -->
          <h1 class="mt-3 flex text-5xl sm:text-6xl font-extrabold tracking-tight">
            <span
              v-for="(char, i) in splashLetters"
              :key="i"
              class="splash-letter bg-gradient-to-b from-white via-emerald-100 to-emerald-300 bg-clip-text text-transparent"
              :style="{ animationDelay: `${260 + i * 70}ms` }"
            >{{ char }}</span>
          </h1>

          <p class="splash-in splash-in--2 mt-4 text-sm sm:text-base text-slate-300/90">
            Funcionalidades premium para tu Spotify
          </p>

          <!-- Ecualizador -->
          <div class="splash-in splash-in--3 mt-8 flex h-6 items-end gap-1.5">
            <span
              v-for="n in 5"
              :key="n"
              class="splash-bar w-1.5 rounded-full bg-gradient-to-t from-emerald-500 to-teal-300"
              :style="{ animationDelay: `${n * 120}ms` }"
            />
          </div>

          <!-- Barra de progreso: recorre exactamente los 3 s del splash -->
          <div class="splash-in splash-in--3 mt-8 h-[3px] w-44 overflow-hidden rounded-full bg-slate-700/50">
            <span class="splash-progress block h-full rounded-full bg-gradient-to-r from-emerald-400 to-teal-300" />
          </div>
        </div>
      </div>
    </Transition>

    <!-- Sidebar -->
    <AppSidebar v-model:open="sidebarOpen" />

    <!-- Main content -->
    <div class="flex-1 min-w-0">

      <!-- First-launch permissions modal -->
      <Transition name="modal">
        <div
          v-if="notif.showPermissionsModal.value"
          class="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/70 backdrop-blur-sm"
        >
          <div class="w-full max-w-md rounded-2xl border-2 border-amber-400/40 bg-slate-950 shadow-2xl p-6">
            <div class="flex items-center gap-3 mb-4">
              <span class="text-3xl">🔔</span>
              <h2 class="text-lg font-semibold text-amber-200">Permisos requeridos</h2>
            </div>
            <p class="text-sm text-slate-300 mb-2">
              Skippify necesita acceso a las notificaciones del sistema para detectar
              automáticamente las canciones que escuchas en Spotify.
            </p>
            <p class="text-sm text-slate-400 mb-5">
              Dirígete a la pestaña <span class="font-semibold text-slate-200">Configuración</span> para
              revisar y conceder los permisos necesarios.
            </p>
            <div class="flex flex-wrap gap-2">
              <button
                class="flex-1 rounded-lg bg-amber-500/25 border border-amber-400/40 text-amber-200 text-sm px-4 py-2.5 hover:bg-amber-500/35 transition-colors font-medium"
                @click="goToSettings"
              >
                Ir a Configuración
              </button>
              <button
                class="rounded-lg bg-slate-800 border border-slate-700 text-slate-400 text-xs px-4 py-2.5 hover:bg-slate-700 transition-colors"
                @click="notif.dismissPermissionsModal()"
              >
                Ahora no
              </button>
            </div>
          </div>
        </div>
      </Transition>

      <div class="max-w-7xl mx-auto px-4 py-8">
        <header class="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4 mb-8">
          <div class="flex items-center gap-3" data-tour="app-header">
            <!-- Mobile menu button -->
            <button
              class="md:hidden rounded-xl bg-slate-800/80 border border-slate-700/60 p-2.5 text-slate-400 hover:text-white hover:bg-slate-700 transition-all"
              @click="sidebarOpen = true"
            >
              <svg xmlns="http://www.w3.org/2000/svg" class="h-5 w-5" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
                <line x1="3" y1="12" x2="21" y2="12"/><line x1="3" y1="6" x2="21" y2="6"/><line x1="3" y1="18" x2="21" y2="18"/>
              </svg>
            </button>
            <!-- Title block -->
            <div class="flex items-center gap-4">
              <div class="hidden sm:flex h-11 w-11 items-center justify-center rounded-2xl bg-gradient-to-br from-emerald-500/25 to-teal-500/10 border border-emerald-500/30 shadow-lg shadow-emerald-500/10">
                <svg xmlns="http://www.w3.org/2000/svg" class="h-6 w-6 text-emerald-400" viewBox="0 0 24 24" fill="currentColor">
                  <path d="M12 3v10.55A4 4 0 1 0 14 17V7h4V3h-6z"/>
                </svg>
              </div>
              <div>
                <h1 class="text-2xl sm:text-3xl font-extrabold tracking-tight bg-gradient-to-r from-white via-slate-100 to-slate-400 bg-clip-text text-transparent leading-tight">
                  {{ currentTabTitle }}
                </h1>
                <p class="text-xs sm:text-sm text-slate-500 mt-0.5">{{ currentTabDescription }}</p>
              </div>
            </div>
          </div>

        </header>

        <router-view
          :now-playing="nowPlaying"
          @update-now-playing="setNowPlaying"
        />
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
const SPLASH_MS = 3000
const splashLetters = 'Skippify'.split('')

const currentTabTitle = computed(() => route.meta?.title || 'Skippify')
const currentTabDescription = computed(() => route.meta?.description || 'Funcionalidades premium para tu Spotify')

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
// devuelve a Inicio a la fuerza. Antes el temporizador de 2 s hacía siempre
// `router.replace('/')` y cancelaba cualquier navegación en curso.
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

.splash-fade-enter-active,
.splash-fade-leave-active {
  transition: opacity 0.45s ease, transform 0.45s ease;
}

.splash-fade-enter-from,
.splash-fade-leave-to {
  opacity: 0;
}

.splash-fade-leave-to {
  transform: scale(1.06);
}

/* ── Splash animado (3 s) ─────────────────────────────────────────────────── */
.splash-aurora {
  background:
    radial-gradient(circle at 18% 22%, rgba(16, 185, 129, 0.30), transparent 45%),
    radial-gradient(circle at 82% 78%, rgba(56, 189, 248, 0.22), transparent 42%),
    radial-gradient(circle at 60% 12%, rgba(20, 184, 166, 0.18), transparent 38%);
  animation: splash-aurora 6s ease-in-out infinite alternate;
}

.splash-grid {
  background-image:
    linear-gradient(rgba(148, 163, 184, 0.07) 1px, transparent 1px),
    linear-gradient(90deg, rgba(148, 163, 184, 0.07) 1px, transparent 1px);
  background-size: 48px 48px;
  mask-image: radial-gradient(circle at 50% 45%, #000 0%, transparent 70%);
  -webkit-mask-image: radial-gradient(circle at 50% 45%, #000 0%, transparent 70%);
  animation: splash-grid 3s ease-out forwards;
}

.splash-disc {
  animation: splash-disc 2.4s cubic-bezier(0.34, 1.4, 0.64, 1) both;
}

.splash-ring {
  animation: splash-ring 2.2s ease-out infinite;
}

.splash-ring--delay {
  animation-delay: 1.1s;
}

.splash-letter {
  display: inline-block;
  white-space: pre;
  opacity: 0;
  animation: splash-letter 0.55s cubic-bezier(0.22, 1.2, 0.36, 1) both;
}

.splash-in {
  opacity: 0;
  animation: splash-in 0.6s ease-out both;
}

.splash-in--1 { animation-delay: 0.12s; }
.splash-in--2 { animation-delay: 0.95s; }
.splash-in--3 { animation-delay: 1.15s; }

.splash-bar {
  height: 40%;
  animation: splash-bar 0.9s ease-in-out infinite alternate;
}

.splash-progress {
  width: 0;
  animation: splash-progress 3s linear forwards;
}

@keyframes splash-aurora {
  from { opacity: 0.45; transform: scale(1); }
  to   { opacity: 0.85; transform: scale(1.12); }
}

@keyframes splash-grid {
  from { opacity: 0; transform: scale(1.25); }
  to   { opacity: 1; transform: scale(1); }
}

@keyframes splash-disc {
  0%   { opacity: 0; transform: scale(0.4) rotate(-90deg); }
  60%  { opacity: 1; transform: scale(1.08) rotate(6deg); }
  100% { opacity: 1; transform: scale(1) rotate(0deg); }
}

@keyframes splash-ring {
  0%   { opacity: 0.7; transform: scale(0.6); }
  100% { opacity: 0; transform: scale(1.35); }
}

@keyframes splash-letter {
  from { opacity: 0; transform: translateY(18px) rotateX(-70deg); filter: blur(6px); }
  to   { opacity: 1; transform: translateY(0) rotateX(0deg); filter: blur(0); }
}

@keyframes splash-in {
  from { opacity: 0; transform: translateY(10px); }
  to   { opacity: 1; transform: translateY(0); }
}

@keyframes splash-bar {
  from { height: 22%; }
  to   { height: 100%; }
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
  .splash-bar,
  .splash-progress {
    animation: none !important;
    opacity: 1;
  }
  .splash-progress { width: 100%; }
  .splash-bar { height: 60%; }
}
</style>
