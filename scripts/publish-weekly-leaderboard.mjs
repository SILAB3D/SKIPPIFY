import { initializeApp, cert, getApps } from 'firebase-admin/app'
import { getFirestore, FieldValue } from 'firebase-admin/firestore'

function getServiceAccountFromEnv () {
  const raw = process.env.FIREBASE_SERVICE_ACCOUNT_JSON || ''
  if (!raw.trim()) {
    throw new Error('Missing FIREBASE_SERVICE_ACCOUNT_JSON secret.')
  }
  return JSON.parse(raw)
}

function madridNowParts (date = new Date()) {
  const parts = new Intl.DateTimeFormat('en-GB', {
    timeZone: 'Europe/Madrid',
    weekday: 'short',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
    hour12: false
  }).formatToParts(date)

  const map = Object.fromEntries(parts.map(p => [p.type, p.value]))
  return {
    weekday: map.weekday,
    year: Number(map.year),
    month: Number(map.month),
    day: Number(map.day),
    hour: Number(map.hour),
    minute: Number(map.minute),
    second: Number(map.second)
  }
}

function shouldRunPublishNow () {
  if ((process.env.FORCE_WEEKLY_PUBLISH || '').toLowerCase() === 'true') return true
  const now = madridNowParts()
  return now.weekday === 'Sun' && now.hour === 15
}

function getRollingWindow () {
  const end = new Date()
  const start = new Date(end.getTime() - (7 * 24 * 60 * 60 * 1000))
  return {
    startIso: start.toISOString(),
    endIso: end.toISOString(),
    weekKey: start.toISOString().slice(0, 10)
  }
}

function scoreMember (events) {
  let validMinutes = 0
  let completedTracks = 0
  let totalTracks = 0
  const days = new Set()
  const artistPlays = new Map()
  const trackPlays = new Map()

  const addPlay = (map, rawKey) => {
    const key = (rawKey || '').toString().trim()
    if (!key) return
    map.set(key, (map.get(key) || 0) + 1)
  }

  const getTop = (map) => {
    let bestKey = ''
    let bestCount = 0
    for (const [key, count] of map.entries()) {
      if (count > bestCount) {
        bestKey = key
        bestCount = count
      }
    }
    return { name: bestKey, plays: bestCount }
  }

  for (const e of events) {
    const duration = Number(e.durationMs || 0)
    const msPlayed = Number(e.msPlayed || 0)
    const ratio = duration > 0 ? msPlayed / duration : 0
    const countedForRegister = e.countedForRegister === true || ratio >= 0.05

    if (countedForRegister) {
      totalTracks += 1
      addPlay(artistPlays, e.artist)
      addPlay(trackPlays, e.track)
    }

    if (ratio >= 0.8 && msPlayed > 0) {
      validMinutes += msPlayed / 60000
      completedTracks += 1
      const d = new Date(e.playedAt || 0)
      if (Number.isFinite(d.getTime())) days.add(d.toISOString().slice(0, 10))
    }
  }

  const activeDays = days.size
  const score = validMinutes + (activeDays * 2) + (completedTracks * 0.5)
  const topArtist = getTop(artistPlays)
  const topTrack = getTop(trackPlays)

  return {
    totalMinutes: Number(validMinutes.toFixed(2)),
    completedTracks,
    totalTracks,
    topArtist: topArtist.name,
    topArtistPlays: topArtist.plays,
    topTrack: topTrack.name,
    topTrackPlays: topTrack.plays,
    activeDays,
    score: Number(score.toFixed(2))
  }
}

async function fetchMemberEventsForWindow (db, uid, startIso, endIso) {
  const snap = await db
    .collection('users')
    .doc(uid)
    .collection('listening_events')
    .where('playedAt', '>=', startIso)
    .where('playedAt', '<', endIso)
    .get()

  return snap.docs.map(d => d.data())
}

async function run () {
  if (!shouldRunPublishNow()) {
    console.log('[weekly] Skipped: outside Sunday 15:00 Europe/Madrid window.')
    return
  }

  const serviceAccount = getServiceAccountFromEnv()
  if (!getApps().length) {
    initializeApp({ credential: cert(serviceAccount) })
  }

  const db = getFirestore()
  const { startIso, endIso, weekKey } = getRollingWindow()
  console.log(`[weekly] Publishing window ${startIso} -> ${endIso}`)

  const groupsSnap = await db.collection('friend_groups').get()
  for (const groupDoc of groupsSnap.docs) {
    const groupId = groupDoc.id
    const resultsCollection = db.collection('friend_groups').doc(groupId).collection('weekly_results')
    const membersSnap = await db.collection('friend_groups').doc(groupId).collection('members').get()
    const members = membersSnap.docs.map(d => ({ uid: d.id, ...d.data() }))
    if (!members.length) continue

    const results = []
    for (const member of members) {
      const events = await fetchMemberEventsForWindow(db, member.uid, startIso, endIso)
      const groupScoped = events.filter(e => (e.groupId || '') === groupId)
      const stats = scoreMember(groupScoped)

      results.push({
        uid: member.uid,
        displayName: member.displayName || member.uid,
        ...stats
      })
    }

    results.sort((a, b) => b.score - a.score)

    const usersBatch = db.batch()
    for (const memberResult of results) {
      const userRef = db.collection('users').doc(memberResult.uid)
      const weeklyStatsRef = userRef.collection('league_weekly_stats').doc('current')

      usersBatch.set(weeklyStatsRef, {
        weekKey,
        weekStart: startIso,
        weekEnd: endIso,
        groupId,
        displayName: memberResult.displayName,
        totalMinutes: memberResult.totalMinutes,
        totalTracks: memberResult.totalTracks,
        completedTracks: memberResult.completedTracks,
        activeDays: memberResult.activeDays,
        score: memberResult.score,
        topArtist: memberResult.topArtist,
        topArtistPlays: memberResult.topArtistPlays,
        topTrack: memberResult.topTrack,
        topTrackPlays: memberResult.topTrackPlays,
        publishedAt: FieldValue.serverTimestamp()
      }, { merge: true })

      usersBatch.set(userRef, {
        latestLeagueSummary: {
          weekKey,
          groupId,
          totalMinutes: memberResult.totalMinutes,
          totalTracks: memberResult.totalTracks,
          completedTracks: memberResult.completedTracks,
          activeDays: memberResult.activeDays,
          score: memberResult.score,
          topArtist: memberResult.topArtist,
          topArtistPlays: memberResult.topArtistPlays,
          topTrack: memberResult.topTrack,
          topTrackPlays: memberResult.topTrackPlays,
          publishedAt: FieldValue.serverTimestamp()
        }
      }, { merge: true })
    }

    await usersBatch.commit()

    const pruneBatch = db.batch()
    const existingResultsSnap = await resultsCollection.get()
    for (const docSnap of existingResultsSnap.docs) {
      if (docSnap.id !== 'current') {
        pruneBatch.delete(docSnap.ref)
      }
    }

    for (const member of members) {
      const weeklyStatsCollection = db.collection('users').doc(member.uid).collection('league_weekly_stats')
      const existingStatsSnap = await weeklyStatsCollection.get()
      for (const docSnap of existingStatsSnap.docs) {
        if (docSnap.id !== 'current') {
          pruneBatch.delete(docSnap.ref)
        }
      }
    }

    await pruneBatch.commit()

    await resultsCollection
      .doc('current')
      .set({
        weekKey,
        weekStart: startIso,
        weekEnd: endIso,
        publishedAt: FieldValue.serverTimestamp(),
        members: results,
        algorithm: {
          mode: 'free-github-actions',
          minutesWeight: 1,
          activeDaysWeight: 2,
          completedTracksWeight: 0.5,
          minCompletionRatioForMinutes: 0.8
        }
      }, { merge: true })

    console.log(`[weekly] Published group ${groupId} (${results.length} members)`)
  }

  console.log('[weekly] Done')
}

run().catch((err) => {
  console.error('[weekly] Failed:', err)
  process.exit(1)
})
