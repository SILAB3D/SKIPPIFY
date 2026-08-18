/**
 * useSpotify — sesión con la Web API de Spotify mediante OAuth PKCE.
 *
 * Se usa PKCE y no el flujo con secreto por una razón obligatoria: en una app
 * que se instala en el móvil del usuario NO existe forma de guardar un
 * client secret; cualquiera puede abrir la APK y leerlo. PKCE está pensado
 * exactamente para este caso y no necesita secreto.
 *
 * El login se abre en el navegador del sistema (Spotify bloquea el login desde
 * WebViews embebidas) y se vuelve por deep link `skippify://spotify-auth`.
 */
import { computed, reactive, ref } from 'vue'

const TOKEN_KEY = 'skippify-spotify-token'
const VERIFIER_KEY = 'skippify-spotify-verifier'
const CLIENT_ID_KEY = 'skippify-spotify-client-id'

const AUTH_URL = 'https://accounts.spotify.com/authorize'
const TOKEN_URL = 'https://accounts.spotify.com/api/token'
const API_BASE = 'https://api.spotify.com/v1'

/** Esquema del deep link. Debe coincidir con el intent-filter del manifiesto. */
const NATIVE_REDIRECT = 'skippify://spotify-auth'

const SCOPES = [
  'user-read-private',
  'user-read-email',
  'playlist-read-private',
  'playlist-read-collaborative',
  'playlist-modify-private',
  'playlist-modify-public',
  'user-library-read',
  'user-library-modify',
  'user-read-recently-played',
  'user-read-currently-playing',
  'user-read-playback-state',
  'user-modify-playback-state',
  'user-top-read',
  'user-follow-read'
].join(' ')

const state = reactive({
  profile: null,
  connecting: false,
  error: ''
})

const token = ref(loadToken())
const clientId = ref(loadClientId())

// ── Persistencia ────────────────────────────────────────────────────────────

function loadToken () {
  try {
    const parsed = JSON.parse(localStorage.getItem(TOKEN_KEY) || 'null')
    if (!parsed?.access_token) return null
    return parsed
  } catch {
    return null
  }
}

function saveToken (value) {
  token.value = value
  try {
    if (value) localStorage.setItem(TOKEN_KEY, JSON.stringify(value))
    else localStorage.removeItem(TOKEN_KEY)
  } catch { /* ignored */ }
}

function loadClientId () {
  try {
    const stored = (localStorage.getItem(CLIENT_ID_KEY) || '').trim()
    if (stored) return stored
  } catch { /* ignored */ }
  return (import.meta.env?.VITE_SPOTIFY_CLIENT_ID || '').trim()
}

function setClientId (value) {
  const clean = (value || '').toString().trim()
  clientId.value = clean
  try {
    if (clean) localStorage.setItem(CLIENT_ID_KEY, clean)
    else localStorage.removeItem(CLIENT_ID_KEY)
  } catch { /* ignored */ }
}

// ── PKCE ────────────────────────────────────────────────────────────────────

function randomVerifier (length = 96) {
  const charset = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789-._~'
  const bytes = new Uint8Array(length)
  crypto.getRandomValues(bytes)
  return Array.from(bytes, byte => charset[byte % charset.length]).join('')
}

async function challengeFrom (verifier) {
  const digest = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(verifier))
  return btoa(String.fromCharCode(...new Uint8Array(digest)))
    .replace(/\+/g, '-')
    .replace(/\//g, '_')
    .replace(/=+$/, '')
}

function plugin () {
  return window.Capacitor?.Plugins?.NotifListener || null
}

function isNative () {
  return !!window.Capacitor?.isNativePlatform?.()
}

function redirectUri () {
  // En el navegador (desarrollo) Spotify exige una URL http(s) registrada;
  // en la app se usa el deep link, que es lo que recoge MainActivity.
  return isNative() ? NATIVE_REDIRECT : `${window.location.origin}/`
}

// ── Flujo de autorización ───────────────────────────────────────────────────

async function connect () {
  state.error = ''

  if (!clientId.value) {
    state.error = 'Falta el Client ID de tu aplicación de Spotify.'
    return false
  }

  try {
    const verifier = randomVerifier()
    localStorage.setItem(VERIFIER_KEY, verifier)

    const params = new URLSearchParams({
      client_id: clientId.value,
      response_type: 'code',
      redirect_uri: redirectUri(),
      code_challenge_method: 'S256',
      code_challenge: await challengeFrom(verifier),
      scope: SCOPES,
      show_dialog: 'true'
    })

    const url = `${AUTH_URL}?${params.toString()}`
    const NL = plugin()

    if (isNative() && NL?.openExternalUrl) {
      state.connecting = true
      const opened = await NL.openExternalUrl({ url })
      if (!opened?.opened) {
        // Sin navegador que abrir no llegará ninguna redirección: dejar el
        // estado en «conectando» colgaría el botón para siempre.
        state.connecting = false
        state.error = 'No se pudo abrir el navegador para autorizar la cuenta.'
        return false
      }
      return true
    }

    window.location.assign(url)
    return true
  } catch (error) {
    state.error = `No se pudo iniciar el login: ${error?.message || error}`
    state.connecting = false
    return false
  }
}

/** Canjea el `code` de la redirección por un token. Idempotente por diseño. */
async function exchangeCode (code) {
  const verifier = localStorage.getItem(VERIFIER_KEY) || ''
  if (!code || !verifier) return false

  try {
    const response = await fetch(TOKEN_URL, {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams({
        client_id: clientId.value,
        grant_type: 'authorization_code',
        code,
        redirect_uri: redirectUri(),
        code_verifier: verifier
      })
    })

    const data = await response.json()
    if (!response.ok || !data?.access_token) {
      state.error = data?.error_description || 'Spotify rechazó la autorización.'
      return false
    }

    // El verifier es de un solo uso: dejarlo permitiría reintentar un canje que
    // Spotify ya rechazaría, y confundiría el diagnóstico de errores.
    localStorage.removeItem(VERIFIER_KEY)
    storeTokenResponse(data)
    await loadProfile()
    return true
  } catch (error) {
    state.error = `No se pudo completar el login: ${error?.message || error}`
    return false
  } finally {
    state.connecting = false
  }
}

function storeTokenResponse (data, previousRefresh = '') {
  saveToken({
    access_token: data.access_token,
    refresh_token: data.refresh_token || previousRefresh || token.value?.refresh_token || '',
    expires_at: Date.now() + Math.max(0, Number(data.expires_in || 3600) - 60) * 1000
  })
}

async function refreshToken () {
  const refresh = token.value?.refresh_token
  if (!refresh || !clientId.value) return false

  try {
    const response = await fetch(TOKEN_URL, {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams({
        client_id: clientId.value,
        grant_type: 'refresh_token',
        refresh_token: refresh
      })
    })

    const data = await response.json()
    if (!response.ok || !data?.access_token) {
      // Un refresh token revocado no se recupera reintentando: se cierra sesión
      // para que la interfaz pida un login nuevo en lugar de fallar en bucle.
      disconnect()
      return false
    }

    storeTokenResponse(data, refresh)
    return true
  } catch {
    return false
  }
}

function disconnect () {
  saveToken(null)
  state.profile = null
  try { localStorage.removeItem(VERIFIER_KEY) } catch { /* ignored */ }
}

/** Recoge el `code` de una URL de redirección (deep link o barra del navegador). */
async function consumeRedirect (rawUrl) {
  const source = rawUrl || window.location.href
  let params

  try {
    params = new URL(source).searchParams
  } catch {
    const queryIndex = source.indexOf('?')
    if (queryIndex < 0) return false
    params = new URLSearchParams(source.slice(queryIndex + 1))
  }

  const error = params.get('error')
  if (error) {
    state.error = error === 'access_denied'
      ? 'Has cancelado el acceso a tu cuenta de Spotify.'
      : `Spotify devolvió un error: ${error}`
    state.connecting = false
    return false
  }

  const code = params.get('code')
  if (!code) return false
  return exchangeCode(code)
}

// ── Llamadas a la API ───────────────────────────────────────────────────────

async function ensureFreshToken () {
  if (!token.value?.access_token) return false
  if (Date.now() < Number(token.value.expires_at || 0)) return true
  return refreshToken()
}

/**
 * Llamada autenticada. Reintenta una vez tras refrescar el token: un 401 por
 * caducidad es lo habitual cuando la app ha estado horas en segundo plano.
 */
async function api (path, options = {}, retry = true) {
  if (!(await ensureFreshToken())) throw new Error('Sesión de Spotify no válida')

  const url = path.startsWith('http') ? path : `${API_BASE}${path}`
  const response = await fetch(url, {
    ...options,
    headers: {
      Authorization: `Bearer ${token.value.access_token}`,
      'Content-Type': 'application/json',
      ...(options.headers || {})
    }
  })

  if (response.status === 401 && retry) {
    if (await refreshToken()) return api(path, options, false)
    throw new Error('Sesión de Spotify caducada')
  }

  if (response.status === 429) {
    const wait = Number(response.headers.get('Retry-After') || 1)
    await new Promise(resolve => setTimeout(resolve, (wait + 1) * 1000))
    if (retry) return api(path, options, false)
  }

  if (!response.ok) {
    let detail = ''
    try {
      const body = await response.json()
      detail = body?.error?.message || ''
    } catch { /* respuesta sin cuerpo JSON */ }
    throw new Error(detail || `Spotify respondió ${response.status}`)
  }

  if (response.status === 204) return null
  const text = await response.text()
  return text ? JSON.parse(text) : null
}

/** Recorre una colección paginada de la API hasta `max` elementos. */
async function apiPaged (path, max = 200) {
  const items = []
  let next = path

  while (next && items.length < max) {
    const page = await api(next)
    if (!page) break
    items.push(...(page.items || []))
    next = page.next || null
  }

  return items.slice(0, max)
}

async function loadProfile () {
  try {
    state.profile = await api('/me')
    return state.profile
  } catch (error) {
    state.error = error?.message || 'No se pudo leer tu perfil.'
    return null
  }
}

/** Deja de esperar la vuelta del navegador sin marcarlo como error. */
function cancelConnecting () {
  state.connecting = false
}

export function useSpotify () {
  const connected = computed(() => !!token.value?.access_token)

  return {
    state,
    connected,
    cancelConnecting,
    clientId,
    setClientId,
    redirectUri,
    connect,
    disconnect,
    consumeRedirect,
    loadProfile,
    api,
    apiPaged
  }
}
