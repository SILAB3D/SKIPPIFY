import { computed, ref } from 'vue'
import { signInAnonymously, onAuthStateChanged } from 'firebase/auth'
import { LocalNotifications } from '@capacitor/local-notifications'
import {
  collection,
  doc,
  getDoc,
  getDocs,
  limit,
  query,
  serverTimestamp,
  setDoc,
  where,
  writeBatch
} from 'firebase/firestore'
import { useEventStore } from '@/stores/events'
import { getFirebaseContext, getFirebaseDiagnostics } from '@/lib/firebaseClient'

const ctx = getFirebaseContext()
const LEAGUE_STATE_KEY = 'skippify-league-state'

const state = ref({
  uid: '',
  groupId: '',
  displayName: '',
  inviteCode: '',
  lastSyncAt: null,
  lastSeenWeeklyResultsWeekKey: ''
})

const authReady = ref(false)
const authLoading = ref(false)
const syncing = ref(false)
const loadingLeaderboard = ref(false)
const error = ref('')
const message = ref('')
const leaderboard = ref(null)
const weeklyMembers = ref([])
let authPromise = null
let syncPromise = null

const clockTick = ref(Date.now())
if (typeof window !== 'undefined') {
  setInterval(() => { clockTick.value = Date.now() }, 60_000)
}

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
      lastSyncAt: parsed?.lastSyncAt || null,
      lastSeenWeeklyResultsWeekKey: (parsed?.lastSeenWeeklyResultsWeekKey || '').toString()
    }
  } catch {
    state.value = { uid: '', groupId: '', displayName: '', inviteCode: '', lastSyncAt: null, lastSeenWeeklyResultsWeekKey: '' }
  }
}

function saveState () {
  try {
    localStorage.setItem(LEAGUE_STATE_KEY, JSON.stringify(state.value))
  } catch { /* ignored */ }
}

async function requestWeeklyResultNotification () {
  const title = 'Skippify'
  const body = 'Los resultados de la liga semanal ya estan disponibles.'

  try {
    const permissions = await LocalNotifications.checkPermissions()
    if (permissions.display !== 'granted') {
      const requested = await LocalNotifications.requestPermissions()
      if (requested.display !== 'granted') {
        throw new Error('Local notifications permission not granted')
      }
    }

    await LocalNotifications.schedule({
      notifications: [
        {
          id: Date.now() % 2147483647,
          title,
          body,
          schedule: { at: new Date(Date.now() + 1000) }
        }
      ]
    })
    return
  } catch {
    if (typeof window === 'undefined' || typeof Notification === 'undefined') return

    if (Notification.permission === 'granted') {
      try {
        new Notification(title, { body })
      } catch { /* ignored */ }
      return
    }

    if (Notification.permission === 'default') {
      Notification.requestPermission().then((permission) => {
        if (permission === 'granted') {
          try {
            new Notification(title, { body })
          } catch { /* ignored */ }
        }
      }).catch(() => {})
    }
  }
}

function clearStatus () {
  error.value = ''
  message.value = ''
}

function mapFirebaseError (err, fallback = 'Ocurrio un error inesperado.') {
  const code = (err?.code || '').toString()
  const diagnostics = getFirebaseDiagnostics()
  if (code.includes('permission-denied')) {
    return 'Firebase rechazo el acceso. Intenta entrar de nuevo al grupo; si persiste, revisa Authentication (Anonymous) y reglas de Firestore.'
  }
  if (code.includes('unavailable')) {
    return 'No hay conexion con Firebase. Verifica internet e intenta nuevamente.'
  }
  if (code.includes('api-key-not-valid')) {
    return `La API key de Firebase no es valida para Auth. Verifica que sea la Web API Key del proyecto ${diagnostics.projectId || '(sin projectId)'}, sin restricciones HTTP referrer para Capacitor, y con la API Identity Toolkit habilitada.`
  }
  if (code.includes('invalid-api-key')) {
    return 'La API key de Firebase no es valida. Revisa VITE_FIREBASE_API_KEY.'
  }
  if (code.includes('network-request-failed')) {
    return 'Fallo de red al conectar con Firebase.'
  }
  return err?.message || fallback
}

function normalizeDisplayName (value) {
  return (value || '').toString().trim().replace(/\s+/g, ' ')
}

function isPermissionDeniedError (err) {
  const code = (err?.code || '').toString().toLowerCase()
  return code.includes('permission-denied')
}

async function repairMembershipIfNeeded () {
  if (!ctx.enabled || !ctx.db || !state.value.groupId || !state.value.uid) {
    return false
  }

  const safeName = normalizeDisplayName(state.value.displayName) || `Player-${state.value.uid.slice(0, 6)}`
  const memberRef = doc(ctx.db, 'friend_groups', state.value.groupId, 'members', state.value.uid)
  const userRef = doc(ctx.db, 'users', state.value.uid)

  try {
    const batch = writeBatch(ctx.db)
    batch.set(memberRef, {
      uid: state.value.uid,
      displayName: safeName,
      updatedAt: serverTimestamp()
    }, { merge: true })
    batch.set(userRef, {
      uid: state.value.uid,
      displayName: safeName,
      activeGroupId: state.value.groupId,
      updatedAt: serverTimestamp()
    }, { merge: true })
    await batch.commit()
    state.value.displayName = safeName
    saveState()
    return true
  } catch {
    return false
  }
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

  // Varias vistas llaman a ensureAuth() a la vez (onMounted + auto-sync). Sin
  // esta guarda se lanzaban varios signInAnonymously en paralelo.
  if (authPromise) return authPromise

  authLoading.value = true

  authPromise = new Promise((resolve) => {
    let settled = false
    let unsub = null

    const finish = () => {
      if (settled) return
      settled = true
      authReady.value = true
      authLoading.value = false
      saveState()
      // `unsub` puede seguir sin asignarse si el callback se dispara de forma
      // síncrona: por eso se comprueba antes de invocarlo.
      if (typeof unsub === 'function') unsub()
      clearTimeout(timeoutId)
      resolve(!!state.value.uid)
    }

    // Si Firebase nunca responde (sin red, DNS bloqueado) la promesa se quedaba
    // colgada para siempre y la vista Liga se congelaba en "Conectando...".
    const timeoutId = setTimeout(() => {
      if (settled) return
      error.value = 'No fue posible conectar con Firebase (tiempo de espera agotado).'
      finish()
    }, 20000)

    try {
      unsub = onAuthStateChanged(
        ctx.auth,
        async (user) => {
          if (!user) {
            try {
              const cred = await signInAnonymously(ctx.auth)
              state.value.uid = cred.user.uid
            } catch (err) {
              error.value = mapFirebaseError(err, 'No fue posible iniciar sesion en Firebase.')
            }
          } else {
            state.value.uid = user.uid
          }
          finish()
        },
        (err) => {
          error.value = mapFirebaseError(err, 'No fue posible iniciar sesion en Firebase.')
          finish()
        }
      )
    } catch (err) {
      error.value = mapFirebaseError(err, 'No fue posible iniciar sesion en Firebase.')
      finish()
    }
  }).finally(() => { authPromise = null })

  return authPromise
}

async function createGroup ({ displayName }) {
  clearStatus()
  if (!ctx.enabled || !ctx.db) {
    error.value = 'Firebase no está configurado. Define variables VITE_FIREBASE_*.'
    return null
  }

  const ok = await ensureAuth()
  if (!ok) return null

  const safeName = normalizeDisplayName(displayName)
  if (!safeName || safeName.length < 3) {
    error.value = 'Introduce un nombre de usuario de al menos 3 caracteres.'
    return null
  }

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

  try {
    await batch.commit()
  } catch (err) {
    error.value = mapFirebaseError(err, 'No fue posible crear el grupo.')
    return null
  }

  state.value.groupId = groupId
  state.value.displayName = safeName
  state.value.inviteCode = inviteCode
  saveState()
  message.value = `Grupo creado. Código: ${inviteCode}`
  return groupId
}

async function joinGroup ({ inviteCode, displayName }) {
  clearStatus()
  if (!ctx.enabled || !ctx.db) {
    error.value = 'Firebase no está configurado. Define variables VITE_FIREBASE_*.'
    return null
  }

  const ok = await ensureAuth()
  if (!ok) return null

  const safeName = normalizeDisplayName(displayName)
  if (!safeName || safeName.length < 3) {
    error.value = 'Introduce un nombre de usuario de al menos 3 caracteres.'
    return null
  }

  const code = (inviteCode || '').trim().toUpperCase()
  if (!code || code.length !== 6) {
    error.value = 'El código de invitación debe tener exactamente 6 caracteres.'
    return null
  }

  const q = query(collection(ctx.db, 'friend_groups'), where('inviteCode', '==', code), limit(1))
  let snap
  try {
    snap = await getDocs(q)
  } catch (err) {
    error.value = mapFirebaseError(err, 'No fue posible buscar el grupo por código.')
    return null
  }

  if (snap.empty) {
    error.value = 'No existe un grupo con ese código.'
    return null
  }

  const group = snap.docs[0]
  const groupId = group.id

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

  try {
    await batch.commit()
  } catch (err) {
    error.value = mapFirebaseError(err, 'No fue posible unirte al grupo.')
    return null
  }

  state.value.groupId = groupId
  state.value.displayName = safeName
  state.value.inviteCode = code
  saveState()
  message.value = 'Te uniste al grupo correctamente.'
  return groupId
}

async function syncLocalEvents (options = {}) {
  // Evita solapes entre el auto-sync de 30 min y una pulsación manual.
  if (syncPromise) return syncPromise
  syncPromise = _syncLocalEvents(options).finally(() => { syncPromise = null })
  return syncPromise
}

async function _syncLocalEvents (options = {}) {
  const silent = !!options?.silent
  if (!silent) {
    clearStatus()
  } else {
    error.value = ''
  }
  if (!ctx.enabled || !ctx.db) {
    error.value = 'Firebase no está configurado. Define variables VITE_FIREBASE_*.'
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

  // `ms_played` se rellena al TERMINAR la canción (finalizeCurrentEvent). Si la
  // sincronización automática corría mientras sonaba un tema, ese evento se subía
  // con ms_played = 0 y nunca se volvía a enviar, así que la liga contaba de menos.
  // Se reenvía siempre una ventana de solape; los documentos usan un ID
  // determinista + merge, así que reenviar es idempotente.
  const RESYNC_OVERLAP_MS = 26 * 60 * 60 * 1000
  const lowerBound = state.value.lastSyncAt
    ? new Date(new Date(state.value.lastSyncAt).getTime() - RESYNC_OVERLAP_MS)
    : null
  const candidates = allEvents.filter((event) => {
    const playedAt = new Date(event?.played_at || 0)
    if (!Number.isFinite(playedAt.getTime())) return false
    if (lowerBound && playedAt <= lowerBound) return false
    return true
  })

  if (!candidates.length) {
    syncing.value = false
    if (!silent) {
      message.value = 'No hay reproducciones nuevas para sincronizar.'
    }
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

  try {
    for (const b of batches) {
      await b.commit()
    }
  } catch (err) {
    syncing.value = false
    error.value = mapFirebaseError(err, 'No fue posible sincronizar eventos.')
    return 0
  }

  state.value.lastSyncAt = new Date().toISOString()
  saveState()
  syncing.value = false
  if (!silent) {
    message.value = `Sincronizacion completada: ${synced} eventos subidos.`
  }
  return synced
}

async function loadLeaderboard (options = {}) {
  const silent = !!options?.silent
  if (!silent) {
    clearStatus()
  }
  if (!ctx.enabled || !ctx.db) {
    error.value = 'Firebase no está configurado. Define variables VITE_FIREBASE_*.'
    return null
  }

  const ok = await ensureAuth()
  if (!ok) return null

  if (!state.value.groupId) {
    error.value = 'Primero crea o unete a un grupo.'
    return null
  }

  loadingLeaderboard.value = true

  const loadCurrentResult = async () => {
    const resultsRef = doc(ctx.db, 'friend_groups', state.value.groupId, 'weekly_results', 'current')
    const snap = await getDoc(resultsRef)
    if (!snap.exists()) {
      leaderboard.value = null
      weeklyMembers.value = []
      if (!silent) {
        message.value = 'Aun no hay resultados semanales publicados.'
      }
      return null
    }

    const previousWeekKey = (state.value.lastSeenWeeklyResultsWeekKey || '').toString()
    const currentWeekKey = (snap.data()?.weekKey || '').toString()
    leaderboard.value = {
      id: 'current',
      ...snap.data()
    }
    weeklyMembers.value = Array.isArray(leaderboard.value.members)
      ? leaderboard.value.members
      : []

    if (currentWeekKey && previousWeekKey && currentWeekKey !== previousWeekKey) {
      void requestWeeklyResultNotification()
    }

    state.value.lastSeenWeeklyResultsWeekKey = currentWeekKey
    saveState()
    return leaderboard.value
  }

  try {
    return await loadCurrentResult()
  } catch (err) {
    if (isPermissionDeniedError(err)) {
      const repaired = await repairMembershipIfNeeded()
      if (repaired) {
        try {
          return await loadCurrentResult()
        } catch (retryErr) {
          error.value = mapFirebaseError(retryErr, 'No fue posible cargar el ranking semanal.')
          return null
        }
      }
    }

    error.value = mapFirebaseError(err, 'No fue posible cargar el ranking semanal.')
    return null
  } finally {
    loadingLeaderboard.value = false
  }
}

async function loadCurrentGroupInfo () {
  clearStatus()
  if (!ctx.enabled || !ctx.db || !state.value.groupId) return null

  const readGroup = async () => {
    const ref = doc(ctx.db, 'friend_groups', state.value.groupId)
    const snap = await getDoc(ref)
    if (!snap.exists()) return null
    const data = snap.data()
    state.value.inviteCode = (data?.inviteCode || state.value.inviteCode || '').toString()
    saveState()
    return data
  }

  try {
    return await readGroup()
  } catch (err) {
    if (isPermissionDeniedError(err)) {
      const repaired = await repairMembershipIfNeeded()
      if (repaired) {
        try {
          return await readGroup()
        } catch (retryErr) {
          error.value = mapFirebaseError(retryErr, 'No fue posible cargar el grupo activo.')
          return null
        }
      }
    }

    error.value = mapFirebaseError(err, 'No fue posible cargar el grupo activo.')
    return null
  }
}

loadState()

export function useLeague () {
  return {
    enabled: computed(() => ctx.enabled),
    state,
    authReady,
    authLoading,
    syncing,
    loadingLeaderboard,
    leaderboard,
    weeklyMembers,
    error,
    message,
    // Depende de `clockTick` para que la etiqueta avance sola; antes era un
    // computed sin dependencias reactivas y se quedaba fijo en el valor inicial.
    nextPublishLabel: computed(() => {
      void clockTick.value
      return nextSunday1500Label()
    }),
    ensureAuth,
    createGroup,
    joinGroup,
    syncLocalEvents,
    loadLeaderboard,
    loadCurrentGroupInfo,
    clearStatus
  }
}
