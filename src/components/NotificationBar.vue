<template>
  <div v-if="show">
    <!-- Permission granted: subtle success bar -->
    <div
      v-if="notifEnabled"
      class="rounded-xl border px-4 py-3 mb-4 flex items-center gap-3 text-sm bg-emerald-500/10 border-emerald-500/30"
    >
      <span class="text-base">🔔</span>
      <span class="text-emerald-300">Notificaciones Android activas · capturas en tiempo real</span>
    </div>

    <!-- Error state -->
    <div
      v-else-if="notifError"
      class="rounded-xl border px-4 py-3 mb-4 flex items-center gap-3 text-sm bg-rose-500/10 border-rose-500/30"
    >
      <span class="text-base">❌</span>
      <span class="text-rose-300">Error al comprobar notificaciones: {{ notifError }}</span>
    </div>

    <!-- Permission NOT granted: prominent CTA -->
    <div
      v-else
      class="rounded-2xl border-2 border-amber-400/40 bg-gradient-to-br from-amber-500/20 via-slate-900 to-slate-900 p-5 mb-6"
    >
      <div class="flex items-start gap-4">
        <div class="text-3xl">🔔</div>
        <div class="flex-1">
          <h3 class="text-lg font-semibold text-amber-200">Permiso de notificaciones requerido</h3>
          <p class="text-sm text-slate-300 mt-1">
            Skippify necesita acceder a las notificaciones de tu dispositivo para detectar
            automáticamente las canciones que escuchas en Spotify en tiempo real.
          </p>
          <p class="text-xs text-slate-400 mt-2">
            En la pantalla de ajustes del sistema, busca "Skippify" y activa el interruptor.
          </p>
          <div class="flex flex-wrap gap-2 mt-3">
            <button
              class="rounded-lg bg-amber-500/30 border border-amber-400/40 text-amber-200 text-sm px-4 py-2 hover:bg-amber-500/40 transition-colors font-medium"
              @click="promptPermission"
            >
              Activar acceso a notificaciones
            </button>
            <button
              v-if="showDismiss"
              class="rounded-lg bg-slate-800 border border-slate-700 text-slate-400 text-xs px-3 py-2 hover:bg-slate-700 transition-colors"
              @click="dismissPrompt"
            >
              Ahora no
            </button>
          </div>
        </div>
      </div>
    </div>
  </div>
</template>

<script setup>
import { computed } from 'vue'
import { useNotifListener } from '@/composables/useNotifListener'

const props = defineProps({
  showDismiss: { type: Boolean, default: false }
})

const {
  notifEnabled,
  notifError,
  notifChecked,
  isCapacitor,
  promptDismissed,
  promptPermission,
  dismissPrompt
} = useNotifListener()

const show = computed(() => isCapacitor.value && notifChecked.value)
</script>
