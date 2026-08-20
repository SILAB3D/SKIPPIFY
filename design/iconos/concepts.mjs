/**
 * Hoja de comparación de propuestas de icono para Skippify.
 *
 * Cada concepto se define en un lienzo de 24x24 y se pinta en las tres
 * situaciones que importan: icono del launcher, tamaño pequeño de lista, y
 * máscara blanca de la barra de notificación.
 */
import { writeFileSync } from 'node:fs'
import {
  Canvas, sdArc, sdSegment, sdTriangle, sdRoundRect, sdCircle,
  hexToRgb, mixRgb
} from '../../scripts/lib/raster.mjs'

const STOPS = [
  { offset: 0, rgb: hexToRgb('#2F80F7') },
  { offset: 0.42, rgb: hexToRgb('#22D3EE') },
  { offset: 0.74, rgb: hexToRgb('#4ADE80') },
  { offset: 1, rgb: hexToRgb('#BEF264') }
]
const INK = hexToRgb('#050B14')
const DEEP = hexToRgb('#0D1B2A')
const BLUE = hexToRgb('#2F80F7')
const GREEN = hexToRgb('#4ADE80')

function gradientAt (k) {
  const c = k < 0 ? 0 : k > 1 ? 1 : k
  for (let i = 1; i < STOPS.length; i++) {
    if (c <= STOPS[i].offset) {
      const a = STOPS[i - 1]; const b = STOPS[i]
      return mixRgb(a.rgb, b.rgb, (c - a.offset) / (b.offset - a.offset))
    }
  }
  return STOPS[STOPS.length - 1].rgb
}

// ── Conceptos, todos en coordenadas 0..24 ───────────────────────────────────

/**
 * A · Bucle roto. Un anillo de repetición abierto por la derecha; en el hueco,
 * el glifo de «saltar a la siguiente». Cuenta literalmente lo que hace la app:
 * rompe el bucle de lo que ya has oído.
 */
function conceptoBucle () {
  return {
    strokes: [
      { kind: 'arc', cx: 12, cy: 12, r: 7.4, from: 38, to: 322, width: 2.7 },
      { kind: 'seg', a: { x: 21.3, y: 9.4 }, b: { x: 21.3, y: 14.6 }, width: 1.9 }
    ],
    fills: [
      [{ x: 15.9, y: 8.5 }, { x: 20.1, y: 12 }, { x: 15.9, y: 15.5 }]
    ]
  }
}

/**
 * B · Onda saltada. Barras de espectro a ambos lados y, donde deberían seguir,
 * un doble chevrón: el salto ocurre dentro del propio sonido.
 */
function conceptoOnda () {
  const strokes = []
  const alturas = [5.0, 9.0, 13.0]
  alturas.forEach((h, i) => {
    const x = 2.6 + i * 2.7
    strokes.push({ kind: 'seg', a: { x, y: 12 - h / 2 }, b: { x, y: 12 + h / 2 }, width: 1.7 })
  })
  alturas.slice().reverse().forEach((h, i) => {
    const x = 15.9 + i * 2.7
    strokes.push({ kind: 'seg', a: { x, y: 12 - h / 2 }, b: { x, y: 12 + h / 2 }, width: 1.7 })
  })
  return {
    strokes,
    fills: [
      [{ x: 10.0, y: 7.4 }, { x: 12.4, y: 12 }, { x: 10.0, y: 16.6 }],
      [{ x: 12.2, y: 7.4 }, { x: 14.6, y: 12 }, { x: 12.2, y: 16.6 }]
    ]
  }
}

/**
 * C · Monograma macizo. La «S» reducida a lo esencial: dos arcos tangentes de
 * un solo trazo grueso, sin estelas ni adornos. Es la que mejor aguanta a
 * tamaños diminutos.
 */
function conceptoMonograma () {
  const cTop = { cx: 13.1, cy: 8.3 }
  const cBot = { cx: 10.9, cy: 15.7 }
  const dx = cBot.cx - cTop.cx
  const dy = cBot.cy - cTop.cy
  const r = Math.hypot(dx, dy) / 2
  const touch = Math.atan2(dy, dx) * 180 / Math.PI
  return {
    strokes: [
      { kind: 'arc', ...cTop, r, from: -95, to: touch - 360, width: 3.5 },
      { kind: 'arc', ...cBot, r, from: touch - 180, to: 85, width: 3.5 }
    ],
    fills: []
  }
}

/**
 * D · Salto en negativo. Pastilla maciza con el glifo de salto recortado. Es la
 * más rotunda de lejos, y la única que no depende del trazo fino.
 */
function conceptoNegativo () {
  return {
    plate: true,
    strokes: [],
    fills: [
      [{ x: 5.6, y: 6.6 }, { x: 12.2, y: 12 }, { x: 5.6, y: 17.4 }],
      [{ x: 11.4, y: 6.6 }, { x: 18.0, y: 12 }, { x: 11.4, y: 17.4 }]
    ],
    bar: { x: 19.6, y0: 6.8, y1: 17.2, width: 2.0 }
  }
}

const CONCEPTOS = [conceptoBucle, conceptoOnda, conceptoMonograma, conceptoNegativo]

// ── Pintado ─────────────────────────────────────────────────────────────────

function paintMark (canvas, concepto, size, { mono = false, knockout = false } = {}) {
  const s = size / 24
  const paint = mono
    ? () => [255, 255, 255, 1]
    : (px, py) => gradientAt(((px / size) + (1 - py / size)) / 2)

  const data = concepto()

  // La pastilla del concepto D: se pinta llena y el glifo se recorta encima.
  if (data.plate && !knockout) {
    canvas.draw(
      (px, py) => sdRoundRect(px, py, size / 2, size / 2, 9.6 * s, 9.6 * s, 3.4 * s),
      paint
    )
  }

  for (const st of data.strokes) {
    const hw = (st.width / 2) * s
    if (st.kind === 'arc') {
      canvas.draw((px, py) => sdArc(px, py, st.cx * s, st.cy * s, st.r * s, st.from, st.to, hw), paint)
    } else {
      canvas.draw((px, py) => sdSegment(px, py, st.a.x * s, st.a.y * s, st.b.x * s, st.b.y * s, hw), paint)
    }
  }

  if (data.bar) {
    const hw = (data.bar.width / 2) * s
    canvas.draw((px, py) => sdSegment(px, py, data.bar.x * s, data.bar.y0 * s, data.bar.x * s, data.bar.y1 * s, hw),
      data.plate && !knockout ? () => [5, 11, 20, 1] : paint)
  }

  for (const tri of data.fills) {
    const [p0, p1, p2] = tri.map(p => ({ x: p.x * s, y: p.y * s }))
    canvas.draw((px, py) => sdTriangle(px, py, p0, p1, p2),
      data.plate && !knockout ? () => [5, 11, 20, 1] : paint)
  }
}

function fondo (canvas, size, redondeo) {
  canvas.draw(
    (px, py) => sdRoundRect(px, py, size / 2, size / 2, size / 2, size / 2, size * redondeo),
    (px, py) => {
      const k = (px + py) / (2 * size)
      let col = mixRgb(DEEP, INK, k)
      const halos = [
        { x: 0.3 * size, y: 0.72 * size, r: 0.72 * size, rgb: BLUE, a: 0.26 },
        { x: 0.72 * size, y: 0.3 * size, r: 0.62 * size, rgb: GREEN, a: 0.2 }
      ]
      for (const h of halos) {
        const d = Math.hypot(px - h.x, py - h.y) / h.r
        if (d < 1) col = mixRgb(col, h.rgb, (1 - d) * (1 - d) * h.a)
      }
      return col
    }
  )
}

function celdaLauncher (concepto, size) {
  const c = new Canvas(size, size)
  fondo(c, size, 0.22)
  const inner = new Canvas(size, size)
  paintMark(inner, concepto, size)
  blit(c, inner, 0, 0)
  return c
}

function celdaMono (concepto, size) {
  const c = new Canvas(size, size)
  c.fill(() => [72, 72, 80])
  const inner = new Canvas(size, size)
  paintMark(inner, concepto, size, { mono: true, knockout: true })
  blit(c, inner, 0, 0)
  return c
}

function blit (dst, src, ox, oy) {
  for (let y = 0; y < src.height; y++) {
    for (let x = 0; x < src.width; x++) {
      const i = (y * src.width + x) * 4
      const jx = x + ox; const jy = y + oy
      if (jx < 0 || jy < 0 || jx >= dst.width || jy >= dst.height) continue
      const j = (jy * dst.width + jx) * 4
      const a = src.data[i + 3]; const d = dst.data[j + 3]
      const out = a + d * (1 - a)
      for (let k = 0; k < 3; k++) {
        dst.data[j + k] = (src.data[i + k] * a + dst.data[j + k] * d * (1 - a)) / (out || 1)
      }
      dst.data[j + 3] = out
    }
  }
}

const FILA = 152
const hoja = new Canvas(300, FILA * CONCEPTOS.length + 16)
hoja.fill(() => [16, 18, 24])

CONCEPTOS.forEach((concepto, i) => {
  const y = 16 + i * FILA
  blit(hoja, celdaLauncher(concepto, 128), 20, y)
  blit(hoja, celdaLauncher(concepto, 48), 168, y + 20)
  blit(hoja, celdaLauncher(concepto, 28), 168, y + 78)
  blit(hoja, celdaMono(concepto, 24), 236, y + 24)
  blit(hoja, celdaMono(concepto, 48), 232, y + 62)
})

writeFileSync(process.argv[2], hoja.toPng())
console.log('hoja generada')
