<template>
  <div>
    <div class="space-y-4">
      <article
        data-tour="permissions-required"
        class="relative overflow-hidden rounded-2xl border border-slate-700/70 bg-slate-900/95 p-4 sm:p-5 shadow-[0_20px_40px_-24px_rgba(0,0,0,0.7)]"
      >
        <div class="pointer-events-none absolute inset-x-0 top-0 h-16 bg-gradient-to-b from-emerald-500/8 via-emerald-500/2 to-transparent"></div>
        <div class="flex flex-col gap-3">
          <div class="relative">
            <div class="inline-flex items-center gap-2 rounded-full border border-emerald-500/25 bg-emerald-500/10 px-2.5 py-1 text-[11px] font-medium text-emerald-200">
              <span class="h-1.5 w-1.5 rounded-full bg-emerald-300"></span>
              Estado en vivo
            </div>
            <h3 class="mt-2 font-semibold text-sm text-slate-100">Permisos del sistema</h3>
            <p class="text-xs text-slate-400 mt-1">Estado actual de permisos necesarios para detectar canciones.</p>
          </div>

          <div class="space-y-3">
            <div
              v-for="card in orderedPermissionCards"
              :key="card.id"
              class="group rounded-xl border p-3 transition-all duration-200 hover:border-slate-500/70 hover:bg-slate-800/55"
              :class="card.borderClass"
            >
              <div class="flex items-start gap-2 min-w-0">
                <span class="text-base leading-none pt-0.5" aria-hidden="true">{{ card.icon }}</span>

                <div class="min-w-0 flex-1">
                  <p class="text-sm font-semibold text-slate-100 leading-tight break-words">{{ card.title }}</p>
                  <span
                    class="mt-1 inline-flex items-center gap-1.5 max-w-full px-2 py-0.5 rounded-full text-[11px] font-medium border"
                    :class="card.tagClass"
                  >
                    <span class="h-1.5 w-1.5 rounded-full" :class="card.statusLabel === 'Concedido' ? 'bg-emerald-300' : 'bg-amber-300'"></span>
                    {{ card.statusLabel }}
                  </span>
                </div>

                <button
                  class="shrink-0 rounded-md border border-slate-600 bg-slate-800/70 px-2 py-1 text-[11px] text-slate-200 hover:bg-slate-700 transition-colors"
                  type="button"
                  :aria-expanded="expandedPermissionId === card.id"
                  @click="togglePermissionInfo(card.id)"
                >
                  ℹ️
                </button>
              </div>

              <div v-if="card.action && isCapacitor" class="mt-3">
                <button
                  class="w-full sm:w-auto rounded-md text-[11px] px-3 py-1.5 transition-colors font-semibold text-center disabled:opacity-60 disabled:cursor-not-allowed"
                  :class="card.actionClass"
                  :disabled="checkingPermissions"
                  @click="card.action"
                >
                  {{ checkingPermissions ? 'Verificando...' : card.actionLabel }}
                </button>
              </div>

              <div v-if="expandedPermissionId === card.id" class="mt-2 rounded-lg border border-slate-700/80 bg-slate-900/60 px-3 py-2">
                <p class="text-xs text-slate-400">{{ card.description }}</p>
                <p class="text-xs text-slate-500 mt-1">{{ card.meta }}</p>
              </div>
            </div>
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

      <article class="relative overflow-hidden rounded-2xl border border-slate-700/70 bg-slate-900/95 p-4 sm:p-5 shadow-[0_20px_40px_-24px_rgba(0,0,0,0.7)]">
        <div class="pointer-events-none absolute inset-x-0 top-0 h-16 bg-gradient-to-b from-blue-500/8 via-blue-500/2 to-transparent"></div>
        <div class="relative flex flex-col gap-3">
          <div class="space-y-1">
            <div class="flex items-center gap-2">
              <span class="inline-flex items-center justify-center w-5 h-5 rounded-full bg-blue-500/20 text-blue-300 text-[10px]">💾</span>
              <h3 class="font-semibold text-sm text-slate-100">Respaldo de historial y estadísticas</h3>
              <span class="inline-block ml-auto px-2 py-0.5 rounded text-[10px] font-medium text-blue-300 bg-blue-500/15 border border-blue-500/30">Datos locales</span>
            </div>
            <p class="text-xs text-slate-400 pl-7">
              Exporta o importa el historial de canciones junto con la configuración de funciones.
            </p>
          </div>

          <div class="flex flex-wrap gap-2">
            <button
              class="rounded-lg text-xs px-4 py-2 transition-all duration-200 font-medium whitespace-nowrap border border-emerald-500/35 bg-emerald-500/15 text-emerald-200 hover:bg-emerald-500/25 hover:border-emerald-500/50 hover:shadow-[0_8px_16px_-6px_rgba(16,185,129,0.1)]"
              @click="exportBackup"
            >
              Exportar respaldo
            </button>

            <button
              class="rounded-lg text-xs px-4 py-2 transition-all duration-200 font-medium whitespace-nowrap border border-sky-500/35 bg-sky-500/15 text-sky-200 hover:bg-sky-500/25 hover:border-sky-500/50 hover:shadow-[0_8px_16px_-6px_rgba(14,165,233,0.1)]"
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
              class="rounded-lg text-xs px-3 py-2 border border-slate-600/80 bg-slate-800/60 text-slate-200 transition-colors hover:border-slate-500 focus:border-blue-500/50 focus:bg-slate-800"
            >
              <option value="replace">Modo: Reemplazar historial</option>
              <option value="merge">Modo: Fusionar historial</option>
            </select>
          </div>

          <div v-if="backupPreview" class="rounded-xl border border-slate-700/80 bg-gradient-to-br from-slate-800/80 to-slate-900/60 p-3 text-xs text-slate-300 backdrop-blur-sm">
            <p class="font-semibold text-slate-100 mb-2 flex items-center gap-2"><span class="w-1.5 h-1.5 rounded-full bg-blue-400"></span>Vista previa de importación</p>
            <p>Canciones válidas: {{ backupPreview.totalTracks }}</p>
            <p>Artistas únicos: {{ backupPreview.uniqueArtists }}</p>
            <p>Canciones únicas: {{ backupPreview.uniqueTracks }}</p>
            <p>Rango: {{ backupPreview.rangeLabel }}</p>
            <p class="mt-2 text-slate-400">Esquema: {{ backupPreview.schema }} · Versión: {{ backupPreview.version }}</p>

            <div class="flex flex-wrap gap-2 mt-3">
              <button
                class="rounded-lg text-xs px-4 py-2 transition-all duration-200 font-medium whitespace-nowrap border border-emerald-500/35 bg-emerald-500/15 text-emerald-200 hover:bg-emerald-500/25 hover:border-emerald-500/50 hover:shadow-[0_8px_16px_-6px_rgba(16,185,129,0.1)]"
                @click="applyPendingImport"
              >
                Confirmar importación
              </button>
              <button
                class="rounded-lg text-xs px-4 py-2 transition-all duration-200 font-medium whitespace-nowrap border border-slate-600/80 bg-slate-700/40 text-slate-200 hover:bg-slate-700/60 hover:border-slate-500"
                @click="clearPendingImport"
              >
                Cancelar
              </button>
            </div>
          </div>

          <div class="space-y-2">
            <p v-if="backupMessage" class="text-xs text-emerald-300 flex items-center gap-2"><span class="w-1 h-1 rounded-full bg-emerald-400"></span>{{ backupMessage }}</p>
            <p v-if="backupWarning" class="text-xs text-amber-300 flex items-center gap-2"><span class="w-1 h-1 rounded-full bg-amber-400"></span>{{ backupWarning }}</p>
            <p v-if="backupError" class="text-xs text-rose-300 flex items-center gap-2"><span class="w-1 h-1 rounded-full bg-rose-400"></span>{{ backupError }}</p>
          </div>
        </div>
      </article>

      <article class="relative overflow-hidden rounded-2xl border border-slate-700/70 bg-slate-900/95 p-4 sm:p-5 shadow-[0_20px_40px_-24px_rgba(0,0,0,0.7)]">
        <div class="pointer-events-none absolute inset-x-0 top-0 h-16 bg-gradient-to-b from-purple-500/8 via-purple-500/2 to-transparent"></div>
        <div class="relative flex flex-col gap-3">
          <div class="space-y-1">
            <div class="flex items-center gap-2">
              <span class="inline-flex items-center justify-center w-5 h-5 rounded-full bg-purple-500/20 text-purple-300 text-[10px]">⚙️</span>
              <h3 class="font-semibold text-sm text-slate-100">Configuración actualizada de la app</h3>
              <span class="inline-block ml-auto px-2 py-0.5 rounded text-[10px] font-medium text-purple-300 bg-purple-500/15 border border-purple-500/30">Runtime</span>
            </div>
            <p class="text-xs text-slate-400 pl-7">Parámetros vigentes en la versión actual.</p>
          </div>

          <div class="rounded-xl border border-slate-700/80 bg-gradient-to-br from-slate-800/80 to-slate-900/60 p-3 text-xs text-slate-300 space-y-2 backdrop-blur-sm">
            <div class="flex items-center justify-between gap-3 py-1 px-2 rounded-lg hover:bg-slate-700/30 transition-colors">
              <span class="text-slate-300 font-medium">Escucha mínima para registrar nueva canción</span>
              <span class="font-semibold text-emerald-300 text-sm">{{ appRuntimeSettings.registerSongPercent }}</span>
            </div>
            <div class="flex items-center justify-between gap-3 py-1 px-2 rounded-lg hover:bg-slate-700/30 transition-colors">
              <span class="text-slate-300 font-medium">Escucha mínima para registrar tiempo escuchado</span>
              <span class="font-semibold text-emerald-300 text-sm">{{ appRuntimeSettings.listenTimePercent }}</span>
            </div>
            <div class="flex items-center justify-between gap-3 py-1 px-2 rounded-lg hover:bg-slate-700/30 transition-colors">
              <span class="text-slate-300 font-medium">Escucha mínima para registrar canción como duplicada</span>
              <span class="font-semibold text-emerald-300 text-sm">{{ appRuntimeSettings.duplicateSongPercent }}</span>
            </div>
            <div class="border-t border-slate-700/60 mt-2 pt-2">
              <p class="text-[11px] text-slate-500 flex items-center gap-2"><span class="w-1 h-1 rounded-full bg-slate-600"></span>Firma de app: {{ APP_SIGNATURE }}</p>
            </div>
          </div>
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
import { useFeatures, sanitizeListeningMode, sanitizeSkipInterval } from '@/composables/useFeatures'
import {
  REGISTER_DUPLICATE_PROGRESS_RATIO,
  REGISTER_NEW_SONG_PROGRESS_RATIO,
  REGISTER_LISTEN_TIME_PROGRESS_RATIO
} from '@/config/appThresholds'

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
const expandedPermissionId = ref(null)
const APP_VERSION = __APP_VERSION__
const APP_SIGNATURE = `Skippify ${APP_VERSION}`

const FEATURES_STORAGE_KEY = 'skippify-features'
const CUSTOM_SKIP_CONFIG_KEY = 'skippify-features-custom-skip'
const BACKUP_SCHEMA = 'skippify-backup-v1'
const BACKUP_VERSION = 1
const SUPPORTED_SCHEMAS = new Set([BACKUP_SCHEMA])

const postNotifGranted = ref(true) // default true; updated from native
const batteryOptimizationIgnored = ref(false)
const checkingPermissions = ref(false)

const orderedPermissionCards = computed(() => {
  return [
    {
      id: 'notif-access',
      icon: '🔔',
      title: 'Acceso a notificaciones',
      description: 'Permite detectar automáticamente las canciones reproducidas en Spotify mediante NotificationListenerService.',
      meta: 'Requerido · Todas las versiones de Android',
      statusLabel: notifEnabled.value ? 'Concedido' : 'No concedido',
      borderClass: notifEnabled.value ? 'border-emerald-500/30 bg-emerald-500/5' : 'border-amber-400/40 bg-amber-500/5',
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
      statusLabel: postNotifGranted.value ? 'Concedido' : 'No concedido',
      borderClass: postNotifGranted.value ? 'border-emerald-500/30 bg-emerald-500/5' : 'border-amber-400/40 bg-amber-500/5',
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
      statusLabel: batteryOptimizationIgnored.value ? 'Concedido' : 'No concedido',
      borderClass: batteryOptimizationIgnored.value ? 'border-emerald-500/30 bg-emerald-500/5' : 'border-amber-400/40 bg-amber-500/5',
      tagClass: batteryOptimizationIgnored.value
        ? 'bg-emerald-500/20 text-emerald-300 border-emerald-500/35'
        : 'bg-amber-500/20 text-amber-300 border-amber-400/35',
      action: !batteryOptimizationIgnored.value ? requestBatteryOptimizationExclusion : null,
      actionLabel: 'Excluir de optimización',
      actionClass: 'bg-amber-500/20 border border-amber-400/30 text-amber-200 hover:bg-amber-500/30'
    }
  ]
})

const appRuntimeSettings = computed(() => ({
  duplicateSongPercent: formatPercent(REGISTER_DUPLICATE_PROGRESS_RATIO),
  registerSongPercent: formatPercent(REGISTER_NEW_SONG_PROGRESS_RATIO),
  listenTimePercent: formatPercent(REGISTER_LISTEN_TIME_PROGRESS_RATIO)
}))

function formatPercent (ratio) {
  const numeric = Number(ratio)
  if (!Number.isFinite(numeric)) return 'N/A'
  return `${Math.round(numeric * 100)}%`
}

function togglePermissionInfo (cardId) {
  expandedPermissionId.value = expandedPermissionId.value === cardId ? null : cardId
}

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
      try {
        const dirHandle = await window.showDirectoryPicker({ mode: 'readwrite' })
        const fileHandle = await dirHandle.getFileHandle(fileName, { create: true })
        const writable = await fileHandle.createWritable()
        await writable.write(payloadJson)
        await writable.close()

        backupMessage.value = `Respaldo exportado en ${dirHandle.name}/${fileName} (${payload.data.events.length} canciones).`
        return
      } catch (pickerError) {
        if (pickerError?.name === 'AbortError' || pickerError?.name === 'SecurityError') {
          backupWarning.value = 'No se pudo usar el selector de carpeta. Se usó una exportación automática.'
        } else {
          throw pickerError
        }
      }
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
      backupWarning.value = backupWarning.value || 'Se usó carpeta predeterminada porque el selector de carpeta no está disponible en este dispositivo.'
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
    backupWarning.value = backupWarning.value || 'Se usó carpeta predeterminada porque el selector de carpeta no está disponible en este navegador.'
  } catch (error) {
    const detail = (error?.message || '').toString().trim()
    backupError.value = detail
      ? `No se pudo exportar el respaldo: ${detail}`
      : 'No se pudo exportar el respaldo.'
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
      reason: (event?.reason || '').toString(),
      // Se perdía al importar y provocaba eventos duplicados al reanudar una
      // canción pausada tras restaurar un respaldo.
      resume_anchor_ms: Math.max(0, Number(event?.resume_anchor_ms || 0) || 0)
    })
  }

  normalized.sort((a, b) => new Date(b.played_at) - new Date(a.played_at))
  return normalized
}

function applyImportedFeatures (incoming) {
  if (!incoming || typeof incoming !== 'object') return
  // Antes se copiaban los valores del fichero tal cual: un respaldo manipulado o
  // de una versión antigua podía dejar `listeningMode`/intervalo con valores
  // inválidos y romper las vistas Modos y Funcionalidades.
  if (typeof incoming.listeningMode === 'string') {
    featureState.listeningMode = sanitizeListeningMode(incoming.listeningMode)
  }
  if (typeof incoming.skipDuplicates === 'boolean') featureState.skipDuplicates = incoming.skipDuplicates
  if (typeof incoming.skipDuplicatesInterval === 'string') {
    featureState.skipDuplicatesInterval = sanitizeSkipInterval(incoming.skipDuplicatesInterval)
  }
  if (typeof incoming.silenceAds === 'boolean') featureState.silenceAds = incoming.silenceAds
  if (Array.isArray(incoming.silenceAdsKeywords)) {
    const keywords = incoming.silenceAdsKeywords
      .map(v => (v || '').toString().trim().toLowerCase())
      .filter((v, i, arr) => v && arr.indexOf(v) === i)
    for (const kw of ['publicidad', 'anuncio', 'anuncios']) {
      if (!keywords.includes(kw)) keywords.push(kw)
    }
    featureState.silenceAdsKeywords = keywords
  }
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
      backupError.value = 'Versión de respaldo no compatible con esta app.'
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
