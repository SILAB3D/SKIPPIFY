/**
 * Comprobación de humo de los paneles de Inicio.
 *
 * Se generan historiales sintéticos con el resultado conocido de antemano y se
 * contrasta con lo que calculan `useAnalytics` y `useDuplicateStats`: es la
 * única forma de saber que «canciones de esta semana» o «+42 %» dicen lo que
 * parece que dicen y no lo que sale por casualidad con los datos reales.
 */
function installBrowserGlobals () {
  const store = new Map()
  globalThis.localStorage = {
    getItem: (k) => (store.has(k) ? store.get(k) : null),
    setItem: (k, v) => store.set(k, String(v)),
    removeItem: (k) => store.delete(k),
    clear: () => store.clear()
  }
  globalThis.document = {
    createElement: () => ({}),
    addEventListener () {},
    removeEventListener () {},
    visibilityState: 'visible'
  }
  globalThis.window = {
    localStorage: globalThis.localStorage,
    location: { origin: 'http://localhost' },
    addEventListener () {},
    removeEventListener () {}
  }
}
installBrowserGlobals()

const DIA = 86400000

async function main () {
  const { useEventStore } = await import('../src/stores/events.js')
  const { useAnalytics } = await import('../src/composables/useAnalytics.js')
  const { useDuplicateStats } = await import('../src/composables/useDuplicateStats.js')

  let fallos = 0
  function check (etiqueta, real, esperado) {
    const ok = esperado instanceof RegExp ? esperado.test(real) : Object.is(real, esperado)
    console.log(`  ${ok ? '✓' : '✗'} ${etiqueta}${ok ? '' : `\n      esperado: ${JSON.stringify(esperado)} · recibido: ${JSON.stringify(real)}`}`)
    if (!ok) fallos++
  }

  const store = useEventStore()
  const analytics = useAnalytics()

  /** Crea una escucha `diasAtras` días antes de ahora (con minutos de desempate). */
  function escucha (diasAtras, track, artist, minutos = 0) {
    return {
      played_at: new Date(Date.now() - diasAtras * DIA + minutos * 60000).toISOString(),
      track,
      artist,
      duration_ms: 200000,
      ms_played: 180000
    }
  }

  // ── Canciones y artistas de la semana, con variación ───────────────────────
  console.log('\nCanciones y artistas (semana) con variación sobre la anterior')
  store.setEvents([
    // Semana en curso: 4 canciones distintas, 2 artistas distintos
    escucha(1, 'A', 'Ana'), escucha(2, 'B', 'Ana'), escucha(3, 'C', 'Beto'), escucha(4, 'D', 'Beto'),
    escucha(5, 'A', 'Ana', 5), // repetida: no debe contar dos veces
    // Semana anterior: 2 canciones distintas, 1 artista
    escucha(9, 'E', 'Ana'), escucha(10, 'F', 'Ana')
  ])
  check('canciones distintas de la semana', analytics.kpiTracks.value, 4)
  check('artistas distintos de la semana', analytics.kpiArtists.value, 2)
  check('canciones de la semana anterior', analytics.kpiTracksPrevWeek.value, 2)
  check('artistas de la semana anterior', analytics.kpiArtistsPrevWeek.value, 1)
  check('variación de canciones (4 vs 2)', analytics.kpiTracksChangePct.value, 100)
  check('variación de artistas (2 vs 1)', analytics.kpiArtistsChangePct.value, 100)

  console.log('\nCaídas y ausencia de base de comparación')
  store.setEvents([escucha(1, 'A', 'Ana'), escucha(9, 'B', 'Ana'), escucha(10, 'C', 'Ana'), escucha(11, 'D', 'Ana'), escucha(12, 'E', 'Ana')])
  check('variación negativa (1 vs 4)', analytics.kpiTracksChangePct.value, -75)
  store.setEvents([escucha(1, 'A', 'Ana'), escucha(2, 'B', 'Ana')])
  check('sin semana anterior no se inventa un porcentaje', analytics.kpiTracksChangePct.value, null)
  store.setEvents([])
  check('historial vacío da 0 canciones', analytics.kpiTracks.value, 0)
  check('y tampoco se pinta pastilla de porcentaje', analytics.kpiTracksChangePct.value, null)

  // ── Sesiones del año ──────────────────────────────────────────────────────
  console.log('\nSesiones del último año (corte a los 30 min de silencio)')
  store.setEvents([
    // Sesión 1: tres escuchas seguidas dentro de 20 min → dura 20 min
    escucha(3, 'A', 'Ana', 0), escucha(3, 'B', 'Ana', 10), escucha(3, 'C', 'Ana', 20),
    // Hueco de 60 min → sesión 2, de 10 min
    escucha(3, 'D', 'Ana', 80), escucha(3, 'E', 'Ana', 90),
    // Escucha de hace dos años: fuera de la ventana anual
    escucha(730, 'Z', 'Zoe', 0)
  ])
  check('sesiones detectadas en el año', analytics.sessionsYear.value.count, 2)
  check('duración media (20 y 10 min)', analytics.sessionsYear.value.averageMinutes, 15)
  check('la escucha de hace dos años queda fuera', analytics.yearEvents.value.length, 5)

  // ── Escuchas por día (el panel «Escuchas por día») ────────────────────────
  console.log('\nEscuchas por día')
  store.setEvents([escucha(0, 'A', 'Ana'), escucha(0, 'B', 'Ana', 1), escucha(2, 'C', 'Ana')])
  const chart = analytics.chartData.value
  check('siete columnas', chart.labels.length, 7)
  check('hoy suma 2', chart.data[6], 2)
  check('hace dos días suma 1', chart.data[4], 1)
  check('total de la semana', chart.data.reduce((a, b) => a + b, 0), 3)

  // ── Duplicadas de la semana ───────────────────────────────────────────────
  console.log('\nDuplicadas iniciadas y saltadas (semana)')
  function sello (diasAtras) {
    const d = new Date(Date.now() - diasAtras * DIA)
    return d.getFullYear() * 10000 + (d.getMonth() + 1) * 100 + d.getDate()
  }
  const dias = [
    { day: sello(0), duplicates: 5, skipped: 4 },
    { day: sello(3), duplicates: 7, skipped: 2 },
    { day: sello(6), duplicates: 1, skipped: 1 },
    // Fuera de la semana en curso: cuentan para la anterior
    { day: sello(8), duplicates: 100, skipped: 50 },
    { day: sello(13), duplicates: 3, skipped: 3 },
    // Muy antiguo: no cuenta en ninguna de las dos
    { day: sello(40), duplicates: 999, skipped: 999 }
  ]
  globalThis.localStorage.setItem('skippify-duplicate-daily', JSON.stringify(dias))
  globalThis.window.Capacitor = {
    Plugins: { NotifListener: { getDailyStatsHistory: async () => ({ days: dias }) } }
  }
  const dup = useDuplicateStats()
  await dup.refresh()
  check('duplicadas iniciadas esta semana (5+7+1)', dup.weekDuplicates.value, 13)
  check('duplicadas saltadas esta semana (4+2+1)', dup.weekSkipped.value, 7)
  check('la semana anterior no se mezcla (100+3)', dup.previousWeek.value.duplicates, 103)
  check('lo de hace 40 días queda fuera', dup.week.value.duplicates + dup.previousWeek.value.duplicates, 116)
  check('hay dato, así que se pinta cifra y no «—»', dup.hasData.value, true)

  console.log(fallos ? `\nFallos: ${fallos}` : '\nInicio: todo correcto.')
  process.exit(fallos ? 1 : 0)
}

main()
