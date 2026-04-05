/**
 * useClaude — composable para interactuar con Claude via backend
 */
import { ref, computed } from 'vue'

const apiUrl = import.meta.env.VITE_CLAUDE_API_URL || 'http://localhost:3000'

const models = ref([])
const selectedModel = ref('')
const messages = ref([])
const loading = ref(false)
const error = ref('')

async function loadModels() {
  try {
    error.value = ''
    const response = await fetch(`${apiUrl}/api/models`)
    if (!response.ok) throw new Error(`HTTP ${response.status}`)
    const data = await response.json()
    models.value = data.models || []
    if (models.value.length > 0 && !selectedModel.value) {
      selectedModel.value = models.value[0].id
    }
  } catch (err) {
    error.value = `Failed to load models: ${err.message}`
    console.error(error.value)
  }
}

async function sendMessage(userMessage, systemPrompt = '') {
  if (!userMessage.trim() || !selectedModel.value) return

  loading.value = true
  error.value = ''

  try {
    // Agregar mensaje del usuario a la conversación
    messages.value.push({ role: 'user', content: userMessage })

    // Enviar a Claude
    const response = await fetch(`${apiUrl}/api/chat`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        model: selectedModel.value,
        message: userMessage,
        systemPrompt
      })
    })

    const data = await response.json()

    if (!response.ok) {
      throw new Error(data.error || `HTTP ${response.status}`)
    }

    if (data.success) {
      messages.value.push({ role: 'assistant', content: data.message })
    }
  } catch (err) {
    error.value = err.message
    console.error('Chat error:', err)
  } finally {
    loading.value = false
  }
}

function clearMessages() {
  messages.value = []
  error.value = ''
}

const hasMessages = computed(() => messages.value.length > 0)

export function useClaude() {
  return {
    models,
    selectedModel,
    messages,
    loading,
    error,
    hasMessages,
    loadModels,
    sendMessage,
    clearMessages
  }
}
