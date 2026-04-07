import { initializeApp, getApps } from 'firebase/app'
import { getAuth } from 'firebase/auth'
import { getFirestore } from 'firebase/firestore'

function readEnv (name) {
  const raw = import.meta.env[name]
  if (typeof raw !== 'string') return ''
  return raw.trim().replace(/^['"]|['"]$/g, '')
}

const firebaseConfig = {
  apiKey: readEnv('VITE_FIREBASE_API_KEY'),
  authDomain: readEnv('VITE_FIREBASE_AUTH_DOMAIN'),
  projectId: readEnv('VITE_FIREBASE_PROJECT_ID'),
  storageBucket: readEnv('VITE_FIREBASE_STORAGE_BUCKET'),
  messagingSenderId: readEnv('VITE_FIREBASE_MESSAGING_SENDER_ID'),
  appId: readEnv('VITE_FIREBASE_APP_ID')
}

const requiredKeys = ['apiKey', 'authDomain', 'projectId', 'appId']
const enabled = requiredKeys.every(key => !!firebaseConfig[key])

let app = null
let auth = null
let db = null

if (enabled) {
  app = getApps().length ? getApps()[0] : initializeApp(firebaseConfig)
  auth = getAuth(app)
  db = getFirestore(app)
}

export function getFirebaseContext () {
  return {
    enabled,
    app,
    auth,
    db
  }
}

export function getFirebaseDiagnostics () {
  const key = firebaseConfig.apiKey || ''
  return {
    enabled,
    projectId: firebaseConfig.projectId,
    authDomain: firebaseConfig.authDomain,
    apiKeyShape: {
      present: !!key,
      startsWithAIza: key.startsWith('AIza'),
      length: key.length
    }
  }
}
