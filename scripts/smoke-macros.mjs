/**
 * Comprobación de humo de las macros: verifica que los casos que Spotify
 * rechaza con 403 se detectan ANTES de escribir nada y se explican en
 * castellano, en vez de propagar el «Forbidden» pelado de la API.
 */
function installBrowserGlobals () {
  const store = new Map()
  globalThis.localStorage = {
    getItem: (k) => (store.has(k) ? store.get(k) : null),
    setItem: (k, v) => store.set(k, String(v)),
    removeItem: (k) => store.delete(k),
    clear: () => store.clear()
  }
  globalThis.window = { localStorage: globalThis.localStorage, location: { origin: 'http://localhost' } }
}
installBrowserGlobals()

async function main () {
const { preflightMacro, explainSpotifyError, runMacro, validateDraft } = await import('../src/composables/useMacros.js')

let failures = 0
function check (label, actual, expected) {
  const ok = expected instanceof RegExp ? expected.test(actual) : actual === expected
  console.log(`  ${ok ? '\u2713' : '\u2717'} ${label}${ok ? '' : `\n      recibido: ${JSON.stringify(actual)}`}`)
  if (!ok) failures++
}

/** Spotify falso: registra toda escritura para probar que no ocurre ninguna. */
function fakeSpotify ({ product = 'premium', scope = 'ALL', playlists = {} } = {}) {
  const writes = []
  const ALL = 'user-read-private user-read-email playlist-read-private playlist-read-collaborative '
    + 'playlist-modify-private playlist-modify-public user-library-read user-library-modify '
    + 'user-read-recently-played user-read-currently-playing user-read-playback-state '
    + 'user-modify-playback-state user-top-read user-follow-read'
  const granted = (scope === 'ALL' ? ALL : scope).split(/\s+/).filter(Boolean)

  return {
    writes,
    state: { profile: { id: 'yo', product } },
    loadProfile: async () => ({ id: 'yo', product }),
    missingScopes: (needed) => needed.filter(s => !granted.includes(s)),
    api: async (path, options = {}) => {
      const method = (options.method || 'GET').toUpperCase()
      if (method !== 'GET') { writes.push(`${method} ${path}`); return {} }
      const match = /^\/playlists\/([^/?]+)/.exec(path)
      if (match) {
        const pl = playlists[match[1]]
        if (!pl) { const e = new Error('Not found'); e.status = 404; e.path = path; throw e }
        return pl
      }
      return { items: [] }
    },
    apiPaged: async () => []
  }
}

const own = { id: 'A', name: 'Mía', owner: { id: 'yo' }, collaborative: false }
const alien = { id: 'B', name: 'Éxitos España', owner: { id: 'spotify', display_name: 'Spotify' }, collaborative: false }
const collab = { id: 'C', name: 'Compartida', owner: { id: 'otro' }, collaborative: true }
const playlists = { A: own, B: alien, C: collab }

console.log('\nPreflight: escritura en playlist ajena')
check('copiar a playlist ajena se bloquea',
  await preflightMacro(
    { source: { type: 'current_track' }, action: { type: 'copy' }, target: { type: 'playlist', playlistId: 'B' } },
    fakeSpotify({ playlists })),
  /no es colaborativa/)
check('copiar a playlist propia pasa',
  await preflightMacro(
    { source: { type: 'current_track' }, action: { type: 'copy' }, target: { type: 'playlist', playlistId: 'A' } },
    fakeSpotify({ playlists })), '')
check('copiar a playlist colaborativa pasa',
  await preflightMacro(
    { source: { type: 'current_track' }, action: { type: 'copy' }, target: { type: 'playlist', playlistId: 'C' } },
    fakeSpotify({ playlists })), '')
check('mover desde playlist ajena se bloquea (el origen también se escribe)',
  await preflightMacro(
    { source: { type: 'playlist_all', playlistId: 'B' }, action: { type: 'move' }, target: { type: 'playlist', playlistId: 'A' } },
    fakeSpotify({ playlists })),
  /no es colaborativa/)

console.log('\nPreflight: Premium y permisos')
check('encolar sin Premium se bloquea',
  await preflightMacro(
    { source: { type: 'current_track' }, action: { type: 'queue' } },
    fakeSpotify({ product: 'free', playlists })),
  /requiere Spotify Premium/)
check('encolar con Premium pasa',
  await preflightMacro(
    { source: { type: 'current_track' }, action: { type: 'queue' } },
    fakeSpotify({ playlists })), '')
check('permiso ausente se detecta',
  await preflightMacro(
    { source: { type: 'liked_new' }, action: { type: 'copy' }, target: { type: 'playlist', playlistId: 'A' } },
    fakeSpotify({ scope: 'playlist-modify-private playlist-modify-public', playlists })),
  /user-library-read/)

console.log('\nrunMacro no escribe nada cuando el preflight falla')
const spy = fakeSpotify({ playlists })
const macro = {
  source: { type: 'playlist_all', playlistId: 'A', playlistName: 'Mía' },
  action: { type: 'copy' },
  target: { type: 'playlist', playlistId: 'B', playlistName: 'Éxitos España' },
  cursor: { seen: [], lastRunAt: null },
  stats: { runs: 0, applied: 0, lastResult: '' }
}
const result = await runMacro(macro, spy)
check('devuelve el motivo real', result.error, /no es colaborativa/)
check('no ha hecho ninguna escritura', spy.writes.length, 0)
check('lo deja anotado en la macro', macro.stats.lastResult, /^Bloqueada:/)

console.log('\nTraducción del 403 pelado de Spotify')
const forbidden = Object.assign(new Error('Forbidden'), { status: 403 })
check('403 sobre playlist', explainSpotifyError(forbidden, { scope: 'playlist', playlistName: 'Éxitos' }), /«Éxitos».*no es tuya/)
check('403 de Premium', explainSpotifyError(Object.assign(new Error('Player command failed: Premium required'), { status: 403 })), /Premium/)
check('403 de modo desarrollo', explainSpotifyError(Object.assign(new Error('Check settings on developer.spotify.com/dashboard, the user may not be registered.'), { status: 403 })), /modo desarrollo/)
check('403 sin contexto no deja «Forbidden» a secas', explainSpotifyError(forbidden), /playlist que no es tuya/)
check('404 del reproductor', explainSpotifyError(Object.assign(new Error('No active device found'), { status: 404 }), { scope: 'player' }), /dispositivo activo/)

console.log('\nvalidateDraft corta al crear la macro')
check('destino no escribible',
  validateDraft({ source: { type: 'current_track' }, action: { type: 'copy' }, target: { type: 'playlist', playlistId: 'B', playlistWritable: false } }),
  /no es tuya ni colaborativa/)
check('destino escribible pasa',
  validateDraft({ source: { type: 'current_track' }, action: { type: 'copy' }, target: { type: 'playlist', playlistId: 'A', playlistWritable: true } }), '')

console.log(failures ? `\nFallos: ${failures}` : '\nMacros: todo correcto.')
process.exit(failures ? 1 : 0)
}

main()
