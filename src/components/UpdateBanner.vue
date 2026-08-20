<template>
  <Transition name="modal">
    <div
      v-if="update.shouldPrompt.value"
      class="fixed inset-0 z-[60] flex items-center justify-center bg-black/70 p-4 backdrop-blur-sm"
    >
      <div class="sk-card sk-card-lit w-full max-w-md border-brand-400/30 p-6">
        <div class="mb-4 flex items-center gap-3">
          <span class="flex h-11 w-11 items-center justify-center rounded-2xl border border-brand-400/30 bg-brand-500/12 text-xl">⬆️</span>
          <div>
            <h2 class="text-base font-semibold text-brand-100">Actualización disponible</h2>
            <p class="text-[11px] text-brand-200/60">Skippify {{ update.latest.value?.version }}</p>
          </div>
        </div>

        <!--
          Lo único que se cuenta aquí son las instrucciones. Android enseña un
          aviso alarmante al instalar fuera de Play Store y ese es el momento en
          que la gente cancela, así que conviene anticiparlo.
        -->
        <p v-if="needsInstallPermission" class="mb-5 text-sm leading-relaxed text-slate-300">
          Android necesita tu permiso para instalar aplicaciones fuera de Play Store.
          Concédeselo a Skippify y vuelve aquí.
        </p>
        <p v-else class="mb-5 text-sm leading-relaxed text-slate-300">
          Al instalar, Android avisará de que la aplicación procede de una fuente
          desconocida. Pulsa <span class="font-semibold text-slate-100">«Instalar de todos modos»</span>:
          es segura, va firmada con la misma clave que la versión que ya tienes.
        </p>

        <div class="flex flex-wrap gap-2">
          <button
            v-if="needsInstallPermission"
            class="sk-btn flex-1 border-amber-400/40 bg-amber-500/20 text-amber-100 hover:bg-amber-500/30"
            @click="update.openInstallSettings()"
          >
            Conceder permiso
          </button>
          <button
            v-else
            class="sk-btn flex-1 border-brand-400/40 bg-brand-500/20 text-brand-100 hover:bg-brand-500/30"
            :disabled="update.status.value === 'downloading'"
            @click="run"
          >
            {{ primaryLabel }}
          </button>

          <button
            class="sk-btn sk-btn-ghost sk-btn-sm"
            :disabled="update.status.value === 'downloading'"
            @click="update.dismiss()"
          >
            Ahora no
          </button>
        </div>

        <!--
          El error se queda: ocultarlo es exactamente lo que hizo que un fallo de
          red pasara desapercibido durante toda una versión.
        -->
        <p
          v-if="update.status.value === 'error'"
          class="mt-3 text-xs text-rose-300"
        >{{ update.error.value }}</p>
      </div>
    </div>
  </Transition>
</template>

<script setup>
import { computed, onMounted, onUnmounted } from 'vue'
import { useAppUpdate } from '@/composables/useAppUpdate'

const update = useAppUpdate()

/**
 * `error` vale 'PERMISO' cuando el instalador se rechazó por falta del permiso
 * de orígenes desconocidos. No es un fallo: la APK ya está descargada y basta
 * con conceder el permiso y volver a pulsar.
 */
const needsInstallPermission = computed(() => update.error.value === 'PERMISO')

const primaryLabel = computed(() => {
  switch (update.status.value) {
    case 'downloading': return `Descargando… ${update.progress.value}%`
    case 'ready': return 'Instalar'
    case 'installing': return 'Abriendo instalador…'
    case 'error': return 'Reintentar'
    default: return 'Actualizar'
  }
})

function run () {
  // Si ya está en disco de un intento anterior, se salta la descarga.
  if (update.status.value === 'ready') return update.install()
  return update.downloadAndInstall()
}

/**
 * Conceder el permiso ocurre FUERA de la app, en los ajustes del sistema. Al
 * volver hay que releer el estado o el aviso se quedaría ofreciendo «Conceder
 * permiso» para siempre, aunque ya estuviera dado.
 */
function onVisibilityChange () {
  if (document.visibilityState === 'visible') {
    update.recheckInstallPermission()
  }
}

onMounted(() => document.addEventListener('visibilitychange', onVisibilityChange))
onUnmounted(() => document.removeEventListener('visibilitychange', onVisibilityChange))
</script>
