/**
 * Genera todos los recursos gráficos de la marca a partir de una única
 * geometría (`lib/brand-mark.mjs`):
 *
 *   · android-src/res/drawable/ic_launcher_{background,foreground}.xml
 *   · android-src/res/drawable/ic_stat_skippify.xml   (notificación, sin fondo)
 *   · android-src/res/mipmap-anydpi-v26/ic_launcher*.xml
 *   · android-src/res/mipmap-<densidad>/ic_launcher*.png       (5 densidades)
 *   · android-src/res/drawable-<orientación>/splash.png     (pantalla de arranque)
 *   · src/lib/brandMark.js                            (mismo trazo para la web)
 *   · el flavicon incrustado en index.html
 *
 * Ejecutar con: node scripts/generate-brand-assets.mjs
 */
import { mkdirSync, writeFileSync, readFileSync } from 'node:fs'
import { dirname, join, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import {
  BRAND, GRADIENT, GLYPH_BOX, S_STROKE,
  fit, markShapes, sPath, sStrokeWidth
} from './lib/brand-mark.mjs'
import {
  Canvas, sdArc, sdRoundRect, sdCircle, hexToRgb, mixRgb
} from './lib/raster.mjs'

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..')
const RES = join(ROOT, 'android-src', 'res')

function write (relPath, contents) {
  const target = join(RES, relPath)
  mkdirSync(dirname(target), { recursive: true })
  writeFileSync(target, contents)
  console.log('  ·', relPath)
}

// ── Degradado ────────────────────────────────────────────────────────────────

const STOPS = GRADIENT.map(({ offset, color }) => ({ offset, rgb: hexToRgb(color) }))

/** Color del degradado en `k` ∈ [0, 1], interpolando entre paradas. */
function gradientAt (k) {
  const c = k < 0 ? 0 : k > 1 ? 1 : k
  for (let i = 1; i < STOPS.length; i++) {
    if (c <= STOPS[i].offset) {
      const a = STOPS[i - 1]
      const b = STOPS[i]
      return mixRgb(a.rgb, b.rgb, (c - a.offset) / (b.offset - a.offset))
    }
  }
  return STOPS[STOPS.length - 1].rgb
}

/**
 * Eje del degradado: de abajo-izquierda (azul, donde nace la «S») a
 * arriba-derecha (lima, por donde sale). Devuelve los
 * extremos ya transformados al lienzo pedido.
 */
function gradientAxis (t) {
  return {
    x0: GLYPH_BOX.x0 * t.s + t.tx,
    y0: GLYPH_BOX.y1 * t.s + t.ty,
    x1: GLYPH_BOX.x1 * t.s + t.tx,
    y1: GLYPH_BOX.y0 * t.s + t.ty
  }
}

/** Proyección de un punto sobre ese eje, normalizada a [0, 1]. */
function gradientK (axis, px, py) {
  const dx = axis.x1 - axis.x0
  const dy = axis.y1 - axis.y0
  return ((px - axis.x0) * dx + (py - axis.y0) * dy) / (dx * dx + dy * dy)
}

// ── Vectores de Android ──────────────────────────────────────────────────────

/**
 * El icono adaptativo se dibuja en 108 dp, pero el sistema sólo enseña los 72 dp
 * centrales, ampliados hasta llenar la casilla: todo lo que se pinte aquí se ve
 * un 50 % más grande de lo que mide en el lienzo. Los 66 dp de «zona segura» son
 * el máximo que el recorte no se come, no la medida a la que debe ir el
 * monograma: a esa escala la «S» salía rozando los bordes de la casilla. Ocupa
 * el 62 % de la ventana visible (0.62 × 72 / 108), el aire que llevan los demás
 * iconos del cajón.
 */
const LAUNCHER_COVERAGE = 0.42
const LAUNCHER = fit(108, LAUNCHER_COVERAGE)

function androidGradient (t, indent) {
  const axis = gradientAxis(t)
  const pad = ' '.repeat(indent)
  const stops = GRADIENT
    .map(s => `${pad}    <item android:offset="${s.offset}" android:color="${s.color}" />`)
    .join('\n')
  return `${pad}<gradient
${pad}    android:type="linear"
${pad}    android:startX="${axis.x0.toFixed(1)}" android:startY="${axis.y0.toFixed(1)}"
${pad}    android:endX="${axis.x1.toFixed(1)}" android:endY="${axis.y1.toFixed(1)}">
${stops}
${pad}</gradient>`
}

/**
 * Cuerpo del vector: un único `path`, el trazo de la «S».
 *
 * `color` puede ser un literal (#FFFFFFFF para las versiones monocromas) o
 * `null` para que el trazo lleve el degradado de marca.
 */
function vectorBody (t, color) {
  if (color) {
    return `    <path
        android:pathData="${sPath(t)}"
        android:strokeWidth="${sStrokeWidth(t)}"
        android:strokeLineCap="round"
        android:strokeLineJoin="round"
        android:strokeColor="${color}" />`
  }

  return `    <path
        android:pathData="${sPath(t)}"
        android:strokeWidth="${sStrokeWidth(t)}"
        android:strokeLineCap="round"
        android:strokeLineJoin="round">
        <aapt:attr name="android:strokeColor">
${androidGradient(t, 12)}
        </aapt:attr>
    </path>`
}

function launcherForegroundXml () {
  return `<?xml version="1.0" encoding="utf-8"?>
<!--
  Cara del icono adaptativo: el monograma macizo de la «S».
  Generado por scripts/generate-brand-assets.mjs — no editar a mano.
-->
<vector xmlns:android="http://schemas.android.com/apk/res/android"
    xmlns:aapt="http://schemas.android.com/aapt"
    android:width="108dp"
    android:height="108dp"
    android:viewportWidth="108"
    android:viewportHeight="108">
${vectorBody(LAUNCHER, null)}
</vector>
`
}

function launcherBackgroundXml () {
  return `<?xml version="1.0" encoding="utf-8"?>
<!--
  Fondo del icono adaptativo: pizarra profunda con un halo que va del azul de la
  cintura de la «S» al verde de su salida, para que el monograma tenga relieve.
  Generado por scripts/generate-brand-assets.mjs — no editar a mano.
-->
<vector xmlns:android="http://schemas.android.com/apk/res/android"
    xmlns:aapt="http://schemas.android.com/aapt"
    android:width="108dp"
    android:height="108dp"
    android:viewportWidth="108"
    android:viewportHeight="108">
    <path android:pathData="M0,0h108v108h-108z">
        <aapt:attr name="android:fillColor">
            <gradient
                android:type="linear"
                android:startX="0" android:startY="0"
                android:endX="108" android:endY="108">
                <item android:offset="0" android:color="${BRAND.deep}" />
                <item android:offset="1" android:color="${BRAND.ink}" />
            </gradient>
        </aapt:attr>
    </path>
    <path android:pathData="M0,0h108v108h-108z">
        <aapt:attr name="android:fillColor">
            <gradient
                android:type="radial"
                android:centerX="34" android:centerY="70"
                android:gradientRadius="70">
                <item android:offset="0" android:color="#3C2F80F7" />
                <item android:offset="1" android:color="#002F80F7" />
            </gradient>
        </aapt:attr>
    </path>
    <path android:pathData="M0,0h108v108h-108z">
        <aapt:attr name="android:fillColor">
            <gradient
                android:type="radial"
                android:centerX="76" android:centerY="34"
                android:gradientRadius="60">
                <item android:offset="0" android:color="#324ADE80" />
                <item android:offset="1" android:color="#004ADE80" />
            </gradient>
        </aapt:attr>
    </path>
</vector>
`
}

// La notificación va a 24 dp reales en la barra de estado; llena el lienzo
// (0.94) porque ahí no hay zona segura que respetar.
const NOTIF = fit(24, 0.94)

function notificationXml () {
  return `<?xml version="1.0" encoding="utf-8"?>
<!--
  Icono de notificación: el mismo monograma, sin fondo. Android descarta el color de los iconos pequeños y conserva sólo la
  máscara alfa, así que va en blanco puro sobre lienzo transparente.
  Generado por scripts/generate-brand-assets.mjs — no editar a mano.
-->
<vector xmlns:android="http://schemas.android.com/apk/res/android"
    android:width="24dp"
    android:height="24dp"
    android:viewportWidth="24"
    android:viewportHeight="24">
${vectorBody(NOTIF, '#FFFFFFFF')}
</vector>
`
}

function monochromeXml () {
  return `<?xml version="1.0" encoding="utf-8"?>
<!--
  Versión monocroma para los iconos temáticos de Android 13+. Mismo trazo, en
  blanco puro y dentro de la zona segura del icono adaptativo (a diferencia del
  icono de notificación, que sí llena su lienzo de 24 dp).
  Generado por scripts/generate-brand-assets.mjs — no editar a mano.
-->
<vector xmlns:android="http://schemas.android.com/apk/res/android"
    android:width="108dp"
    android:height="108dp"
    android:viewportWidth="108"
    android:viewportHeight="108">
${vectorBody(LAUNCHER, '#FFFFFFFF')}
</vector>
`
}

const ADAPTIVE_XML = `<?xml version="1.0" encoding="utf-8"?>
<adaptive-icon xmlns:android="http://schemas.android.com/apk/res/android">
    <background android:drawable="@drawable/ic_launcher_background" />
    <foreground android:drawable="@drawable/ic_launcher_foreground" />
    <monochrome android:drawable="@drawable/ic_launcher_monochrome" />
</adaptive-icon>
`

// ── Rasterizado ──────────────────────────────────────────────────────────────

const INK = hexToRgb(BRAND.ink)
const DEEP = hexToRgb(BRAND.deep)
const BLUE = hexToRgb(BRAND.blue)
const GREEN = hexToRgb(BRAND.green)

/** Dibuja la marca escalada a `t` sobre el lienzo dado. */
function paintMark (canvas, t, { mono = false } = {}) {
  const axis = gradientAxis(t)
  const paint = mono
    ? () => [255, 255, 255, 1]
    : (px, py) => gradientAt(gradientK(axis, px, py))
  const hw = (S_STROKE * t.s) / 2

  for (const arc of markShapes(t)) {
    canvas.draw(
      (px, py) => sdArc(px, py, arc.cx, arc.cy, arc.r, arc.from, arc.to, hw),
      paint
    )
  }
}

/** Fondo compartido: degradado diagonal y los dos halos de la marca. */
function paintBackdrop (canvas, sdf) {
  const { width: w, height: h } = canvas
  const diag = w + h
  canvas.draw(sdf, (px, py) => {
    const k = (px + py) / diag
    let col = mixRgb(DEEP, INK, k)

    // Halo azul abajo-izquierda y verde arriba-derecha: los mismos extremos del
    // degradado del trazo, para que el icono lea como una pieza sola.
    const halos = [
      { x: 0.3 * w, y: 0.72 * h, r: 0.72 * Math.max(w, h), rgb: BLUE, a: 0.26 },
      { x: 0.72 * w, y: 0.3 * h, r: 0.62 * Math.max(w, h), rgb: GREEN, a: 0.2 }
    ]
    for (const halo of halos) {
      const d = Math.hypot(px - halo.x, py - halo.y) / halo.r
      if (d < 1) col = mixRgb(col, halo.rgb, (1 - d) * (1 - d) * halo.a)
    }
    return col
  })
}

function launcherSquarePng (size) {
  const c = new Canvas(size, size)
  paintBackdrop(c, (px, py) => sdRoundRect(px, py, size / 2, size / 2, size / 2, size / 2, size * 0.22))
  paintMark(c, fit(size, 0.66))
  return c.toPng()
}

function launcherRoundPng (size) {
  const c = new Canvas(size, size)
  paintBackdrop(c, (px, py) => sdCircle(px, py, size / 2, size / 2, size / 2))
  paintMark(c, fit(size, 0.62))
  return c.toPng()
}

function launcherForegroundPng (size) {
  const c = new Canvas(size, size)
  // Mismo encuadre que el vector: lienzo transparente y la marca a la escala
  // que le deja aire dentro de la ventana visible del icono adaptativo.
  paintMark(c, fit(size, LAUNCHER_COVERAGE))
  return c.toPng()
}

function splashPng (w, h) {
  const c = new Canvas(w, h)
  paintBackdrop(c, () => -10)
  const side = Math.min(w, h)
  // El splash es el sitio donde la marca se ve grande: aquí sí entra completa,
  // con las barras de onda.
  const t = fit(side, 0.34)
  t.tx += (w - side) / 2
  t.ty += (h - side) / 2
  paintMark(c, t)
  return c.toPng()
}

// ── Módulo compartido con la interfaz web ────────────────────────────────────

const WEB = fit(24, 0.94)

function webModule () {
  return `/**
 * Trazo de la marca Skippify para la interfaz web (flavicon, splash, cabeceras).
 *
 * ARCHIVO GENERADO por scripts/generate-brand-assets.mjs — no editar a mano.
 * Comparte geometría exacta con el icono del launcher y con el de notificación.
 */
export const BRAND_VIEWBOX = '0 0 24 24'

/** Los dos arcos tangentes que forman la «S». */
export const BRAND_S_PATH = '${sPath(WEB)}'
export const BRAND_S_WIDTH = ${sStrokeWidth(WEB)}

/** Paradas del degradado azul → lima, en el orden en que las pinta el SVG. */
export const BRAND_GRADIENT = ${JSON.stringify(GRADIENT)}
`
}

/**
 * Flavicon: el mismo dibujo incrustado en index.html. Se reescribe desde aquí
 * porque a mano se quedaba desincronizado del resto de la marca.
 */
function faviconDataUri () {
  // Más pequeña que el resto de usos: el flavicon se pinta suelto en la pestaña,
  // sin ninguna caja alrededor que le dé aire. Llenando el lienzo, la «S» roza
  // los bordes y se lee como una mancha.
  const t = fit(24, 0.76)
  const stops = GRADIENT
    .map(s => `%3Cstop offset='${s.offset * 100}%25' stop-color='%23${s.color.slice(1)}'/%3E`)
    .join('')
  const stroke = `%3Cpath d='${sPath(t)}' stroke='url(%23g)' stroke-width='${sStrokeWidth(t)}' stroke-linecap='round' stroke-linejoin='round'/%3E`
  return `data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 24 24' fill='none'%3E%3Cdefs%3E%3ClinearGradient id='g' x1='0' y1='1' x2='1' y2='0'%3E${stops}%3C/linearGradient%3E%3C/defs%3E${stroke}%3C/svg%3E`
}

function updateIndexHtml () {
  const path = join(ROOT, 'index.html')
  const html = readFileSync(path, 'utf8')
  // Se comprueba que el patrón exista, y no que el fichero cambie: si el
  // flavicon ya estaba al día, no cambiar nada es lo correcto, no un fallo.
  const pattern = /(rel="icon"\s*\n?\s*type="image\/svg\+xml"\s*\n?\s*href=")[^"]*(")/
  if (!pattern.test(html)) {
    console.warn('  ! No se encontró la etiqueta del flavicon en index.html')
    return
  }
  writeFileSync(path, html.replace(pattern, `$1${faviconDataUri()}$2`))
  console.log('  · index.html (flavicon)')
}

// ── Ejecución ────────────────────────────────────────────────────────────────

console.log('Generando recursos de marca…')

write('drawable/ic_launcher_background.xml', launcherBackgroundXml())
write('drawable/ic_launcher_foreground.xml', launcherForegroundXml())
// El proyecto arrastra una copia en drawable-v24 que, por especificidad, gana
// en API 24+: si no se sobrescribe, el launcher seguiría mostrando el icono viejo.
write('drawable-v24/ic_launcher_foreground.xml', launcherForegroundXml())
write('drawable/ic_stat_skippify.xml', notificationXml())
write('drawable/ic_launcher_monochrome.xml', monochromeXml())
write('mipmap-anydpi-v26/ic_launcher.xml', ADAPTIVE_XML)
write('mipmap-anydpi-v26/ic_launcher_round.xml', ADAPTIVE_XML)

const DENSITIES = [
  ['mdpi', 48, 108],
  ['hdpi', 72, 162],
  ['xhdpi', 96, 216],
  ['xxhdpi', 144, 324],
  ['xxxhdpi', 192, 432]
]

for (const [density, legacy, adaptive] of DENSITIES) {
  write(`mipmap-${density}/ic_launcher.png`, launcherSquarePng(legacy))
  write(`mipmap-${density}/ic_launcher_round.png`, launcherRoundPng(legacy))
  write(`mipmap-${density}/ic_launcher_foreground.png`, launcherForegroundPng(adaptive))
}

const SPLASHES = [
  ['drawable', 480, 320],
  ['drawable-land-mdpi', 480, 320],
  ['drawable-land-hdpi', 800, 480],
  ['drawable-land-xhdpi', 1280, 720],
  ['drawable-land-xxhdpi', 1600, 960],
  ['drawable-land-xxxhdpi', 1920, 1280],
  ['drawable-port-mdpi', 320, 480],
  ['drawable-port-hdpi', 480, 800],
  ['drawable-port-xhdpi', 720, 1280],
  ['drawable-port-xxhdpi', 960, 1600],
  ['drawable-port-xxxhdpi', 1280, 1920]
]

for (const [folder, w, h] of SPLASHES) {
  write(`${folder}/splash.png`, splashPng(w, h))
}

mkdirSync(join(ROOT, 'src', 'lib'), { recursive: true })
writeFileSync(join(ROOT, 'src', 'lib', 'brandMark.js'), webModule())
console.log('  · src/lib/brandMark.js')

updateIndexHtml()

console.log('Listo.')
