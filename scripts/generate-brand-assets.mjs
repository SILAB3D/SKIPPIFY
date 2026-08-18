/**
 * Genera todos los recursos gráficos de la marca a partir de una única
 * geometría (`lib/brand-mark.mjs`):
 *
 *   · android-src/res/drawable/ic_launcher_{background,foreground}.xml
 *   · android-src/res/drawable/ic_stat_skippify.xml   (notificación, sin fondo)
 *   · android-src/res/mipmap-anydpi-v26/ic_launcher*.xml
 *   · android-src/res/mipmap-<densidad>/ic_launcher*.png       (5 densidades)
 *   · android-src/res/drawable-<orientación>/splash.png            (pantalla de arranque)
 *   · src/lib/brandMark.js                            (mismo trazo para la web)
 *
 * Ejecutar con: node scripts/generate-brand-assets.mjs
 */
import { mkdirSync, writeFileSync } from 'node:fs'
import { dirname, join, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import {
  BRAND, S_STROKE, TRAIL_STROKE, GLYPH_BOX,
  S_ARC_TOP, S_ARC_BOTTOM, S_POINTS, TRAIL,
  fit, sPath, trailPath, sStrokeWidth, trailStrokeWidth
} from './lib/brand-mark.mjs'
import { Canvas, sdArc, sdSegment, sdRoundRect, sdCircle, hexToRgb, mixRgb } from './lib/raster.mjs'

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..')
const RES = join(ROOT, 'android-src', 'res')

function write (relPath, contents) {
  const target = join(RES, relPath)
  mkdirSync(dirname(target), { recursive: true })
  writeFileSync(target, contents)
  console.log('  ·', relPath)
}

// ── Vectores de Android ──────────────────────────────────────────────────────

const LAUNCHER = fit(108, 0.52)

function launcherForegroundXml () {
  return `<?xml version="1.0" encoding="utf-8"?>
<!--
  Cara del icono adaptativo: el monograma «S» de Skippify con su estela de
  velocidad. Generado por scripts/generate-brand-assets.mjs — no editar a mano.
-->
<vector xmlns:android="http://schemas.android.com/apk/res/android"
    xmlns:aapt="http://schemas.android.com/aapt"
    android:width="108dp"
    android:height="108dp"
    android:viewportWidth="108"
    android:viewportHeight="108">
    <path
        android:pathData="${trailPath(LAUNCHER)}"
        android:strokeWidth="${trailStrokeWidth(LAUNCHER)}"
        android:strokeLineCap="round"
        android:strokeColor="${BRAND.teal}"
        android:strokeAlpha="0.55" />
    <path
        android:pathData="${sPath(LAUNCHER)}"
        android:strokeWidth="${sStrokeWidth(LAUNCHER)}"
        android:strokeLineCap="round"
        android:strokeLineJoin="round">
        <aapt:attr name="android:strokeColor">
            <gradient
                android:type="linear"
                android:startX="30" android:startY="24"
                android:endX="82" android:endY="86">
                <item android:offset="0" android:color="${BRAND.emerald}" />
                <item android:offset="0.55" android:color="${BRAND.emeraldDeep}" />
                <item android:offset="1" android:color="${BRAND.teal}" />
            </gradient>
        </aapt:attr>
    </path>
</vector>
`
}

function launcherBackgroundXml () {
  return `<?xml version="1.0" encoding="utf-8"?>
<!--
  Fondo del icono adaptativo: pizarra profunda con un halo esmeralda desplazado
  hacia la esquina superior izquierda, para que el monograma tenga relieve.
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
                android:centerX="36" android:centerY="34"
                android:gradientRadius="66">
                <item android:offset="0" android:color="#4610B981" />
                <item android:offset="1" android:color="#0010B981" />
            </gradient>
        </aapt:attr>
    </path>
</vector>
`
}

const NOTIF = fit(24, 0.86)

function notificationXml () {
  return `<?xml version="1.0" encoding="utf-8"?>
<!--
  Icono de notificación: el mismo monograma, sin fondo. Android descarta el
  color de los iconos pequeños y conserva sólo la máscara alfa, así que va en
  blanco puro sobre lienzo transparente.
  Generado por scripts/generate-brand-assets.mjs — no editar a mano.
-->
<vector xmlns:android="http://schemas.android.com/apk/res/android"
    android:width="24dp"
    android:height="24dp"
    android:viewportWidth="24"
    android:viewportHeight="24">
    <path
        android:pathData="${trailPath(NOTIF)}"
        android:strokeWidth="${trailStrokeWidth(NOTIF)}"
        android:strokeLineCap="round"
        android:strokeColor="#FFFFFFFF" />
    <path
        android:pathData="${sPath(NOTIF)}"
        android:strokeWidth="${sStrokeWidth(NOTIF)}"
        android:strokeLineCap="round"
        android:strokeLineJoin="round"
        android:strokeColor="#FFFFFFFF" />
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
    <path
        android:pathData="${trailPath(LAUNCHER)}"
        android:strokeWidth="${trailStrokeWidth(LAUNCHER)}"
        android:strokeLineCap="round"
        android:strokeColor="#FFFFFFFF" />
    <path
        android:pathData="${sPath(LAUNCHER)}"
        android:strokeWidth="${sStrokeWidth(LAUNCHER)}"
        android:strokeLineCap="round"
        android:strokeLineJoin="round"
        android:strokeColor="#FFFFFFFF" />
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
const EMERALD = hexToRgb(BRAND.emerald)
const EMERALD_DEEP = hexToRgb(BRAND.emeraldDeep)
const TEAL = hexToRgb(BRAND.teal)

/** Dibuja el monograma (estela + «S») escalado a `t` sobre el lienzo dado. */
function paintMark (canvas, t, { mono = false } = {}) {
  const trailPaint = mono
    ? () => [255, 255, 255, 1]
    : () => [...TEAL, 0.55]

  for (const { x0, x1, y } of TRAIL) {
    const a = { x: x0 * t.s + t.tx, y: y * t.s + t.ty }
    const b = { x: x1 * t.s + t.tx, y: y * t.s + t.ty }
    const hw = (TRAIL_STROKE / 2) * t.s
    canvas.draw((px, py) => sdSegment(px, py, a.x, a.y, b.x, b.y, hw), trailPaint)
  }

  const hw = (S_STROKE / 2) * t.s
  const span = (GLYPH_BOX.x1 - GLYPH_BOX.x0 + GLYPH_BOX.y1 - GLYPH_BOX.y0) * t.s
  const originX = GLYPH_BOX.x0 * t.s + t.tx
  const originY = GLYPH_BOX.y0 * t.s + t.ty
  const sPaint = mono
    ? () => [255, 255, 255, 1]
    : (px, py) => {
      const k = ((px - originX) + (py - originY)) / span
      return k < 0.55
        ? mixRgb(EMERALD, EMERALD_DEEP, k / 0.55)
        : mixRgb(EMERALD_DEEP, TEAL, (k - 0.55) / 0.45)
    }

  for (const arc of [S_ARC_TOP, S_ARC_BOTTOM]) {
    const cx = arc.cx * t.s + t.tx
    const cy = arc.cy * t.s + t.ty
    const r = arc.r * t.s
    canvas.draw((px, py) => sdArc(px, py, cx, cy, r, arc.from, arc.to, hw), sPaint)
  }

  const c1 = { x: S_POINTS.topEnd.x * t.s + t.tx, y: S_POINTS.topEnd.y * t.s + t.ty }
  const c2 = { x: S_POINTS.bottomStart.x * t.s + t.tx, y: S_POINTS.bottomStart.y * t.s + t.ty }
  canvas.draw((px, py) => sdSegment(px, py, c1.x, c1.y, c2.x, c2.y, hw), sPaint)
}

/** Fondo compartido: degradado diagonal + halo esmeralda. */
function paintBackdrop (canvas, sdf, glow = { x: 0.34, y: 0.32, r: 0.62, a: 0.28 }) {
  const { width: w, height: h } = canvas
  const diag = w + h
  canvas.draw(sdf, (px, py) => {
    const k = (px + py) / diag
    let col = mixRgb(DEEP, INK, k)
    const gx = glow.x * w
    const gy = glow.y * h
    const gr = glow.r * Math.max(w, h)
    const d = Math.hypot(px - gx, py - gy) / gr
    if (d < 1) {
      const falloff = (1 - d) * (1 - d)
      col = mixRgb(col, EMERALD_DEEP, falloff * glow.a)
    }
    return col
  })
}

function launcherSquarePng (size) {
  const c = new Canvas(size, size)
  paintBackdrop(c, (px, py) => sdRoundRect(px, py, size / 2, size / 2, size / 2, size / 2, size * 0.22))
  paintMark(c, fit(size, 0.56))
  return c.toPng()
}

function launcherRoundPng (size) {
  const c = new Canvas(size, size)
  paintBackdrop(c, (px, py) => sdCircle(px, py, size / 2, size / 2, size / 2))
  paintMark(c, fit(size, 0.52))
  return c.toPng()
}

function launcherForegroundPng (size) {
  const c = new Canvas(size, size)
  // El primer plano de un icono adaptativo va sobre lienzo transparente y la
  // marca debe caber en la zona segura (66 de 108), de ahí el 0.52.
  paintMark(c, fit(size, 0.52))
  return c.toPng()
}

function splashPng (w, h) {
  const c = new Canvas(w, h)
  paintBackdrop(c, () => -10, { x: 0.5, y: 0.42, r: 0.72, a: 0.22 })
  const side = Math.min(w, h)
  const t = fit(side, 0.26)
  t.tx += (w - side) / 2
  t.ty += (h - side) / 2
  paintMark(c, t)
  return c.toPng()
}

// ── Módulo compartido con la interfaz web ────────────────────────────────────

function webModule () {
  const t = fit(24, 0.86)
  return `/**
 * Trazo de la marca Skippify para la interfaz web (flavicon, splash, cabeceras).
 *
 * ARCHIVO GENERADO por scripts/generate-brand-assets.mjs — no editar a mano.
 * Comparte geometría exacta con el icono del launcher y con el de notificación.
 */
export const BRAND_VIEWBOX = '0 0 24 24'
export const BRAND_S_PATH = '${sPath(t)}'
export const BRAND_TRAIL_PATH = '${trailPath(t)}'
export const BRAND_S_WIDTH = ${sStrokeWidth(t)}
export const BRAND_TRAIL_WIDTH = ${trailStrokeWidth(t)}
`
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

console.log('Listo.')
