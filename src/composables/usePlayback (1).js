/**
 * usePlayback — tracks the currently-playing song using wall-clock timing.
 *
 * IMMEDIATE REGISTRATION: Each song is added to the event store exactly ONCE,
 * the moment playback is first detected.  When the track ends / changes the
 * stored event is updated with the final ms_played value.
 *
 * Deduplication guarantees:
 *  - Pause→resume of the same track does NOT create a second event.
 *  - Multiple sources (notification + API) for the same song share one event.
 *  - Time-window guard prevents any duplicate within 120 s for the same song.
 */
import { reactive } from 'vue'
import { useEventStore } from '@/stores/events'

const playback = reactive({
  key: '',
  track: '',
  artist: '',
  album: '',
  durationMs: 0,
  msPlayed: 0,
  lastProgressMs: null,
  lastTickAt: null,
  isPlaying: false,
  source: '',
  eventPlayedAt: null   // played_at of the event we stored for this track
})

function playbackKey (track, artist) {
  return `${(track || '').trim()}|${(artist || '').trim()}`
}

function normalizeForMatch (value) {
  return (value || '')
    .toString()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, ' ')
    .trim()
    .replace(/\s+/g, ' ')
}

function softenTrackTitle (value) {
  let track = normalizeForMatch(value)
  if (!track) return ''

  track = track
    .replace(/\b(feat|featuring|ft)\b.*$/, '')
    .replace(/\b(remaster|remastered)(\s+\d{2,4})?$/, '')
    .replace(/\b(live|mono|stereo|instrumental|acoustic|karaoke|commentary)$/, '')
    .replace(/\b(radio edit|edit|mix|version)$/, '')
    .trim()

  return track.replace(/\s+/g, ' ')
}

function primaryArtist (value) {
  const normalized = normalizeForMatch(value)
  if (!normalized) return ''
  return normalized.split(/\b(?:and|with|x|y)\b|,|&|;/)[0].trim()
}

function matchesTrackArtist (candidate, track, artist) {
  const candidateTrack = normalizeForMatch(candidate?.track)
  const candidateArtist = normalizeForMatch(candidate?.artist)
  const targetTrack = normalizeForMatch(track)
  const targetArtist = normalizeForMatch(artist)

  if (!candidateTrack || !candidateArtist || !targetTrack || !targetArtist) return false
  if (candidateTrack === targetTrack && candidateArtist === targetArtist) return true

  return softenTrackTitle(candidate?.track) === softenTrackTitle(track) &&
    primaryArtist(candidate?.artist) === primaryArtist(artist)
}

function resetPlayback (s = {}) {
  playback.key = s.key || ''
  playback.track = s.track || ''
  playback.artist = s.artist || ''
  playback.album = s.album || ''
  playback.durationMs = Number(s.durationMs || 0)
  playback.msPlayed = 0
  playback.lastProgressMs = Number.isFinite(s.progressMs) ? Number(s.progressMs) : null
  playback.lastTickAt = Date.now()
  playback.isPlaying = !!s.isPlaying
  playback.source = s.source || ''
  playback.eventPlayedAt = s.eventPlayedAt || null
}

function tickFromWallclock () {
  if (!playback.key || !playback.isPlaying) return
  const now = Date.now()
  if (!playback.lastTickAt) { playback.lastTickAt = now; return }
  const delta = now - playback.lastTickAt
  playback.lastTickAt = now
  if (delta > 0 && delta < 60000) {
    playback.msPlayed += delta
    _onTick?.()
  }
}

// Wall-clock ticker
let _interval = null
let _onTick = null

function startTicker () {
  if (_interval) return
  _interval = setInterval(tickFromWallclock, 1000)
}

/** Dedup window — same track+artist won't be registered twice within this span */
const DEDUP_WINDOW_MS = 120_000 // 2 minutes
const MIN_REGISTER_PROGRESS_RATIO = 0.05
const MIN_LISTEN_TIME_PROGRESS_RATIO = 0.80

export function usePlayback () {
  const store = useEventStore()
  const { addEvent, updateEvent } = store

  startTicker()

  /**
   * Check if the same track+artist already has an event within the last
   * DEDUP_WINDOW_MS. If so return its played_at (reuse it); otherwise null.
   */
  function findRecentEvent (track, artist) {
    const cutoff = new Date(Date.now() - DEDUP_WINDOW_MS).toISOString()
    for (const e of store.state.events) {
      if (e.played_at < cutoff) break // events sorted newest-first
      if (matchesTrackArtist(e, track, artist)) return e.played_at
    }
    return null
  }

  /**
   * Register a song in the store exactly once.
   * If the same track+artist was already registered within the dedup window,
   * returns the existing event's played_at instead of creating a duplicate.
   */
  function registerImmediate (track, artist, album, durationMs, source) {
    if (!track || !artist) return null

    // ── Dedup: reuse if recently registered ──
    const existing = findRecentEvent(track, artist)
    if (existing) return existing

    const played_at = new Date().toISOString()
    addEvent({
      played_at,
      track,
      artist,
      album: album || '',
      duration_ms: Number(durationMs || 0),
      ms_played: 0,
      genres: [],
      source: source || 'notification',
      reason: 'detected'
    })
    return played_at
  }

  function hasReachedRegisterThreshold (msPlayed, durationMs) {
    const dur = Number(durationMs || 0)
    const ms = Number(msPlayed || 0)
    if (!Number.isFinite(dur) || dur <= 0) return false
    if (!Number.isFinite(ms) || ms <= 0) return false
    return ms >= Math.ceil(dur * MIN_REGISTER_PROGRESS_RATIO)
  }

  function maybeRegisterCurrentEvent () {
    if (playback.eventPlayedAt) return
    if (!playback.track || !playback.artist) return
    if (!hasReachedRegisterThreshold(playback.msPlayed, playback.durationMs)) return

    playback.eventPlayedAt = registerImmediate(
      playback.track,
      playback.artist,
      playback.album,
      playback.durationMs,
      playback.source
    )
  }

  // Keep registration responsive even if Spotify doesn't emit frequent updates.
  _onTick = maybeRegisterCurrentEvent

  /**
   * Finalize the currently-tracked event: patch ms_played with the wall-clock
   * total accumulated so far. Only record listening time if progress >= 80%.
   */
  function finalizeCurrentEvent (reason = '') {
    if (!playback.eventPlayedAt || !playback.track || !playback.artist) return
    const ms = Math.round(playback.msPlayed)
    const durationMs = Number(playback.durationMs || 0)
    
    let msToRecord = ms
    // Only record listening time if progress >= 80%
    if (Number.isFinite(durationMs) && durationMs > 0) {
      const progressRatio = ms / durationMs
      if (progressRatio < MIN_LISTEN_TIME_PROGRESS_RATIO) {
        msToRecord = 0
      }
    }
    
    updateEvent(playback.eventPlayedAt, playback.track, playback.artist, {
      ms_played: msToRecord,
      reason
    })
  }

  async function updateState (update) {
    const track = (update?.track || '').trim()
    const artist = (update?.artist || '').trim()
    const album = (update?.album || '').trim()
    const durationMs = Number(update?.duration_ms ?? update?.durationMs ?? 0)
    const isPlaying = !!update?.is_playing
    const source = update?.source || ''
    const progressMs = Number.isFinite(update?.progress_ms)
      ? Number(update.progress_ms)
      : Number.isFinite(update?.progressMs) ? Number(update.progressMs) : null

    const key = playbackKey(track, artist)

    // ── Track changed ──────────────────────────────────────────────────────
    if (playback.key && key && key !== playback.key) {
      maybeRegisterCurrentEvent()
      finalizeCurrentEvent('track_changed')

      // New track starts unregistered; it will be persisted only after >=5% listened.
      resetPlayback({ key, track, artist, album, durationMs, progressMs, isPlaying, source, eventPlayedAt: null })
      return
    }

    // ── Stopped (no track info) ────────────────────────────────────────────
    if (playback.key && !key) {
      maybeRegisterCurrentEvent()
      finalizeCurrentEvent('stopped')
      resetPlayback({})
      return
    }

    // ── Brand-new track (nothing was playing) ──────────────────────────────
    if (!playback.key && key) {
      resetPlayback({ key, track, artist, album, durationMs, progressMs, isPlaying, source, eventPlayedAt: null })
      return
    }

    // ── Same track ─────────────────────────────────────────────────────────
    if (playback.key && key === playback.key) {
      if (durationMs > 0) playback.durationMs = durationMs
      if (album) playback.album = album

      const now = Date.now()

      // Accumulate play time while playing
      if (playback.isPlaying) {
        if (Number.isFinite(progressMs) && Number.isFinite(playback.lastProgressMs)) {
          const delta = progressMs - playback.lastProgressMs
          if (delta > 0 && delta < 60000) playback.msPlayed += delta
          playback.lastProgressMs = progressMs
          playback.lastTickAt = now
        } else {
          tickFromWallclock()
        }
      }

      // Persist track only after minimum listened ratio is reached.
      maybeRegisterCurrentEvent()

      // Was playing → now paused: finalize ms_played but KEEP the track key
      // so a quick resume doesn't re-register.
      if (playback.isPlaying && !isPlaying) {
        finalizeCurrentEvent('paused')
        playback.isPlaying = false
        playback.lastTickAt = now
        // Do NOT resetPlayback — keep key + eventPlayedAt intact
        return
      }

      // Was paused → now resuming same track: continue accumulating on the
      // same event (no new registration).
      if (!playback.isPlaying && isPlaying) {
        playback.isPlaying = true
        playback.lastTickAt = now

        // Do not reset msPlayed on resume: threshold is based on total listened
        // for this track session.
      }

      playback.source = source || playback.source
      if (Number.isFinite(progressMs)) playback.lastProgressMs = progressMs
      playback.lastTickAt = now
    }
  }

  return {
    playback,
    updateState,
    finalizeCurrentEvent
  }
}
