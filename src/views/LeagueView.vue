<template>
  <div class="space-y-4">
    <article class="rounded-2xl border border-slate-700/70 bg-slate-900/95 p-5">
      <div class="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h3 class="text-sm font-semibold text-slate-100">Liga semanal entre amigos</h3>
          <p class="text-xs text-slate-400 mt-1">Publicacion automatica: domingos a las 15:00 (Europe/Madrid).</p>
          <p class="text-xs text-slate-500 mt-1">Proxima publicacion: {{ nextPublishLabel }}</p>
        </div>
        <button
          class="rounded-lg text-xs px-4 py-2 transition-colors font-medium whitespace-nowrap border border-emerald-500/35 bg-emerald-500/15 text-emerald-200 hover:bg-emerald-500/25"
          :disabled="!enabled || syncing"
          @click="handleSync"
        >
          {{ syncing ? 'Sincronizando...' : 'Sincronizar datos' }}
        </button>
      </div>

      <div class="mt-4 grid grid-cols-1 sm:grid-cols-2 gap-3">
        <div class="rounded-xl border border-slate-700 bg-slate-800/60 p-3">
          <p class="text-[11px] uppercase tracking-wide text-slate-500">Usuario</p>
          <p class="text-sm text-slate-200 mt-1">{{ leagueState.uid || 'No conectado' }}</p>
        </div>
        <div class="rounded-xl border border-slate-700 bg-slate-800/60 p-3">
          <p class="text-[11px] uppercase tracking-wide text-slate-500">Grupo actual</p>
          <p class="text-sm text-slate-200 mt-1">{{ leagueState.groupId || 'Sin grupo' }}</p>
        </div>
      </div>

      <p v-if="!enabled" class="text-xs text-amber-300 mt-3">Firebase no configurado: define VITE_FIREBASE_* para activar la liga.</p>
      <p v-if="message" class="text-xs text-emerald-300 mt-3">{{ message }}</p>
      <p v-if="error" class="text-xs text-rose-300 mt-3">{{ error }}</p>
    </article>

    <article class="rounded-2xl border border-slate-700/70 bg-slate-900/95 p-5">
      <h3 class="text-sm font-semibold text-slate-100">Grupo de amigos</h3>
      <p class="text-xs text-slate-400 mt-1">Crea un grupo o unete por codigo para comparar tiempos de escucha.</p>

      <div class="grid grid-cols-1 md:grid-cols-2 gap-3 mt-4">
        <input
          v-model.trim="displayName"
          class="rounded-lg border border-slate-700 bg-slate-800 px-3 py-2 text-sm text-slate-100"
          placeholder="Nombre publico (ej: Iker)"
        >
        <input
          v-model.trim="inviteCodeInput"
          class="rounded-lg border border-slate-700 bg-slate-800 px-3 py-2 text-sm text-slate-100"
          placeholder="Codigo de invitacion"
        >
      </div>

      <div class="flex flex-wrap gap-2 mt-3">
        <button
          class="rounded-lg text-xs px-4 py-2 transition-colors font-medium whitespace-nowrap border border-cyan-500/35 bg-cyan-500/15 text-cyan-200 hover:bg-cyan-500/25"
          :disabled="!enabled"
          @click="handleCreateGroup"
        >
          Crear grupo
        </button>
        <button
          class="rounded-lg text-xs px-4 py-2 transition-colors font-medium whitespace-nowrap border border-sky-500/35 bg-sky-500/15 text-sky-200 hover:bg-sky-500/25"
          :disabled="!enabled"
          @click="handleJoinGroup"
        >
          Unirme por codigo
        </button>
        <button
          class="rounded-lg text-xs px-4 py-2 transition-colors font-medium whitespace-nowrap border border-slate-600 bg-slate-700/60 text-slate-200 hover:bg-slate-700"
          :disabled="!enabled || loadingLeaderboard"
          @click="handleLoadLeaderboard"
        >
          {{ loadingLeaderboard ? 'Cargando...' : 'Ver resultados' }}
        </button>
      </div>

      <p v-if="leagueState.inviteCode" class="text-xs text-slate-300 mt-3">Codigo de tu grupo: {{ leagueState.inviteCode }}</p>
    </article>

    <article class="rounded-2xl border border-slate-700/70 bg-slate-900/95 p-5">
      <h3 class="text-sm font-semibold text-slate-100">Resultados semanales</h3>
      <p class="text-xs text-slate-400 mt-1">Se calcula un score por minutos validos, constancia y canciones completadas.</p>

      <div v-if="!weeklyMembers.length" class="text-xs text-slate-500 mt-3">Todavia no hay ranking semanal publicado para tu grupo.</div>

      <ul v-else class="mt-4 space-y-2">
        <li
          v-for="(item, idx) in weeklyMembers"
          :key="`${item.uid}-${idx}`"
          class="rounded-xl border border-slate-700 bg-slate-800/60 px-3 py-2 flex items-center justify-between gap-2"
        >
          <div class="min-w-0">
            <p class="text-sm text-slate-100 truncate">#{{ idx + 1 }} {{ item.displayName || item.uid }}</p>
            <p class="text-xs text-slate-400 mt-0.5">
              {{ formatMinutes(item.totalMinutes) }} min · {{ item.activeDays || 0 }} dias · {{ item.completedTracks || 0 }} completadas
            </p>
          </div>
          <span class="text-sm font-semibold text-emerald-300">{{ (item.score || 0).toFixed(1) }}</span>
        </li>
      </ul>
    </article>
  </div>
</template>

<script setup>
import { computed, onMounted, ref } from 'vue'
import { useLeague } from '@/composables/useLeague'

const {
  enabled,
  state,
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

function formatMinutes (value) {
  const n = Number(value || 0)
  if (!Number.isFinite(n)) return '0'
  return n.toFixed(1)
}

async function handleCreateGroup () {
  await createGroup({ displayName: displayName.value })
}

async function handleJoinGroup () {
  await joinGroup({ inviteCode: inviteCodeInput.value, displayName: displayName.value })
}

async function handleSync () {
  await syncLocalEvents()
}

async function handleLoadLeaderboard () {
  await loadLeaderboard()
}

onMounted(async () => {
  await ensureAuth()
  if (leagueState.value.groupId) {
    await loadCurrentGroupInfo()
    await loadLeaderboard()
  }
})
</script>
