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
const MIN_LISTEN_TIME_PROGRESS_RATIO = 0.80

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

function _parseIntervalMs (interval) {
  const n = parseInt(interval, 10)
  if (interval.endsWith('h')) return n * 3_600_000
  if (interval.endsWith('d')) return n * 86_400_000
  if (interval.endsWith('w')) return n * 7 * 86_400_000
  if (interval.endsWith('m')) return n * 30 * 86_400_000
  if (interval.endsWith('y')) return n * 365 * 86_400_000
  return 7 * 86_400_000
}

function _isRecentDuplicate (track, artist, durationMs, interval, currentPlayStart) {
  const { state } = useEventStore()
  const cutoff = new Date(Date.now() - _parseIntervalMs(interval)).toISOString()
  return state.events.some(
    e => !_isExcludedHistoryEntry(e) &&
         _matchesDuplicateCandidate(e, track, artist, durationMs) &&
         e.played_at >= cutoff &&
         e.played_at < currentPlayStart   // exclude the event created for the current play
  )
}

function getPlugin () {
  return window.Capacitor?.Plugins?.NotifListener || null
}

export function useNotifListener () {
  const { addEvent } = useEventStore()
  const { updateState, playback } = usePlayback()

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

  /** Set up real-time Spotify notification listener */
  async function setupTrackListener (NL) {
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
        _currentTrackFirstSeenAt = new Date().toISOString()        // Clear the registered marker when track changes
        _currentRegisteredTrackKey = ''      }

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
      // Mark this as the currently registered track (prevent skipping it)
      _currentRegisteredTrackKey = `${seg.track}|${seg.artist}`
    }
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
