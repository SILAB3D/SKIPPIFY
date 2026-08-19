<template>
  <div class="sk-stagger space-y-4">
    <!-- ── Estado del servicio ───────────────────────────────────────────── -->
    <div v-if="!enabled" class="sk-card border-amber-500/25 p-5">
      <p class="text-sm font-semibold text-amber-200">Friendly-Wrapped no está configurado</p>
      <p class="mt-1 text-xs text-amber-200/70">
        Define las variables <span class="font-mono">VITE_FIREBASE_*</span> para poder crear grupos
        y compartir tu resumen semanal.
      </p>
    </div>

    <!-- ── Mis grupos ────────────────────────────────────────────────────── -->
    <section v-if="groups.length" class="sk-card p-5">
      <header class="flex flex-wrap items-center justify-between gap-2">
        <h2 class="sk-title">Mis grupos</h2>
        <span class="sk-chip">{{ groups.length }} / {{ MAX_GROUPS }}</span>
      </header>
      <p class="sk-subtitle">Puedes pertenecer a varios a la vez. Elige cuál quieres ver.</p>

      <div class="mt-3.5 flex flex-wrap gap-2">
        <button
          v-for="group in groups"
          :key="group.groupId"
          type="button"
          class="flex items-center gap-2 rounded-xl border px-3 py-2 text-left transition-colors"
          :class="group.groupId === activeGroupId
            ? 'border-brand-400/45 bg-brand-500/12 text-brand-100'
            : 'border-white/[0.07] bg-white/[0.02] text-slate-300 hover:border-white/[0.16]'"
          @click="onSelectGroup(group.groupId)"
        >
          <span class="text-sm font-medium">{{ groupLabel(group) }}</span>
          <span class="font-mono text-[10px] text-slate-500">{{ group.inviteCode || '······' }}</span>
        </button>
      </div>
    </section>

    <!-- ── Grupo activo ──────────────────────────────────────────────────── -->
    <section v-if="activeGroup" class="sk-card border-brand-500/25 p-5">
      <header class="flex flex-wrap items-start justify-between gap-3">
        <div class="min-w-0">
          <h2 class="truncate text-base font-semibold text-brand-200">{{ groupLabel(activeGroup) }}</h2>
          <p class="mt-1 text-xs text-slate-400">Próxima publicación: {{ nextPublishLabel }}</p>
          <p class="mt-0.5 text-xs text-slate-500">Cuenta atrás: {{ nextPublishCountdown }}</p>
        </div>

        <div class="flex flex-wrap gap-2">
          <button
            class="sk-btn sk-btn-ghost sk-btn-sm"
            :disabled="!activeGroup.inviteCode"
            @click="copyInviteCode"
          >
            {{ copied ? '¡Copiado!' : 'Copiar código' }}
          </button>
          <button class="sk-btn sk-btn-ghost sk-btn-sm" :disabled="syncing || loadingLeaderboard" @click="onRefresh">
            {{ syncing || loadingLeaderboard ? 'Actualizando…' : 'Actualizar' }}
          </button>
          <button class="sk-btn sk-btn-danger sk-btn-sm" @click="onLeave(activeGroup)">
            {{ confirmLeaveId === activeGroup.groupId ? '¿Seguro? Pulsa otra vez' : 'Salir del grupo' }}
          </button>
        </div>
      </header>

      <div class="sk-divider my-4" />

      <div class="flex flex-wrap items-center justify-between gap-2">
        <h3 class="text-sm font-semibold text-slate-100">Resultados semanales</h3>
        <span v-if="weekLabel" class="sk-chip">{{ weekLabel }}</span>
      </div>

      <p v-if="!weeklyMembers.length" class="mt-3 text-xs text-slate-500">
        Todavía no hay ranking publicado para este grupo. Se publica cada domingo a las 15:00.
      </p>

      <ul v-else class="mt-3.5 space-y-2">
        <li
          v-for="(item, idx) in weeklyMembers"
          :key="`${item.uid}-${idx}`"
          class="flex items-center justify-between gap-3 rounded-xl border px-3 py-2.5"
          :class="item.uid === state.uid
            ? 'border-brand-400/35 bg-brand-500/[0.08]'
            : 'border-white/[0.07] bg-white/[0.03]'"
        >
          <div class="min-w-0">
            <p class="truncate text-sm text-slate-100">
              {{ rankLabel(idx) }} {{ item.displayName || shortenUid(item.uid) }}
              <span v-if="item.uid === state.uid" class="ml-1 text-[10px] uppercase tracking-wider text-brand-300">tú</span>
            </p>
            <p class="mt-0.5 text-[11px] text-slate-400">
              {{ formatHours(item.totalMinutes) }} · {{ getTrackCount(item) }} canciones
            </p>
            <p class="mt-0.5 text-[11px] text-slate-500">
              🎤 {{ getTopArtist(item) }} · 🎵 {{ getTopTrack(item) }}
            </p>
          </div>
          <span class="shrink-0 font-mono text-sm font-semibold text-brand-300">{{ formatScore(item.score) }}</span>
        </li>
      </ul>
    </section>

    <!-- ── Crear o unirse ────────────────────────────────────────────────── -->
    <section class="sk-card p-5">
      <header class="flex flex-wrap items-center justify-between gap-2">
        <h2 class="sk-title">{{ groups.length ? 'Entrar en otro grupo' : 'Empieza tu Friendly-Wrapped' }}</h2>
        <span class="text-[11px] text-slate-500">Auto-sync cada 30 min</span>
      </header>
      <p class="sk-subtitle">
        Crea un grupo y comparte su código, o introduce el código de 6 caracteres que te hayan pasado.
      </p>

      <label class="mt-3.5 block">
        <span class="sk-eyebrow">Tu nombre en los rankings</span>
        <input
          v-model.trim="displayName"
          class="sk-input mt-1.5"
          maxlength="24"
          placeholder="Nombre de usuario (mín. 3 caracteres)"
        >
      </label>

      <div class="mt-4 grid gap-4 md:grid-cols-2">
        <div class="rounded-xl border border-white/[0.06] bg-white/[0.02] p-4">
          <p class="text-sm font-semibold text-slate-100">Crear grupo</p>
          <p class="mt-1 text-[11px] leading-relaxed text-slate-400">
            Serás el propietario y recibirás un código para invitar a tus amigos.
          </p>
          <input
            v-model.trim="groupNameInput"
            class="sk-input mt-3"
            maxlength="32"
            placeholder="Nombre del grupo (opcional)"
          >
          <button
            class="sk-btn sk-btn-primary sk-btn-sm mt-3 w-full"
            :disabled="!enabled || !canUseUsername || busy"
            @click="handleCreateGroup"
          >
            Crear grupo
          </button>
        </div>

        <div class="rounded-xl border border-white/[0.06] bg-white/[0.02] p-4">
          <p class="text-sm font-semibold text-slate-100">Unirme con código</p>
          <p class="mt-1 text-[11px] leading-relaxed text-slate-400">
            Introduce el código que te haya pasado quien creó el grupo.
          </p>
          <input
            v-model.trim="inviteCodeInput"
            class="sk-input mt-3 font-mono uppercase tracking-widest"
            maxlength="6"
            placeholder="ABC123"
          >
          <button
            class="sk-btn sk-btn-primary sk-btn-sm mt-3 w-full"
            :disabled="!enabled || !canJoin || busy"
            @click="handleJoinGroup"
          >
            Unirme
          </button>
        </div>
      </div>

      <p v-if="authLoading" class="mt-3 text-xs text-sky-300">Conectando con Firebase…</p>
      <p v-if="message" class="mt-3 text-xs text-brand-300">{{ message }}</p>
      <p v-if="error" class="mt-3 text-xs text-rose-300">{{ error }}</p>
    </section>

    <p class="px-1 text-[11px] text-slate-500">
      Usuario: {{ state.displayName || 'sin nombre' }} · ID: {{ shortUid }}
      <template v-if="state.lastSyncAt"> · última sincronización: {{ lastSyncLabel }}</template>
    </p>
  </div>
</template>

<script setup>
/**
 * Friendly-Wrapped — resumen de escucha compartido con grupos de amigos.
 *
 * Sustituye a la antigua «Liga». Además del nombre cambia el modelo: se puede
 * pertenecer a varios grupos y salirse de cualquiera de ellos, y el ranking se
 * lee de la última publicación real del grupo (antes se buscaba un documento
 * `current` que la función programada nunca escribía, así que salía vacío).
 */
import { computed, onBeforeUnmount, onMounted, ref } from 'vue'
import { useLeague, normalizeInviteCode } from '@/composables/useLeague'

const {
  enabled,
  MAX_GROUPS,
  state,
  groups,
  activeGroup,
  activeGroupId,
  activeLeaderboard,
  weeklyMembers,
  authLoading,
  syncing,
  loadingLeaderboard,
  error,
  message,
  nextPublishLabel,
  ensureAuth,
  createGroup,
  joinGroup,
  leaveGroup,
  setActiveGroup,
  loadLeaderboard,
  loadCurrentGroupInfo,
  refreshAll
} = useLeague()

const displayName = ref(state.value.displayName || '')
const groupNameInput = ref('')
const inviteCodeInput = ref('')
const nextPublishCountdown = ref('calculando…')
const confirmLeaveId = ref('')
const copied = ref(false)

const AUTO_SYNC_MS = 30 * 60 * 1000
let autoSyncTimer = null
let countdownTimer = null
let confirmTimer = null
let copiedTimer = null

const busy = computed(() => syncing.value || loadingLeaderboard.value || authLoading.value)
const canUseUsername = computed(() => (displayName.value || '').trim().length >= 3)
const canJoin = computed(() => canUseUsername.value && normalizeInviteCode(inviteCodeInput.value).length === 6)

const shortUid = computed(() => shortenUid(state.value.uid))

const weekLabel = computed(() => {
  const key = (activeLeaderboard.value?.weekKey || '').toString()
  if (!key) return ''
  const d = new Date(`${key}T00:00:00`)
  return Number.isNaN(d.getTime())
    ? `Semana ${key}`
    : `Semana del ${d.toLocaleDateString('es-ES', { day: '2-digit', month: 'short' })}`
})

const lastSyncLabel = computed(() => {
  const d = new Date(state.value.lastSyncAt || 0)
  return Number.isNaN(d.getTime()) ? '—' : d.toLocaleString('es-ES')
})

function shortenUid (value) {
  const uid = (value || '').toString()
  return uid ? `${uid.slice(0, 6)}…${uid.slice(-4)}` : 'no conectado'
}

function groupLabel (group) {
  if (!group) return 'Grupo'
  return group.name || (group.inviteCode ? `Grupo ${group.inviteCode}` : `Grupo ${group.groupId.slice(0, 6)}`)
}

function formatHours (minutesValue) {
  const totalMinutes = Math.max(0, Math.round(Number(minutesValue || 0)))
  const hours = Math.floor(totalMinutes / 60)
  const minutes = totalMinutes % 60
  return `${hours}h ${minutes.toString().padStart(2, '0')}m`
}

function formatScore (value) {
  const n = Number(value || 0)
  return Number.isFinite(n) ? n.toFixed(1) : '0.0'
}

function rankLabel (idx) {
  if (idx === 0) return '🥇'
  if (idx === 1) return '🥈'
  if (idx === 2) return '🥉'
  return `#${idx + 1}`
}

function getTrackCount (item) {
  for (const value of [item?.totalTracks, item?.completedTracks]) {
    const n = Number(value)
    if (Number.isFinite(n) && n >= 0) return n
  }
  return 0
}

function getTopArtist (item) {
  return (item?.topArtist || '').toString().trim() || 'sin datos'
}

function getTopTrack (item) {
  return (item?.topTrack || '').toString().trim() || 'sin datos'
}

async function handleCreateGroup () {
  const groupId = await createGroup({
    displayName: displayName.value,
    groupName: groupNameInput.value
  })
  if (!groupId) return
  groupNameInput.value = ''
  await loadCurrentGroupInfo(groupId)
  await loadLeaderboard({ silent: true, groupId })
}

async function handleJoinGroup () {
  const groupId = await joinGroup({
    inviteCode: inviteCodeInput.value,
    displayName: displayName.value
  })
  if (!groupId) return
  inviteCodeInput.value = ''
  await loadCurrentGroupInfo(groupId)
  await loadLeaderboard({ silent: true, groupId })
}

async function onSelectGroup (groupId) {
  setActiveGroup(groupId)
  await loadLeaderboard({ silent: true, groupId })
}

/** Salir es irreversible sin el código: se pide una segunda pulsación. */
async function onLeave (group) {
  if (confirmLeaveId.value !== group.groupId) {
    confirmLeaveId.value = group.groupId
    if (confirmTimer) clearTimeout(confirmTimer)
    confirmTimer = setTimeout(() => { confirmLeaveId.value = '' }, 4000)
    return
  }
  confirmLeaveId.value = ''
  const left = await leaveGroup(group.groupId)
  if (left && activeGroupId.value) {
    await loadLeaderboard({ silent: true, groupId: activeGroupId.value })
  }
}

async function onRefresh () {
  await refreshAll({ silent: false })
}

async function copyInviteCode () {
  const code = (activeGroup.value?.inviteCode || '').toString()
  if (!code) return
  try {
    await navigator.clipboard.writeText(code)
    copied.value = true
    if (copiedTimer) clearTimeout(copiedTimer)
    copiedTimer = setTimeout(() => { copied.value = false }, 2000)
  } catch {
    // La Clipboard API no existe fuera de contextos seguros.
    error.value = `No se pudo copiar. El código es ${code}.`
  }
}

/** Próximo domingo a las 15:00 en Europe/Madrid. */
function nextSunday1500Date () {
  const nowMadrid = new Date(new Date().toLocaleString('en-US', { timeZone: 'Europe/Madrid' }))
  const target = new Date(nowMadrid)
  target.setDate(nowMadrid.getDate() + ((7 - nowMadrid.getDay()) % 7))
  target.setHours(15, 0, 0, 0)
  if (target <= nowMadrid) target.setDate(target.getDate() + 7)
  return { now: nowMadrid, target }
}

function updateCountdown () {
  const { now, target } = nextSunday1500Date()
  const diff = target.getTime() - now.getTime()
  if (diff <= 0) {
    nextPublishCountdown.value = 'publicando resultados…'
    return
  }

  const totalMinutes = Math.floor(diff / 60000)
  const days = Math.floor(totalMinutes / (60 * 24))
  const hours = Math.floor((totalMinutes % (60 * 24)) / 60)
  const minutes = totalMinutes % 60
  nextPublishCountdown.value = `${days}d ${hours}h ${minutes}m`
}

onMounted(async () => {
  updateCountdown()
  countdownTimer = setInterval(updateCountdown, 30000)
  autoSyncTimer = setInterval(() => { refreshAll({ silent: true }) }, AUTO_SYNC_MS)

  await ensureAuth()
  if (!displayName.value) displayName.value = state.value.displayName || ''
  if (groups.value.length) await refreshAll({ silent: true })
})

onBeforeUnmount(() => {
  if (countdownTimer) clearInterval(countdownTimer)
  if (autoSyncTimer) clearInterval(autoSyncTimer)
  if (confirmTimer) clearTimeout(confirmTimer)
  if (copiedTimer) clearTimeout(copiedTimer)
  countdownTimer = null
  autoSyncTimer = null
  confirmTimer = null
  copiedTimer = null
})
</script>
