/**
 * useNotifListener — bridges the Capacitor NotifListener plugin (Android)
 * and drains background events on startup.
 *
 * SINGLETON: All components share the same reactive state.
 * Auto-prompts the user on first launch if permission is not granted.
 * Listens for `permissionChanged` events when user returns from settings.
 */
import { ref } from 'vue'
import { useEventStore } from '@/stores/events'
import { usePlayback } from '@/composables/usePlayback'
import { useFeatures } from '@/composables/useFeatures'
import {
  REGISTER_DUPLICATE_PROGRESS_RATIO,
  REGISTER_LISTEN_TIME_PROGRESS_RATIO
} from '@/config/appThresholds'

// ── Shared singleton state ────────────────────────────────────────────────────
const notifEnabled = ref(false)
const notifError = ref('')
const notifChecked = ref(false)
const isCapacitor = ref(false)
const promptDismissed = ref(false)

// Controls the first-launch permissions modal.
// True = modal visible. Persisted via localStorage so it only shows once,
// but reappears if permissions are later revoked.
const SEEN_KEY = 'skippify-notif-seen'
const showPermissionsModal = ref(false)

// Ruta solicitada desde la notificación persistente (acciones de modo). El lado
// nativo ya emitía `openRoute` / exponía `consumePendingOpenRoute`, pero nadie lo
// consumía: pulsar la notificación abría siempre la pantalla de inicio.
const pendingOpenRoute = ref('')

function _updateModalVisibility () {
  if (!isCapacitor.value || !notifChecked.value) return
  if (notifEnabled.value) {
    // Permissions granted → mark as seen and hide modal
    localStorage.setItem(SEEN_KEY, '1')
    showPermissionsModal.value = false
  } else {
    // Permissions NOT granted → show modal only if not already seen this cycle
    showPermissionsModal.value = !localStorage.getItem(SEEN_KEY)
  }
}

let _initialized = false
let _onNowPlayingCb = null
// Guardas de idempotencia: `setupTrackListener` / `drainEvents` pueden llegar a
// invocarse en paralelo desde `checkAndInit`, desde el evento `permissionChanged`
// y desde `recheckPermission`. Sin estas guardas se registraban varios listeners
// `spotifyTrack` y cada notificación de Spotify se procesaba (y contaba) 2 veces.
let _trackListenerReady = false
let _featureListenerReady = false
let _openRouteListenerReady = false
let _drainPromise = null

// ── Skip-duplicate helpers ────────────────────────────────────────────────
let _lastSkippedKey = ''
let _lastSkippedAtMs = 0

// Tracks the first moment the current track was seen so its own event
// (added immediately to the store) is excluded from the duplicate check.
let _currentTrackKey = ''
let _currentTrackFirstSeenAt = ''

// Tracks the currently registered song in this session to prevent skipping it.
// Never skip the song that was just registered until user switches to another song.
let _currentRegisteredTrackKey = ''

const MIN_REGISTER_PROGRESS_RATIO = 0.05
const MIN_LISTEN_TIME_PROGRESS_RATIO = REGISTER_LISTEN_TIME_PROGRESS_RATIO

function _normalizeForMatch (value) {
  return (value || '')
    .toString()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, ' ')
    .trim()
    .replace(/\s+/g, ' ')
}

function _isExcludedHistoryEntry (event) {
  const track = _normalizeForMatch(event?.track)
  const artist = _normalizeForMatch(event?.artist)
  const combined = `${track} ${artist}`.trim()
  if (!combined) return false
  if (combined.includes('publicidad')) return true
  if (combined.includes('anuncio')) return true
  if (combined.includes('spotify')) return true
  if (track.includes('dj x') || artist.includes('dj x')) return true
  return false
}

function _matchesDuplicateCandidate (candidate, track, artist, durationMs) {
  const candidateTrack = _normalizeForMatch(candidate?.track)
  const candidateArtist = _normalizeForMatch(candidate?.artist)
  const targetTrack = _normalizeForMatch(track)
  const targetArtist = _normalizeForMatch(artist)

  if (!candidateTrack || !candidateArtist || !targetTrack || !targetArtist) return false
  if (candidateTrack !== targetTrack || candidateArtist !== targetArtist) return false

  const candidateDuration = Number(candidate?.duration_ms || 0)
  const targetDuration = Number(durationMs || 0)
  if (candidateDuration > 0 && targetDuration > 0 && Math.abs(candidateDuration - targetDuration) > 2000) {
    return false
  }

  return true
}

const DEFAULT_INTERVAL_MS = 7 * 86_400_000

function _parseIntervalMs (interval) {
  // Antes se llamaba a `interval.endsWith(...)` directamente: si el valor venía
  // undefined/numérico (respaldo corrupto, config nativa antigua) lanzaba
  // TypeError y rompía todo el listener de notificaciones.
  const raw = (interval ?? '').toString().trim().toLowerCase()
  if (!raw) return DEFAULT_INTERVAL_MS

  const parsed = parseInt(raw, 10)
  const n = Number.isFinite(parsed) && parsed > 0 ? parsed : 1

  if (raw.endsWith('h')) return n * 3_600_000
  if (raw.endsWith('d')) return n * 86_400_000
  if (raw.endsWith('w')) return n * 7 * 86_400_000
  if (raw.endsWith('m')) return n * 30 * 86_400_000
  if (raw.endsWith('y')) return n * 365 * 86_400_000
  return DEFAULT_INTERVAL_MS
}

function _hasReachedDuplicateThreshold (event) {
  const dur = Number(event?.duration_ms || 0)
  const ms = Number(event?.ms_played || 0)
  if (!Number.isFinite(dur) || dur <= 0) return false
  if (!Number.isFinite(ms) || ms <= 0) return false
  return (ms / dur) >= REGISTER_DUPLICATE_PROGRESS_RATIO
}

function _isRecentDuplicate (track, artist, durationMs, interval, currentPlayStart) {
  const { state } = useEventStore()
  // Comparación numérica en vez de lexicográfica sobre cadenas ISO (un evento
  // importado con desfase "+02:00" rompía el filtro de ventana temporal).
  const cutoffMs = Date.now() - _parseIntervalMs(interval)
  const currentPlayStartMs = Date.parse(currentPlayStart)
  const upperBoundMs = Number.isFinite(currentPlayStartMs) ? currentPlayStartMs : Date.now()

  // Los eventos están ordenados de más nuevo a más antiguo: se corta el recorrido
  // al salir de la ventana en vez de barrer todo el historial.
  for (const e of state.events) {
    const playedAtMs = Date.parse(e?.played_at)
    if (!Number.isFinite(playedAtMs)) continue
    if (playedAtMs < cutoffMs) break
    if (playedAtMs >= upperBoundMs) continue // exclude the event created for the current play
    if (_isExcludedHistoryEntry(e)) continue
    if (!_hasReachedDuplicateThreshold(e)) continue
    if (_matchesDuplicateCandidate(e, track, artist, durationMs)) return true
  }
  return false
}

function getPlugin () {
  return window.Capacitor?.Plugins?.NotifListener || null
}

export function useNotifListener () {
  const { addEvent } = useEventStore()
  const { updateState, playback } = usePlayback()
  const { applyNativeFeatureConfig } = useFeatures()

  /**
   * Initialize the notification listener. Should be called once (from App.vue).
   * - Checks if we're running inside Capacitor
   * - Checks notification listener permission
   * - If NOT enabled → shows native prompt dialog
   * - Listens for permissionChanged events (fired onResume)
   * - Sets up spotifyTrack listener + drains background events
   */
  async function checkAndInit (onNowPlaying) {
    _onNowPlayingCb = onNowPlaying

    const NL = getPlugin()
    if (!NL) {
      // Running in browser, not Capacitor
      notifChecked.value = true
      isCapacitor.value = false
      return
    }

    isCapacitor.value = true

    // If already initialized (e.g. hot-reload), skip
    if (_initialized) return
    _initialized = true

    // Listen for permission changes (fired by native onResume)
    try {
      await NL.addListener('permissionChanged', async (data) => {
        const wasEnabled = notifEnabled.value
        notifEnabled.value = !!data?.enabled
        notifChecked.value = true

        if (!wasEnabled && notifEnabled.value) {
          // Just granted → set up listeners, hide modal
          _updateModalVisibility()
          await setupTrackListener(NL)
          await drainEvents(NL)
        } else if (wasEnabled && !notifEnabled.value) {
          // Revoked → clear seen flag so modal reappears
          localStorage.removeItem(SEEN_KEY)
          _updateModalVisibility()
        }
      })
    } catch { /* ignored */ }

    // El servicio nativo emite `featureConfigChanged` cuando el usuario cambia de
    // modo desde las acciones de la notificación persistente. Antes nadie
    // escuchaba este evento, así que la UI se quedaba desincronizada.
    await setupFeatureConfigListener(NL)
    await setupOpenRouteListener(NL)

    try {
      // Ensure POST_NOTIFICATIONS permission (Android 13+) + check listener
      await NL.ensureAllPermissions()

      const { enabled } = await NL.isEnabled()
      notifChecked.value = true
      notifEnabled.value = enabled

      // Update modal visibility based on current permission state
      _updateModalVisibility()

      if (enabled) {
        // Permission already granted — start listening
        await setupTrackListener(NL)
        await drainEvents(NL)
      }
    } catch (err) {
      notifError.value = err.message || String(err)
      notifChecked.value = true
    }
  }

  /** Keep the JS feature state in sync with the native config (notification actions). */
  async function setupFeatureConfigListener (NL) {
    if (_featureListenerReady) return
    _featureListenerReady = true
    try {
      await NL.addListener('featureConfigChanged', (config) => {
        if (config && typeof config === 'object') applyNativeFeatureConfig(config)
      })
    } catch {
      _featureListenerReady = false
    }
  }

  /** Route requested from the persistent notification (mode actions / tap). */
  async function setupOpenRouteListener (NL) {
    if (_openRouteListenerReady) return
    _openRouteListenerReady = true
    try {
      await NL.addListener('openRoute', (payload) => {
        const route = (payload?.route || '').toString().trim()
        if (route.startsWith('/')) pendingOpenRoute.value = route
      })
      if (NL.consumePendingOpenRoute) {
        const initial = await NL.consumePendingOpenRoute()
        const route = (initial?.route || '').toString().trim()
        if (route.startsWith('/')) pendingOpenRoute.value = route
      }
    } catch {
      _openRouteListenerReady = false
    }
  }

  function consumePendingOpenRoute () {
    const route = pendingOpenRoute.value
    pendingOpenRoute.value = ''
    return route
  }

  /** Set up real-time Spotify notification listener */
  async function setupTrackListener (NL) {
    if (_trackListenerReady) return
    _trackListenerReady = true

    const { state: features } = useFeatures()

    await NL.addListener('spotifyTrack', async (data) => {
      const evt = (data?.event || '').toString()
      const track = (data?.track || '').toString()
      const artist = (data?.artist || '').toString()
      const durationMs = Number(data?.duration_ms || 0)
      const playing = !!data?.is_playing
      const progressMs = Number(data?.progress_ms ?? data?.progressMs)

      if (evt === 'stopped' || (!track && !artist)) {
        _onNowPlayingCb?.({ mode: 'stopped', progressPct: null, durationMs: null, progressSyncedAt: null })
        await updateState({ track: '', artist: '', is_playing: false, source: 'notification' })
        return
      }

      // ── Saltar duplicadas ──────────────────────────────────────────────
      // Track when we first see this track so its own registered event
      // (added immediately to the store) is excluded from the check.
      const trackKey = `${track}|${artist}`
      const trackChanged = trackKey !== _currentTrackKey
      if (trackChanged) {
        _currentTrackKey = trackKey
        _currentTrackFirstSeenAt = new Date().toISOString()
        // Clear the registered marker when track changes
        _currentRegisteredTrackKey = ''
      }

      const nearStart = !Number.isFinite(progressMs) || progressMs <= 12_000

      // Duplicate skip logic:
      // - Only when PLAYING (not paused)
      // - When track changed or is new
      // - Near the start (< 12s)
      // - NOT the currently registered song in this session
      if (features.skipDuplicates && playing && track && artist && trackChanged && nearStart) {
        const skipKey = trackKey
        const now = Date.now()
        const loopGuard = skipKey === _lastSkippedKey && (now - _lastSkippedAtMs) < 10_000
        // If we already issued a skip for this track, suppress any follow-up
        // notifications too (pause/metadata updates) so it never gets registered.
        if (loopGuard) return
        
        // Never skip the song that was just registered in this session
        if (skipKey === _currentRegisteredTrackKey) {
          return  // Don't skip, don't register
        }
        
        if (_isRecentDuplicate(track, artist, durationMs, features.skipDuplicatesInterval, _currentTrackFirstSeenAt)) {
          _lastSkippedKey = skipKey
          _lastSkippedAtMs = now
          try { await NL.skipTrack() } catch { /* ignored */ }
          return  // no registrar este evento
        }
      }

      await updateState({
        track,
        artist,
        album: data.album,
        duration_ms: Number(data.duration_ms || 0),
        progress_ms: Number.isFinite(progressMs) ? progressMs : null,
        is_playing: playing,
        source: 'notification'
      })

      const effectiveDurationMs = Number(durationMs || playback.durationMs || 0)

      let progressPct = null
      if (Number.isFinite(progressMs) && effectiveDurationMs > 0) {
        progressPct = (progressMs / effectiveDurationMs) * 100
      } else if (effectiveDurationMs > 0 && playback.key === `${track}|${artist}`) {
        progressPct = (Number(playback.msPlayed || 0) / effectiveDurationMs) * 100
      }

      _onNowPlayingCb?.({
        mode: playing ? 'playing' : 'paused',
        track,
        artist,
        meta: '',
        progressPct,
        durationMs: effectiveDurationMs > 0 ? effectiveDurationMs : null,
        progressSyncedAt: Date.now()
      })
    })
  }

  /** Drain background-captured events */
  async function drainEvents (NL) {
    // `drainBackgroundEvents` borra el log nativo al leerlo: dos llamadas
    // simultáneas se repartían los eventos y se perdían segmentos.
    if (_drainPromise) return _drainPromise
    _drainPromise = _drainEventsOnce(NL).finally(() => { _drainPromise = null })
    return _drainPromise
  }

  async function _drainEventsOnce (NL) {
    try {
      const drained = await NL.drainBackgroundEvents()
      const raw = Array.isArray(drained?.events) ? drained.events : []
      if (raw.length) {
        await ingestBackgroundEvents(raw)
      }
    } catch { /* ignored */ }

    // After draining, advance _currentTrackFirstSeenAt to NOW so that any
    // background event just ingested (including the currently-playing song)
    // is treated as a prior session and does NOT trigger a duplicate skip
    // when the first live notification arrives for that same track.
    _currentTrackFirstSeenAt = new Date().toISOString()
  }

  /** Open system notification listener settings directly (no dialog) */
  async function requestPermission () {
    const NL = getPlugin()
    if (NL) await NL.requestPermission()
  }

  /** Show the native prompt dialog, then open settings if accepted */
  async function promptPermission () {
    const NL = getPlugin()
    if (!NL) return
    try {
      await NL.promptPermission()
    } catch { /* ignored */ }
  }

  /** Re-check permission (call after returning from settings) */
  async function recheckPermission () {
    const NL = getPlugin()
    if (!NL) return
    try {
      const { enabled } = await NL.isEnabled()
      const wasEnabled = notifEnabled.value
      notifEnabled.value = enabled
      notifChecked.value = true

      if (!wasEnabled && enabled) {
        await setupTrackListener(NL)
        await drainEvents(NL)
      }
    } catch { /* ignored */ }
  }

  function dismissPrompt () {
    promptDismissed.value = true
  }

  /** Dismiss the first-launch permissions modal (marks as seen in localStorage). */
  function dismissPermissionsModal () {
    localStorage.setItem(SEEN_KEY, '1')
    showPermissionsModal.value = false
  }

  async function ingestBackgroundEvents (rawEvents) {
    const list = Array.isArray(rawEvents) ? rawEvents : []
    const parsed = list
      .map(e => {
        const playedAt = (e?.played_at || '').toString()
        const t = Date.parse(playedAt)
        if (!Number.isFinite(t)) return null
        const event = (e?.event || '').toString().toLowerCase()
        const track = (e?.track || '').toString().trim()
        const artist = (e?.artist || '').toString().trim()
        const album = (e?.album || '').toString().trim()
        const durationMs = Number(e?.duration_ms || 0)
        let evt = event
        if (!evt) evt = (track || artist) ? (e?.is_playing ? 'playing' : 'paused') : ''
        if (!evt) return null
        return { t, played_at: playedAt, event: evt, track, artist, album, durationMs }
      })
      .filter(Boolean)
      .sort((a, b) => a.t - b.t)

    if (!parsed.length) return

    const segments = []
    let current = null

    function closeCurrent (endT, endPlayedAt) {
      if (!current) return
      const msPlayed = endT - current.startT
      if (!Number.isFinite(msPlayed) || msPlayed <= 0 || msPlayed > 6 * 3600000) {
        current = null
        return
      }
      segments.push({
        played_at: endPlayedAt,
        track: current.track,
        artist: current.artist,
        album: current.album || '',
        duration_ms: Number(current.durationMs || 0),
        ms_played: Math.round(msPlayed),
        genres: [],
        source: 'notification_background',
        reason: 'background'
      })
      current = null
    }

    for (const e of parsed) {
      if (e.event === 'playing') {
        if (!e.track || !e.artist) continue
        // If the same track is already being tracked (notification refresh / repeated
        // "playing" event for the same song), don't close and re-open the segment.
        if (current && current.track === e.track && current.artist === e.artist) continue
        if (current) closeCurrent(e.t, e.played_at)
        current = {
          track: e.track,
          artist: e.artist,
          album: e.album,
          durationMs: Number(e.durationMs || 0),
          startT: e.t
        }
        continue
      }
      if (e.event === 'paused' || e.event === 'stopped') {
        closeCurrent(e.t, e.played_at)
      }
    }
    if (current) closeCurrent(Date.now(), new Date().toISOString())

    segments.sort((a, b) => new Date(b.played_at) - new Date(a.played_at))
    let newestRegisteredKey = ''
    for (const seg of segments) {
      const durationMs = Number(seg.duration_ms || 0)
      const msPlayed = Number(seg.ms_played || 0)
      if (!Number.isFinite(durationMs) || durationMs <= 0) continue
      if (!Number.isFinite(msPlayed) || msPlayed <= 0) continue

      const progressRatio = msPlayed / durationMs
      // Register song if progress >= 5%
      if (progressRatio < MIN_REGISTER_PROGRESS_RATIO) continue

      // Only record listening time if progress >= 80%
      if (progressRatio < MIN_LISTEN_TIME_PROGRESS_RATIO) {
        seg.ms_played = 0
      }

      addEvent(seg)
      // Los segmentos están ordenados de más nuevo a más antiguo: quedarse con el
      // primero. Antes se sobrescribía en cada vuelta y acababa apuntando al más
      // ANTIGUO, así que la protección "no saltar la canción recién registrada"
      // se aplicaba a la canción equivocada.
      if (!newestRegisteredKey) newestRegisteredKey = `${seg.track}|${seg.artist}`
    }
    if (newestRegisteredKey) _currentRegisteredTrackKey = newestRegisteredKey
  }

  /** Mark a track as currently registered in this session (prevent skipping it) */
  function markCurrentlyRegistered (track, artist) {
    _currentRegisteredTrackKey = `${(track || '').trim()}|${(artist || '').trim()}`
  }

  /** Clear the currently registered track (call when switching to different track) */
  function clearCurrentlyRegistered () {
    _currentRegisteredTrackKey = ''
  }

  return {
    notifEnabled,
    notifError,
    notifChecked,
    isCapacitor,
    promptDismissed,
    showPermissionsModal,
    pendingOpenRoute,
    consumePendingOpenRoute,
    checkAndInit,
    requestPermission,
    promptPermission,
    recheckPermission,
    dismissPrompt,
    dismissPermissionsModal,
    getPlugin,
    markCurrentlyRegistered,
    clearCurrentlyRegistered
  }
}
