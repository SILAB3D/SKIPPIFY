import express from 'express'
import cors from 'cors'
import dotenv from 'dotenv'
import Anthropic from '@anthropic-ai/sdk'

dotenv.config({ path: '.env.local' })

const app = express()
const port = 3000

app.use(cors({
  origin: 'http://localhost:5173',
  credentials: true
}))
app.use(express.json())

const client = new Anthropic({
  apiKey: process.env.ANTHROPIC_API_KEY
})

// Modelos disponibles de Claude
const availableModels = [
  { id: 'claude-3-5-sonnet-20241022', name: 'Claude 3.5 Sonnet', maxTokens: 8000 },
  { id: 'claude-3-opus-20250219', name: 'Claude 3 Opus', maxTokens: 4000 },
  { id: 'claude-3-haiku-20250307', name: 'Claude 3 Haiku', maxTokens: 1024 }
]

// Endpoint para listar modelos disponibles
app.get('/api/models', (req, res) => {
  res.json({ models: availableModels })
})

// Endpoint para enviar mensaje a Claude
app.post('/api/chat', async (req, res) => {
  const { model, message, systemPrompt = '' } = req.body

  if (!model || !message) {
    return res.status(400).json({ error: 'Model and message are required' })
  }

  if (!process.env.ANTHROPIC_API_KEY) {
    return res.status(400).json({ error: 'ANTHROPIC_API_KEY not set in .env.local' })
  }

  try {
    const response = await client.messages.create({
      model,
      max_tokens: 2048,
      system: systemPrompt || 'Eres un asistente útil y accesible.',
      messages: [
        { role: 'user', content: message }
      ]
    })

    const text = response.content[0]?.type === 'text' ? response.content[0].text : ''

    res.json({
      success: true,
      message: text,
      model,
      usage: {
        input_tokens: response.usage.input_tokens,
        output_tokens: response.usage.output_tokens
      }
    })
  } catch (err) {
    console.error('Claude API error:', err)
    res.status(500).json({
      error: err.message || 'Error calling Claude API',
      details: err.status === 401 ? 'Invalid API key' : undefined
    })
  }
})

// Health check
app.get('/api/health', (req, res) => {
  res.json({ status: 'ok', timestamp: new Date().toISOString() })
})

app.listen(port, () => {
  console.log(`Claude backend running at http://localhost:${port}`)
  console.log(`CORS enabled for http://localhost:5173`)
  if (!process.env.ANTHROPIC_API_KEY) {
    console.warn('⚠️  ANTHROPIC_API_KEY not set! Set it in .env.local to use Claude')
  }
})
