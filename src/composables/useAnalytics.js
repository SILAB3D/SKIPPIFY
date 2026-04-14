/**
 * useAnalytics — computes KPIs and analytics from the events store.
 */
import { computed } from 'vue'
import { useEventStore } from '@/stores/events'
import { REGISTER_DUPLICATE_PROGRESS_RATIO } from '@/config/appThresholds'

function hasReachedDuplicateThreshold (event) {
  const dur = Number(event?.duration_ms || 0)
  const ms = Number(event?.ms_played || 0)
  if (!Number.isFinite(dur) || dur <= 0) return false
  if (!Number.isFinite(ms) || ms <= 0) return false
  return (ms / dur) >= REGISTER_DUPLICATE_PROGRESS_RATIO
}

export function useAnalytics () {
  const { events } = useEventStore()

  const now = computed(() => new Date())

  const todayEvents = computed(() => {
    const start = new Date(now.value.getFullYear(), now.value.getMonth(), now.value.getDate())
    return events.value.filter(e => new Date(e.played_at) >= start)
  })

  const yesterdayEvents = computed(() => {
    const startToday = new Date(now.value.getFullYear(), now.value.getMonth(), now.value.getDate())
    const startYesterday = new Date(startToday)
    startYesterday.setDate(startYesterday.getDate() - 1)
    return events.value.filter(e => {
      const playedAt = new Date(e.played_at)
      return playedAt >= startYesterday && playedAt < startToday
    })
  })

  const weekEvents = computed(() => {
    const sevenAgo = new Date(Date.now() - 7 * 86400000)
    return events.value.filter(e => new Date(e.played_at) >= sevenAgo)
  })

  const kpiToday = computed(() => todayEvents.value.length)

  const kpiTodayChangePct = computed(() => {
    const today = todayEvents.value.length
    const yesterday = yesterdayEvents.value.length
    if (yesterday === 0) return today === 0 ? 0 : 100
    return Math.round(((today - yesterday) * 100) / yesterday)
  })

  const kpiArtists = computed(() => new Set(weekEvents.value.map(e => e.artist)).size)

  const kpiTracks = computed(() => new Set(weekEvents.value.map(e => e.track)).size)

  const monthEvents = computed(() => {
    const n = now.value
    const start = new Date(n.getFullYear(), n.getMonth(), 1)
    return events.value.filter(e => new Date(e.played_at) >= start)
  })

  const top5TracksMonth = computed(() => {
    const map = new Map()
    for (const e of monthEvents.value) map.set(e.track, (map.get(e.track) || 0) + 1)
    return [...map.entries()].sort((a, b) => b[1] - a[1]).slice(0, 5).map(([track, count]) => ({ track, count }))
  })

  const top5ArtistsMonth = computed(() => {
    const map = new Map()
    for (const e of monthEvents.value) map.set(e.artist, (map.get(e.artist) || 0) + 1)
    return [...map.entries()].sort((a, b) => b[1] - a[1]).slice(0, 5).map(([artist, count]) => ({ artist, count }))
  })

  const quarterEvents = computed(() => {
    const ninetyAgo = new Date(Date.now() - 90 * 86400000)
    return events.value.filter(e => new Date(e.played_at) >= ninetyAgo)
  })

  const top5TracksQuarter = computed(() => {
    const map = new Map()
    for (const e of quarterEvents.value) map.set(e.track, (map.get(e.track) || 0) + 1)
    return [...map.entries()].sort((a, b) => b[1] - a[1]).slice(0, 5).map(([track, count]) => ({ track, count }))
  })

  const duplicatesMonth = computed(() => {
    const eligibleEvents = monthEvents.value.filter(hasReachedDuplicateThreshold)
    const map = new Map()
    for (const e of eligibleEvents) {
      const key = `${e.track}\x00${e.artist}`
      map.set(key, (map.get(key) || 0) + 1)
    }
    let dupeEntries = 0
    let extraPlays = 0
    for (const count of map.values()) {
      if (count > 1) {
        dupeEntries++
        extraPlays += count - 1
      }
    }
    const total = eligibleEvents.length
    const duplicateRate = total ? Math.round((dupeEntries * 100) / total) : 0
    return { dupeEntries, extraPlays, total, duplicateRate }
  })

  const incompletePlays = computed(() => {
    let incomplete = 0
    let tracked = 0
    for (const item of events.value) {
      const dur = Number(item.duration_ms)
      const ms = Number(item.ms_played)
      if (!Number.isFinite(dur) || dur <= 0 || !Number.isFinite(ms)) continue
      tracked++
      if (ms / dur < 0.9) incomplete++
    }
    const rate = tracked ? Math.round((incomplete * 100) / tracked) : 0
    return { count: incomplete, tracked, rate }
  })

  const sessions = computed(() => {
    const sorted = [...events.value].sort((a, b) => new Date(a.played_at) - new Date(b.played_at))
    const durations = []
    let start = null
    let end = null

    for (const item of sorted) {
      const t = new Date(item.played_at)
      if (!start) { start = t; end = t; continue }
      if ((t - end) / 60000 > 30) {
        durations.push((end - start) / 60000)
        start = t; end = t
      } else {
        end = t
      }
    }
    if (start) durations.push((end - start) / 60000)

    const avg = durations.length ? durations.reduce((a, b) => a + b, 0) / durations.length : 0
    return { count: durations.length, averageMinutes: Math.round(avg) }
  })

  const topArtists = computed(() => {
    const map = new Map()
    for (const e of weekEvents.value) map.set(e.artist, (map.get(e.artist) || 0) + 1)
    return [...map.entries()].sort((a, b) => b[1] - a[1]).slice(0, 5).map(([artist, count]) => ({ artist, count }))
  })

  const chartData = computed(() => {
    const labels = []
    const data = []
    const n = new Date()
    for (let i = 6; i >= 0; i--) {
      const d = new Date(n.getTime() - i * 86400000)
      const key = `${d.getFullYear()}-${d.getMonth() + 1}-${d.getDate()}`
      labels.push(d.toLocaleDateString('es-ES', { day: '2-digit', month: '2-digit' }))
      data.push(Math.max(0, weekEvents.value.filter(e => {
        const x = new Date(e.played_at)
        return `${x.getFullYear()}-${x.getMonth() + 1}-${x.getDate()}` === key
      }).length))
    }
    return { labels, data }
  })

  return {
    kpiToday,
    kpiTodayChangePct,
    kpiArtists,
    kpiTracks,
    incompletePlays,
    sessions,
    topArtists,
    top5TracksMonth,
    top5ArtistsMonth,
    top5TracksQuarter,
    duplicatesMonth,
    chartData,
    todayEvents,
    weekEvents,
    monthEvents
  }
}
