/**
 * Comprobación de humo: renderiza en servidor la App y cada vista con un router
 * en memoria. No sustituye a probarlo en el móvil, pero detecta al instante
 * plantillas rotas, imports mal escritos y errores de ejecución en `setup()`.
 *
 * Se compila con Vite (los .vue hay que transformarlos) y se ejecuta con Node:
 *   npx vite build --ssr scripts/smoke-ssr.mjs --outDir .tmp-ssr
 *   node .tmp-ssr/smoke-ssr.js
 */
import { createSSRApp } from 'vue'
import { renderToString } from '@vue/server-renderer'
import { createRouter, createMemoryHistory } from 'vue-router'

const ROUTES = ['/', '/stats', '/modes', '/features', '/settings', '/league', '/macros', '/calibration']

/**
 * Mínimos globales del navegador. Varias piezas consultan `window.Capacitor`
 * o `localStorage` en el propio `setup()`; sin esto el render fallaría por
 * motivos que en el móvil no existen.
 */
function installBrowserGlobals () {
  const store = new Map()
  globalThis.localStorage = {
    getItem: (k) => (store.has(k) ? store.get(k) : null),
    setItem: (k, v) => store.set(k, String(v)),
    removeItem: (k) => store.delete(k),
    clear: () => store.clear()
  }
  globalThis.window = {
    location: { origin: 'http://localhost', href: 'http://localhost/', hash: '' },
    localStorage: globalThis.localStorage,
    addEventListener () {},
    removeEventListener () {},
    matchMedia: () => ({ matches: false, addEventListener () {}, removeEventListener () {} })
  }
  globalThis.document = {
    visibilityState: 'visible',
    addEventListener () {},
    removeEventListener () {},
    querySelectorAll: () => []
  }
  // Node 21+ ya define `navigator` como getter de sólo lectura: no hace falta.
}

async function main () {
  installBrowserGlobals()

  // Import dinámico: los composables leen esos globales al evaluarse.
  const { default: App } = await import('../src/App.vue')
  const { routes } = await import('../src/router/routes.js')

  let failures = 0

  for (const path of ROUTES) {
    const router = createRouter({ history: createMemoryHistory(), routes })
    const app = createSSRApp(App)
    app.use(router)
    app.config.warnHandler = (msg) => {
      console.warn(`  ! aviso en ${path}: ${msg}`)
    }

    await router.push(path)
    await router.isReady()

    try {
      const html = await renderToString(app)
      console.log(`  ✓ ${path} (${html.length} bytes)`)
    } catch (error) {
      failures++
      console.error(`  ✗ ${path}: ${error?.stack || error}`)
    }
  }

  if (failures) {
    console.error(`\n${failures} ruta(s) con error.`)
    process.exit(1)
  }
  console.log('\nTodas las rutas renderizan.')
}

main()
