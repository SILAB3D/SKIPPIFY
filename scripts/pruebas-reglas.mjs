/**
 * Simulación de las reglas de Firestore contra el emulador.
 *
 * Reproduce el fallo reportado («Firebase rechazó el acceso» al abrir un grupo)
 * y comprueba que sigue habiendo puerta donde tiene que haberla.
 */
import { initializeApp, deleteApp } from 'firebase/app'
import { getAuth, connectAuthEmulator, signInAnonymously } from 'firebase/auth'
import {
  getFirestore, connectFirestoreEmulator, collection, doc, getDoc, getDocs,
  query, where, limit, setDoc, deleteDoc, writeBatch, serverTimestamp
} from 'firebase/firestore'

const PROJECT = 'skipp-7d184'
const FS_PORT = Number(process.env.FS_PORT || 8080)
const AUTH_PORT = Number(process.env.AUTH_PORT || 9099)

let fallos = 0
let total = 0

function check (etiqueta, real, esperado) {
  total += 1
  const ok = real === esperado
  if (!ok) fallos += 1
  console.log(`  ${ok ? 'OK ' : 'MAL'} ${etiqueta}${ok ? '' : ` → ${real} (esperaba ${esperado})`}`)
}

/** Ejecuta una operación y devuelve 'ok' o el código de error de Firestore. */
async function intentar (fn) {
  try {
    await fn()
    return 'ok'
  } catch (err) {
    const code = (err?.code || '').toString()
    return code.includes('permission-denied') ? 'denegado' : `error:${code || err?.message}`
  }
}

async function nuevoUsuario (nombre) {
  const app = initializeApp({ apiKey: 'demo', projectId: PROJECT }, nombre)
  const auth = getAuth(app)
  connectAuthEmulator(auth, `http://127.0.0.1:${AUTH_PORT}`, { disableWarnings: true })
  const db = getFirestore(app)
  connectFirestoreEmulator(db, '127.0.0.1', FS_PORT)
  const cred = await signInAnonymously(auth)
  return { app, db, uid: cred.user.uid }
}

const INVITE = 'ABC123'

async function main () {
  const A = await nuevoUsuario('userA')
  const B = await nuevoUsuario('userB')
  const C = await nuevoUsuario('userC')

  const groupId = doc(collection(A.db, 'friend_groups')).id

  console.log('\nCrear un grupo (dueño A)')
  check('A crea el grupo con su ficha de miembro', await intentar(async () => {
    const batch = writeBatch(A.db)
    batch.set(doc(A.db, 'friend_groups', groupId), {
      name: 'Grupo de prueba', ownerUid: A.uid, inviteCode: INVITE, createdAt: serverTimestamp()
    })
    batch.set(doc(A.db, 'friend_groups', groupId, 'members', A.uid), {
      uid: A.uid, displayName: 'Ana', role: 'owner', joinedAt: serverTimestamp()
    })
    batch.set(doc(A.db, 'users', A.uid), { uid: A.uid, groupIds: [groupId] }, { merge: true })
    await batch.commit()
  }), 'ok')

  check('un impostor no puede crear un grupo a nombre de otro', await intentar(async () => {
    await setDoc(doc(B.db, 'friend_groups', 'usurpado'), { name: 'x', ownerUid: A.uid, inviteCode: 'ZZZ999' })
  }), 'denegado')

  console.log('\nEntrar con el código de invitación (B)')
  let encontrado = null
  check('B busca el grupo por código', await intentar(async () => {
    const snap = await getDocs(query(
      collection(B.db, 'friend_groups'), where('inviteCode', '==', INVITE), limit(1)
    ))
    encontrado = snap.empty ? null : snap.docs[0].id
  }), 'ok')
  check('y lo encuentra', encontrado, groupId)

  check('B se apunta como miembro', await intentar(async () => {
    await setDoc(doc(B.db, 'friend_groups', groupId, 'members', B.uid), {
      uid: B.uid, displayName: 'Berta', role: 'member', joinedAt: serverTimestamp()
    }, { merge: true })
  }), 'ok')
  check('B abre el grupo', await intentar(() => getDoc(doc(B.db, 'friend_groups', groupId))), 'ok')

  console.log('\nListar los miembros del grupo')
  let cuantos = -1
  check('B, que es miembro, lista a los demás', await intentar(async () => {
    const snap = await getDocs(collection(B.db, 'friend_groups', groupId, 'members'))
    cuantos = snap.size
  }), 'ok')
  check('y salen los dos que hay', cuantos, 2)
  check('C, que no es miembro, no puede listarlos', await intentar(async () => {
    await getDocs(collection(C.db, 'friend_groups', groupId, 'members'))
  }), 'denegado')

  // La vista convierte `joinedAt` con toDate(): si Firestore dejara de
  // devolver un Timestamp, la fecha de alta saldría vacía sin avisar.
  let formaOk = false
  let dueñoPrimero = false
  check('las fichas traen rol y fecha utilizables', await intentar(async () => {
    const snap = await getDocs(collection(B.db, 'friend_groups', groupId, 'members'))
    const fichas = snap.docs.map(d => ({ uid: d.id, ...d.data() }))
    const dueño = fichas.find(f => f.uid === A.uid)
    formaOk = typeof dueño.joinedAt?.toDate === 'function'
      && !Number.isNaN(dueño.joinedAt.toDate().getTime())
    fichas.sort((a, b) => ((a.role === 'owner') !== (b.role === 'owner'))
      ? (a.role === 'owner' ? -1 : 1)
      : (a.displayName || a.uid).localeCompare(b.displayName || b.uid, 'es'))
    dueñoPrimero = fichas[0].uid === A.uid
  }), 'ok')
  check('joinedAt es un Timestamp convertible a fecha', formaOk, true)
  check('el dueño encabeza la lista', dueñoPrimero, true)

  console.log('\nEl fallo reportado: abrir el grupo sin ficha de miembro (C)')
  check('C abre el grupo (antes: permission-denied)',
    await intentar(() => getDoc(doc(C.db, 'friend_groups', groupId))), 'ok')
  check('pero el ranking sigue cerrado sin pertenecer',
    await intentar(() => getDoc(doc(C.db, 'friend_groups', groupId, 'weekly_results', '2026-09-06'))), 'denegado')

  console.log('\nReparar acceso: rehacer la ficha de miembro')
  check('C rehace su ficha', await intentar(async () => {
    await setDoc(doc(C.db, 'friend_groups', groupId, 'members', C.uid), {
      uid: C.uid, displayName: 'Carlos', updatedAt: serverTimestamp()
    }, { merge: true })
  }), 'ok')
  check('y ya puede leer el ranking',
    await intentar(() => getDoc(doc(C.db, 'friend_groups', groupId, 'weekly_results', '2026-09-06'))), 'ok')

  console.log('\nSalir del grupo')
  check('C borra su propia ficha', await intentar(async () => {
    await deleteDoc(doc(C.db, 'friend_groups', groupId, 'members', C.uid))
  }), 'ok')
  check('y vuelve a quedarse sin ranking',
    await intentar(() => getDoc(doc(C.db, 'friend_groups', groupId, 'weekly_results', '2026-09-06'))), 'denegado')

  console.log('\nLo que sigue estando prohibido')
  check('C no puede escribir la ficha de B', await intentar(async () => {
    await setDoc(doc(C.db, 'friend_groups', groupId, 'members', B.uid), { displayName: 'suplantado' }, { merge: true })
  }), 'denegado')
  check('C no puede renombrar el grupo ajeno', await intentar(async () => {
    await setDoc(doc(C.db, 'friend_groups', groupId), { name: 'secuestrado' }, { merge: true })
  }), 'denegado')
  check('nadie publica resultados desde el cliente', await intentar(async () => {
    await setDoc(doc(C.db, 'friend_groups', groupId, 'weekly_results', '2026-09-06'), { weekKey: '2026-09-06' })
  }), 'denegado')
  check('B no lee el documento privado de A',
    await intentar(() => getDoc(doc(B.db, 'users', A.uid))), 'denegado')
  check('A sí escribe sus propias escuchas', await intentar(async () => {
    await setDoc(doc(A.db, 'users', A.uid, 'listening_events', 'ev1'), { track: 'x' })
  }), 'ok')
  check('B no escribe escuchas en la cuenta de A', await intentar(async () => {
    await setDoc(doc(B.db, 'users', A.uid, 'listening_events', 'ev2'), { track: 'y' })
  }), 'denegado')

  for (const u of [A, B, C]) await deleteApp(u.app)

  console.log(`\nReglas de Firestore: ${total} comprobaciones, ${fallos ? `${fallos} FALLIDAS` : 'todo correcto'}.`)
  process.exit(fallos ? 1 : 0)
}

main().catch((err) => {
  console.error('La simulación no pudo completarse:', err)
  process.exit(2)
})
