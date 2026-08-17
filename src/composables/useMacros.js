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

  if (target.type === 'playlist'
      && draft?.source?.playlistId
      && draft.source.playlistId === draft.target.playlistId) {
    return 'El origen y el destino son la misma playlist.'
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
    result.error = error?.message || 'Error desconocido'
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
