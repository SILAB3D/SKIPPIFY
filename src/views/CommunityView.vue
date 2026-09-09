<template>
  <div class="sk-stagger space-y-4">
    <!-- ── Estado del servicio ───────────────────────────────────────────── -->
    <div v-if="!enabled" class="sk-card border-amber-500/25 p-5">
      <p class="text-sm font-semibold text-amber-200">La comunidad no está configurada</p>
      <p class="mt-1 text-xs text-amber-200/70">
        Define las variables <span class="font-mono">VITE_FIREBASE_*</span> para poder crear grupos
        y compartir tu resumen semanal.
      </p>
    </div>

    <!-- ══ Resultados del grupo ══════════════════════════════════════════════
         Van primero porque son lo que se viene a mirar; crear o unirse es algo
         que se hace una vez. Si no perteneces a ningún grupo, este bloque
         entero desaparece y la pantalla se queda en las dos opciones. -->
    <template v-if="activeGroup">
      <section v-if="groups.length > 1" class="sk-card p-5">
        <header class="flex flex-wrap items-center justify-between gap-2">
          <h2 class="sk-title">Tus grupos</h2>
          <span class="sk-chip">{{ groups.length }} / {{ MAX_GROUPS }}</span>
        </header>
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

      <section class="sk-card sk-card-lit border-brand-500/25 p-5">
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
            <button
              v-if="accesoRechazado"
              class="sk-btn sk-btn-sm border-amber-400/40 bg-amber-500/15 text-amber-100 hover:bg-amber-500/25"
              :disabled="reparando"
              @click="onRepair"
            >
              {{ reparando ? 'Reparando…' : 'Reparar acceso' }}
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
    </template>

    <!-- ══ Crear grupo · Unirme a grupo ═════════════════════════════════════ -->
    <section class="sk-card p-5">
      <header class="flex flex-wrap items-baseline justify-between gap-2">
        <h2 class="sk-title">{{ groups.length ? 'Entrar en otro grupo' : 'Empieza aquí' }}</h2>
        <span class="text-[11px] text-slate-500">Se sincroniza cada 30 min</span>
      </header>
      <p class="sk-subtitle">
        Crea un grupo y comparte su código, o entra en uno con el código de 6 caracteres
        que te hayan pasado.
      </p>

      <div class="mt-4 grid grid-cols-2 gap-2.5">
        <button
          v-for="opcion in opciones"
          :key="opcion.id"
          type="button"
          class="relative overflow-hidden rounded-xl border p-4 text-left transition-all duration-200"
          :class="accion === opcion.id
            ? 'border-brand-400/45 bg-brand-500/[0.07]'
            : 'border-white/[0.06] bg-white/[0.02] hover:border-white/[0.16] hover:bg-white/[0.05]'"
          @click="accion = accion === opcion.id ? '' : opcion.id"
        >
          <div
            v-if="accion === opcion.id"
            class="pointer-events-none absolute inset-0 bg-gradient-to-br from-brand-500/10 to-transparent"
          />
          <div class="relative">
            <span
              class="flex h-10 w-10 items-center justify-center rounded-xl border text-lg transition-colors"
              :class="accion === opcion.id
                ? 'border-brand-400/35 bg-brand-500/15'
                : 'border-white/[0.07] bg-white/[0.03]'"
            >{{ opcion.icon }}</span>
            <p class="mt-2.5 text-sm font-semibold" :class="accion === opcion.id ? 'text-brand-100' : 'text-white'">
              {{ opcion.title }}
            </p>
            <p class="mt-1 text-[11px] leading-relaxed text-slate-400">{{ opcion.description }}</p>
          </div>
        </button>
      </div>

      <Transition name="desplegar">
        <div v-if="accion" class="mt-4 border-t border-white/[0.06] pt-4">
          <label class="block">
            <span class="sk-eyebrow">Tu nombre en los rankings</span>
            <input
              v-model.trim="displayName"
              class="sk-input mt-1.5"
              maxlength="24"
              placeholder="Nombre de usuario (mín. 3 caracteres)"
            >
          </label>

          <template v-if="accion === 'crear'">
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
            <p class="mt-2 text-[11px] text-slate-500">
              Serás el propietario y recibirás un código para invitar a tus amigos.
            </p>
          </template>

          <template v-else>
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
              Unirme al grupo
            </button>
            <p class="mt-2 text-[11px] text-slate-500">
              El código lo genera quien crea el grupo; son 6 caracteres.
            </p>
          </template>
        </div>
      </Transition>

      <p v-if="authLoading" class="mt-3 text-xs text-sky-300">Conectando con Firebase…</p>
      <p v-if="message" class="mt-3 text-xs text-brand-300">{{ message }}</p>

      <div v-if="error" class="mt-3 rounded-xl border border-rose-500/30 bg-rose-500/[0.07] px-3.5 py-3">
        <p class="text-xs text-rose-300">{{ error }}</p>

        <div v-if="accesoRechazado" class="mt-2.5 flex flex-wrap items-center gap-2">
          <button
            class="sk-btn sk-btn-sm border-amber-400/40 bg-amber-500/15 text-amber-100 hover:bg-amber-500/25"
            :disabled="reparando || !activeGroupId"
            @click="onRepair"
          >
            {{ reparando ? 'Reparando…' : 'Reparar acceso' }}
          </button>
          <button class="sk-btn sk-btn-ghost sk-btn-sm" @click="verDiagnostico = !verDiagnostico">
            {{ verDiagnostico ? 'Ocultar detalles' : 'Ver detalles técnicos' }}
          </button>
        </div>

        <dl v-if="verDiagnostico" class="mt-2.5 grid grid-cols-2 gap-x-3 gap-y-1 font-mono text-[10px] text-slate-400">
          <dt class="text-slate-500">projectId</dt><dd class="truncate">{{ diagnostics.projectId || '—' }}</dd>
          <dt class="text-slate-500">authDomain</dt><dd class="truncate">{{ diagnostics.authDomain || '—' }}</dd>
          <dt class="text-slate-500">apiKey</dt><dd>{{ diagnostics.apiKeyShape.present ? diagnostics.apiKeyShape.length + ' car.' : 'ausente' }}</dd>
          <dt class="text-slate-500">uid</dt><dd class="truncate">{{ state.uid || 'sin sesión' }}</dd>
          <dt class="text-slate-500">grupo</dt><dd class="truncate">{{ activeGroupId || '—' }}</dd>
        </dl>
      </div>
    </section>

    <p class="px-1 text-[11px] text-slate-500">
      Usuario: {{ state.displayName || 'sin nombre' }} · ID: {{ shortUid }}
      <template v-if="state.lastSyncAt"> · última sincronización: {{ lastSyncLabel }}</template>
    </p>
  </div>
</template>

<script setup>
/**
 * Comunidad — resumen de escucha compartido con grupos de amigos.
 *
 * Antes se llamaba «Liga» y luego «Friendly-Wrapped». Se puede pertenecer a
 * varios grupos y salirse de cualquiera de ellos, y el ranking se lee de la
 * última publicación real del grupo.
 *
 * La pantalla se ordena por lo que se viene a hacer: arriba los resultados del
 * grupo (si se pertenece a alguno) y debajo las dos únicas acciones posibles,
 * crear o unirse, que despliegan su formulario al elegirlas.
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
  refreshAll,
  repararAcceso,
  diagnostics
} = useLeague()

const displayName = ref(state.value.displayName || '')
const groupNameInput = ref('')
const inviteCodeInput = ref('')
const nextPublishCountdown = ref('calculando…')
const confirmLeaveId = ref('')
const copied = ref(false)
/** '' | 'crear' | 'unirme': qué formulario está desplegado. */
const accion = ref('')
const reparando = ref(false)
const verDiagnostico = ref(false)

/**
 * Un rechazo de las reglas se arregla casi siempre rehaciendo la ficha de
 * miembro, así que se detecta por el texto para ofrecer el botón en vez de
 * dejar al usuario con un mensaje sin salida.
 */
const accesoRechazado = computed(() => /rechazó el acceso/i.test(error.value || ''))

const opciones = [
  {
    id: 'crear',
    icon: '➕',
    title: 'Crear grupo',
    description: 'Abres un grupo nuevo y repartes su código.'
  },
  {
    id: 'unirme',
    icon: '🔑',
    title: 'Unirme a grupo',
    description: 'Entras en uno que ya existe con su código.'
  }
]

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
  accion.value = ''
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
  accion.value = ''
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

async function onRepair () {
  reparando.value = true
  try {
    await repararAcceso(activeGroupId.value)
  } finally {
    reparando.value = false
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

<style scoped>
.desplegar-enter-active, .desplegar-leave-active {
  transition: opacity 0.2s ease, max-height 0.25s ease;
  overflow: hidden;
  max-height: 340px;
}
.desplegar-enter-from, .desplegar-leave-to {
  opacity: 0;
  max-height: 0;
}
</style>
