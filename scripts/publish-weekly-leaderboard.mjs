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
  const days = new Set()

  for (const e of events) {
    const duration = Number(e.durationMs || 0)
    const msPlayed = Number(e.msPlayed || 0)
    const ratio = duration > 0 ? msPlayed / duration : 0

    if (ratio >= 0.8 && msPlayed > 0) {
      validMinutes += msPlayed / 60000
      completedTracks += 1
      const d = new Date(e.playedAt || 0)
      if (Number.isFinite(d.getTime())) days.add(d.toISOString().slice(0, 10))
    }
  }

  const activeDays = days.size
  const score = validMinutes + (activeDays * 2) + (completedTracks * 0.5)

  return {
    totalMinutes: Number(validMinutes.toFixed(2)),
    completedTracks,
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

    await db
      .collection('friend_groups')
      .doc(groupId)
      .collection('weekly_results')
      .doc(weekKey)
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
