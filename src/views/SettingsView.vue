<template>
  <div>
    <div class="space-y-4">
      <article
        v-for="card in orderedPermissionCards"
        :key="card.id"
        :data-tour="card.id === 'notif-access' ? 'permissions-required' : null"
        class="rounded-2xl border bg-slate-900/95 p-5"
        :class="card.borderClass"
      >
        <div class="flex flex-col sm:flex-row sm:items-start sm:justify-between gap-4">
          <div class="flex-1 min-w-0">
            <div class="flex flex-wrap items-center gap-2 mb-2">
              <span class="text-lg" aria-hidden="true">{{ card.icon }}</span>
              <h3 class="font-semibold text-sm text-slate-100">{{ card.title }}</h3>
              <span class="px-2 py-0.5 rounded-full text-xs font-medium border" :class="card.tagClass">
                {{ card.statusLabel }}
              </span>
            </div>
            <p class="text-xs text-slate-400">{{ card.description }}</p>
            <p class="text-xs text-slate-500 mt-1">{{ card.meta }}</p>
          </div>

          <div class="shrink-0" v-if="card.action && isCapacitor">
            <button
              class="rounded-lg text-xs px-4 py-2 transition-colors font-medium whitespace-nowrap"
              :class="card.actionClass"
              :disabled="checkingPermissions"
              @click="card.action"
            >
              {{ checkingPermissions ? 'Verificando...' : card.actionLabel }}
            </button>
          </div>
        </div>
      </article>

      <!-- Error de notificaciones -->
      <div
        v-if="notifError"
        class="rounded-xl border border-rose-500/30 bg-rose-500/10 px-4 py-3 text-sm text-rose-300"
      >
        Error al verificar permisos: {{ notifError }}
      </div>

      <article class="rounded-2xl border border-slate-700/70 bg-slate-900/95 p-5">
        <div class="flex flex-col gap-3">
          <div>
            <h3 class="font-semibold text-sm text-slate-100">Respaldo de historial y estadísticas</h3>
            <p class="text-xs text-slate-400 mt-1">
              Exporta o importa el historial de canciones junto con la configuración de funciones.
            </p>
          </div>

          <div class="flex flex-wrap gap-2">
            <button
              class="rounded-lg text-xs px-4 py-2 transition-colors font-medium whitespace-nowrap border border-emerald-500/35 bg-emerald-500/15 text-emerald-200 hover:bg-emerald-500/25"
              @click="exportBackup"
            >
              Exportar respaldo
            </button>

            <button
              class="rounded-lg text-xs px-4 py-2 transition-colors font-medium whitespace-nowrap border border-sky-500/35 bg-sky-500/15 text-sky-200 hover:bg-sky-500/25"
              @click="triggerImport"
            >
              Importar respaldo
            </button>

            <input
              ref="importInputRef"
              type="file"
              accept="application/json,.json"
              class="hidden"
              @change="onImportFileChange"
            >

            <select
              v-model="importMode"
              class="rounded-lg text-xs px-3 py-2 border border-slate-600 bg-slate-800 text-slate-200"
            >
              <option value="replace">Modo: Reemplazar historial</option>
              <option value="merge">Modo: Fusionar historial</option>
            </select>
          </div>

          <div v-if="backupPreview" class="rounded-xl border border-slate-700 bg-slate-800/60 p-3 text-xs text-slate-300">
            <p class="font-medium text-slate-200 mb-2">Vista previa de importación</p>
            <p>Canciones válidas: {{ backupPreview.totalTracks }}</p>
            <p>Artistas únicos: {{ backupPreview.uniqueArtists }}</p>
            <p>Canciones únicas: {{ backupPreview.uniqueTracks }}</p>
            <p>Rango: {{ backupPreview.rangeLabel }}</p>
            <p class="mt-2 text-slate-400">Esquema: {{ backupPreview.schema }} · Versión: {{ backupPreview.version }}</p>

            <div class="flex flex-wrap gap-2 mt-3">
              <button
                class="rounded-lg text-xs px-4 py-2 transition-colors font-medium whitespace-nowrap border border-emerald-500/35 bg-emerald-500/15 text-emerald-200 hover:bg-emerald-500/25"
                @click="applyPendingImport"
              >
                Confirmar importación
              </button>
              <button
                class="rounded-lg text-xs px-4 py-2 transition-colors font-medium whitespace-nowrap border border-slate-600 bg-slate-700/60 text-slate-200 hover:bg-slate-700"
                @click="clearPendingImport"
              >
                Cancelar
              </button>
            </div>
          </div>

          <p v-if="backupMessage" class="text-xs text-slate-300">{{ backupMessage }}</p>
          <p v-if="backupWarning" class="text-xs text-amber-300">{{ backupWarning }}</p>
          <p v-if="backupError" class="text-xs text-rose-300">{{ backupError }}</p>
        </div>
      </article>

    </div>
  </div>
</template>

<script setup>
import { ref, computed, onMounted, onUnmounted } from 'vue'
import { Capacitor } from '@capacitor/core'
import { Filesystem, Directory, Encoding } from '@capacitor/filesystem'
import { useNotifListener } from '@/composables/useNotifListener'
import { useEventStore } from '@/stores/events'
import { useFeatures } from '@/composables/useFeatures'

const {
  notifEnabled,
  notifError,
  isCapacitor,
  promptPermission,
  recheckPermission,
  getPlugin
} = useNotifListener()

const eventStore = useEventStore()
const { state: featureState } = useFeatures()
const importInputRef = ref(null)
const importMode = ref('replace')
const backupPreview = ref(null)
const pendingImportPayload = ref(null)
const backupMessage = ref('')
const backupWarning = ref('')
const backupError = ref('')

const FEATURES_STORAGE_KEY = 'skippify-features'
const CUSTOM_SKIP_CONFIG_KEY = 'skippify-features-custom-skip'
const BACKUP_SCHEMA = 'skippify-backup-v1'
const BACKUP_VERSION = 1
const SUPPORTED_SCHEMAS = new Set([BACKUP_SCHEMA])

const postNotifGranted = ref(true) // default true; updated from native
const batteryOptimizationIgnored = ref(false)
const checkingPermissions = ref(false)

const orderedPermissionCards = computed(() => {
  const cards = [
    {
      id: 'notif-access',
      icon: '🔔',
      title: 'Acceso a notificaciones',
      description: 'Permite detectar automáticamente las canciones reproducidas en Spotify mediante NotificationListenerService.',
      meta: 'Requerido · Todas las versiones de Android',
      statusLabel: notifEnabled.value ? 'Concedido' : 'Pendiente',
      needsUserAction: !notifEnabled.value,
      systemDependent: false,
      borderClass: notifEnabled.value ? 'border-emerald-500/30' : 'border-amber-400/40',
      tagClass: notifEnabled.value
        ? 'bg-emerald-500/20 text-emerald-300 border-emerald-500/35'
        : 'bg-amber-500/20 text-amber-300 border-amber-400/35',
      action: !notifEnabled.value ? promptPermission : null,
      actionLabel: 'Activar permiso',
      actionClass: 'bg-amber-500/20 border border-amber-400/30 text-amber-200 hover:bg-amber-500/30'
    },
    {
      id: 'post-notifications',
      icon: '📬',
      title: 'Permiso POST_NOTIFICATIONS',
      description: 'Necesario para mostrar notificaciones y mantener operativo el servicio de detección en primer plano.',
      meta: 'Requerido en Android 13+ (API 33)',
      statusLabel: postNotifGranted.value ? 'Concedido' : 'Pendiente',
      needsUserAction: !postNotifGranted.value,
      systemDependent: false,
      borderClass: postNotifGranted.value ? 'border-emerald-500/30' : 'border-amber-400/40',
      tagClass: postNotifGranted.value
        ? 'bg-emerald-500/20 text-emerald-300 border-emerald-500/35'
        : 'bg-amber-500/20 text-amber-300 border-amber-400/35',
      action: !postNotifGranted.value ? requestPostNotificationsPermission : null,
      actionLabel: 'Solicitar permiso',
      actionClass: 'bg-amber-500/20 border border-amber-400/30 text-amber-200 hover:bg-amber-500/30'
    },
    {
      id: 'battery-optimization',
      icon: '🔋',
      title: 'Optimización de batería',
      description: 'Excluir Skippify evita pausas agresivas del sistema y mejora la captura cuando la app está en segundo plano.',
      meta: 'Recomendado · Android 6+ · Crítico en capas OEM restrictivas',
      statusLabel: batteryOptimizationIgnored.value ? 'Sin restricciones' : 'Pendiente',
      needsUserAction: !batteryOptimizationIgnored.value,
      systemDependent: false,
      borderClass: batteryOptimizationIgnored.value ? 'border-emerald-500/30' : 'border-amber-400/40',
      tagClass: batteryOptimizationIgnored.value
        ? 'bg-emerald-500/20 text-emerald-300 border-emerald-500/35'
        : 'bg-amber-500/20 text-amber-300 border-amber-400/35',
      action: !batteryOptimizationIgnored.value ? requestBatteryOptimizationExclusion : null,
      actionLabel: 'Excluir de optimización',
      actionClass: 'bg-amber-500/20 border border-amber-400/30 text-amber-200 hover:bg-amber-500/30'
    },
    {
      id: 'foreground-service',
      icon: '⚙️',
      title: 'Servicio en primer plano',
      description: 'SkippifyForegroundService mantiene el proceso activo para reducir cierres automáticos en segundo plano.',
      meta: 'FOREGROUND_SERVICE · FOREGROUND_SERVICE_DATA_SYNC',
      statusLabel: 'Gestionado por el sistema',
      needsUserAction: false,
      systemDependent: true,
      borderClass: 'border-slate-700/70',
      tagClass: 'bg-slate-700 text-slate-300 border-slate-600'
    },
    {
      id: 'oem-recommendations',
      icon: '📱',
      title: 'Ajustes recomendados por fabricante',
      description: 'En Samsung, Xiaomi, OPPO o Realme conviene habilitar autoinicio, ejecución en segundo plano y bloqueo en recientes.',
      meta: 'Dependiente del fabricante · Recomendado para mayor estabilidad',
      statusLabel: 'Revisión recomendada',
      needsUserAction: false,
      systemDependent: true,
      borderClass: 'border-slate-700/70',
      tagClass: 'bg-slate-700 text-slate-300 border-slate-600'
    }
  ]

  return cards.sort((a, b) => {
    if (a.needsUserAction !== b.needsUserAction) return a.needsUserAction ? -1 : 1
    if (a.systemDependent !== b.systemDependent) return a.systemDependent ? 1 : -1
    return 0
  })
})

async function checkAllPermissions () {
  const NL = getPlugin()
  if (!NL) return
  try {
    const result = await NL.ensureAllPermissions()
    postNotifGranted.value = !!result?.postNotificationsGranted
    batteryOptimizationIgnored.value = !!result?.batteryOptimizationIgnored
  } catch { /* ignored */ }
}

async function requestPostNotificationsPermission () {
  const NL = getPlugin()
  if (!NL || checkingPermissions.value) return
  checkingPermissions.value = true
  try {
    await NL.ensureAllPermissions()
    await recheckPermission()
    await checkAllPermissions()
  } catch { /* ignored */ } finally {
    checkingPermissions.value = false
  }
}

async function refreshAllStatuses () {
  if (!isCapacitor.value || checkingPermissions.value) return
  checkingPermissions.value = true
  try {
    await recheckPermission()
    await checkAllPermissions()
  } finally {
    checkingPermissions.value = false
  }
}

async function requestBatteryOptimizationExclusion () {
  const NL = getPlugin()
  if (!NL) return
  try {
    const opened = await NL.requestIgnoreBatteryOptimization()
    if (opened?.opened) {
      // Give Android settings time to apply state changes when returning.
      setTimeout(() => { refreshAllStatuses() }, 800)
    }
  } catch { /* ignored */ }
}

function summarizeStats (events) {
  const totalTracks = events.length
  const totalMsPlayed = events.reduce((acc, item) => acc + Number(item?.ms_played || 0), 0)
  const uniqueTracks = new Set(events.map(item => `${item?.track || ''}|${item?.artist || ''}`)).size
  const uniqueArtists = new Set(events.map(item => `${item?.artist || ''}`)).size
  return {
    totalTracks,
    uniqueTracks,
    uniqueArtists,
    totalMsPlayed
  }
}

function stableStringify (value) {
  if (value === null || typeof value !== 'object') return JSON.stringify(value)
  if (Array.isArray(value)) return `[${value.map(stableStringify).join(',')}]`
  const keys = Object.keys(value).sort()
  const body = keys.map(key => `${JSON.stringify(key)}:${stableStringify(value[key])}`).join(',')
  return `{${body}}`
}

function fnv1a32 (input) {
  let hash = 0x811c9dc5
  for (let i = 0; i < input.length; i += 1) {
    hash ^= input.charCodeAt(i)
    hash = Math.imul(hash, 0x01000193)
  }
  return (hash >>> 0).toString(16).padStart(8, '0')
}

function computeChecksum (data) {
  return fnv1a32(stableStringify(data))
}

function formatDateLabel (iso) {
  const d = new Date(iso)
  if (!Number.isFinite(d.getTime())) return 'N/A'
  return d.toLocaleString()
}

function createPreview (events, meta = {}) {
  const sorted = [...events].sort((a, b) => new Date(a.played_at) - new Date(b.played_at))
  const first = sorted[0]?.played_at || null
  const last = sorted[sorted.length - 1]?.played_at || null
  return {
    totalTracks: events.length,
    uniqueTracks: new Set(events.map(item => `${item.track}|${item.artist}`)).size,
    uniqueArtists: new Set(events.map(item => item.artist)).size,
    rangeLabel: first && last ? `${formatDateLabel(first)} -> ${formatDateLabel(last)}` : 'Sin rango válido',
    schema: meta.schema || BACKUP_SCHEMA,
    version: Number(meta.version || 1)
  }
}

function mergeEventLists (currentEvents, importedEvents) {
  const map = new Map()
  for (const item of [...currentEvents, ...importedEvents]) {
    const key = `${item.played_at}|${item.track}|${item.artist}`
    if (!map.has(key)) map.set(key, item)
  }
  return [...map.values()].sort((a, b) => new Date(b.played_at) - new Date(a.played_at))
}

function buildBackupPayload () {
  const events = [...eventStore.state.events]
  let customSkipConfig = {}
  try {
    customSkipConfig = JSON.parse(localStorage.getItem(CUSTOM_SKIP_CONFIG_KEY) || '{}')
  } catch {
    customSkipConfig = {}
  }

  const data = {
    events,
    features: { ...featureState },
    customSkipConfig,
    statsSummary: summarizeStats(events)
  }

  return {
    schema: BACKUP_SCHEMA,
    version: BACKUP_VERSION,
    exportedAt: new Date().toISOString(),
    checksum: {
      algorithm: 'fnv1a-32',
      value: computeChecksum(data)
    },
    data
  }
}

async function exportBackup () {
  backupError.value = ''
  backupMessage.value = ''
  backupWarning.value = ''

  try {
    const payload = buildBackupPayload()
    const stamp = new Date().toISOString().replace(/[:.]/g, '-').slice(0, 19)
    const fileName = `skippify-backup-${stamp}.json`
    const payloadJson = JSON.stringify(payload, null, 2)

    if (typeof window.showDirectoryPicker === 'function') {
      const dirHandle = await window.showDirectoryPicker({ mode: 'readwrite' })
      const fileHandle = await dirHandle.getFileHandle(fileName, { create: true })
      const writable = await fileHandle.createWritable()
      await writable.write(payloadJson)
      await writable.close()

      backupMessage.value = `Respaldo exportado en ${dirHandle.name}/${fileName} (${payload.data.events.length} canciones).`
      return
    }

    if (isCapacitor.value && Capacitor.isNativePlatform()) {
      const defaultDir = 'Skippify/backups'
      const defaultPath = `${defaultDir}/${fileName}`
      await Filesystem.mkdir({
        path: defaultDir,
        directory: Directory.Documents,
        recursive: true
      })
      await Filesystem.writeFile({
        path: defaultPath,
        data: payloadJson,
        directory: Directory.Documents,
        encoding: Encoding.UTF8
      })
      backupMessage.value = `Respaldo autoexportado en Documents/${defaultPath} (${payload.data.events.length} canciones).`
      backupWarning.value = 'Se usó carpeta predeterminada porque el selector de carpeta no está disponible en este dispositivo.'
      return
    }

    const blob = new Blob([payloadJson], { type: 'application/json' })
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url
    a.download = fileName
    document.body.appendChild(a)
    a.click()
    document.body.removeChild(a)
    URL.revokeObjectURL(url)

    backupMessage.value = `Respaldo autoexportado en Descargas como ${fileName} (${payload.data.events.length} canciones).`
    backupWarning.value = 'Se usó carpeta predeterminada porque el selector de carpeta no está disponible en este navegador.'
  } catch (error) {
    if (error?.name === 'AbortError') {
      backupWarning.value = 'Exportación cancelada: no se seleccionó carpeta.'
      return
    }
    backupError.value = 'No se pudo exportar el respaldo.'
  }
}

function triggerImport () {
  backupError.value = ''
  backupMessage.value = ''
  backupWarning.value = ''
  clearPendingImport(false)
  if (importInputRef.value) {
    importInputRef.value.value = ''
    importInputRef.value.click()
  }
}

function clearPendingImport (clearInput = true) {
  backupPreview.value = null
  pendingImportPayload.value = null
  if (clearInput && importInputRef.value) importInputRef.value.value = ''
}

function sanitizeImportedEvents (items) {
  if (!Array.isArray(items)) return []
  const seen = new Set()
  const normalized = []

  for (const event of items) {
    const playedAt = (event?.played_at || '').toString()
    const track = (event?.track || '').toString().trim()
    const artist = (event?.artist || '').toString().trim()
    if (!playedAt || !track || !artist) continue
    if (!Number.isFinite(Date.parse(playedAt))) continue

    const key = `${playedAt}|${track}|${artist}`
    if (seen.has(key)) continue
    seen.add(key)

    normalized.push({
      played_at: playedAt,
      track,
      artist,
      album: (event?.album || '').toString(),
      duration_ms: Math.max(0, Number(event?.duration_ms || 0) || 0),
      ms_played: Math.max(0, Number(event?.ms_played || 0) || 0),
      genres: Array.isArray(event?.genres) ? event.genres : [],
      source: (event?.source || '').toString(),
      reason: (event?.reason || '').toString()
    })
  }

  normalized.sort((a, b) => new Date(b.played_at) - new Date(a.played_at))
  return normalized
}

function applyImportedFeatures (incoming) {
  if (!incoming || typeof incoming !== 'object') return
  if (typeof incoming.listeningMode === 'string') featureState.listeningMode = incoming.listeningMode
  if (typeof incoming.skipDuplicates === 'boolean') featureState.skipDuplicates = incoming.skipDuplicates
  if (typeof incoming.skipDuplicatesInterval === 'string') featureState.skipDuplicatesInterval = incoming.skipDuplicatesInterval
  if (typeof incoming.silenceAds === 'boolean') featureState.silenceAds = incoming.silenceAds
}

async function onImportFileChange (ev) {
  backupError.value = ''
  backupMessage.value = ''
  backupWarning.value = ''
  clearPendingImport(false)

  const file = ev?.target?.files?.[0]
  if (!file) return

  try {
    const content = await file.text()
    const parsed = JSON.parse(content)

    const schema = (parsed?.schema || '').toString()
    const version = Number(parsed?.version ?? 1)
    if (!SUPPORTED_SCHEMAS.has(schema)) {
      backupError.value = 'Esquema de respaldo no compatible.'
      return
    }
    if (!Number.isFinite(version) || version < 1 || version > BACKUP_VERSION) {
      backupError.value = 'Version de respaldo no compatible con esta app.'
      return
    }

    const checksumBlock = parsed?.checksum
    if (checksumBlock?.algorithm === 'fnv1a-32' && typeof checksumBlock?.value === 'string') {
      const expected = computeChecksum(parsed?.data || {})
      if (checksumBlock.value !== expected) {
        backupError.value = 'Checksum inválido: el archivo parece corrupto o fue modificado.'
        return
      }
    } else {
      backupWarning.value = 'El respaldo no incluye checksum verificable. Se importará bajo tu responsabilidad.'
    }

    const candidateEvents = parsed?.data?.events ?? parsed?.events
    const sanitizedEvents = sanitizeImportedEvents(candidateEvents)
    if (!sanitizedEvents.length) {
      backupError.value = 'El archivo no contiene canciones válidas para importar.'
      return
    }

    const importedFeatures = parsed?.data?.features ?? parsed?.features
    const importedCustomSkip = parsed?.data?.customSkipConfig ?? parsed?.customSkipConfig

    pendingImportPayload.value = {
      events: sanitizedEvents,
      importedFeatures,
      importedCustomSkip,
      schema,
      version
    }
    backupPreview.value = createPreview(sanitizedEvents, { schema, version })
    backupMessage.value = `Archivo validado. Revisa la vista previa y confirma la importación (${sanitizedEvents.length} canciones).`
  } catch {
    backupError.value = 'No se pudo importar el archivo. Verifica que sea un JSON válido de Skippify.'
  }
}

function applyPendingImport () {
  backupError.value = ''
  backupMessage.value = ''
  const payload = pendingImportPayload.value
  if (!payload) return

  const importedEvents = payload.events
  const nextEvents = importMode.value === 'merge'
    ? mergeEventLists(eventStore.state.events, importedEvents)
    : importedEvents

  eventStore.setEvents(nextEvents)

  if (payload.importedFeatures && typeof payload.importedFeatures === 'object') {
    applyImportedFeatures(payload.importedFeatures)
    try { localStorage.setItem(FEATURES_STORAGE_KEY, JSON.stringify({ ...featureState })) } catch { /* ignored */ }
  }

  if (payload.importedCustomSkip && typeof payload.importedCustomSkip === 'object') {
    try { localStorage.setItem(CUSTOM_SKIP_CONFIG_KEY, JSON.stringify(payload.importedCustomSkip)) } catch { /* ignored */ }
  }

  backupMessage.value = importMode.value === 'merge'
    ? `Importación completada en modo fusión (${nextEvents.length} canciones totales).`
    : `Importación completada en modo reemplazo (${nextEvents.length} canciones).`
  clearPendingImport()
}

function onAppVisibleAgain () {
  if (document.visibilityState === 'visible') {
    refreshAllStatuses()
  }
}

onMounted(async () => {
  await refreshAllStatuses()
  window.addEventListener('focus', refreshAllStatuses)
  document.addEventListener('visibilitychange', onAppVisibleAgain)
})

onUnmounted(() => {
  window.removeEventListener('focus', refreshAllStatuses)
  document.removeEventListener('visibilitychange', onAppVisibleAgain)
})
</script>
