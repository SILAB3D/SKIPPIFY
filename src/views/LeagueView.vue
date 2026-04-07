<template>
  <div class="space-y-4">
    <article class="rounded-2xl border border-slate-700/70 bg-slate-900/95 p-5">
      <div class="flex flex-wrap items-center justify-between gap-2">
        <h3 class="text-sm font-semibold text-slate-100">Acceso al grupo</h3>
        <span class="text-[11px] text-slate-500">Auto-sync cada 30 min</span>
      </div>
      <p class="text-xs text-slate-400 mt-1">Configuracion rapida para crear o unirte con codigo.</p>

      <div class="grid grid-cols-1 md:grid-cols-2 gap-2 mt-3">
        <input
          v-model.trim="displayName"
          class="rounded-lg border border-slate-700 bg-slate-800 px-3 py-2 text-sm text-slate-100"
          placeholder="Nombre de usuario (min. 3 caracteres)"
        >
        <input
          v-model.trim="inviteCodeInput"
          class="rounded-lg border border-slate-700 bg-slate-800 px-3 py-2 text-sm text-slate-100"
          placeholder="Codigo (6 caracteres)"
        >
      </div>

      <div class="grid grid-cols-1 sm:grid-cols-2 gap-2 mt-2">
        <button
          class="rounded-lg text-xs px-4 py-2 transition-colors font-medium whitespace-nowrap border border-cyan-500/35 bg-cyan-500/15 text-cyan-200 hover:bg-cyan-500/25 disabled:opacity-50"
          :disabled="!enabled || !canUseUsername"
          @click="handleCreateGroup"
        >
          Crear grupo
        </button>
        <button
          class="rounded-lg text-xs px-4 py-2 transition-colors font-medium whitespace-nowrap border border-sky-500/35 bg-sky-500/15 text-sky-200 hover:bg-sky-500/25 disabled:opacity-50"
          :disabled="!enabled || !canJoin"
          @click="handleJoinGroup"
        >
          Unirme
        </button>
      </div>

      <p class="text-[11px] text-slate-500 mt-2">Actualmente se usa un grupo activo por cuenta.</p>

      <p v-if="!enabled" class="text-xs text-amber-300 mt-3">Firebase no configurado: define VITE_FIREBASE_* para activar la liga.</p>
      <p v-if="authLoading" class="text-xs text-sky-300 mt-3">Conectando con Firebase...</p>
      <p v-if="message" class="text-xs text-emerald-300 mt-3">{{ message }}</p>
      <p v-if="error" class="text-xs text-rose-300 mt-3">{{ error }}</p>
    </article>

    <article v-if="hasGroup" class="rounded-2xl border border-emerald-500/25 bg-slate-900/95 p-5">
      <div class="flex flex-wrap items-start justify-between gap-2">
        <div>
          <h3 class="text-base font-semibold text-emerald-200">{{ groupTitle }}</h3>
          <p class="text-xs text-slate-400 mt-1">Proxima publicacion: {{ nextPublishLabel }}</p>
          <p class="text-xs text-slate-500 mt-0.5">Cuenta atras: {{ nextPublishCountdown }}</p>
        </div>
        <button
          class="rounded-md border border-slate-600 bg-slate-700/70 px-2 py-1 text-[11px] text-slate-200 hover:bg-slate-700 disabled:opacity-50"
          :disabled="!leagueState.inviteCode"
          @click="copyInviteCode"
        >
          Copiar codigo
        </button>
      </div>

      <p class="text-xs text-slate-400 mt-3">Resultados semanales</p>

      <div v-if="!weeklyMembers.length" class="text-xs text-slate-500 mt-3">Todavia no hay ranking semanal publicado para tu grupo.</div>

      <ul v-else class="mt-4 space-y-2">
        <li
          v-for="(item, idx) in weeklyMembers"
          :key="`${item.uid}-${idx}`"
          class="rounded-xl border border-slate-700 bg-slate-800/60 px-3 py-2 flex items-center justify-between gap-2"
        >
          <div class="min-w-0">
            <p class="text-sm text-slate-100 truncate">{{ rankLabel(idx) }} {{ item.displayName || item.uid }}</p>
            <p class="text-xs text-slate-400 mt-0.5">
              {{ formatHours(item.totalMinutes) }} · {{ getTrackCount(item) }} canciones · Top artista: {{ getTopArtist(item) }} · Top cancion: {{ getTopTrack(item) }}
            </p>
          </div>
          <span class="text-sm font-semibold text-emerald-300">{{ (item.score || 0).toFixed(1) }}</span>
        </li>
      </ul>
    </article>

    <p class="text-[11px] text-slate-500 px-1">
      Usuario: {{ leagueState.displayName || 'sin nombre' }} · ID: {{ shortUid }}
    </p>
  </div>
</template>

<script setup>
import { computed, onBeforeUnmount, onMounted, ref } from 'vue'
import { useLeague } from '@/composables/useLeague'

const {
  enabled,
  state,
  authLoading,
  syncing,
  loadingLeaderboard,
  weeklyMembers,
  error,
  message,
  nextPublishLabel,
  ensureAuth,
  createGroup,
  joinGroup,
  syncLocalEvents,
  loadLeaderboard,
  loadCurrentGroupInfo
} = useLeague()

const displayName = ref('')
const inviteCodeInput = ref('')

const leagueState = computed(() => state.value)
const hasGroup = computed(() => !!leagueState.value.groupId)
const canUseUsername = computed(() => (displayName.value || '').trim().length >= 3)
const shortUid = computed(() => {
  const uid = (leagueState.value.uid || '').toString()
  return uid ? `${uid.slice(0, 6)}...${uid.slice(-4)}` : 'no conectado'
})
const groupTitle = computed(() => {
  const code = (leagueState.value.inviteCode || '').toString().trim().toUpperCase()
  if (code) return code
  const fallback = (leagueState.value.groupId || '').toString()
  return fallback ? `Grupo ${fallback.slice(0, 8)}` : 'Grupo activo'
})
const nextPublishCountdown = ref('calculando...')

const AUTO_SYNC_MS = 30 * 60 * 1000
let autoSyncTimer = null
let countdownTimer = null

function normalizeInviteCode (value) {
  return (value || '').toString().trim().toUpperCase().replace(/\s+/g, '')
}

const canJoin = computed(() => canUseUsername.value && normalizeInviteCode(inviteCodeInput.value).length >= 6)

function formatMinutes (value) {
  const n = Number(value || 0)
  if (!Number.isFinite(n)) return '0'
  return n.toFixed(1)
}

function formatHours (minutesValue) {
  const totalMinutes = Math.max(0, Math.round(Number(minutesValue || 0)))
  const hours = Math.floor(totalMinutes / 60)
  const minutes = totalMinutes % 60
  return `${hours}h ${minutes.toString().padStart(2, '0')}m`
}

function rankLabel (idx) {
  if (idx === 0) return '🥇'
  if (idx === 1) return '🥈'
  if (idx === 2) return '🥉'
  return `#${idx + 1}`
}

function getTrackCount (item) {
  const totalTracks = Number(item?.totalTracks)
  if (Number.isFinite(totalTracks) && totalTracks >= 0) return totalTracks
  const completed = Number(item?.completedTracks)
  if (Number.isFinite(completed) && completed >= 0) return completed
  return 0
}

function getTopArtist (item) {
  return (item?.topArtist || '').toString().trim() || 'N/A'
}

function getTopTrack (item) {
  return (item?.topTrack || '').toString().trim() || 'N/A'
}

async function handleCreateGroup () {
  const groupId = await createGroup({ displayName: displayName.value })
  if (!groupId) return
  await loadCurrentGroupInfo()
  await refreshLeagueData()
}

async function handleJoinGroup () {
  const groupId = await joinGroup({ inviteCode: normalizeInviteCode(inviteCodeInput.value), displayName: displayName.value })
  if (!groupId) return
  await loadCurrentGroupInfo()
  await refreshLeagueData()
}

async function refreshLeagueData () {
  if (!enabled.value || !hasGroup.value) return
  await syncLocalEvents({ silent: true })
  await loadLeaderboard({ silent: true })
}

async function copyInviteCode () {
  const code = (leagueState.value.inviteCode || '').toString()
  if (!code) return
  try {
    await navigator.clipboard.writeText(code)
  } catch {
    // Clipboard API may fail outside secure contexts.
  }
}

function nextSunday1500Date () {
  const nowMadrid = new Date(new Date().toLocaleString('en-US', { timeZone: 'Europe/Madrid' }))
  const day = nowMadrid.getDay()
  const daysUntilSunday = (7 - day) % 7
  const target = new Date(nowMadrid)
  target.setDate(nowMadrid.getDate() + daysUntilSunday)
  target.setHours(15, 0, 0, 0)
  if (target <= nowMadrid) target.setDate(target.getDate() + 7)
  return target
}

function updateCountdown () {
  const now = new Date(new Date().toLocaleString('en-US', { timeZone: 'Europe/Madrid' }))
  const target = nextSunday1500Date()
  const diff = target.getTime() - now.getTime()
  if (diff <= 0) {
    nextPublishCountdown.value = 'publicando resultados...'
    return
  }

  const totalMinutes = Math.floor(diff / 60000)
  const days = Math.floor(totalMinutes / (60 * 24))
  const hours = Math.floor((totalMinutes % (60 * 24)) / 60)
  const minutes = totalMinutes % 60
  nextPublishCountdown.value = `${days}d ${hours}h ${minutes}m`
}

async function runAutoSync () {
  await refreshLeagueData()
}

onMounted(async () => {
  await ensureAuth()
  updateCountdown()

  countdownTimer = setInterval(() => {
    updateCountdown()
  }, 30000)

  autoSyncTimer = setInterval(() => {
    runAutoSync()
  }, AUTO_SYNC_MS)

  if (leagueState.value.groupId) {
    await loadCurrentGroupInfo()
    await refreshLeagueData()
  }
})

onBeforeUnmount(() => {
  if (countdownTimer) {
    clearInterval(countdownTimer)
    countdownTimer = null
  }
  if (autoSyncTimer) {
    clearInterval(autoSyncTimer)
    autoSyncTimer = null
  }
})
</script>
