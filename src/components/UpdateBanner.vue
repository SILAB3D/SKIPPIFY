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
            <p class="text-[11px] text-brand-200/60">
              Skippify {{ update.latest.value?.version }}
              <span v-if="sizeLabel"> · {{ sizeLabel }}</span>
            </p>
          </div>
        </div>

        <!-- ── Novedades de la release ─────────────────────────────────────── -->
        <p
          v-if="update.latest.value?.notes"
          class="mb-5 max-h-32 overflow-y-auto whitespace-pre-line text-sm leading-relaxed text-slate-300"
        >{{ update.latest.value.notes }}</p>
        <p v-else class="mb-5 text-sm leading-relaxed text-slate-300">
          Hay una versión más reciente de Skippify lista para instalar. Tus datos e
          historial se conservan.
        </p>

        <!-- ── Descarga en curso ───────────────────────────────────────────── -->
        <div v-if="update.status.value === 'downloading'" class="mb-5">
          <div class="mb-2 flex items-center justify-between text-[11px] text-slate-400">
            <span>Descargando…</span>
            <span>{{ update.progress.value }}%</span>
          </div>
          <div class="h-1.5 w-full overflow-hidden rounded-full bg-white/10">
            <span
              class="block h-full rounded-full bg-gradient-to-r from-brand-400 to-teal-300 transition-[width] duration-200"
              :style="{ width: `${update.progress.value}%` }"
            />
          </div>
        </div>

        <!-- ── Falta el permiso de "apps desconocidas" ─────────────────────── -->
        <div
          v-else-if="needsInstallPermission"
          class="mb-5 rounded-xl border border-amber-400/25 bg-amber-500/10 p-3 text-sm text-amber-100"
        >
          Android pide tu permiso para instalar apps fuera de Play Store. Concédeselo a
          Skippify y vuelve aquí.
        </div>

        <!-- ── Error real ──────────────────────────────────────────────────── -->
        <div
          v-else-if="update.status.value === 'error'"
          class="mb-5 rounded-xl border border-rose-400/25 bg-rose-500/10 p-3 text-sm text-rose-100"
        >
          {{ update.error.value }}
        </div>

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
      </div>
    </div>
  </Transition>
</template>

<script setup>
import { computed } from 'vue'
import { useAppUpdate } from '@/composables/useAppUpdate'

const update = useAppUpdate()

/**
 * `error` vale 'PERMISO' cuando el instalador se rechazó por falta del permiso
 * de orígenes desconocidos. No es un fallo: la APK ya está descargada y basta
 * con conceder el permiso y volver a pulsar.
 */
const needsInstallPermission = computed(() => update.error.value === 'PERMISO')

const sizeLabel = computed(() => {
  const bytes = update.latest.value?.size || 0
  if (!bytes) return ''
  return `${(bytes / 1024 / 1024).toFixed(1)} MB`
})

const primaryLabel = computed(() => {
  switch (update.status.value) {
    case 'downloading': return 'Descargando…'
    case 'ready':       return 'Instalar'
    case 'installing':  return 'Abriendo instalador…'
    case 'error':       return 'Reintentar'
    default:            return 'Actualizar'
  }
})

function run () {
  // Si ya está en disco de un intento anterior, se salta la descarga.
  if (update.status.value === 'ready') return update.install()
  return update.downloadAndInstall()
}
</script>
