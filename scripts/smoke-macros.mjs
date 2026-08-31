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

console.log('\nErrores que antes se quedaban en «Error desconocido»')
check('429 explica el cupo agotado y cuánto esperar',
  explainSpotifyError(Object.assign(new Error('API rate limit exceeded'), { status: 429, retryAfter: 120 })),
  /cupo de peticiones.*2 min/)
check('5xx se atribuye a Spotify', explainSpotifyError(Object.assign(new Error(''), { status: 503 })), /fallando por su lado/)
check('sin red se dice que no hay conexión', explainSpotifyError(new TypeError('Failed to fetch')), /No hay conexión/)
check('un código raro no se traga la causa',
  explainSpotifyError(Object.assign(new Error('Bad gateway thing'), { status: 418, path: '/me/tracks?limit=50' })),
  /418.*\/me\/tracks/)

console.log('\nMacros guardadas por versiones anteriores')
for (const [label, partial] of [
  ['sin cursor ni stats', {}],
  ['sin cursor', { stats: { runs: 0, applied: 0, lastResult: '' } }],
  ['sin stats', { cursor: { seen: [], lastRunAt: null } }]
]) {
  const vieja = {
    id: 'vieja',
    source: { type: 'current_track' },
    action: { type: 'copy' },
    target: { type: 'playlist', playlistId: 'A' },
    ...partial
  }
  let salida
  try {
    salida = await runMacro(vieja, fakeSpotify({ playlists }))
  } catch (e) {
    salida = { error: `EXCEPCIÓN NO RECOGIDA: ${e.message}` }
  }
  check(`macro ${label} no revienta`, salida.error, '')
}

console.log('\nTope de canciones por ejecución (protege el cupo de la app)')
const muchas = Array.from({ length: 120 }, (_, i) => ({
  track: { id: `t${i}`, uri: `spotify:track:t${i}`, name: `S${i}`, type: 'track', is_local: false, artists: [] }
}))
function spotifyConPlaylistLarga () {
  const base = fakeSpotify({ playlists })
  return { ...base, apiPaged: async () => muchas }
}
const enCola = await runMacro(
  { id: 'q', source: { type: 'playlist_all', playlistId: 'A' }, action: { type: 'queue' }, target: null,
    cursor: { seen: [], lastRunAt: null }, stats: { runs: 0, applied: 0, lastResult: '' } },
  spotifyConPlaylistLarga())
check('encolar procesa como mucho 40 por vuelta', enCola.applied, 40)
check('y avisa de que ha quedado a medias', enCola.limited, true)

console.log('\nEl fichero no arrastra bytes corruptos')
const fuente = await import('node:fs').then(fs => fs.readFileSync(new URL('../src/composables/useMacros.js', import.meta.url)))
check('sin bytes NUL en useMacros.js', fuente.includes(0), false)

console.log('\nNo se usan endpoints retirados por Spotify')
// Spotify jubiló estas rutas: siguen existiendo pero responden 403 «Forbidden»
// incluso sobre playlists propias. Volver a escribirlas rompería TODAS las macros.
const texto = fuente.toString('utf8')
for (const [etiqueta, patron] of [
  ['/playlists/{id}/tracks', /\/playlists\/\$\{[^}]+\}\/tracks/],
  ['POST /users/{id}/playlists', /\/users\/\$\{[^}]+\}\/playlists/],
  ['PUT|DELETE /me/tracks', /'\/me\/tracks'/]
]) check(`no aparece ${etiqueta}`, patron.test(texto), false)

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
