# Integración Claude AI en Skippify

La app ahora incluye soporte completo para **Claude** de Anthropic.

## Setup Rápido

### 1. Obtén tu API Key

1. Ve a https://console.anthropic.com/
2. Crea una cuenta o inicia sesión
3. Ve a **API Keys** en el sidebar izquierdo
4. Copia tu clave secreta (empieza con `sk-ant-`)

### 2. Configura la API Key

Edita el archivo `.env.local` en la raíz del proyecto:

```env
ANTHROPIC_API_KEY=sk-ant-tu-clave-aqui
VITE_CLAUDE_API_URL=http://localhost:3000
```

### 3. Inicia los servidores

Abre 2 terminales:

**Terminal 1 - Frontend (Vite):**
```bash
npm run dev
```
Accede a http://localhost:5173

**Terminal 2 - Backend (Claude API):**
```bash
npm run server
```

### 4. Usa Claude

- Ve a la app en http://localhost:5173
- Haz clic en **Claude AI** en el sidebar
- Selecciona el modelo que prefieras
- Escribe tu pregunta y presiona Enter

## Modelos Disponibles

- **Claude 3.5 Sonnet** - Mejor balance velocidad/calidad (recomendado)
- **Claude 3 Opus** - Más potente, usa más tokens
- **Claude 3 Haiku** - Rápido y económico

## Troubleshooting

### "Models not loading"
- Verifica que `npm run server` esté corriendo sin errores
- Revisa que `.env.local` tenga una `ANTHROPIC_API_KEY` válida
- Abre la consola del navegador (F12) y busca errores de red

### "Invalid API key"
- Comprueba la clave en `.env.local` (debe empezar con `sk-ant-`)
- Genera una nueva clave en https://console.anthropic.com/api_keys

### CORS errors
- Asegúrate que ambos servidores están corriendo:
  - Frontend: http://localhost:5173
  - Backend: http://localhost:3000

## Límites y Costos

- Verificarán automáticamente los tokens usados en cada interacción
- Los precios dependen del modelo: Sonnet ~3¢, Opus ~15¢, Haiku ~0.25¢ por 1M tokens
- Consulta https://www.anthropic.com/pricing para detalles

## Estructura

```
src/
  composables/useClaude.js       - Lógica de comunicación con Claude
  components/ClaudeChat.vue      - Componente de interfaz
  views/ClaudeView.vue           - Vista principal

server.js                        - Backend Node.js/Express
.env.local                       - Configuración (API key)
```

## Desarrollo

Para hacer cambios en la interfaz:

1. Edita `src/components/ClaudeChat.vue`
2. El cambio se refleja automáticamente en http://localhost:5173 (Vite hot-reload)

Para cambios en el backend:

1. Edita `server.js`
2. Reinicia el servidor (`npm run server`)

---

¡Listo! Ahora Skippify puede chatear con Claude directamente. 🤖
