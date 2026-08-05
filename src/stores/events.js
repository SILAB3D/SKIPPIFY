/**
 * Shared reactive events store — singleton used across all composables and components.
 */
import { reactive, computed } from 'vue'

const STORAGE_KEY = 'skippify-events'
const eventKeySet = new Set()

const state = reactive({
  events: []
})

function eventKey (event) {
  return `${event?.played_at || ''}|${event?.track || ''}|${event?.artist || ''}`
}

function playedAtMs (playedAt) {
  const ms = Date.parse(playedAt)
  return Number.isFinite(ms) ? ms : -Infinity
}

function normalizeForMatch (value) {
  return (value || '')
    .toString()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(/\s+/g, ' ')
    .trim()
}

function sameTrackArtist (a, b) {
  return normalizeForMatch(a?.track) === normalizeForMatch(b?.track) &&
    normalizeForMatch(a?.artist) === normalizeForMatch(b?.artist)
}

/**
 * Índice de inserción por búsqueda binaria (la lista está ordenada de más nueva a
 * más antigua). Antes era un barrido lineal en cada evento: con historiales
 * largos el hilo principal se bloqueaba en cada canción detectada.
 */
function getInsertIndex (event) {
  const targetMs = playedAtMs(event.played_at)
  let lo = 0
  let hi = state.events.length
  while (lo < hi) {
    const mid = (lo + hi) >> 1
    if (playedAtMs(state.events[mid]?.played_at) <= targetMs) {
      hi = mid
    } else {
      lo = mid + 1
    }
  }
  return lo
}

function wouldBeImmediateConsecutiveDuplicate (event, insertIndex) {
  const newerNeighbor = insertIndex > 0 ? state.events[insertIndex - 1] : null
  const olderNeighbor = insertIndex < state.events.length ? state.events[insertIndex] : null
  return (newerNeighbor && sameTrackArtist(newerNeighbor, event)) ||
    (olderNeighbor && sameTrackArtist(olderNeighbor, event))
}

function rebuildEventKeySet () {
  eventKeySet.clear()
  for (const event of state.events) {
    eventKeySet.add(eventKey(event))
  }
}

function insertEventSorted (event) {
  const insertIndex = getInsertIndex(event)
  if (!state.events.length) {
    state.events.push(event)
    return
  }
  state.events.splice(insertIndex, 0, event)
}

function loadFromStorage () {
  try {
    const raw = localStorage.getItem(STORAGE_KEY)
    if (!raw) return
    const parsed = JSON.parse(raw)
    if (Array.isArray(parsed)) {
      state.events = parsed.sort((a, b) => new Date(b.played_at) - new Date(a.played_at))
      rebuildEventKeySet()
    }
  } catch { /* ignored */ }
}

function saveNow () {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(state.events))
  } catch { /* ignored */ }
}

/**
 * Guardado diferido: serializar el historial completo en cada tick de
 * reproducción (updateEvent se llama ~1 vez/segundo) provocaba tirones en la UI.
 * Se agrupan las escrituras y se fuerza el volcado al ocultar/cerrar la app.
 */
let saveTimer = null
let savePending = false

function saveToStorage () {
  savePending = true
  if (saveTimer) return
  saveTimer = setTimeout(() => {
    saveTimer = null
    savePending = false
    saveNow()
  }, 1500)
}

function flushToStorage () {
  if (saveTimer) {
    clearTimeout(saveTimer)
    saveTimer = null
  }
  if (savePending) {
    savePending = false
    saveNow()
  }
}

if (typeof window !== 'undefined') {
  document.addEventListener('visibilitychange', () => {
    if (document.visibilityState === 'hidden') flushToStorage()
  })
  window.addEventListener('pagehide', flushToStorage)
  window.addEventListener('beforeunload', flushToStorage)
}

function addEvent (event) {
  if (!event?.played_at || !event?.track || !event?.artist) return false
  const key = eventKey(event)
  if (eventKeySet.has(key)) return false

  const insertIndex = getInsertIndex(event)
  if (wouldBeImmediateConsecutiveDuplicate(event, insertIndex)) return false

  insertEventSorted(event)
  eventKeySet.add(key)
  saveToStorage()
  return true
}

/**
 * Update an existing event in-place (e.g. to patch ms_played after playback ends).
 * Returns true if the event was found and updated.
 */
function updateEvent (playedAt, track, artist, updates) {
  const key = `${playedAt}|${track}|${artist}`
  const idx = state.events.findIndex(e => eventKey(e) === key)
  if (idx === -1) return false
  Object.assign(state.events[idx], updates)
  saveToStorage()
  return true
}

function setEvents (items) {
  state.events = [...items].sort((a, b) => new Date(b.played_at) - new Date(a.played_at))
  rebuildEventKeySet()
  saveNow()
}

function clearEvents () {
  state.events = []
  eventKeySet.clear()
  saveNow()
}

function deleteOlderThan (months) {
  const now = new Date()
  // `setMonth(getMonth() - n)` desborda cuando el día actual no existe en el mes
  // destino (31 de marzo − 1 mes ⇒ 3 de marzo). Construir la fecha acotando el día.
  const targetYear = now.getFullYear()
  const targetMonth = now.getMonth() - months
  const lastDayOfTargetMonth = new Date(targetYear, targetMonth + 1, 0).getDate()
  const cutoff = new Date(
    targetYear,
    targetMonth,
    Math.min(now.getDate(), lastDayOfTargetMonth),
    now.getHours(),
    now.getMinutes(),
    now.getSeconds()
  )
  const before = state.events.length
  state.events = state.events.filter(e => new Date(e.played_at) >= cutoff)
  rebuildEventKeySet()
  saveNow()
  return before - state.events.length
}

// Init from localStorage immediately
loadFromStorage()

export function useEventStore () {
  return {
    state,
    events: computed(() => state.events),
    addEvent,
    updateEvent,
    setEvents,
    clearEvents,
    deleteOlderThan,
    saveToStorage,
    flushToStorage,
    loadFromStorage
  }
}
