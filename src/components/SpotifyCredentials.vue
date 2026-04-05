<template>
  <section class="rounded-2xl border border-slate-800 bg-slate-900 p-5 mb-6">
    <h2 class="text-lg font-semibold mb-3">Credenciales Spotify</h2>
    <div class="grid grid-cols-1 md:grid-cols-2 gap-3">
      <div>
        <label class="text-xs text-slate-400">Client ID</label>
        <input
          v-model="clientId"
          type="text"
          placeholder="Tu Client ID de Spotify"
          class="w-full mt-1 bg-slate-800 border border-slate-700 rounded-lg px-3 py-2 text-sm text-slate-100 font-mono"
        />
      </div>
      <div>
        <label class="text-xs text-slate-400">Client Secret</label>
        <input
          v-model="clientSecret"
          type="password"
          placeholder="Tu Client Secret"
          class="w-full mt-1 bg-slate-800 border border-slate-700 rounded-lg px-3 py-2 text-sm text-slate-100 font-mono"
        />
      </div>
      <div class="md:col-span-2">
        <label class="text-xs text-slate-400">
          Refresh Token
          <span class="text-slate-500">(obtén uno con scripts/get-refresh-token.ps1)</span>
        </label>
        <input
          v-model="refreshToken"
          type="password"
          placeholder="Tu Refresh Token"
          class="w-full mt-1 bg-slate-800 border border-slate-700 rounded-lg px-3 py-2 text-sm text-slate-100 font-mono"
        />
      </div>
    </div>

    <div class="flex flex-wrap gap-2 mt-3">
      <button
        class="rounded-lg bg-slate-700 border border-slate-600 text-slate-100 text-sm px-3 py-2 hover:bg-slate-600 transition-colors"
        @click="save"
      >
        Guardar credenciales
      </button>
      <button
        class="rounded-lg bg-emerald-500/20 border border-emerald-400/30 text-emerald-300 text-sm px-3 py-2 hover:bg-emerald-500/30 transition-colors"
        @click="$emit('sync-spotify')"
      >
        Sincronizar ahora
      </button>
    </div>

    <p
      class="text-xs mt-2"
      :class="spotify.feedbackError.value ? 'text-rose-300' : 'text-slate-400'"
    >
      {{ spotify.feedback.value || 'Introduce tus credenciales Spotify para sincronizar directamente desde el dispositivo.' }}
    </p>
  </section>
</template>

<script setup>
import { ref, onMounted } from 'vue'
import { useSpotify } from '@/composables/useSpotify'

const emit = defineEmits(['sync-spotify'])
const spotify = useSpotify()

const clientId = ref('')
const clientSecret = ref('')
const refreshToken = ref('')

onMounted(() => {
  const creds = spotify.loadSavedCredentials()
  clientId.value = creds.clientId
  clientSecret.value = creds.clientSecret
  refreshToken.value = creds.refreshToken
})

function save () {
  if (!clientId.value || !clientSecret.value || !refreshToken.value) {
    spotify.setFeedback('Completa los tres campos antes de guardar.', true)
    return
  }
  spotify.saveCredentials(clientId.value, clientSecret.value, refreshToken.value)
  spotify.setFeedback('Credenciales guardadas. Sincronizando...')
  emit('sync-spotify')
}
</script>
