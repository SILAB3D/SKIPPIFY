/**
 * useCalibrationWizard — asistente interactivo para el salto de duplicadas.
 *
 * Resuelve el problema real de esta pantalla: los parámetros del motor sólo
 * tienen sentido frente a un síntoma concreto, y probarlos «a ojo» con la
 * música que suene en ese momento no mide nada. El asistente fija un protocolo
 * (una playlist de 10 canciones ya escuchadas, en bucle, con la ventana de
 * duplicadas en 2 semanas), propone un ajuste adaptado a la configuración que
 * el usuario tiene AHORA, y sólo lo da por bueno cuando él lo confirma.
 *
 * Cada síntoma tiene varios «niveles» de remedio: si el primero no basta, el
 * siguiente aprieta más en la misma dirección en lugar de repetir el cambio.
 */
import { computed, reactive, ref } from 'vue'
import { useCalibration, CALIBRATION_PARAMS, CALIBRATION_TOGGLES, sanitizeConfig } from '@/composables/useCalibration'
import { useFeatures } from '@/composables/useFeatures'

const PRESETS_KEY = 'skippify-calibration-presets'
const MAX_PRESETS = 12

/** Ventana de duplicadas que se fuerza durante la prueba. */
export const TEST_INTERVAL = '2w'
export const TEST_PLAYLIST_SIZE = 10

const clamp = (value, min, max) => Math.min(max, Math.max(min, Math.round(value)))

const LIMITS = Object.fromEntries(
  CALIBRATION_PARAMS.map(p => [p.key, { min: p.min, max: p.max }])
)

/** Sube un parámetro sin bajar nunca de lo que ya tenía el usuario. */
function atLeast (cfg, key, value) {
  const { min, max } = LIMITS[key]
  return clamp(Math.max(Number(cfg[key]) || 0, value), min, max)
}

/** Baja un parámetro sin subir nunca por encima de lo que ya tenía. */
function atMost (cfg, key, value) {
  const { min, max } = LIMITS[key]
  return clamp(Math.min(Number.isFinite(Number(cfg[key])) ? Number(cfg[key]) : value, value), min, max)
}

const exact = (key, value) => clamp(value, LIMITS[key].min, LIMITS[key].max)

/**
 * Catálogo de síntomas. `remedies` va de menos a más agresivo: el asistente
 * avanza de nivel cada vez que el usuario responde «sigue ocurriendo».
 */
export const WIZARD_SYMPTOMS = [
  {
    id: 'pitido-entre-canciones',
    icon: '🔉',
    title: 'Se oye un ruido o un pitido entre canciones',
    detail: 'Un chasquido, un pitido corto o un salto de volumen justo al cambiar de pista.',
    cause: 'Lo provoca el silenciado mientras se decide: el motor baja y sube el volumen multimedia en milisegundos y algunos dispositivos lo acusan con un artefacto audible.',
    remedies: [
      {
        summary: 'Desactivar el silenciado mientras se decide',
        explain: 'Es la causa directa del ruido. Sin él oirás el arranque de las duplicadas antes del salto, pero desaparece el artefacto.',
        patch: (cfg) => ({
          premute: false,
          restartOnKeep: false,
          minStableMs: atMost(cfg, 'minStableMs', 250)
        })
      },
      {
        summary: 'Sin silenciado y con decisión más rápida',
        explain: 'Ya sin silenciado, se acorta la espera y se amplía la ventana para que el salto llegue antes de que se oiga apenas nada.',
        patch: (cfg) => ({
          premute: false,
          restartOnKeep: false,
          minStableMs: exact('minStableMs', 150),
          decisionWindowMs: atLeast(cfg, 'decisionWindowMs', 8000)
        })
      }
    ]
  },
  {
    id: 'pausa-permanente',
    icon: '⏸️',
    title: 'La reproducción se queda pausada entre canciones',
    detail: 'Al cambiar de pista Spotify se queda en pausa y hay que darle a reproducir a mano.',
    cause: 'Lo provoca «Pausar antes de saltar», un método heredado: si el reanudado no llega a tiempo, la reproducción se queda parada. Debe estar desactivado salvo que quieras reproducir aquel fallo.',
    remedies: [
      {
        summary: 'Desactivar «Pausar antes de saltar»',
        explain: 'Es el ajuste que deja la reproducción parada. Desactivado es el valor recomendado por defecto.',
        patch: () => ({ pauseToSkip: false })
      },
      {
        summary: 'Sin pausa previa y con decisión más asentada',
        explain: 'Si aún se queda parada, es que se está decidiendo sobre metadatos a medio cambiar: se da más margen antes de juzgar y se acorta la ventana.',
        patch: (cfg) => ({
          pauseToSkip: false,
          minStableMs: atLeast(cfg, 'minStableMs', 600),
          decisionWindowMs: atMost(cfg, 'decisionWindowMs', 6000)
        })
      }
    ]
  },
  {
    id: 'franja-audible',
    icon: '🎧',
    title: 'Se oye un trozo de la duplicada antes de saltar',
    detail: 'La canción repetida suena medio segundo o más antes de que el salto entre.',
    cause: 'El silenciado previo no llega a tiempo, o el sonido vuelve antes de cerrar la decisión.',
    remedies: [
      {
        summary: 'Silenciar antes y decidir con menos espera',
        explain: 'Se garantiza el silenciado previo y se recorta la estabilización, que es lo que retrasa la decisión.',
        patch: (cfg) => ({
          premute: true,
          minStableMs: atMost(cfg, 'minStableMs', 250),
          premuteMaxMs: atLeast(cfg, 'premuteMaxMs', 3500),
          unmuteDelayMs: atLeast(cfg, 'unmuteDelayMs', 250)
        })
      },
      {
        summary: 'Más margen de silencio y ventana más amplia',
        explain: 'Si aún se cuela audio, el motor está tardando más de lo previsto: se le da más silencio de seguridad y más ventana para saltar.',
        patch: (cfg) => ({
          premute: true,
          minStableMs: exact('minStableMs', 150),
          premuteMaxMs: atLeast(cfg, 'premuteMaxMs', 5000),
          decisionWindowMs: atLeast(cfg, 'decisionWindowMs', 8000)
        })
      },
      {
        summary: 'Perfil de silencio máximo',
        explain: 'Último recurso: decisión casi inmediata y el silencio de seguridad muy largo. A cambio, un fallo puntual deja el móvil mudo más tiempo.',
        patch: () => ({
          premute: true,
          minStableMs: exact('minStableMs', 100),
          premuteMaxMs: exact('premuteMaxMs', 6500),
          unmuteDelayMs: exact('unmuteDelayMs', 150)
        })
      }
    ]
  },
  {
    id: 'salta-la-que-no-es',
    icon: '🎯',
    title: 'Salta canciones que no son duplicadas',
    detail: 'Se salta una canción que no habías escuchado en el periodo configurado.',
    cause: 'Se está decidiendo con los metadatos de la canción anterior, que aún no se habían actualizado.',
    remedies: [
      {
        summary: 'Dar más tiempo a que asienten los metadatos',
        explain: 'Se sube la estabilización por encima de lo que tienes ahora y se recorta la ventana para no juzgar tarde.',
        patch: (cfg) => ({
          minStableMs: atLeast(cfg, 'minStableMs', Math.max(700, (Number(cfg.minStableMs) || 0) + 300)),
          decisionWindowMs: atMost(cfg, 'decisionWindowMs', 4500)
        })
      },
      {
        summary: 'Estabilización larga y ventana corta',
        explain: 'Si sigue confundiéndose, se prioriza no equivocarse aunque se escape alguna duplicada detectada tarde.',
        patch: (cfg) => ({
          minStableMs: exact('minStableMs', 1000),
          decisionWindowMs: exact('decisionWindowMs', 3500),
          premuteMaxMs: atLeast(cfg, 'premuteMaxMs', 3000)
        })
      },
      {
        summary: 'Máxima prudencia',
        explain: 'Sólo se salta con datos plenamente asentados y muy al principio de la pista.',
        patch: () => ({
          minStableMs: exact('minStableMs', 1400),
          decisionWindowMs: exact('decisionWindowMs', 3000)
        })
      }
    ]
  },
  {
    id: 'no-salta',
    icon: '🚪',
    title: 'Se le escapan duplicadas sin saltar',
    detail: 'Canciones que ya habías escuchado suenan enteras sin que pase nada.',
    cause: 'La decisión llega cuando la pista ya iba demasiado avanzada y queda fuera de la ventana.',
    remedies: [
      {
        summary: 'Ampliar la ventana de decisión',
        explain: 'Se amplía el margen para saltar y se acelera la decisión sin renunciar al silenciado.',
        patch: (cfg) => ({
          premute: true,
          decisionWindowMs: atLeast(cfg, 'decisionWindowMs', Math.max(8000, (Number(cfg.decisionWindowMs) || 0) + 2500)),
          minStableMs: atMost(cfg, 'minStableMs', 300)
        })
      },
      {
        summary: 'Ventana amplia y decisión inmediata',
        explain: 'Se acepta saltar más tarde dentro de la canción con tal de no perder ninguna duplicada.',
        patch: (cfg) => ({
          decisionWindowMs: exact('decisionWindowMs', 12000),
          minStableMs: exact('minStableMs', 200),
          premuteMaxMs: atLeast(cfg, 'premuteMaxMs', 4000)
        })
      },
      {
        summary: 'Ventana máxima',
        explain: 'El tope del motor. Si aún así se escapan, revisa que el intervalo de «Saltar duplicadas» cubra realmente esas escuchas.',
        patch: () => ({
          decisionWindowMs: exact('decisionWindowMs', 15000),
          minStableMs: exact('minStableMs', 150),
          premuteMaxMs: exact('premuteMaxMs', 5000)
        })
      }
    ]
  },
  {
    id: 'arranque-cortado',
    icon: '✂️',
    title: 'Las canciones buenas empiezan cortadas',
    detail: 'Una canción que NO era duplicada arranca con el principio comido.',
    cause: 'Se silenció el arranque para decidir y después no se rebobinó, o se rebobinó demasiado pronto.',
    remedies: [
      {
        summary: 'Reiniciar la pista cuando no era duplicada',
        explain: 'Se activa el rebobinado y se da margen antes de devolver el sonido, para no oír el punto anterior al salto.',
        patch: (cfg) => ({
          restartOnKeep: true,
          unmuteDelayMs: atLeast(cfg, 'unmuteDelayMs', 400)
        })
      },
      {
        summary: 'Más retardo al devolver el sonido',
        explain: 'Si aún se nota el corte, el rebobinado necesita más tiempo antes de subir el volumen.',
        patch: (cfg) => ({
          restartOnKeep: true,
          unmuteDelayMs: exact('unmuteDelayMs', 650),
          minStableMs: atMost(cfg, 'minStableMs', 300)
        })
      },
      {
        summary: 'Rebobinado holgado y silencio corto',
        explain: 'Se acorta el silencio de seguridad para que haya menos que recuperar y se alarga el retardo del rebobinado.',
        patch: () => ({
          restartOnKeep: true,
          unmuteDelayMs: exact('unmuteDelayMs', 900),
          premuteMaxMs: exact('premuteMaxMs', 2000)
        })
      }
    ]
  },
  {
    id: 'mudo-de-mas',
    icon: '🔇',
    title: 'El móvil se queda mudo más de la cuenta',
    detail: 'Silencios largos al cambiar de canción, aunque después vuelva el sonido.',
    cause: 'El silencio de seguridad es más largo de lo que tu dispositivo tarda realmente en decidir.',
    remedies: [
      {
        summary: 'Recortar el silencio de seguridad',
        explain: 'El sonido vuelve antes ante cualquier imprevisto, sin renunciar al silenciado previo.',
        patch: (cfg) => ({
          premuteMaxMs: atMost(cfg, 'premuteMaxMs', 1800),
          unmuteDelayMs: atMost(cfg, 'unmuteDelayMs', 150),
          minStableMs: atMost(cfg, 'minStableMs', 250)
        })
      },
      {
        summary: 'Silencio mínimo',
        explain: 'El tope baja a poco más de un segundo: oirás algún arranque de duplicada, pero nunca un mudo largo.',
        patch: () => ({
          premuteMaxMs: exact('premuteMaxMs', 1200),
          unmuteDelayMs: exact('unmuteDelayMs', 100)
        })
      },
      {
        summary: 'Renunciar al silenciado',
        explain: 'Se desactiva el silenciado previo por completo. Es la única forma de garantizar que no habrá mudos.',
        patch: () => ({ premute: false, restartOnKeep: false })
      }
    ]
  },
  {
    id: 'movil-lento',
    icon: '🐢',
    title: 'Mi dispositivo tarda en detectar la reproducción',
    detail: 'Todo llega con retraso: la canción actual, los saltos y los contadores.',
    cause: 'El sistema entrega las notificaciones de Spotify con latencia, así que cada fase necesita más margen.',
    remedies: [
      {
        summary: 'Perfil tolerante',
        explain: 'Más tiempo para todo, a costa de saltos algo más tardíos dentro de la canción.',
        patch: (cfg) => ({
          minStableMs: atLeast(cfg, 'minStableMs', 900),
          decisionWindowMs: atLeast(cfg, 'decisionWindowMs', 12000),
          premuteMaxMs: atLeast(cfg, 'premuteMaxMs', 5000),
          unmuteDelayMs: atLeast(cfg, 'unmuteDelayMs', 400)
        })
      },
      {
        summary: 'Perfil muy tolerante',
        explain: 'Los valores más altos que admite el motor en cada fase.',
        patch: () => ({
          minStableMs: exact('minStableMs', 1200),
          decisionWindowMs: exact('decisionWindowMs', 15000),
          premuteMaxMs: exact('premuteMaxMs', 6500)
        })
      }
    ]
  }
]

const LABELS = Object.fromEntries([
  ...CALIBRATION_PARAMS.map(p => [p.key, p.label]),
  ...CALIBRATION_TOGGLES.map(t => [t.key, t.label])
])

function loadPresets () {
  try {
    const raw = localStorage.getItem(PRESETS_KEY)
    const parsed = raw ? JSON.parse(raw) : []
    return Array.isArray(parsed) ? parsed.filter(item => item?.id && item?.config) : []
  } catch {
    return []
  }
}

const presets = reactive(loadPresets())

function persistPresets () {
  try {
    localStorage.setItem(PRESETS_KEY, JSON.stringify([...presets]))
  } catch { /* ignored */ }
}

// ── Estado del asistente (único, compartido por la vista) ────────────────────

const STEPS = ['setup', 'diagnose', 'verify', 'save']

const step = ref('setup')
const symptomId = ref(null)
const tier = ref(0)
const attempts = ref([])
const testActive = ref(false)
const savedPreset = ref(null)

/** Configuración previa a la prueba, para poder deshacerlo todo al salir. */
let baseline = null

export function useCalibrationWizard () {
  const { config, apply, refresh, available } = useCalibration()
  const { state: features } = useFeatures()

  // 'done' no es un paso del recorrido: se muestra con la barra completa.
  const stepIndex = computed(() => (
    step.value === 'done' ? STEPS.length - 1 : Math.max(0, STEPS.indexOf(step.value))
  ))
  const symptom = computed(() => WIZARD_SYMPTOMS.find(s => s.id === symptomId.value) || null)

  const remedy = computed(() => {
    if (!symptom.value) return null
    const list = symptom.value.remedies
    return list[Math.min(tier.value, list.length - 1)] || null
  })

  /** ¿Queda algún nivel más agresivo por probar para este síntoma? */
  const hasStrongerRemedy = computed(() => (
    !!symptom.value && tier.value < symptom.value.remedies.length - 1
  ))

  /** Parche ya resuelto contra la configuración vigente del usuario. */
  const proposedPatch = computed(() => {
    if (!remedy.value) return {}
    return sanitizeConfig(remedy.value.patch({ ...config.value }))
  })

  /** Sólo lo que cambia de verdad: si ya lo tiene puesto, no se le enseña. */
  const proposedChanges = computed(() => {
    const current = config.value
    return Object.entries(proposedPatch.value)
      .filter(([key, next]) => current[key] !== next)
      .map(([key, next]) => ({
        key,
        label: LABELS[key] || key,
        from: formatValue(key, current[key]),
        to: formatValue(key, next),
        direction: typeof next === 'boolean'
          ? (next ? 'up' : 'down')
          : (Number(next) > Number(current[key]) ? 'up' : 'down')
      }))
  })

  /** Contexto de la prueba: lo que el usuario debe tener preparado. */
  const testChecklist = computed(() => ([
    {
      id: 'playlist',
      text: `Crea una playlist con unas ${TEST_PLAYLIST_SIZE} canciones que hayas escuchado enteras hace menos de una semana.`
    },
    {
      id: 'repeat',
      text: 'Activa en Spotify la repetición de todas las canciones de la lista.'
    },
    {
      id: 'window',
      text: `Skippify fijará «Saltar duplicadas» en ${TEST_INTERVAL === '2w' ? 'las últimas 2 semanas' : TEST_INTERVAL} durante la prueba, para que todas esas canciones cuenten como duplicadas.`
    }
  ]))

  function formatValue (key, value) {
    if (typeof value === 'boolean') return value ? 'activado' : 'desactivado'
    const param = CALIBRATION_PARAMS.find(p => p.key === key)
    return param ? `${value} ${param.unit}` : String(value ?? '—')
  }

  /** Arranca la prueba: guarda el estado actual y fuerza el escenario. */
  async function startTest () {
    await refresh()
    baseline = {
      engine: sanitizeConfig(config.value),
      skipDuplicates: !!features.skipDuplicates,
      skipDuplicatesInterval: features.skipDuplicatesInterval,
      listeningMode: features.listeningMode
    }

    // El modo de escucha puede tener bloqueado el salto de duplicadas; sin
    // pasar a «Personalizado» la prueba mediría el motor apagado.
    features.listeningMode = 'custom'
    features.skipDuplicates = true
    features.skipDuplicatesInterval = TEST_INTERVAL

    testActive.value = true
    attempts.value = []
    savedPreset.value = null
    symptomId.value = null
    tier.value = 0
    step.value = 'diagnose'
  }

  function selectSymptom (id) {
    if (symptomId.value === id) {
      symptomId.value = null
      return
    }
    symptomId.value = id
    tier.value = 0
  }

  /** Aplica el remedio vigente y pasa a la comprobación. */
  async function applyRemedy () {
    if (!remedy.value) return
    const patch = proposedPatch.value
    if (Object.keys(patch).length) await apply(patch)

    attempts.value = [
      ...attempts.value,
      {
        at: new Date().toISOString(),
        symptomId: symptomId.value,
        symptomTitle: symptom.value?.title || '',
        tier: tier.value,
        summary: remedy.value.summary,
        patch
      }
    ]
    step.value = 'verify'
  }

  /** El usuario confirma que el problema desapareció. */
  function markSolved () {
    step.value = 'save'
  }

  /** Sigue el mismo problema: se sube de nivel y se vuelve a proponer. */
  function markSameProblem () {
    if (hasStrongerRemedy.value) tier.value += 1
    step.value = 'diagnose'
  }

  /** Ha aparecido otro problema: se vuelve al listado de síntomas. */
  function markOtherProblem () {
    symptomId.value = null
    tier.value = 0
    step.value = 'diagnose'
  }

  /** Guarda el resultado como preset, con la traza de lo que se arregló. */
  function savePreset (name) {
    const last = attempts.value[attempts.value.length - 1] || null
    const preset = {
      id: `preset-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`,
      name: (name || '').toString().trim() || `Calibración ${new Date().toLocaleDateString('es-ES')}`,
      savedAt: new Date().toISOString(),
      config: sanitizeConfig(config.value),
      // Metadatos: qué se arregló y cuántos intentos hicieron falta.
      fix: last
        ? {
            symptomId: last.symptomId,
            symptomTitle: last.symptomTitle,
            remedy: last.summary,
            tier: last.tier + 1
          }
        : null,
      attempts: attempts.value.length,
      device: navigator.userAgent?.slice(0, 120) || ''
    }

    presets.unshift(preset)
    while (presets.length > MAX_PRESETS) presets.pop()
    persistPresets()

    savedPreset.value = preset
    step.value = 'done'
    return preset
  }

  async function applyPreset (id) {
    const found = presets.find(item => item.id === id)
    if (!found) return null
    return apply(found.config)
  }

  function deletePreset (id) {
    const index = presets.findIndex(item => item.id === id)
    if (index < 0) return
    presets.splice(index, 1)
    persistPresets()
  }

  /** Cierra el asistente. `keep` decide si se conserva lo probado. */
  async function finish ({ keepEngine = true, keepFeature = false } = {}) {
    if (baseline) {
      if (!keepEngine) await apply(baseline.engine)
      if (!keepFeature) {
        features.listeningMode = baseline.listeningMode
        features.skipDuplicates = baseline.skipDuplicates
        features.skipDuplicatesInterval = baseline.skipDuplicatesInterval
      }
    }
    baseline = null
    testActive.value = false
    step.value = 'setup'
    symptomId.value = null
    tier.value = 0
    attempts.value = []
    savedPreset.value = null
  }

  return {
    STEPS,
    available,
    step,
    stepIndex,
    symptomId,
    symptom,
    symptoms: WIZARD_SYMPTOMS,
    remedy,
    tier,
    hasStrongerRemedy,
    proposedChanges,
    attempts,
    testActive,
    testChecklist,
    savedPreset,
    presets,
    config,
    startTest,
    selectSymptom,
    applyRemedy,
    markSolved,
    markSameProblem,
    markOtherProblem,
    savePreset,
    applyPreset,
    deletePreset,
    finish
  }
}
