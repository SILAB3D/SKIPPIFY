/**
 * La guía rápida obliga a elegir modo de escucha antes de seguir.
 *
 * Lo que se comprueba aquí es la máquina de estados en la que se apoya esa
 * regla —«¿ha elegido el usuario un modo alguna vez?»—, que es la parte capaz
 * de romperse sin hacer ruido: `listeningMode` siempre tiene valor, así que un
 * despiste devolvería «sí» para un usuario recién instalado y el paso dejaría
 * de bloquear sin que se note en pantalla. El render del panel se comprueba
 * aparte, en smoke-ssr.
 *
 *   npx vite build --ssr scripts/smoke-tour.mjs --outDir .tmp-ssr
 *   node .tmp-ssr/smoke-tour.js
 */
import { createSSRApp, nextTick } from 'vue'
import { renderToString } from '@vue/server-renderer'
import { createRouter, createMemoryHistory } from 'vue-router'
import { routes } from '../src/router/routes.js'
import AppTour from '../src/components/AppTour.vue'
import { useFeatures, sanitizeListeningMode } from '../src/composables/useFeatures.js'

const failures = []
const FEATURES_KEY = 'skippify-features'

function check (label, condition, extra = '') {
  if (condition) {
    console.log(`  ✓ ${label}`)
  } else {
    failures.push(label)
    console.error(`  ✗ ${label} ${extra}`)
  }
}

function installBrowserGlobals () {
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
    createElement: () => ({ innerHTML: '', content: { firstChild: null } })
  }
  globalThis.window = {
    location: { origin: 'http://localhost', href: 'http://localhost/', hash: '' },
    localStorage: globalThis.localStorage,
    addEventListener () {},
    removeEventListener () {},
    matchMedia: () => ({ matches: false, addEventListener () {}, removeEventListener () {} })
  }
}

async function main () {
  installBrowserGlobals()

  const { state: features, setListeningMode } = useFeatures()

  console.log('\n¿Ha elegido el usuario un modo de escucha?')

  check('un usuario recién instalado, no', features.listeningModeChosen === false)
  check('aunque listeningMode ya tenga un valor por defecto',
    typeof features.listeningMode === 'string' && features.listeningMode.length > 0)

  setListeningMode('casual')
  check('elegir Casual lo marca como elegido', features.listeningModeChosen === true)
  check('y aplica el modo', features.listeningMode === 'casual')

  setListeningMode('discovery')
  check('cambiar de idea lo mantiene elegido', features.listeningModeChosen === true)
  check('con el modo nuevo', features.listeningMode === 'discovery')

  setListeningMode('custom')
  check('personalizado también cuenta como elección',
    features.listeningModeChosen === true && features.listeningMode === 'custom')

  console.log('\nLa marca sobrevive al guardado')

  // El watch que persiste el estado se vacía en microtarea: leerlo antes de
  // ceder el turno daba un fallo que era de la prueba, no del producto.
  await nextTick()
  const guardado = JSON.parse(globalThis.localStorage.getItem(FEATURES_KEY) || '{}')
  check('se persiste en skippify-features', guardado.listeningModeChosen === true)

  console.log('\nUn valor inventado no cuela')
  setListeningMode('lo-que-sea')
  check('el modo no cambia', features.listeningMode === 'custom')
  check('sanitizeListeningMode cae al de por defecto', sanitizeListeningMode('lo-que-sea') === 'custom')

  console.log('\nEl panel de la guía se renderiza')

  const app = createSSRApp({
    components: { AppTour },
    template: '<AppTour :model-value="true" />'
  })
  // AppTour cambia de pestaña en cada paso, así que necesita un router. Sin
  // `isReady()` el render se queda esperando a la primera navegación.
  const router = createRouter({ history: createMemoryHistory(), routes })
  app.use(router)
  await router.push('/')
  await router.isReady()
  const html = await renderToString(app)

  check('el panel se pinta', html.includes('Guía rápida de Skippify'))
  check('empieza por la bienvenida', html.includes('Bienvenido a Skippify'))
  check('y el primer paso sí se puede omitir', html.includes('Omitir'))

  console.log(`\nGuía rápida: ${failures.length ? `${failures.length} fallo(s)` : 'todo correcto'}.`)
  // Salida explícita: montar la app deja temporizadores vivos (el reloj de
  // reproducción, entre otros) y Node se quedaría esperándolos para siempre,
  // colgando la tanda entera de comprobaciones.
  process.exit(failures.length ? 1 : 0)
}

main().catch((err) => {
  console.error('La comprobación no pudo completarse:', err)
  process.exit(2)
})
