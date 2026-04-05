const { onSchedule } = require('firebase-functions/v2/scheduler')
const { onCall, HttpsError } = require('firebase-functions/v2/https')
const admin = require('firebase-admin')

admin.initializeApp()
const db = admin.firestore()

function getWeekKeyFromDate (date) {
  const d = new Date(date)
  const day = (d.getUTCDay() + 6) % 7
  d.setUTCDate(d.getUTCDate() - day)
  d.setUTCHours(0, 0, 0, 0)
  return d.toISOString().slice(0, 10)
}

function scoreMember (events) {
  let validMinutes = 0
  let completedTracks = 0
  const days = new Set()

  for (const e of events) {
    const playedAt = new Date(e.playedAt || 0)
    if (!Number.isFinite(playedAt.getTime())) continue

    const duration = Number(e.durationMs || 0)
    const msPlayed = Number(e.msPlayed || 0)
    const ratio = duration > 0 ? msPlayed / duration : 0

    if (ratio >= 0.8 && msPlayed > 0) {
      validMinutes += msPlayed / 60000
      completedTracks += 1
      days.add(playedAt.toISOString().slice(0, 10))
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

async function fetchMemberEventsForWindow (uid, startIso, endIso) {
  const snap = await db
    .collection('users')
    .doc(uid)
    .collection('listening_events')
    .where('playedAt', '>=', startIso)
    .where('playedAt', '<', endIso)
    .get()

  return snap.docs.map(d => d.data())
}

exports.computeWeeklyLeaderboards = onSchedule(
  {
    schedule: '0 15 * * 0',
    timeZone: 'Europe/Madrid',
    region: 'europe-west1'
  },
  async () => {
    const now = new Date()
    const currentWeekStart = new Date(now)
    const weekDay = (currentWeekStart.getUTCDay() + 6) % 7
    currentWeekStart.setUTCDate(currentWeekStart.getUTCDate() - weekDay)
    currentWeekStart.setUTCHours(0, 0, 0, 0)

    const prevWeekStart = new Date(currentWeekStart)
    prevWeekStart.setUTCDate(prevWeekStart.getUTCDate() - 7)

    const weekStartIso = prevWeekStart.toISOString()
    const weekEndIso = currentWeekStart.toISOString()
    const weekKey = getWeekKeyFromDate(prevWeekStart)

    const groupsSnap = await db.collection('friend_groups').get()

    for (const groupDoc of groupsSnap.docs) {
      const groupId = groupDoc.id
      const membersSnap = await db.collection('friend_groups').doc(groupId).collection('members').get()
      const members = membersSnap.docs.map(d => ({ uid: d.id, ...d.data() }))

      if (!members.length) continue

      const results = []
      for (const member of members) {
        const events = await fetchMemberEventsForWindow(member.uid, weekStartIso, weekEndIso)
        const stats = scoreMember(events)

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
          weekStart: weekStartIso,
          weekEnd: weekEndIso,
          publishedAt: admin.firestore.FieldValue.serverTimestamp(),
          members: results,
          algorithm: {
            minutesWeight: 1,
            activeDaysWeight: 2,
            completedTracksWeight: 0.5,
            minCompletionRatioForMinutes: 0.8
          }
        }, { merge: true })
    }
  }
)

exports.publishWeeklyResultNow = onCall({ region: 'europe-west1' }, async (request) => {
  if (!request.auth) {
    throw new HttpsError('unauthenticated', 'Authentication required.')
  }

  const groupId = (request.data?.groupId || '').toString().trim()
  if (!groupId) {
    throw new HttpsError('invalid-argument', 'groupId is required.')
  }

  const memberDoc = await db.collection('friend_groups').doc(groupId).collection('members').doc(request.auth.uid).get()
  if (!memberDoc.exists) {
    throw new HttpsError('permission-denied', 'You are not a member of this group.')
  }

  return { ok: true, message: 'Use scheduler for production publication. Manual publish endpoint is enabled.' }
})
