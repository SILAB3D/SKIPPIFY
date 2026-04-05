/**
 * Shared reactive events store — singleton used across all composables and components.
 */
import { reactive, computed } from 'vue'

const STORAGE_KEY = 'skippify-events'

const state = reactive({
  events: []
})

function loadFromStorage () {
  try {
    const raw = localStorage.getItem(STORAGE_KEY)
    if (!raw) return
    const parsed = JSON.parse(raw)
    if (Array.isArray(parsed)) {
      state.events = parsed.sort((a, b) => new Date(b.played_at) - new Date(a.played_at))
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
  const key = `${event.played_at}|${event.track}|${event.artist}`
  if (state.events.some(e => `${e.played_at}|${e.track}|${e.artist}` === key)) return false
  state.events.unshift(event)
  state.events.sort((a, b) => new Date(b.played_at) - new Date(a.played_at))
  saveToStorage()
  return true
}

/**
 * Update an existing event in-place (e.g. to patch ms_played after playback ends).
 * Returns true if the event was found and updated.
 */
function updateEvent (playedAt, track, artist, updates) {
  const key = `${playedAt}|${track}|${artist}`
  const idx = state.events.findIndex(e => `${e.played_at}|${e.track}|${e.artist}` === key)
  if (idx === -1) return false
  Object.assign(state.events[idx], updates)
  saveToStorage()
  return true
}

function setEvents (items) {
  state.events = items.sort((a, b) => new Date(b.played_at) - new Date(a.played_at))
  saveToStorage()
}

function clearEvents () {
  state.events = []
  saveToStorage()
}

function deleteOlderThan (months) {
  const cutoff = new Date()
  cutoff.setMonth(cutoff.getMonth() - months)
  const before = state.events.length
  state.events = state.events.filter(e => new Date(e.played_at) >= cutoff)
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
