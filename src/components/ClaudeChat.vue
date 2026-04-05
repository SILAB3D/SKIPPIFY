<template>
  <div class="h-full flex flex-col bg-slate-950">
    <!-- Header -->
    <div class="border-b border-slate-800 bg-slate-900/50 p-4">
      <div class="flex items-center gap-3 mb-4">
        <span class="text-2xl">🤖</span>
        <div>
          <h2 class="text-lg font-semibold text-white">Claude AI</h2>
          <p class="text-xs text-slate-400">Powered by Anthropic</p>
        </div>
      </div>

      <!-- Model selector -->
      <div v-if="models.length > 0" class="flex gap-2">
        <label class="text-xs text-slate-400">Modelo:</label>
        <select
          v-model="selectedModel"
          class="flex-1 rounded-lg bg-slate-800 border border-slate-700 text-sm text-white px-3 py-1.5 hover:border-slate-500"
        >
          <option v-for="m in models" :key="m.id" :value="m.id">
            {{ m.name }}
          </option>
        </select>
      </div>

      <!-- Error -->
      <div
        v-if="error"
        class="mt-3 rounded-lg bg-rose-500/10 border border-rose-400/20 text-rose-300 text-xs p-2"
      >
        {{ error }}
      </div>
    </div>

    <!-- Messages area -->
    <div class="flex-1 overflow-y-auto p-4 space-y-4">
      <div v-if="messages.length === 0" class="flex items-center justify-center h-full">
        <div class="text-center">
          <p class="text-slate-400 text-sm mb-2">Sin mensajes aún</p>
          <p class="text-slate-500 text-xs">Escribe tu primer mensaje abajo</p>
        </div>
      </div>

      <div v-for="(msg, idx) in messages" :key="idx" class="flex gap-3 animate-in">
        <!-- Role badge -->
        <div
          class="shrink-0 w-8 h-8 rounded-lg flex items-center justify-center text-xs font-bold"
          :class="msg.role === 'user'
            ? 'bg-emerald-500/20 text-emerald-300 border border-emerald-500/30'
            : 'bg-blue-500/20 text-blue-300 border border-blue-500/30'"
        >
          {{ msg.role === 'user' ? 'TÚ' : 'IA' }}
        </div>

        <!-- Message content -->
        <div class="flex-1 min-w-0">
          <p class="text-sm text-white whitespace-pre-wrap break-words">{{ msg.content }}</p>
        </div>
      </div>

      <!-- Loading indicator -->
      <div v-if="loading" class="flex gap-3">
        <div class="shrink-0 w-8 h-8 rounded-lg bg-blue-500/20 flex items-center justify-center">
          <span class="animate-spin">⏳</span>
        </div>
        <div class="text-sm text-slate-400">Claude está pensando...</div>
      </div>
    </div>

    <!-- Input area -->
    <div class="border-t border-slate-800 bg-slate-900/50 p-4">
      <div class="flex gap-2">
        <input
          v-model="inputMessage"
          type="text"
          placeholder="Escribe tu mensaje..."
          @keyup.enter="handleSend"
          :disabled="loading || models.length === 0"
          class="flex-1 rounded-lg bg-slate-800 border border-slate-700 text-white placeholder-slate-500 px-3 py-2 text-sm focus:outline-none focus:border-emerald-500 disabled:opacity-50"
        />
        <button
          @click="handleSend"
          :disabled="loading || !inputMessage.trim() || models.length === 0"
          class="rounded-lg bg-emerald-500/20 border border-emerald-500/40 text-emerald-300 px-4 py-2 text-sm font-medium hover:bg-emerald-500/30 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
        >
          Enviar
        </button>
        <button
          v-if="hasMessages"
          @click="handleClear"
          :disabled="loading"
          class="rounded-lg bg-slate-800 border border-slate-700 text-slate-400 px-3 py-2 text-sm font-medium hover:bg-slate-700 disabled:opacity-50 transition-colors"
        >
          Limpiar
        </button>
      </div>

      <!-- Settings hint -->
      <p v-if="models.length === 0" class="text-xs text-slate-500 mt-2">
        ⚠️ Configura tu ANTHROPIC_API_KEY en <code>.env.local</code> e inicia el servidor:
        <code>node server.js</code>
      </p>
    </div>
  </div>
</template>

<script setup>
import { ref, onMounted } from 'vue'
import { useClaude } from '@/composables/useClaude'

const { models, selectedModel, messages, loading, error, hasMessages, loadModels, sendMessage, clearMessages } = useClaude()
const inputMessage = ref('')

onMounted(() => {
  loadModels()
})

const handleSend = async () => {
  if (!inputMessage.value.trim()) return
  await sendMessage(inputMessage.value)
  inputMessage.value = ''
}

const handleClear = () => {
  clearMessages()
}
</script>

<style scoped>
.animate-in {
  animation: slideIn 0.3s ease-out;
}

@keyframes slideIn {
  from {
    opacity: 0;
    transform: translateY(10px);
  }
  to {
    opacity: 1;
    transform: translateY(0);
  }
}
</style>
