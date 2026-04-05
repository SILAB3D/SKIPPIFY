import { computed, ref } from 'vue'
import { signInAnonymously, onAuthStateChanged } from 'firebase/auth'
import {
  collection,
  collectionGroup,
  doc,
  getDoc,
  getDocs,
  limit,
  orderBy,
  query,
  serverTimestamp,
  setDoc,
  where,
  writeBatch
} from 'firebase/firestore'
import { useEventStore } from '@/stores/events'
import { getFirebaseContext } from '@/lib/firebaseClient'

const ctx = getFirebaseContext()
const LEAGUE_STATE_KEY = 'skippify-league-state'

const state = ref({
  uid: '',
  groupId: '',
  displayName: '',
  inviteCode: '',
  lastSyncAt: null
})

const authReady = ref(false)
const syncing = ref(false)
const loadingLeaderboard = ref(false)
const error = ref('')
const message = ref('')
const leaderboard = ref(null)
const weeklyMembers = ref([])

function loadState () {
  try {
    const raw = localStorage.getItem(LEAGUE_STATE_KEY)
    if (!raw) return
    const parsed = JSON.parse(raw)
    state.value = {
      uid: (parsed?.uid || '').toString(),
      groupId: (parsed?.groupId || '').toString(),
      displayName: (parsed?.displayName || '').toString(),
      inviteCode: (parsed?.inviteCode || '').toString(),
      lastSyncAt: parsed?.lastSyncAt || null
    }
  } catch {
    state.value = { uid: '', groupId: '', displayName: '', inviteCode: '', lastSyncAt: null }
  }
}

function saveState () {
  try {
    localStorage.setItem(LEAGUE_STATE_KEY, JSON.stringify(state.value))
  } catch { /* ignored */ }
}

function clearStatus () {
  error.value = ''
  message.value = ''
}

function hashId (input) {
  let hash = 0x811c9dc5
  for (let i = 0; i < input.length; i += 1) {
    hash ^= input.charCodeAt(i)
    hash = Math.imul(hash, 0x01000193)
  }
  return (hash >>> 0).toString(16).padStart(8, '0')
}

function eventIdFromLocalEvent (event, uid) {
  const key = `${uid}|${event?.played_at || ''}|${event?.track || ''}|${event?.artist || ''}|${event?.duration_ms || 0}`
  return hashId(key)
}

function normalizeIntervalRangeStart (date = new Date()) {
  const d = new Date(date)
  d.setHours(0, 0, 0, 0)
  return d
}

function generateInviteCode () {
  const alphabet = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789'
  let out = ''
  for (let i = 0; i < 6; i += 1) {
    out += alphabet[Math.floor(Math.random() * alphabet.length)]
  }
  return out
}

function nextSunday1500Label () {
  const now = new Date()
  const day = now.getDay()
  const daysUntilSunday = (7 - day) % 7

  const target = new Date(now)
  target.setDate(now.getDate() + daysUntilSunday)
  target.setHours(15, 0, 0, 0)

  if (target <= now) {
    target.setDate(target.getDate() + 7)
  }

  return target.toLocaleString('es-ES', {
    weekday: 'long',
    day: '2-digit',
    month: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    timeZone: 'Europe/Madrid'
  })
}

async function ensureAuth () {
  if (!ctx.enabled || !ctx.auth) {
    authReady.value = true
    return false
  }

  if (authReady.value && state.value.uid) return true

  await new Promise((resolve) => {
    const unsub = onAuthStateChanged(ctx.auth, async (user) => {
      if (!user) {
        try {
          const cred = await signInAnonymously(ctx.auth)
          state.value.uid = cred.user.uid
        } catch (err) {
          error.value = err?.message || 'No fue posible iniciar sesion en Firebase.'
        }
      } else {
        state.value.uid = user.uid
      }

      authReady.value = true
      saveState()
      unsub()
      resolve()
    })
  })

  return !!state.value.uid
}

async function createGroup ({ displayName }) {
  clearStatus()
  if (!ctx.enabled || !ctx.db) {
    error.value = 'Firebase no esta configurado. Define variables VITE_FIREBASE_*.'
    return null
  }

  const ok = await ensureAuth()
  if (!ok) return null

  const safeName = (displayName || '').trim() || `Player-${state.value.uid.slice(0, 6)}`
  const groupId = doc(collection(ctx.db, 'friend_groups')).id
  const inviteCode = generateInviteCode()

  const groupRef = doc(ctx.db, 'friend_groups', groupId)
  const memberRef = doc(ctx.db, 'friend_groups', groupId, 'members', state.value.uid)
  const userRef = doc(ctx.db, 'users', state.value.uid)

  const batch = writeBatch(ctx.db)
  batch.set(groupRef, {
    name: `${safeName} Squad`,
    ownerUid: state.value.uid,
    inviteCode,
    createdAt: serverTimestamp(),
    publishSchedule: 'SUNDAYS_15_EUROPE_MADRID'
  })
  batch.set(memberRef, {
    uid: state.value.uid,
    displayName: safeName,
    role: 'owner',
    joinedAt: serverTimestamp()
  })
  batch.set(userRef, {
    uid: state.value.uid,
    displayName: safeName,
    activeGroupId: groupId,
    updatedAt: serverTimestamp()
  }, { merge: true })

  await batch.commit()

  state.value.groupId = groupId
  state.value.displayName = safeName
  state.value.inviteCode = inviteCode
  saveState()
  message.value = `Grupo creado. Codigo: ${inviteCode}`
  return groupId
}

async function joinGroup ({ inviteCode, displayName }) {
  clearStatus()
  if (!ctx.enabled || !ctx.db) {
    error.value = 'Firebase no esta configurado. Define variables VITE_FIREBASE_*.'
    return null
  }

  const ok = await ensureAuth()
  if (!ok) return null

  const code = (inviteCode || '').trim().toUpperCase()
  if (!code) {
    error.value = 'Introduce un codigo de invitacion valido.'
    return null
  }

  const q = query(collection(ctx.db, 'friend_groups'), where('inviteCode', '==', code), limit(1))
  const snap = await getDocs(q)
  if (snap.empty) {
    error.value = 'No existe un grupo con ese codigo.'
    return null
  }

  const group = snap.docs[0]
  const groupId = group.id
  const safeName = (displayName || '').trim() || `Player-${state.value.uid.slice(0, 6)}`

  const memberRef = doc(ctx.db, 'friend_groups', groupId, 'members', state.value.uid)
  const userRef = doc(ctx.db, 'users', state.value.uid)
  const batch = writeBatch(ctx.db)

  batch.set(memberRef, {
    uid: state.value.uid,
    displayName: safeName,
    role: 'member',
    joinedAt: serverTimestamp()
  }, { merge: true })

  batch.set(userRef, {
    uid: state.value.uid,
    displayName: safeName,
    activeGroupId: groupId,
    updatedAt: serverTimestamp()
  }, { merge: true })

  await batch.commit()

  state.value.groupId = groupId
  state.value.displayName = safeName
  state.value.inviteCode = code
  saveState()
  message.value = 'Te uniste al grupo correctamente.'
  return groupId
}

async function syncLocalEvents () {
  clearStatus()
  if (!ctx.enabled || !ctx.db) {
    error.value = 'Firebase no esta configurado. Define variables VITE_FIREBASE_*.'
    return 0
  }

  const ok = await ensureAuth()
  if (!ok) return 0

  if (!state.value.groupId) {
    error.value = 'Primero crea o unete a un grupo.'
    return 0
  }

  syncing.value = true
  const { state: eventState } = useEventStore()
  const allEvents = Array.isArray(eventState.events) ? [...eventState.events] : []

  const lowerBound = state.value.lastSyncAt ? new Date(state.value.lastSyncAt) : null
  const candidates = allEvents.filter((event) => {
    const playedAt = new Date(event?.played_at || 0)
    if (!Number.isFinite(playedAt.getTime())) return false
    if (lowerBound && playedAt <= lowerBound) return false
    return true
  })

  if (!candidates.length) {
    syncing.value = false
    message.value = 'No hay reproducciones nuevas para sincronizar.'
    return 0
  }

  let synced = 0
  const batches = []
  let currentBatch = writeBatch(ctx.db)
  let inBatch = 0

  const userRef = doc(ctx.db, 'users', state.value.uid)
  currentBatch.set(userRef, {
    uid: state.value.uid,
    displayName: state.value.displayName || `Player-${state.value.uid.slice(0, 6)}`,
    activeGroupId: state.value.groupId,
    updatedAt: serverTimestamp()
  }, { merge: true })
  inBatch += 1

  for (const event of candidates) {
    const eventId = eventIdFromLocalEvent(event, state.value.uid)
    const ratio = Number(event?.duration_ms || 0) > 0
      ? Number(event?.ms_played || 0) / Number(event?.duration_ms || 1)
      : 0

    const docRef = doc(ctx.db, 'users', state.value.uid, 'listening_events', eventId)
    currentBatch.set(docRef, {
      eventId,
      uid: state.value.uid,
      groupId: state.value.groupId,
      playedAt: event.played_at,
      playedAtDay: normalizeIntervalRangeStart(new Date(event.played_at)).toISOString(),
      track: (event?.track || '').toString(),
      artist: (event?.artist || '').toString(),
      durationMs: Number(event?.duration_ms || 0),
      msPlayed: Number(event?.ms_played || 0),
      completionRatio: Math.max(0, ratio),
      countedForTime: ratio >= 0.8,
      countedForRegister: ratio >= 0.05,
      source: (event?.source || '').toString(),
      createdAt: serverTimestamp()
    }, { merge: true })

    synced += 1
    inBatch += 1

    if (inBatch >= 450) {
      batches.push(currentBatch)
      currentBatch = writeBatch(ctx.db)
      inBatch = 0
    }
  }

  if (inBatch > 0) batches.push(currentBatch)

  for (const b of batches) {
    await b.commit()
  }

  state.value.lastSyncAt = new Date().toISOString()
  saveState()
  syncing.value = false
  message.value = `Sincronizacion completada: ${synced} eventos subidos.`
  return synced
}

async function loadLeaderboard () {
  clearStatus()
  if (!ctx.enabled || !ctx.db) {
    error.value = 'Firebase no esta configurado. Define variables VITE_FIREBASE_*.'
    return null
  }

  const ok = await ensureAuth()
  if (!ok) return null

  if (!state.value.groupId) {
    error.value = 'Primero crea o unete a un grupo.'
    return null
  }

  loadingLeaderboard.value = true
  try {
    const resultsRef = collection(ctx.db, 'friend_groups', state.value.groupId, 'weekly_results')
    const q = query(resultsRef, orderBy('weekStart', 'desc'), limit(1))
    const snap = await getDocs(q)
    if (snap.empty) {
      leaderboard.value = null
      weeklyMembers.value = []
      message.value = 'Aun no hay resultados semanales publicados.'
      return null
    }

    const topDoc = snap.docs[0]
    leaderboard.value = {
      id: topDoc.id,
      ...topDoc.data()
    }
    weeklyMembers.value = Array.isArray(leaderboard.value.members)
      ? leaderboard.value.members
      : []
    return leaderboard.value
  } finally {
    loadingLeaderboard.value = false
  }
}

async function loadCurrentGroupInfo () {
  clearStatus()
  if (!ctx.enabled || !ctx.db || !state.value.groupId) return null

  const ref = doc(ctx.db, 'friend_groups', state.value.groupId)
  const snap = await getDoc(ref)
  if (!snap.exists()) return null
  const data = snap.data()
  state.value.inviteCode = (data?.inviteCode || state.value.inviteCode || '').toString()
  saveState()
  return data
}

loadState()

export function useLeague () {
  return {
    enabled: computed(() => ctx.enabled),
    state,
    authReady,
    syncing,
    loadingLeaderboard,
    leaderboard,
    weeklyMembers,
    error,
    message,
    nextPublishLabel: computed(() => nextSunday1500Label()),
    ensureAuth,
    createGroup,
    joinGroup,
    syncLocalEvents,
    loadLeaderboard,
    loadCurrentGroupInfo,
    clearStatus
  }
}
