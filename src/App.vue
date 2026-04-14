<template>
  <div class="flex min-h-screen">
    <Transition name="splash-fade">
      <div
        v-if="showSplash"
        class="fixed inset-0 z-[90] flex items-center justify-center overflow-hidden"
      >
        <div class="absolute inset-0 bg-gradient-to-br from-slate-950 via-slate-900 to-emerald-950" />
        <div class="absolute inset-0 opacity-40" style="background: radial-gradient(circle at 20% 20%, rgba(16,185,129,0.22), transparent 42%), radial-gradient(circle at 78% 78%, rgba(56,189,248,0.18), transparent 38%);" />

        <div class="relative z-10 text-center px-6">
          <p class="text-[11px] uppercase tracking-[0.24em] text-emerald-300/80 mb-3">Bienvenido</p>
          <h1 class="text-4xl sm:text-5xl font-extrabold tracking-tight bg-gradient-to-r from-white via-slate-100 to-emerald-200 bg-clip-text text-transparent">
            Skippify
          </h1>
          <p class="mt-3 text-sm sm:text-base text-slate-300/90">Funcionalidades premium para tu Spotify</p>
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
import { ref, computed, onMounted, onBeforeUnmount } from 'vue'
import { useRouter, useRoute } from 'vue-router'
import AppSidebar from '@/components/AppSidebar.vue'
import AppTour from '@/components/AppTour.vue'
import { useNotifListener } from '@/composables/useNotifListener'

const sidebarOpen = ref(false)
const notif = useNotifListener()
const nowPlaying = ref({ mode: 'stopped' })
const router = useRouter()
const route = useRoute()
const showTour = ref(false)
const showSplash = ref(true)
const TOUR_DONE_KEY = `skippify.tour.build.${__APP_BUILD_ID__}.completed`
const SPLASH_MS = 2000

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

onMounted(async () => {
  splashTimer = setTimeout(() => {
    if (router.currentRoute.value.path !== '/') {
      router.replace('/')
    }
    showSplash.value = false
  }, SPLASH_MS)

  await notif.checkAndInit(setNowPlaying)

  const tourCompleted = localStorage.getItem(TOUR_DONE_KEY) === '1'
  if (!tourCompleted) {
    tourTimer = setTimeout(() => {
      showTour.value = true
    }, SPLASH_MS + 350)
  }
})

onBeforeUnmount(() => {
  if (splashTimer) clearTimeout(splashTimer)
  if (tourTimer) clearTimeout(tourTimer)
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
  transition: opacity 0.35s ease;
}

.splash-fade-enter-from,
.splash-fade-leave-to {
  opacity: 0;
}
</style>
