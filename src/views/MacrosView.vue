<template>
  <div class="sk-stagger space-y-5">

    <!-- ── Conexión con Spotify ────────────────────────────────────────────── -->
    <section
      v-if="!connected"
      class="overflow-hidden sk-card border-brand-500/25"
    >
      <div class="bg-gradient-to-br from-brand-500/10 to-transparent p-5">
        <div class="flex items-start gap-3">
          <span class="flex h-10 w-10 shrink-0 items-center justify-center rounded-2xl bg-brand-500/15 text-xl">🔗</span>
          <div class="min-w-0">
            <h2 class="text-base font-semibold text-slate-100">Conecta tu cuenta de Spotify</h2>
            <p class="mt-1 text-xs leading-relaxed text-slate-400">
              Las macros trabajan con tus playlists y tu biblioteca, así que necesitan
              permiso de tu cuenta. El acceso se concede en el navegador y puedes
              revocarlo cuando quieras desde tu perfil de Spotify.
            </p>
          </div>
        </div>
      </div>

      <div class="space-y-3.5 border-t border-white/[0.07] p-5">
        <div>
          <label class="text-xs font-medium text-slate-300">Client ID de tu aplicación de Spotify</label>
          <input
            v-model="clientIdInput"
            type="text"
            placeholder="32 caracteres del panel de desarrollador"
            class="mt-1.5 w-full sk-input px-3 py-2.5 font-mono text-xs text-slate-200 placeholder:text-slate-600 focus:border-brand-500/50 focus:outline-none"
          >
          <p class="mt-2 text-[11px] leading-relaxed text-slate-500">
            Créala en
            <span class="text-slate-400">developer.spotify.com/dashboard</span>
            y añade esta URI de redirección exacta:
          </p>
          <code class="mt-1.5 block break-all rounded-lg border border-white/[0.07] bg-slate-950/80 px-2.5 py-2 font-mono text-[11px] text-brand-300">{{ redirectUri() }}</code>
        </div>

        <button
          type="button"
          class="w-full sk-btn sk-btn-primary disabled:opacity-50"
          :disabled="!clientIdInput.trim() || state.connecting"
          @click="onConnect"
        >
          {{ state.connecting ? 'Esperando a Spotify…' : 'Conectar con Spotify' }}
        </button>

        <p v-if="state.error" class="rounded-lg border border-rose-500/30 bg-rose-500/10 px-3 py-2 text-[11px] text-rose-300">
          {{ state.error }}
        </p>
      </div>
    </section>

    <template v-else>
      <!-- ── Cuenta conectada ─────────────────────────────────────────────── -->
      <section class="sk-card p-4">
        <div class="flex flex-wrap items-center gap-3">
          <img
            v-if="state.profile?.images?.[0]?.url"
            :src="state.profile.images[0].url"
            alt=""
            class="h-10 w-10 rounded-full border border-slate-700 object-cover"
          >
          <span v-else class="flex h-10 w-10 items-center justify-center rounded-full bg-brand-500/15 text-lg">👤</span>

          <div class="min-w-0 flex-1">
            <p class="truncate text-sm font-semibold text-slate-100">
              {{ state.profile?.display_name || 'Cuenta conectada' }}
            </p>
            <p class="truncate text-[11px] text-slate-500">
              {{ state.profile?.email || state.profile?.id || '' }}
            </p>
          </div>

          <button
            type="button"
            class="sk-btn sk-btn-ghost sk-btn-sm"
            @click="disconnect"
          >
            Desconectar
          </button>
        </div>
      </section>

      <!-- ── Datos disponibles ────────────────────────────────────────────── -->
      <section class="sk-card p-5">
        <header class="flex flex-wrap items-center gap-2">
          <span class="flex h-7 w-7 items-center justify-center rounded-lg bg-sky-500/15 text-sm">🗂️</span>
          <h2 class="text-sm font-semibold text-slate-100">Datos de tu cuenta disponibles</h2>
          <button
            type="button"
            class="ml-auto sk-btn sk-btn-ghost sk-btn-sm"
            :disabled="loadingLibrary"
            @click="loadLibrary"
          >
            {{ loadingLibrary ? 'Cargando…' : 'Actualizar' }}
          </button>
        </header>

        <div class="mt-4 grid gap-2.5 sm:grid-cols-2 lg:grid-cols-3">
          <article
            v-for="item in dataCatalog"
            :key="item.key"
            class="rounded-xl border border-white/[0.06] bg-slate-950/40 p-3.5"
          >
            <div class="flex items-center gap-2">
              <span class="text-base">{{ item.icon }}</span>
              <p class="text-sm font-semibold text-slate-100">{{ item.label }}</p>
              <span
                v-if="item.count !== null"
                class="ml-auto rounded bg-slate-800 px-1.5 py-0.5 font-mono text-[10px] text-slate-300"
              >{{ item.count }}</span>
            </div>
            <p class="mt-1.5 text-[11px] leading-relaxed text-slate-500">{{ item.detail }}</p>
          </article>
        </div>

        <p v-if="libraryError" class="mt-3 rounded-lg border border-rose-500/30 bg-rose-500/10 px-3 py-2 text-[11px] text-rose-300">
          {{ libraryError }}
        </p>
      </section>

      <!-- ── Constructor A → B → C ────────────────────────────────────────── -->
      <section class="sk-card p-5">
        <header class="flex flex-wrap items-center gap-2">
          <span class="flex h-7 w-7 items-center justify-center rounded-lg bg-violet-500/15 text-sm">⚡</span>
          <h2 class="text-sm font-semibold text-slate-100">Crear una macro</h2>
        </header>

        <!-- Guía de las tres etapas -->
        <div class="mt-4 flex items-center gap-1.5 text-[11px] font-semibold">
          <span
            v-for="(stage, i) in stages"
            :key="stage.key"
            class="flex flex-1 items-center gap-1.5"
          >
            <span
              class="flex h-6 w-6 shrink-0 items-center justify-center rounded-full border text-[10px] transition-colors"
              :class="stageDone(stage.key)
                ? 'border-brand-400/50 bg-brand-500/20 text-brand-200'
                : 'border-slate-600 bg-slate-800 text-slate-500'"
            >{{ stage.letter }}</span>
            <span :class="stageDone(stage.key) ? 'text-brand-200' : 'text-slate-500'">{{ stage.label }}</span>
            <span v-if="i < stages.length - 1" class="flex-1 border-t border-dashed border-slate-700" />
          </span>
        </div>

        <!-- A · origen -->
        <div class="mt-5">
          <p class="text-xs font-semibold uppercase tracking-wider text-slate-500">A · De dónde salen</p>
          <div class="mt-2.5 grid gap-2 sm:grid-cols-2">
            <button
              v-for="source in sources"
              :key="source.type"
              type="button"
              class="rounded-xl border p-3 text-left transition-all"
              :class="draft.source.type === source.type
                ? 'border-brand-400/50 bg-brand-500/10'
                : 'border-white/[0.07] bg-slate-950/40 hover:border-slate-500/70'"
              @click="pickSource(source)"
            >
              <p class="text-sm font-medium text-slate-100">{{ source.icon }} {{ source.label }}</p>
              <p class="mt-1 text-[11px] leading-relaxed text-slate-500">{{ source.detail }}</p>
            </button>
          </div>

          <select
            v-if="selectedSource?.needsPlaylist"
            v-model="draft.source.playlistId"
            class="mt-2.5 w-full sk-input px-3 py-2.5 text-xs text-slate-200 focus:border-brand-500/50 focus:outline-none"
            @change="syncSourcePlaylistName"
          >
            <option value="">Elige la playlist de origen…</option>
            <option v-for="pl in sourcePlaylists" :key="pl.id" :value="pl.id">
              {{ pl.name }} ({{ playlistCount(pl) }}){{ pl.writable ? '' : ' · solo lectura' }}
            </option>
          </select>

          <p
            v-if="selectedSource?.needsPlaylist && draft.action.type === 'move' && readOnlyCount"
            class="mt-1.5 text-[11px] text-slate-500"
          >
            No aparecen {{ readOnlyCount }} playlist(s) que solo sigues: mover exige poder
            quitar la canción del origen.
          </p>
        </div>

        <!-- B · acción -->
        <div class="mt-5">
          <p class="text-xs font-semibold uppercase tracking-wider text-slate-500">B · Qué se hace</p>
          <div class="mt-2.5 grid gap-2 sm:grid-cols-2">
            <button
              v-for="action in availableActions"
              :key="action.type"
              type="button"
              class="rounded-xl border p-3 text-left transition-all"
              :class="draft.action.type === action.type
                ? 'border-violet-400/50 bg-violet-500/10'
                : 'border-white/[0.07] bg-slate-950/40 hover:border-slate-500/70'"
              @click="pickAction(action)"
            >
              <p class="text-sm font-medium text-slate-100">{{ action.icon }} {{ action.label }}</p>
              <p class="mt-1 text-[11px] leading-relaxed text-slate-500">{{ action.detail }}</p>
            </button>
          </div>
        </div>

        <!-- C · destino -->
        <div v-if="selectedAction?.needsTarget" class="mt-5">
          <p class="text-xs font-semibold uppercase tracking-wider text-slate-500">C · Dónde acaban</p>
          <div class="mt-2.5 grid gap-2 sm:grid-cols-2">
            <button
              v-for="target in availableTargets"
              :key="target.type"
              type="button"
              class="rounded-xl border p-3 text-left transition-all"
              :class="draft.target.type === target.type
                ? 'border-sky-400/50 bg-sky-500/10'
                : 'border-white/[0.07] bg-slate-950/40 hover:border-slate-500/70'"
              @click="pickTarget(target)"
            >
              <p class="text-sm font-medium text-slate-100">{{ target.icon }} {{ target.label }}</p>
            </button>
          </div>

          <select
            v-if="selectedTarget?.needsPlaylist"
            v-model="draft.target.playlistId"
            class="mt-2.5 w-full sk-input px-3 py-2.5 text-xs text-slate-200 focus:border-sky-500/50 focus:outline-none"
            @change="syncTargetPlaylistName"
          >
            <option value="">Elige la playlist de destino…</option>
            <option v-for="pl in writablePlaylists" :key="pl.id" :value="pl.id">
              {{ pl.name }} ({{ playlistCount(pl) }})
            </option>
          </select>

          <p v-if="selectedTarget?.needsPlaylist && readOnlyCount" class="mt-1.5 text-[11px] text-slate-500">
            No aparecen {{ readOnlyCount }} playlist(s) que solo sigues: Spotify no deja
            modificar playlists ajenas que no sean colaborativas.
          </p>

          <input
            v-if="selectedTarget?.needsName"
            v-model="draft.target.newPlaylistName"
            type="text"
            maxlength="60"
            placeholder="Nombre de la playlist nueva"
            class="mt-2.5 w-full sk-input px-3 py-2.5 text-xs text-slate-200 placeholder:text-slate-600 focus:border-sky-500/50 focus:outline-none"
          >
        </div>

        <!-- Resumen y creación -->
        <div class="mt-5 border-t border-white/[0.07] pt-4">
          <p class="rounded-xl border border-white/[0.06] bg-slate-950/45 px-3.5 py-3 text-xs leading-relaxed text-slate-300">
            {{ draftSummary }}
          </p>

          <input
            v-model="draft.name"
            type="text"
            maxlength="60"
            placeholder="Nombre de la macro (opcional)"
            class="mt-2.5 w-full sk-input px-3 py-2.5 text-xs text-slate-200 placeholder:text-slate-600 focus:border-brand-500/50 focus:outline-none"
          >

          <p v-if="draftError" class="mt-2.5 text-[11px] text-amber-400">{{ draftError }}</p>

          <p v-else-if="needsPremium && lacksPremium" class="mt-2.5 text-[11px] text-amber-400">
            Tu cuenta de Spotify no es Premium: la cola de reproducción responderá «Forbidden»
            al ejecutar esta macro.
          </p>

          <p v-else-if="missingPermissions.length" class="mt-2.5 text-[11px] text-amber-400">
            Tu sesión no incluye {{ missingPermissions.join(', ') }}. Desconecta y vuelve a
            conectar la cuenta antes de ejecutar macros.
          </p>

          <button
            type="button"
            class="mt-3 w-full sk-btn sk-btn-primary disabled:opacity-40"
            :disabled="!!draftError"
            @click="onCreate"
          >
            Crear macro
          </button>
        </div>
      </section>

      <!-- ── Macros guardadas ─────────────────────────────────────────────── -->
      <section class="sk-card p-5">
        <header class="flex flex-wrap items-center gap-2">
          <span class="flex h-7 w-7 items-center justify-center rounded-lg bg-brand-500/15 text-sm">📚</span>
          <h2 class="text-sm font-semibold text-slate-100">Tus macros</h2>
          <button
            v-if="macros.length"
            type="button"
            class="ml-auto sk-btn sk-btn-ghost sk-btn-sm"
            :disabled="running"
            @click="onRunAll"
          >
            {{ running ? 'Ejecutando…' : 'Ejecutar todas' }}
          </button>
        </header>

        <p class="mt-2 text-[11px] leading-relaxed text-slate-500">
          Las macros marcadas «en segundo plano» las ejecuta el servicio con la app cerrada:
          las de la canción actual en cuanto cambia la canción, y las de lista en un repaso
          cada 15 minutos. El resto se evalúan al pulsar «Ejecutar». Todas recuerdan por dónde
          iban, así que nada se procesa dos veces aunque pasen días entre ejecuciones.
        </p>

        <p v-if="!macros.length" class="mt-4 text-xs text-slate-500">
          Todavía no has creado ninguna macro.
        </p>

        <ul v-else class="mt-4 space-y-2.5">
          <li
            v-for="macro in macros"
            :key="macro.id"
            class="rounded-xl border p-3.5 transition-colors"
            :class="macro.enabled
              ? 'border-white/[0.07] bg-slate-950/40'
              : 'border-white/[0.06] bg-slate-950/20 opacity-60'"
          >
            <div class="flex flex-wrap items-start gap-2">
              <div class="min-w-0 flex-1">
                <p class="truncate text-sm font-semibold text-slate-100">{{ macro.name }}</p>
                <p class="mt-0.5 text-[11px] leading-relaxed text-slate-500">{{ describeMacro(macro) }}</p>
                <p
                  v-if="correEnSegundoPlano(macro)"
                  class="mt-1.5 inline-flex items-center gap-1.5 rounded-md border border-brand-500/30 bg-brand-500/10 px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide text-brand-300"
                >
                  <span class="h-1.5 w-1.5 rounded-full bg-brand-400" />
                  En segundo plano
                </p>
                <p
                  v-else-if="motivoSinSegundoPlano(macro)"
                  class="mt-1.5 text-[10px] leading-relaxed text-amber-300/80"
                >
                  Sólo a mano: {{ motivoSinSegundoPlano(macro) }}
                </p>
              </div>
              <button
                type="button"
                class="rounded-lg border px-2.5 py-1 text-[10px] font-semibold uppercase transition-colors"
                :class="macro.enabled
                  ? 'border-brand-500/35 bg-brand-500/10 text-brand-300'
                  : 'border-slate-600/70 text-slate-500'"
                @click="toggleMacro(macro.id)"
              >{{ macro.enabled ? 'activa' : 'pausada' }}</button>
            </div>

            <div class="mt-2.5 flex flex-wrap items-center gap-2">
              <button
                type="button"
                class="rounded-lg border border-sky-500/35 bg-sky-500/10 px-3 py-1.5 text-[11px] font-semibold text-sky-300 transition-colors hover:bg-sky-500/20 disabled:opacity-50"
                :disabled="running"
                @click="onPreview(macro)"
              >Vista previa</button>
              <button
                type="button"
                class="rounded-lg border border-brand-500/35 bg-brand-500/10 px-3 py-1.5 text-[11px] font-semibold text-brand-300 transition-colors hover:bg-brand-500/20 disabled:opacity-50"
                :disabled="running"
                @click="onRun(macro)"
              >Ejecutar</button>
              <button
                type="button"
                class="sk-btn sk-btn-ghost sk-btn-sm"
                @click="deleteMacro(macro.id)"
              >Borrar</button>

              <button
                type="button"
                class="sk-btn sk-btn-ghost sk-btn-sm"
                @click="verHistorial[macro.id] = !verHistorial[macro.id]"
              >{{ verHistorial[macro.id] ? 'Ocultar historial' : 'Historial' }}</button>

              <span class="ml-auto font-mono text-[10px] text-slate-600">
                {{ ejecuciones(macro) }} ejec. · {{ aplicadas(macro) }} canciones
              </span>
            </div>

            <!--
              Siete días de ejecuciones. Un contador acumulado no sirve para
              saber si la macro está viva: sube igual si lo último que hizo fue
              anteayer. Aquí se ve el día a día, y de dónde vino cada pasada.
            -->
            <div
              v-if="verHistorial[macro.id]"
              class="mt-2.5 rounded-lg border border-white/[0.07] bg-slate-900/60 p-3"
            >
              <p class="text-[10px] font-semibold uppercase tracking-wide text-slate-500">
                Últimos 7 días
              </p>

              <p v-if="!historialPorDia(macro).length" class="mt-2 text-[11px] text-slate-500">
                Sin ejecuciones registradas esta semana.
              </p>

              <ul v-else class="mt-2 space-y-2">
                <li v-for="dia in historialPorDia(macro)" :key="dia.dia">
                  <div class="flex items-baseline justify-between gap-2">
                    <span class="text-[11px] font-semibold text-slate-300">{{ etiquetaDia(dia.dia) }}</span>
                    <span class="font-mono text-[10px] text-slate-500">
                      {{ dia.ejecuciones }} ejec. · {{ dia.aplicadas }} canciones<template v-if="dia.errores"> · {{ dia.errores }} con error</template>
                    </span>
                  </div>
                  <ul class="mt-1 space-y-0.5">
                    <li
                      v-for="(entrada, i) in dia.entradas"
                      :key="dia.dia + '-' + i"
                      class="flex items-baseline gap-2 text-[10px] leading-relaxed"
                      :class="entrada.status === 2 ? 'text-rose-300/90' : (entrada.status === 0 ? 'text-slate-300' : 'text-slate-500')"
                    >
                      <span class="font-mono text-slate-600">{{ hora(entrada.at) }}</span>
                      <span class="shrink-0 text-slate-600">{{ entrada.origen === 'servicio' ? 'servicio' : 'app' }}</span>
                      <span class="min-w-0 flex-1 truncate">{{ entrada.message }}</span>
                    </li>
                  </ul>
                </li>
              </ul>
            </div>

            <p
              v-if="!results[macro.id] && ultimaAutomatica(macro)"
              class="mt-2.5 rounded-lg border border-white/[0.07] bg-slate-900/60 px-3 py-2 text-[11px] text-slate-400"
            >
              {{ ultimaAutomatica(macro) }}
            </p>

            <p
              v-if="results[macro.id]"
              class="mt-2.5 rounded-lg border px-3 py-2 text-[11px]"
              :class="results[macro.id].error
                ? 'border-rose-500/30 bg-rose-500/10 text-rose-300'
                : 'border-white/[0.07] bg-slate-900/60 text-slate-300'"
            >
              {{ results[macro.id].message }}
            </p>
          </li>
        </ul>
      </section>
    </template>

  </div>
</template>

<script setup>
import { computed, onMounted, onUnmounted, reactive, ref, watch } from 'vue'
import { useSpotify } from '@/composables/useSpotify'
import {
  useMacros,
  describeMacro,
  validateDraft,
  sourceMeta,
  actionMeta,
  targetMeta,
  MACRO_SOURCES,
  MACRO_ACTIONS,
  MACRO_TARGETS
} from '@/composables/useMacros'

const spotify = useSpotify()
const { state, connected, clientId, setClientId, redirectUri, connect, disconnect, consumeRedirect, cancelConnecting, loadProfile, missingScopes, api, apiPaged } = spotify
const {
  macros, createMacro, deleteMacro, toggleMacro, runMacro, runAllEnabled,
  sincronizarConNativo, refrescarEstadoNativo, correEnSegundoPlano, motivoSinSegundoPlano,
  estadisticasNativas, historialPorDia
} = useMacros()

/** Qué macros tienen el historial desplegado. */
const verHistorial = reactive({})

function hora (at) {
  try {
    return new Date(at).toLocaleTimeString('es-ES', { hour: '2-digit', minute: '2-digit' })
  } catch {
    return ''
  }
}

function etiquetaDia (iso) {
  const hoy = new Date().toISOString().slice(0, 10)
  const ayer = new Date(Date.now() - 86400000).toISOString().slice(0, 10)
  if (iso === hoy) return 'Hoy'
  if (iso === ayer) return 'Ayer'
  try {
    return new Date(iso + 'T12:00:00').toLocaleDateString('es-ES', { weekday: 'long', day: 'numeric', month: 'short' })
  } catch {
    return iso
  }
}

const sources = MACRO_SOURCES
const stages = [
  { key: 'source', letter: 'A', label: 'Origen' },
  { key: 'action', letter: 'B', label: 'Acción' },
  { key: 'target', letter: 'C', label: 'Destino' }
]

const clientIdInput = ref(clientId.value)
const playlists = ref([])
const library = reactive({ liked: null, recent: null, top: null, following: null })
const loadingLibrary = ref(false)
const libraryError = ref('')
const running = ref(false)
const results = reactive({})

const draft = reactive({
  name: '',
  source: { type: '', playlistId: '', playlistName: '', playlistWritable: null },
  action: { type: '' },
  target: { type: '', playlistId: '', playlistName: '', newPlaylistName: '', playlistWritable: null }
})

/**
 * Permisos que faltan en la sesión actual. Un token emitido antes de que la app
 * pidiera un permiso lo sigue sin tener, y el refresh mantiene los originales:
 * el síntoma es un 403 al ejecutar, no un fallo al iniciar sesión.
 */
const missingPermissions = computed(() => missingScopes() || [])

/** Encolar y controlar la reproducción son endpoints exclusivos de Premium. */
const needsPremium = computed(() => draft.action.type === 'queue' || draft.target.type === 'queue')
const lacksPremium = computed(() => {
  const product = state.profile?.product
  return !!product && product !== 'premium'
})

/** Playlists en las que Spotify permite escribir: propias o colaborativas. */
const writablePlaylists = computed(() => playlists.value.filter(pl => pl.writable))
const readOnlyCount = computed(() => playlists.value.length - writablePlaylists.value.length)

/** «Mover» borra del origen, así que ahí tampoco vale una playlist ajena. */
const sourcePlaylists = computed(() =>
  draft.action.type === 'move' ? writablePlaylists.value : playlists.value)

const selectedSource = computed(() => sourceMeta(draft.source.type))
const selectedAction = computed(() => actionMeta(draft.action.type))
const selectedTarget = computed(() => targetMeta(draft.target.type))

const availableActions = computed(() => MACRO_ACTIONS.filter(action => {
  if (!action.requiresPlaylistSource) return true
  return !!selectedSource.value?.needsPlaylist
}))

const availableTargets = computed(() => {
  const allowed = selectedAction.value?.targets || []
  return MACRO_TARGETS.filter(target => allowed.includes(target.type))
})

const draftError = computed(() => validateDraft(draft))
const draftSummary = computed(() => {
  if (!draft.source.type || !draft.action.type) return 'Elige un origen y una acción para ver el resumen.'
  return describeMacro(draft)
})

const dataCatalog = computed(() => [
  {
    key: 'playlists',
    icon: '🎵',
    label: 'Tus playlists',
    count: playlists.value.length || null,
    detail: 'Propias y seguidas, con sus canciones. Se pueden leer, ampliar y vaciar.'
  },
  {
    key: 'recent',
    icon: '🕒',
    label: 'Reproducciones recientes',
    count: library.recent,
    detail: 'Las últimas 50 canciones escuchadas, con la hora exacta de cada una.'
  },
  {
    key: 'liked',
    icon: '💚',
    label: 'Tus me gusta',
    count: library.liked,
    detail: 'La biblioteca de canciones guardadas. Se pueden añadir y quitar canciones.'
  },
  {
    key: 'top',
    icon: '🏆',
    label: 'Top de canciones y artistas',
    count: library.top,
    detail: 'Tu ranking personal a corto, medio y largo plazo según Spotify.'
  },
  {
    key: 'following',
    icon: '👥',
    label: 'Artistas que sigues',
    count: library.following,
    detail: 'La lista de artistas seguidos, útil para filtrar por procedencia.'
  },
  {
    key: 'player',
    icon: '▶️',
    label: 'Reproductor en vivo',
    count: null,
    detail: 'Canción actual, dispositivo activo, cola y control de reproducción (saltar, encolar).'
  }
])

/**
 * Número de canciones de una playlist. Spotify pasó de exponerlo en `tracks` a
 * exponerlo en `items`; se leen las dos para no depender de la versión.
 */
/**
 * Las macros que gobierna el servicio llevan su cuenta en el lado nativo: es él
 * quien las ejecuta con la app cerrada, así que sus cifras son las buenas.
 */
function ejecuciones (macro) {
  return estadisticasNativas(macro)?.runs ?? macro.stats.runs
}

function aplicadas (macro) {
  return estadisticasNativas(macro)?.applied ?? macro.stats.applied
}

/** Última ejecución automática, para poder comprobar de un vistazo que va. */
function ultimaAutomatica (macro) {
  const st = estadisticasNativas(macro)
  if (!st?.lastRunAt) return ''
  const fecha = new Date(Number(st.lastRunAt))
  if (Number.isNaN(fecha.getTime())) return ''
  const cuando = fecha.toLocaleString('es-ES', { day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' })
  return st.lastResult ? `${cuando} · ${st.lastResult}` : cuando
}

function playlistCount (pl) {
  return pl?.items?.total ?? pl?.tracks?.total ?? 0
}

function stageDone (key) {
  if (key === 'source') return !!draft.source.type && (!selectedSource.value?.needsPlaylist || !!draft.source.playlistId)
  if (key === 'action') return !!draft.action.type
  return !selectedAction.value?.needsTarget || (!!draft.target.type && !validateDraft(draft))
}

function pickSource (source) {
  draft.source.type = source.type
  if (!source.needsPlaylist) {
    draft.source.playlistId = ''
    draft.source.playlistName = ''
    draft.source.playlistWritable = null
  }
  // Mover exige un origen de playlist: si deja de serlo, la acción ya no vale.
  if (selectedAction.value?.requiresPlaylistSource && !source.needsPlaylist) {
    draft.action.type = ''
    draft.target.type = ''
  }
}

function pickAction (action) {
  draft.action.type = action.type

  // El origen elegido puede haber dejado de valer: «mover» borra de la playlist
  // de origen y eso solo se puede si es tuya o colaborativa.
  if (action.type === 'move' && draft.source.playlistWritable === false) {
    draft.source.playlistId = ''
    draft.source.playlistName = ''
    draft.source.playlistWritable = null
  }

  if (!action.needsTarget) {
    draft.target.type = ''
    return
  }
  if (draft.target.type && !action.targets.includes(draft.target.type)) {
    draft.target.type = ''
  }
}

function pickTarget (target) {
  draft.target.type = target.type
  if (!target.needsPlaylist || draft.target.playlistWritable === false) {
    draft.target.playlistId = ''
    draft.target.playlistName = ''
    draft.target.playlistWritable = null
  }
  if (!target.needsName) draft.target.newPlaylistName = ''
}

function syncSourcePlaylistName () {
  const found = playlists.value.find(pl => pl.id === draft.source.playlistId)
  draft.source.playlistName = found?.name || ''
  draft.source.playlistWritable = found ? found.writable : null
}

function syncTargetPlaylistName () {
  const found = playlists.value.find(pl => pl.id === draft.target.playlistId)
  draft.target.playlistName = found?.name || ''
  draft.target.playlistWritable = found ? found.writable : null
}

async function onConnect () {
  setClientId(clientIdInput.value)
  await connect()
}

function onCreate () {
  if (draftError.value) return
  createMacro({
    name: draft.name,
    source: { ...draft.source },
    action: { ...draft.action },
    target: selectedAction.value?.needsTarget ? { ...draft.target } : null
  })

  draft.name = ''
  draft.source = { type: '', playlistId: '', playlistName: '', playlistWritable: null }
  draft.action = { type: '' }
  draft.target = { type: '', playlistId: '', playlistName: '', newPlaylistName: '', playlistWritable: null }
}

async function onPreview (macro) {
  running.value = true
  const result = await runMacro(macro, { dryRun: true })
  results[macro.id] = {
    error: !!result.error,
    message: result.error
      ? result.error
      : result.matched
        ? `Se procesarían ${result.matched} canción(es)${result.limited ? ' (por tandas, para no agotar el cupo de Spotify)' : ''}: `
          + `${result.tracks.map(t => t.name).slice(0, 5).join(', ')}${result.matched > 5 ? '…' : ''}`
        : 'No hay canciones pendientes ahora mismo.'
  }
  running.value = false
}

async function onRun (macro) {
  running.value = true
  const result = await runMacro(macro)
  results[macro.id] = {
    error: !!result.error,
    message: result.error || (result.applied
      ? `Listo: ${result.applied} canción(es) procesadas.`
      : macro.stats.lastResult || 'Sin cambios.')
  }
  running.value = false
  await loadLibrary()
}

async function onRunAll () {
  running.value = true
  const summary = await runAllEnabled()
  for (const { macro, result } of summary) {
    results[macro.id] = {
      error: !!result.error,
      message: result.error || (result.applied ? `${result.applied} canción(es).` : 'Sin cambios.')
    }
  }
  running.value = false
}

async function loadLibrary () {
  if (!connected.value) return
  loadingLibrary.value = true
  libraryError.value = ''

  try {
    // `/me/playlists` devuelve también las que solo sigues (editoriales, de
    // otras personas). Sobre esas Spotify responde 403 al escribir, así que se
    // marca aquí quién puede modificar cada una y la interfaz lo respeta.
    const profile = state.profile || await loadProfile()
    playlists.value = (await apiPaged('/me/playlists?limit=50', 200))
      .filter(Boolean)
      .map(pl => ({
        ...pl,
        writable: (!!profile?.id && pl.owner?.id === profile.id) || pl.collaborative === true
      }))

    // Sólo interesa el total de cada colección: se pide una página mínima y se
    // lee el campo `total`, en lugar de descargar miles de canciones.
    const [liked, recent, top, following] = await Promise.all([
      api('/me/tracks?limit=1').catch(() => null),
      api('/me/player/recently-played?limit=1').catch(() => null),
      api('/me/top/tracks?limit=1').catch(() => null),
      api('/me/following?type=artist&limit=1').catch(() => null)
    ])

    library.liked = liked?.total ?? null
    library.recent = recent?.items?.length != null ? (recent.total ?? 50) : null
    library.top = top?.total ?? null
    library.following = following?.artists?.total ?? null
  } catch (error) {
    libraryError.value = error?.message || 'No se pudieron cargar tus datos.'
  } finally {
    loadingLibrary.value = false
  }
}

let redirectHandle = null

async function handleRedirect (url) {
  const ok = await consumeRedirect(url)
  if (ok) await loadLibrary()
  return ok
}

/**
 * Comprueba si hay una redirección OAuth esperando en el lado nativo.
 *
 * No basta con el evento spotifyAuthRedirect: si la vista ya estaba montada
 * cuando el usuario volvió del navegador, o el evento se pierde por cualquier
 * motivo, la pantalla se quedaría esperando indefinidamente. Preguntar al
 * volver a primer plano es la red de seguridad.
 */
async function pollPendingRedirect () {
  const NL = window.Capacitor?.Plugins?.NotifListener
  if (!NL?.consumeAuthRedirect) return false
  const pending = await NL.consumeAuthRedirect().catch(() => null)
  if (!pending?.url) return false
  return handleRedirect(pending.url)
}

async function onVisibilityChange () {
  if (document.visibilityState !== 'visible') return
  const handled = await pollPendingRedirect()
  // Se ha vuelto a la app sin traer ningún código: el usuario canceló o cerró
  // el navegador. Liberar el botón en vez de dejarlo girando para siempre.
  if (!handled && !connected.value) cancelConnecting()
}

onMounted(async () => {
  // Vuelta del navegador: en la app llega por evento nativo; en el navegador,
  // en la propia barra de direcciones.
  const NL = window.Capacitor?.Plugins?.NotifListener
  if (NL?.addListener) {
    redirectHandle = await NL.addListener('spotifyAuthRedirect', payload => handleRedirect(payload?.url))
  }
  await pollPendingRedirect()
  document.addEventListener('visibilitychange', onVisibilityChange)

  if (window.location.search.includes('code=') || window.location.search.includes('error=')) {
    await handleRedirect(window.location.href)
    // Limpiar la barra evita reprocesar el mismo `code` al recargar.
    window.history.replaceState({}, '', window.location.pathname + window.location.hash)
  }

  // El servicio pudo refrescar el token con la app cerrada: el bueno es el suyo.
  await spotify.adoptarSesionNativa?.()

  if (connected.value) {
    if (!state.profile) await loadProfile()
    await loadLibrary()
  }

  // Se le pasan las macros al servicio y se recoge lo que haya hecho solo.
  await sincronizarConNativo()
  await refrescarEstadoNativo()
})

onUnmounted(() => {
  if (redirectHandle?.remove) redirectHandle.remove()
  document.removeEventListener('visibilitychange', onVisibilityChange)
})

watch(connected, async (value) => {
  if (!value) return
  if (!state.profile) await loadProfile()
  await loadLibrary()
})

watch(clientId, (value) => { clientIdInput.value = value })
</script>
