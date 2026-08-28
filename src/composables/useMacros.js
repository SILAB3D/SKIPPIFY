/**
 * useMacros — modelo y ejecución de las macros A (origen) → B (acción) → C (destino).
 *
 * Una macro es una regla declarativa: de dónde salen las canciones, qué se hace
 * con ellas y dónde acaban. Todo se resuelve contra la Web API de Spotify.
 *
 * Alcance honesto: las macros se evalúan mientras la app está abierta (al
 * pulsar «Ejecutar», al cambiar de canción o al refrescar la pestaña). Android
 * no permite mantener JavaScript corriendo indefinidamente en segundo plano, así
 * que prometer disparos instantáneos con la app cerrada sería falso. Los
 * orígenes de tipo «novedades» llevan un cursor persistente, de modo que al
 * volver a abrir la app se procesa todo lo acumulado sin repetir nada.
 */
import { reactive, watch } from 'vue'
import { useSpotify } from '@/composables/useSpotify'

const STORAGE_KEY = 'skippify-macros'
const MAX_TRACKED_IDS = 400

// ── Catálogo A · orígenes ───────────────────────────────────────────────────

export const MACRO_SOURCES = [
  {
    type: 'current_track',
    label: 'La canción que suena ahora',
    icon: '🎧',
    detail: 'Toma la reproducción activa en Spotify en el momento de ejecutar la macro.',
    needsPlaylist: false,
    incremental: false
  },
  {
    type: 'playlist_new',
    label: 'Novedades de una playlist',
    icon: '🆕',
    detail: 'Detecta las canciones añadidas a una playlist desde la última vez que se ejecutó.',
    needsPlaylist: true,
    incremental: true
  },
  {
    type: 'playlist_all',
    label: 'Todas las canciones de una playlist',
    icon: '📃',
    detail: 'Recorre la playlist entera cada vez. Útil para sincronizar o vaciar.',
    needsPlaylist: true,
    incremental: false
  },
  {
    type: 'recently_played',
    label: 'Tus reproducciones recientes',
    icon: '🕒',
    detail: 'Las últimas canciones que has escuchado según Spotify (máximo 50).',
    needsPlaylist: false,
    incremental: true
  },
  {
    type: 'liked_new',
    label: 'Novedades en «Tus me gusta»',
    icon: '💚',
    detail: 'Canciones que has marcado como favoritas desde la última ejecución.',
    needsPlaylist: false,
    incremental: true
  },
  {
    type: 'top_tracks',
    label: 'Tus canciones más escuchadas',
    icon: '🏆',
    detail: 'El top personal que calcula Spotify con tu historial reciente.',
    needsPlaylist: false,
    incremental: false
  }
]

// ── Catálogo B · acciones ───────────────────────────────────────────────────

export const MACRO_ACTIONS = [
  {
    type: 'copy',
    label: 'Copiar',
    icon: '📋',
    detail: 'Añade las canciones al destino sin tocar el origen.',
    needsTarget: true,
    targets: ['playlist', 'new_playlist', 'liked', 'queue']
  },
  {
    type: 'move',
    label: 'Mover',
    icon: '📦',
    detail: 'Añade al destino y las quita del origen. Solo con orígenes de playlist.',
    needsTarget: true,
    targets: ['playlist', 'new_playlist', 'liked'],
    requiresPlaylistSource: true
  },
  {
    type: 'remove',
    label: 'Eliminar',
    icon: '🗑️',
    detail: 'Quita las canciones del destino indicado.',
    needsTarget: true,
    targets: ['playlist', 'liked']
  },
  {
    type: 'queue',
    label: 'Poner en cola',
    icon: '⏭️',
    detail: 'Encola las canciones para que suenen a continuación. Requiere reproducción activa.',
    needsTarget: false
  }
]

// ── Catálogo C · destinos ───────────────────────────────────────────────────

export const MACRO_TARGETS = [
  { type: 'playlist', label: 'Una playlist existente', icon: '🎵', needsPlaylist: true },
  { type: 'new_playlist', label: 'Una playlist nueva', icon: '✨', needsName: true },
  { type: 'liked', label: 'Tus me gusta', icon: '💚' },
  { type: 'queue', label: 'La cola de reproducción', icon: '⏭️' }
]

export function sourceMeta (type) {
  return MACRO_SOURCES.find(item => item.type === type) || null
}

export function actionMeta (type) {
  return MACRO_ACTIONS.find(item => item.type === type) || null
}

export function targetMeta (type) {
  return MACRO_TARGETS.find(item => item.type === type) || null
}

// ── Persistencia ────────────────────────────────────────────────────────────

function load () {
  try {
    const parsed = JSON.parse(localStorage.getItem(STORAGE_KEY) || '[]')
    return Array.isArray(parsed) ? parsed.filter(isValidMacro) : []
  } catch {
    return []
  }
}

function isValidMacro (macro) {
  return !!macro
    && typeof macro.id === 'string'
    && !!sourceMeta(macro?.source?.type)
    && !!actionMeta(macro?.action?.type)
}

const macros = reactive(load())

watch(
  () => JSON.stringify(macros),
  () => {
    try { localStorage.setItem(STORAGE_KEY, JSON.stringify([...macros])) } catch { /* ignored */ }
  }
)

export function createMacro (draft) {
  const macro = {
    id: `macro-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`,
    name: (draft.name || '').trim() || describeMacro(draft),
    enabled: true,
    createdAt: new Date().toISOString(),
    source: { ...draft.source },
    action: { ...draft.action },
    target: draft.target ? { ...draft.target } : null,
    cursor: { seen: [], lastRunAt: null },
    stats: { runs: 0, applied: 0, lastResult: '' }
  }
  macros.unshift(macro)
  return macro
}

export function deleteMacro (id) {
  const index = macros.findIndex(item => item.id === id)
  if (index >= 0) macros.splice(index, 1)
}

export function toggleMacro (id) {
  const macro = macros.find(item => item.id === id)
  if (macro) macro.enabled = !macro.enabled
}

/** Frase legible «A → B → C», usada como nombre por defecto y en la lista. */
export function describeMacro (macro) {
  const source = sourceMeta(macro?.source?.type)
  const action = actionMeta(macro?.action?.type)
  const target = targetMeta(macro?.target?.type)

  const sourceText = macro?.source?.playlistName
    ? `${source?.label} (${macro.source.playlistName})`
    : source?.label || '—'

  let targetText = ''
  if (action?.needsTarget && target) {
    targetText = macro?.target?.playlistName
      ? `${target.label} (${macro.target.playlistName})`
      : macro?.target?.newPlaylistName
        ? `playlist nueva «${macro.target.newPlaylistName}»`
        : target.label
  }

  return targetText
    ? `${sourceText} → ${action?.label?.toLowerCase()} → ${targetText}`
    : `${sourceText} → ${action?.label?.toLowerCase() || '—'}`
}

/** Valida un borrador antes de dejar crearlo. Devuelve el motivo del bloqueo. */
export function validateDraft (draft) {
  const source = sourceMeta(draft?.source?.type)
  const action = actionMeta(draft?.action?.type)

  if (!source) return 'Elige de dónde salen las canciones.'
  if (source.needsPlaylist && !draft?.source?.playlistId) return 'Elige la playlist de origen.'
  if (!action) return 'Elige qué quieres hacer con ellas.'

  if (action.requiresPlaylistSource && !source.needsPlaylist) {
    return 'Mover solo funciona con una playlist como origen: hay que poder quitar la canción de algún sitio.'
  }

  if (!action.needsTarget) return ''

  const target = targetMeta(draft?.target?.type)
  if (!target) return 'Elige el destino.'
  if (!action.targets.includes(target.type)) return 'Ese destino no es compatible con la acción elegida.'
  if (target.needsPlaylist && !draft?.target?.playlistId) return 'Elige la playlist de destino.'
  if (target.needsName && !(draft?.target?.newPlaylistName || '').trim()) return 'Ponle nombre a la playlist nueva.'

  // Spotify solo deja escribir en playlists propias o colaborativas; sin este
  // corte la macro se crearía bien y fallaría con «Forbidden» al ejecutarse.
  if (draft?.target?.playlistWritable === false) {
    return 'Esa playlist no es tuya ni colaborativa: Spotify no deja añadir ni quitar canciones en ella.'
  }
  if (action.requiresPlaylistSource && draft?.source?.playlistWritable === false) {
    return 'Para mover hay que poder quitar la canción del origen, y esa playlist no es tuya ni colaborativa.'
  }

  if (target.type === 'playlist'
      && draft?.source?.playlistId
      && draft.source.playlistId === draft.target.playlistId) {
    return 'El origen y el destino son la misma playlist.'
  }

  return ''
}

// ── Permisos y diagnóstico ──────────────────────────────────────────────────

/** Permisos que necesita cada origen para poder leerse. */
const SOURCE_SCOPES = {
  current_track: ['user-read-currently-playing'],
  playlist_new: ['playlist-read-private'],
  playlist_all: ['playlist-read-private'],
  recently_played: ['user-read-recently-played'],
  liked_new: ['user-library-read'],
  top_tracks: ['user-top-read']
}

/** Permisos que necesita cada pareja acción/destino para poder escribir. */
function writeScopes (actionType, targetType) {
  if (actionType === 'queue' || targetType === 'queue') return ['user-modify-playback-state']
  if (targetType === 'liked') return ['user-library-modify']
  return ['playlist-modify-private', 'playlist-modify-public']
}

/**
 * Traduce un fallo de la API a algo accionable. Spotify devuelve el 403 con el
 * cuerpo `{"error":{"status":403,"message":"Forbidden"}}` en los tres casos que
 * más se dan aquí —playlist ajena, cuenta sin Premium y app en modo desarrollo—
 * así que el texto crudo hay que sustituirlo por el motivo probable.
 */
export function explainSpotifyError (error, context = {}) {
  const status = error?.status
  const raw = (error?.message || '').trim()
  const bare = /^forbidden$/i.test(raw) || !raw

  if (status === 403) {
    if (/premium/i.test(raw) || /PREMIUM_REQUIRED/i.test(error?.reason || '')) {
      return 'Spotify solo deja controlar la reproducción (cola, saltos) con cuenta Premium.'
    }
    if (/not registered|dashboard/i.test(raw)) {
      return 'Tu app de Spotify está en modo desarrollo y esta cuenta no está en su lista de usuarios. '
        + 'Añádela en developer.spotify.com → tu app → User Management.'
    }
    if (context.scope === 'playlist') {
      return context.playlistName
        ? `Spotify no te deja modificar la playlist «${context.playlistName}»: no es tuya ni colaborativa.`
        : 'Spotify no te deja modificar esa playlist: no es tuya ni colaborativa.'
    }
    if (context.scope === 'player') {
      return 'Spotify ha rechazado la orden de reproducción. Suele ser una cuenta sin Premium.'
    }
    return bare
      ? 'Spotify ha respondido «Forbidden». Lo habitual es una playlist que no es tuya, '
        + 'una cuenta sin Premium o permisos que no concediste al iniciar sesión.'
      : raw
  }

  if (status === 404 && context.scope === 'player') {
    return 'No hay ningún dispositivo activo. Pon algo a sonar en Spotify y vuelve a ejecutarla.'
  }
  if (status === 404 && context.scope === 'playlist') {
    return context.playlistName
      ? `La playlist «${context.playlistName}» ya no existe o Spotify no te la deja leer.`
      : 'Esa playlist ya no existe o Spotify no te la deja leer.'
  }
  if (status === 401) return 'Tu sesión de Spotify ha caducado. Vuelve a conectar la cuenta.'

  return raw || 'Error desconocido'
}

/** Lee dueño y modo colaborativo para saber si la playlist admite escritura. */
async function playlistPermission (playlistId, spotify) {
  const profile = spotify.state.profile || await spotify.loadProfile()

  let playlist
  try {
    playlist = await spotify.api(`/playlists/${playlistId}?fields=name,collaborative,owner(id,display_name)`)
  } catch (error) {
    return {
      ok: false,
      name: '',
      writable: false,
      reason: explainSpotifyError(error, { scope: 'playlist' })
    }
  }

  const owner = playlist?.owner || {}
  const mine = !!profile?.id && owner.id === profile.id
  const writable = mine || playlist?.collaborative === true

  return {
    ok: true,
    name: playlist?.name || '',
    writable,
    mine,
    ownerName: owner.display_name || owner.id || 'otra persona',
    reason: writable
      ? ''
      : `«${playlist?.name || playlistId}» es de ${owner.display_name || owner.id || 'otra persona'} `
        + 'y no es colaborativa, así que Spotify no deja añadir ni quitar canciones en ella.'
  }
}

/**
 * Comprueba por adelantado lo que Spotify rechazaría con un 403 pelado. Se
 * ejecuta también en la vista previa: es la única forma de que el usuario vea
 * el problema antes de que la macro deje el trabajo hecho a medias.
 */
export async function preflightMacro (macro, spotify) {
  const action = macro.action?.type
  const targetType = macro.target?.type

  // 1 · permisos concedidos en el login (un token viejo conserva los de antes)
  const needed = [
    ...(SOURCE_SCOPES[macro.source?.type] || []),
    ...writeScopes(action, targetType)
  ]
  const missing = spotify.missingScopes?.(needed)
  if (missing?.length) {
    return `Tu sesión de Spotify no incluye estos permisos: ${missing.join(', ')}. `
      + 'Desconecta y vuelve a conectar la cuenta para concederlos.'
  }

  // 2 · las órdenes de reproducción exigen Premium
  const touchesPlayer = action === 'queue' || targetType === 'queue'
  if (touchesPlayer) {
    const profile = spotify.state.profile || await spotify.loadProfile()
    if (profile?.product && profile.product !== 'premium') {
      return 'Poner canciones en cola requiere Spotify Premium; tu cuenta es '
        + `${profile.product === 'free' ? 'gratuita' : profile.product}.`
    }
  }

  // 3 · escritura sobre playlists ajenas
  const writeTargets = []
  if ((action === 'copy' || action === 'move' || action === 'remove')
      && targetType === 'playlist'
      && macro.target?.playlistId) {
    writeTargets.push(macro.target.playlistId)
  }
  // «Mover» borra del origen: si la playlist de origen no es escribible, el
  // copiado saldría bien y el borrado fallaría, dejando la canción duplicada.
  if (action === 'move' && macro.source?.playlistId) {
    writeTargets.push(macro.source.playlistId)
  }

  for (const playlistId of [...new Set(writeTargets)]) {
    const permission = await playlistPermission(playlistId, spotify)
    if (!permission.writable) return permission.reason
  }

  return ''
}

// ── Ejecución ───────────────────────────────────────────────────────────────

function chunk (items, size) {
  const out = []
  for (let i = 0; i < items.length; i += size) out.push(items.slice(i, i + size))
  return out
}

function normalizeTrack (raw) {
  const track = raw?.track || raw
  if (!track?.id || !track?.uri) return null
  // Los episodios de pódcast y las pistas locales no admiten las mismas
  // operaciones que una canción del catálogo: se descartan en el origen.
  if (track.type && track.type !== 'track') return null
  if (track.is_local) return null

  return {
    id: track.id,
    uri: track.uri,
    name: track.name || '',
    artists: (track.artists || []).map(artist => artist?.name).filter(Boolean).join(', ')
  }
}

async function resolveSource (macro, spotify) {
  const { api, apiPaged } = spotify
  const type = macro.source.type

  if (type === 'current_track') {
    const playing = await api('/me/player/currently-playing')
    const track = normalizeTrack(playing?.item)
    return track ? [track] : []
  }

  if (type === 'playlist_new' || type === 'playlist_all') {
    const items = await apiPaged(
      `/playlists/${macro.source.playlistId}/tracks?limit=100&fields=items(track(id,uri,name,type,is_local,artists(name))),next`,
      500
    )
    return items.map(normalizeTrack).filter(Boolean)
  }

  if (type === 'recently_played') {
    const page = await api('/me/player/recently-played?limit=50')
    return (page?.items || []).map(normalizeTrack).filter(Boolean)
  }

  if (type === 'liked_new') {
    const items = await apiPaged('/me/tracks?limit=50', 200)
    return items.map(normalizeTrack).filter(Boolean)
  }

  if (type === 'top_tracks') {
    const page = await api('/me/top/tracks?limit=50&time_range=short_term')
    return (page?.items || []).map(normalizeTrack).filter(Boolean)
  }

  return []
}

async function resolveTargetPlaylistId (macro, spotify) {
  const target = macro.target
  if (!target) return null

  if (target.type === 'playlist') return target.playlistId

  if (target.type === 'new_playlist') {
    // Se crea una sola vez y se recuerda: si no, cada ejecución generaría una
    // playlist nueva vacía y la anterior quedaría huérfana.
    if (target.playlistId) return target.playlistId

    const profile = spotify.state.profile || await spotify.loadProfile()
    if (!profile?.id) throw new Error('No se pudo leer tu perfil de Spotify')

    const created = await spotify.api(`/users/${profile.id}/playlists`, {
      method: 'POST',
      body: JSON.stringify({
        name: target.newPlaylistName,
        description: 'Creada automáticamente por Skippify',
        public: false
      })
    })

    target.playlistId = created?.id || null
    target.playlistName = created?.name || target.newPlaylistName
    return target.playlistId
  }

  return null
}

async function applyAction (macro, tracks, spotify) {
  const { api } = spotify
  const action = macro.action.type
  const uris = tracks.map(track => track.uri)

  if (action === 'queue') {
    // La cola no admite lotes: hay un POST por canción.
    for (const uri of uris) {
      await api(`/me/player/queue?uri=${encodeURIComponent(uri)}`, { method: 'POST' })
    }
    return tracks.length
  }

  const targetType = macro.target?.type

  if (action === 'copy' || action === 'move') {
    if (targetType === 'liked') {
      for (const group of chunk(tracks.map(t => t.id), 50)) {
        await api('/me/tracks', { method: 'PUT', body: JSON.stringify({ ids: group }) })
      }
    } else if (targetType === 'queue') {
      for (const uri of uris) {
        await api(`/me/player/queue?uri=${encodeURIComponent(uri)}`, { method: 'POST' })
      }
    } else {
      const playlistId = await resolveTargetPlaylistId(macro, spotify)
      if (!playlistId) throw new Error('No se pudo determinar la playlist de destino')
      for (const group of chunk(uris, 100)) {
        await api(`/playlists/${playlistId}/tracks`, {
          method: 'POST',
          body: JSON.stringify({ uris: group })
        })
      }
    }

    if (action === 'move' && macro.source.playlistId) {
      for (const group of chunk(uris, 100)) {
        await api(`/playlists/${macro.source.playlistId}/tracks`, {
          method: 'DELETE',
          body: JSON.stringify({ tracks: group.map(uri => ({ uri })) })
        })
      }
    }

    return tracks.length
  }

  if (action === 'remove') {
    if (targetType === 'liked') {
      for (const group of chunk(tracks.map(t => t.id), 50)) {
        await api('/me/tracks', { method: 'DELETE', body: JSON.stringify({ ids: group }) })
      }
    } else {
      const playlistId = await resolveTargetPlaylistId(macro, spotify)
      if (!playlistId) throw new Error('No se pudo determinar la playlist de destino')
      for (const group of chunk(uris, 100)) {
        await api(`/playlists/${playlistId}/tracks`, {
          method: 'DELETE',
          body: JSON.stringify({ tracks: group.map(uri => ({ uri })) })
        })
      }
    }
    return tracks.length
  }

  return 0
}

/**
 * Ejecuta una macro. `dryRun` resuelve el origen y filtra, pero no escribe nada:
 * es lo que usa la vista previa antes de tocar la biblioteca del usuario.
 */
export async function runMacro (macro, spotify, { dryRun = false } = {}) {
  const meta = sourceMeta(macro.source.type)
  const result = { matched: 0, applied: 0, tracks: [], error: '' }

  try {
    // Se comprueba antes de tocar nada, también en la vista previa: así el
    // aviso llega en vez de un «Forbidden» a mitad de la ejecución.
    const blocked = await preflightMacro(macro, spotify)
    if (blocked) {
      result.error = blocked
      if (!dryRun) macro.stats.lastResult = `Bloqueada: ${blocked}`
      return result
    }

    const all = await resolveSource(macro, spotify)

    // Orígenes incrementales: sólo lo que no se haya visto antes. En la primera
    // ejecución se marca todo como visto sin actuar, porque si no una macro
    // recién creada volcaría el historial entero de golpe.
    let pending = all
    const firstRun = meta?.incremental && !macro.cursor?.lastRunAt

    if (meta?.incremental) {
      const seen = new Set(macro.cursor?.seen || [])
      pending = all.filter(track => !seen.has(track.id))
      if (firstRun) {
        result.matched = 0
        result.tracks = []
        if (!dryRun) {
          macro.cursor = { seen: all.map(t => t.id).slice(0, MAX_TRACKED_IDS), lastRunAt: new Date().toISOString() }
          macro.stats.runs += 1
          macro.stats.lastResult = `Punto de partida fijado con ${all.length} canciones.`
        }
        return result
      }
    }

    result.matched = pending.length
    result.tracks = pending.slice(0, 25)

    if (dryRun || !pending.length) {
      if (!dryRun) {
        macro.cursor.lastRunAt = new Date().toISOString()
        macro.stats.runs += 1
        macro.stats.lastResult = 'Sin canciones nuevas que procesar.'
      }
      return result
    }

    result.applied = await applyAction(macro, pending, spotify)

    if (meta?.incremental) {
      const seen = [...pending.map(t => t.id), ...(macro.cursor?.seen || [])]
      macro.cursor = { seen: seen.slice(0, MAX_TRACKED_IDS), lastRunAt: new Date().toISOString() }
    } else {
      macro.cursor.lastRunAt = new Date().toISOString()
    }

    macro.stats.runs += 1
    macro.stats.applied += result.applied
    macro.stats.lastResult = `${result.applied} canción(es) procesadas.`
    return result
  } catch (error) {
    const path = error?.path || ''
    const scope = /\/me\/player/.test(path)
      ? 'player'
      : /\/playlists\//.test(path)
        ? 'playlist'
        : ''
    const playlistName = scope === 'playlist'
      ? (path.includes(macro.source?.playlistId || ' ')
          ? macro.source?.playlistName
          : macro.target?.playlistName) || ''
      : ''

    result.error = explainSpotifyError(error, { scope, playlistName })
    if (!dryRun) macro.stats.lastResult = `Error: ${result.error}`
    return result
  }
}

export function useMacros () {
  const spotify = useSpotify()

  async function runAllEnabled () {
    const summary = []
    for (const macro of macros) {
      if (!macro.enabled) continue
      summary.push({ macro, result: await runMacro(macro, spotify) })
    }
    return summary
  }

  return {
    macros,
    createMacro,
    deleteMacro,
    toggleMacro,
    runMacro: (macro, options) => runMacro(macro, spotify, options),
    runAllEnabled
  }
}
