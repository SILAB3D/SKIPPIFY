/**
 * useCalibration — puente con el motor nativo de duplicadas y toda la lógica de
 * la pestaña «Calibración de salto»: metadatos de cada parámetro y puntos de
 * restauración. El asistente guiado vive aparte, en useCalibrationWizard.
 *
 * La vista sólo pinta: aquí vive lo que significa cada ajuste y qué implica
 * subirlo o bajarlo, para que la interfaz pueda explicárselo al usuario sin
 * duplicar textos por todas partes.
 */
import { computed, reactive, ref } from 'vue'

const CHECKPOINT_KEY = 'skippify-calibration-checkpoints'
const MAX_CHECKPOINTS = 8

/** Valores por defecto del motor. Deben coincidir con DuplicateSkipEngine.java. */
export const CALIBRATION_DEFAULTS = {
  decisionWindowMs: 5000,
  minStableMs: 400,
  premute: true,
  premuteMaxMs: 2500,
  restartOnKeep: true,
  unmuteDelayMs: 350,
  pauseToSkip: false,
  telemetry: true
}

/**
 * Parámetros numéricos. `step` es el salto del control; los botones ± mueven un
 * 5 % del recorrido total, redondeado a un múltiplo de `step`.
 */
export const CALIBRATION_PARAMS = [
  {
    key: 'decisionWindowMs',
    label: 'Ventana de decisión',
    unit: 'ms',
    min: 1000,
    max: 15000,
    step: 500,
    summary: 'Hasta qué punto de la canción se permite saltar. Pasado ese punto ya no se salta nunca.',
    up: 'Más margen: se cazan duplicadas que tu móvil detecta con retraso. Si te pasas, notarás saltos varios segundos después de empezar la canción.',
    down: 'Saltos más limpios, siempre al principio. Si lo bajas demasiado, las duplicadas detectadas tarde se te escaparán enteras.'
  },
  {
    key: 'minStableMs',
    label: 'Espera de estabilización',
    unit: 'ms',
    min: 0,
    max: 2000,
    step: 100,
    summary: 'Tiempo que se le da al sistema para asentar los datos de la canción antes de juzgarla.',
    up: 'Aumento del tiempo de respuesta: útil si tu dispositivo tarda en detectar la canción o si a veces salta la que no era.',
    down: 'Decisión más rápida y menos silencio previo. Si lo bajas demasiado, se decidirá con datos aún caducados de la canción anterior.'
  },
  {
    key: 'premuteMaxMs',
    label: 'Silencio máximo de seguridad',
    unit: 'ms',
    min: 500,
    max: 8000,
    step: 250,
    summary: 'Tope absoluto del silenciado previo. Vencido el plazo, el sonido vuelve pase lo que pase.',
    up: 'Más margen para decidir sin que se oiga nada. Si te pasas, un fallo puntual dejará el móvil mudo más tiempo.',
    down: 'El sonido vuelve antes ante cualquier imprevisto. Si lo bajas por debajo de lo que tarda tu móvil en decidir, oirás el principio de las duplicadas.'
  },
  {
    key: 'unmuteDelayMs',
    label: 'Retardo al devolver el sonido',
    unit: 'ms',
    min: 0,
    max: 2000,
    step: 50,
    summary: 'Pausa entre rebobinar la canción y volver a subir el volumen.',
    up: 'Evita oír un instante del punto anterior al rebobinado. Si te pasas, perderás el arranque real de la canción.',
    down: 'El sonido vuelve casi al instante. Si lo bajas demasiado, se colará una fracción de segundo del punto equivocado.'
  }
]

export const CALIBRATION_TOGGLES = [
  {
    key: 'premute',
    label: 'Silenciar mientras se decide',
    summary: 'Silencia la canción en cuanto empieza y devuelve el sonido al cerrar la decisión. Elimina la franja audible de las duplicadas, pero en algunos dispositivos el cambio de volumen se oye como un chasquido o un pitido: si te pasa, desactívalo.',
    recommended: true
  },
  {
    key: 'restartOnKeep',
    label: 'Reiniciar si no era duplicada',
    summary: 'Si la canción resulta no ser duplicada, se rebobina a cero para devolverte el fragmento que se silenció.',
    recommended: true
  },
  {
    key: 'telemetry',
    label: 'Registrar decisiones',
    summary: 'Alimenta el registro de esta pantalla. Desactívalo si prefieres no guardar nada en memoria.',
    recommended: true
  },
  {
    key: 'pauseToSkip',
    label: 'Pausar antes de saltar',
    summary: 'Método heredado, desactivado por defecto. Es la causa de que la reproducción se quede pausada de forma permanente entre canciones: actívalo sólo si quieres reproducir aquel comportamiento.',
    recommended: false,
    legacy: true
  }
]

const diagnostics = ref(null)
const busy = ref(false)
const checkpoints = reactive(loadCheckpoints())

function plugin () {
  return window.Capacitor?.Plugins?.NotifListener || null
}

function loadCheckpoints () {
  try {
    const raw = localStorage.getItem(CHECKPOINT_KEY)
    const parsed = raw ? JSON.parse(raw) : []
    return Array.isArray(parsed) ? parsed.filter(isValidCheckpoint) : []
  } catch {
    return []
  }
}

function isValidCheckpoint (item) {
  return !!item
    && typeof item.id === 'string'
    && typeof item.name === 'string'
    && item.config && typeof item.config === 'object'
}

function persistCheckpoints () {
  try {
    localStorage.setItem(CHECKPOINT_KEY, JSON.stringify([...checkpoints]))
  } catch { /* ignored */ }
}

/** Deja sólo las claves que el motor entiende, con tipos saneados. */
export function sanitizeConfig (raw = {}) {
  const out = {}
  for (const param of CALIBRATION_PARAMS) {
    const value = Number(raw[param.key])
    if (!Number.isFinite(value)) continue
    out[param.key] = Math.min(param.max, Math.max(param.min, Math.round(value)))
  }
  for (const toggle of CALIBRATION_TOGGLES) {
    if (typeof raw[toggle.key] === 'boolean') out[toggle.key] = raw[toggle.key]
  }
  return out
}

async function call (method, args = {}) {
  const NL = plugin()
  if (!NL || typeof NL[method] !== 'function') return null
  try {
    return await NL[method](args)
  } catch {
    return null
  }
}

async function refresh () {
  const result = await call('getDuplicateDiagnostics')
  if (result) diagnostics.value = result
  return result
}

async function apply (patch) {
  const clean = sanitizeConfig(patch)
  if (!Object.keys(clean).length) return null
  busy.value = true
  const result = await call('setDuplicateDevConfig', clean)
  if (result) diagnostics.value = result
  busy.value = false
  return result
}

async function resetConfig () {
  busy.value = true
  const result = await call('resetDuplicateDevConfig')
  if (result) diagnostics.value = result
  busy.value = false
  return result
}

async function clearLog () {
  const result = await call('clearDuplicateLog')
  if (result) diagnostics.value = result
}

async function resetHistory () {
  busy.value = true
  const result = await call('resetDuplicateHistory')
  if (result) diagnostics.value = result
  busy.value = false
}

/** Guarda la configuración vigente como punto de restauración. */
function saveCheckpoint (name) {
  const config = sanitizeConfig(diagnostics.value?.config || CALIBRATION_DEFAULTS)
  const label = (name || '').toString().trim() || `Punto ${checkpoints.length + 1}`

  checkpoints.unshift({
    id: `cp-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`,
    name: label,
    savedAt: new Date().toISOString(),
    config
  })
  // Sin tope, una pantalla que se usa a base de prueba y error acabaría
  // llenando localStorage de instantáneas casi idénticas.
  while (checkpoints.length > MAX_CHECKPOINTS) checkpoints.pop()
  persistCheckpoints()
  return checkpoints[0]
}

async function restoreCheckpoint (id) {
  const found = checkpoints.find(item => item.id === id)
  if (!found) return null
  return apply(found.config)
}

function deleteCheckpoint (id) {
  const index = checkpoints.findIndex(item => item.id === id)
  if (index < 0) return
  checkpoints.splice(index, 1)
  persistCheckpoints()
}

/** Salto de los botones ±: un 5 % del recorrido, alineado al step del control. */
export function stepFor (param) {
  const fivePercent = (param.max - param.min) * 0.05
  return Math.max(param.step, Math.round(fivePercent / param.step) * param.step)
}

export function useCalibration () {
  const available = computed(() => !!plugin() && !!diagnostics.value)
  const config = computed(() => ({
    ...CALIBRATION_DEFAULTS,
    ...(diagnostics.value?.config || {})
  }))
  const session = computed(() => diagnostics.value?.session || {})
  const log = computed(() => diagnostics.value?.log || [])
  const today = computed(() => diagnostics.value?.today || { duplicates: 0, skipped: 0 })

  return {
    diagnostics,
    available,
    busy,
    config,
    session,
    log,
    today,
    checkpoints,
    refresh,
    apply,
    resetConfig,
    clearLog,
    resetHistory,
    saveCheckpoint,
    restoreCheckpoint,
    deleteCheckpoint
  }
}
