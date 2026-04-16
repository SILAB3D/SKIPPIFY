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

function getInsertIndex (event) {
  const targetMs = playedAtMs(event.played_at)
  for (let i = 0; i < state.events.length; i += 1) {
    if (playedAtMs(state.events[i]?.played_at) <= targetMs) {
      return i
    }
  }
  return state.events.length
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

function saveToStorage () {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(state.events))
  } catch { /* ignored */ }
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
  state.events = items.sort((a, b) => new Date(b.played_at) - new Date(a.played_at))
  rebuildEventKeySet()
  saveToStorage()
}

function clearEvents () {
  state.events = []
  eventKeySet.clear()
  saveToStorage()
}

function deleteOlderThan (months) {
  const cutoff = new Date()
  cutoff.setMonth(cutoff.getMonth() - months)
  const before = state.events.length
  state.events = state.events.filter(e => new Date(e.played_at) >= cutoff)
  rebuildEventKeySet()
  saveToStorage()
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
    loadFromStorage
  }
}
