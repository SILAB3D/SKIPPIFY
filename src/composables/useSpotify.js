/**
 * useSpotify — handles Spotify OAuth token refresh, recently-played sync,
 * and currently-playing state.
 */
import { ref, computed } from 'vue'

const SK = {
  clientId: 'skippify-sp-clientid',
  secret: 'skippify-sp-secret',
  refresh: 'skippify-sp-refresh',
  token: 'skippify-sp-token',
  expiry: 'skippify-sp-expiry'
}

export function useSpotify () {
  const feedback = ref('')
  const feedbackError = ref(false)
  const syncStatus = ref('Conectando...')
  const syncStatusError = ref(false)

  function getCredentials () {
    return {
      clientId: (localStorage.getItem(SK.clientId) || '').trim(),
      clientSecret: (localStorage.getItem(SK.secret) || '').trim(),
      refreshToken: (localStorage.getItem(SK.refresh) || '').trim()
    }
  }

  function hasCredentials () {
    const { clientId, clientSecret, refreshToken } = getCredentials()
    return !!(clientId && clientSecret && refreshToken)
  }

  const isConfigured = computed(() => hasCredentials())

  function saveCredentials (clientId, clientSecret, refreshToken) {
    localStorage.setItem(SK.clientId, clientId)
    localStorage.setItem(SK.secret, clientSecret)
    localStorage.setItem(SK.refresh, refreshToken)
    localStorage.removeItem(SK.token)
    localStorage.removeItem(SK.expiry)
  }

  function loadSavedCredentials () {
    return getCredentials()
  }

  async function getAccessToken () {
    if (!hasCredentials()) return null
    const expiry = parseInt(localStorage.getItem(SK.expiry) || '0')
    const existing = localStorage.getItem(SK.token)
    if (existing && Date.now() < expiry - 60000) return existing

    const { clientId, clientSecret, refreshToken } = getCredentials()
    const b64 = btoa(`${clientId}:${clientSecret}`)
    const resp = await fetch('https://accounts.spotify.com/api/token', {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded', Authorization: `Basic ${b64}` },
      body: `grant_type=refresh_token&refresh_token=${encodeURIComponent(refreshToken)}`
    })
    if (!resp.ok) {
      const err = await resp.json().catch(() => ({}))
      throw new Error(err.error_description || `Token refresh error (${resp.status})`)
    }
    const data = await resp.json()
    if (!data.access_token) throw new Error('No se recibió access_token de Spotify')
    localStorage.setItem(SK.token, data.access_token)
    localStorage.setItem(SK.expiry, String(Date.now() + (data.expires_in || 3600) * 1000))
    return data.access_token
  }

  async function fetchRecentlyPlayed () {
    const token = await getAccessToken()
    if (!token) return []
    const resp = await fetch('https://api.spotify.com/v1/me/player/recently-played?limit=50', {
      headers: { Authorization: `Bearer ${token}` }
    })
    if (!resp.ok) {
      const err = await resp.json().catch(() => ({}))
      throw new Error(err.error?.message || `Error ${resp.status}`)
    }
    const data = await resp.json()
    return (data.items || []).map(item => ({
      played_at: item.played_at,
      track: item.track?.name || 'Desconocida',
      artist: (item.track?.artists || []).map(a => a.name).join(', ') || 'Desconocido',
      duration_ms: item.track?.duration_ms || 0,
      ms_played: item.track?.duration_ms || 0,
      genres: []
    }))
  }

  async function fetchCurrentlyPlaying () {
    const token = await getAccessToken()
    if (!token) return null
    const resp = await fetch('https://api.spotify.com/v1/me/player/currently-playing', {
      headers: { Authorization: `Bearer ${token}` }
    })
    if (resp.status === 204) return null
    if (!resp.ok) return null
    const data = await resp.json()
    if (!data?.item) return null
    return {
      track: data.item.name,
      artist: (data.item.artists || []).map(a => a.name).join(', '),
      duration_ms: Number(data.item.duration_ms || 0),
      progress_ms: Number(data.progress_ms || 0),
      is_playing: !!data.is_playing
    }
  }

  function setFeedback (text, isError = false) {
    feedback.value = text
    feedbackError.value = isError
  }

  function setSyncStatus (text, isError = false) {
    syncStatus.value = text
    syncStatusError.value = isError
  }

  return {
    feedback,
    feedbackError,
    syncStatus,
    syncStatusError,
    isConfigured,
    getCredentials,
    hasCredentials,
    saveCredentials,
    loadSavedCredentials,
    getAccessToken,
    fetchRecentlyPlayed,
    fetchCurrentlyPlaying,
    setFeedback,
    setSyncStatus
  }
}
