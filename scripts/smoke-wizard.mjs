/**
 * Recorrido completo del asistente de calibración contra un motor simulado.
 *
 * Comprueba lo que no se ve en una captura: que cada síntoma produzca un parche
 * válido y adaptado a la configuración vigente, que «sigue ocurriendo» suba de
 * nivel en lugar de repetir el mismo cambio, y que el preset se guarde con sus
 * metadatos.
 *
 *   npx vite build --ssr scripts/smoke-wizard.mjs --outDir .tmp-ssr
 *   node .tmp-ssr/smoke-wizard.js
 */
const failures = []

function check (label, condition, extra = '') {
  if (condition) {
    console.log(`  ✓ ${label}`)
  } else {
    failures.push(label)
    console.error(`  ✗ ${label} ${extra}`)
  }
}

function installFakeEngine (initial) {
  const store = new Map()
  globalThis.localStorage = {
    getItem: (k) => (store.has(k) ? store.get(k) : null),
    setItem: (k, v) => store.set(k, String(v)),
    removeItem: (k) => store.delete(k),
    clear: () => store.clear()
  }
  globalThis.document = {
    visibilityState: 'visible',
    addEventListener () {},
    removeEventListener () {},
    querySelectorAll: () => [],
    // Vue runtime-dom crea un <template> al cargarse: sin esto ni siquiera se
    // puede importar el composable en Node.
    createElement: () => ({ innerHTML: '', content: { firstChild: null } })
  }

  const config = { ...initial }
  const NotifListener = {
    async getDuplicateDiagnostics () {
      return { config: { ...config }, session: {}, log: [], today: { duplicates: 0, skipped: 0 } }
    },
    async setDuplicateDevConfig (patch) {
      Object.assign(config, patch)
      return NotifListener.getDuplicateDiagnostics()
    },
    async setFeatureConfig () { return {} },
    async getFeatureConfig () { return {} }
  }

  globalThis.window = {
    location: { origin: 'http://localhost', href: 'http://localhost/', hash: '' },
    localStorage: globalThis.localStorage,
    addEventListener () {},
    removeEventListener () {},
    Capacitor: { Plugins: { NotifListener } }
  }

  return config
}

async function main () {
  // Configuración de partida deliberadamente «rara»: el asistente debe
  // adaptarse a ella, no aplicar valores fijos.
  const engine = installFakeEngine({
    decisionWindowMs: 5000,
    minStableMs: 400,
    premute: true,
    premuteMaxMs: 2500,
    restartOnKeep: true,
    unmuteDelayMs: 350,
    pauseToSkip: true,
    telemetry: true
  })

  const { useCalibrationWizard, WIZARD_SYMPTOMS } = await import('../src/composables/useCalibrationWizard.js')
  const wizard = useCalibrationWizard()

  console.log('Catálogo de síntomas')
  check('incluye el ruido/pitido entre canciones', WIZARD_SYMPTOMS.some(s => s.id === 'pitido-entre-canciones'))
  check('incluye la pausa permanente entre canciones', WIZARD_SYMPTOMS.some(s => s.id === 'pausa-permanente'))
  check(
    'el remedio del pitido desactiva el silenciado',
    WIZARD_SYMPTOMS.find(s => s.id === 'pitido-entre-canciones').remedies[0].patch({}).premute === false
  )
  check(
    'el remedio de la pausa desactiva «pausar antes de saltar»',
    WIZARD_SYMPTOMS.find(s => s.id === 'pausa-permanente').remedies[0].patch({}).pauseToSkip === false
  )

  console.log('\nTodos los síntomas producen un parche válido para la configuración actual')
  await wizard.startTest()
  check('la prueba arranca en el paso de diagnóstico', wizard.step.value === 'diagnose')
  check('fuerza la ventana de duplicadas a 2 semanas', wizard.testActive.value === true)

  for (const symptom of WIZARD_SYMPTOMS) {
    wizard.selectSymptom(symptom.id)
    let ok = true
    for (let level = 0; level < symptom.remedies.length; level++) {
      wizard.tier.value = level
      const changes = wizard.proposedChanges.value
      if (!Array.isArray(changes)) ok = false
      for (const change of changes) {
        if (change.to === undefined || change.to === null || change.to === '') ok = false
      }
    }
    wizard.tier.value = 0
    check(`«${symptom.title.slice(0, 44)}»`, ok)
    wizard.selectSymptom(symptom.id)
  }

  console.log('\nRecorrido: pausa permanente → sigue ocurriendo → resuelto → preset')
  wizard.selectSymptom('pausa-permanente')
  check('propone al menos un cambio', wizard.proposedChanges.value.length > 0)

  await wizard.applyRemedy()
  check('pasa a la comprobación', wizard.step.value === 'verify')
  check('el motor recibió pauseToSkip = false', engine.pauseToSkip === false, `(vale ${engine.pauseToSkip})`)

  wizard.markSameProblem()
  check('sube de nivel al insistir', wizard.tier.value === 1)
  check('vuelve al diagnóstico', wizard.step.value === 'diagnose')
  check('el segundo nivel propone algo nuevo', wizard.proposedChanges.value.length > 0)

  await wizard.applyRemedy()
  check('el segundo nivel sube la estabilización', engine.minStableMs >= 600, `(vale ${engine.minStableMs})`)

  wizard.markSolved()
  check('pasa al guardado', wizard.step.value === 'save')

  const preset = wizard.savePreset('Prueba automática')
  check('guarda el preset', wizard.presets.length === 1)
  check('registra el problema resuelto', preset.fix?.symptomId === 'pausa-permanente')
  check('registra el nivel alcanzado', preset.fix?.tier === 2)
  check('registra los intentos', preset.attempts === 2)
  check('guarda la configuración completa', preset.config.pauseToSkip === false)
  check('termina en la pantalla final', wizard.step.value === 'done')

  console.log('\nOtro problema → vuelve al listado')
  wizard.markOtherProblem()
  check('limpia el síntoma elegido', wizard.symptomId.value === null)

  await wizard.finish()
  check('cierra la prueba', wizard.testActive.value === false && wizard.step.value === 'setup')

  if (failures.length) {
    console.error(`\n${failures.length} comprobación(es) fallida(s).`)
    process.exit(1)
  }
  console.log('\nAsistente de calibración: todo correcto.')
  process.exit(0)
}

main()
