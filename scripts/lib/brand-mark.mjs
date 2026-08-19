/**
 * Geometría única de la marca Skippify.
 *
 * La marca es una «S» de neón trazada como una cinta de tres líneas paralelas
 * que se deshilachan en estelas de velocidad —hacia la derecha por arriba,
 * hacia la izquierda por abajo—, acompañada de un glifo de salto (▷▷|) y de dos
 * grupos de barras de onda.
 *
 * Todo se define en un lienzo de 24 × 24 y se escala desde aquí, de modo que el
 * flavicon web, el vector del launcher, el icono monocromo de notificación y
 * los PNG rasterizados salgan exactamente del mismo dibujo.
 *
 * ── Niveles de detalle ──
 * El dibujo completo tiene demasiados elementos para sobrevivir a 24 dp en la
 * barra de estado, así que se sirve en tres densidades. No son dibujos
 * distintos: son subconjuntos del mismo, de manera que no puedan divergir.
 *
 *   FULL     splash y web       cinta de 3 + estelas + ondas + salto
 *   COMPACT  icono del launcher cinta de 3 + estelas + salto
 *   MINIMAL  notificación       una sola línea + estelas + salto
 */

const D = Math.PI / 180

export const CANVAS = 24

/**
 * Esqueleto de la «S»: dos arcos de sentido contrario, uno por cada bucle.
 *
 * Los centros se eligen a mano; el radio NO. Se calcula como la mitad de la
 * distancia entre centros, que es la condición para que las dos
 * circunferencias sean tangentes: así los arcos se tocan en un punto y
 * comparten tangente, y la cintura sale de un trazo continuo.
 *
 * La versión anterior usaba un radio suelto y cosía los arcos con un segmento
 * diagonal. Con una sola línea colaba, pero con la cinta de tres los tres
 * cosidos tenían longitudes distintas, se cruzaban entre sí y la cintura
 * quedaba hecha un borrón.
 *
 * El truco se sostiene con las tres líneas a la vez: el radio de arriba crece
 * en `d` y el de abajo mengua en `d`, de modo que la suma —lo único que exige
 * la tangencia— sigue valiendo la distancia entre centros sea cual sea `d`.
 */
const S_CENTER_TOP = { cx: 13.4, cy: 8.7 }
const S_CENTER_BOTTOM = { cx: 10.9, cy: 15.4 }

const SPAN_X = S_CENTER_BOTTOM.cx - S_CENTER_TOP.cx
const SPAN_Y = S_CENTER_BOTTOM.cy - S_CENTER_TOP.cy

/** Radio de tangencia y dirección en la que se tocan los dos círculos. */
export const S_RADIUS = Math.hypot(SPAN_X, SPAN_Y) / 2
const TOUCH_DEG = Math.atan2(SPAN_Y, SPAN_X) / D

/**
 * Los barridos empiezan y acaban en ±90°, donde la tangente del arco es
 * horizontal: así las estelas salen rectas desde el propio trazo en vez de
 * pegarse en ángulo. El otro extremo es el punto de tangencia.
 */
export const S_ARC_TOP = {
  ...S_CENTER_TOP,
  r: S_RADIUS,
  from: -90,
  to: TOUCH_DEG - 360      // −249.5°: de la coronilla, por la izquierda, al roce
}
export const S_ARC_BOTTOM = {
  ...S_CENTER_BOTTOM,
  r: S_RADIUS,
  from: TOUCH_DEG - 180,   // −69.5°: desde el roce
  to: 90                   // hasta la base, donde arranca la estela
}

/**
 * Las tres líneas de la cinta, de fuera adentro.
 *
 * `d` es el desplazamiento perpendicular. Se suma al radio del arco de arriba y
 * se RESTA al de abajo porque en una «S» las dos curvas giran en sentidos
 * opuestos: si se sumara en ambas, las líneas se cruzarían en la cintura en vez
 * de correr paralelas.
 *
 * Las estelas menguan hacia dentro (`topTail` / `bottomTail`), que es lo que da
 * la sensación de velocidad: el borde exterior corre más.
 *
 * Ojo al cruce: al recorrer la «S», la línea que va por fuera en el bucle de
 * arriba pasa a ir por dentro en el de abajo —es lo que hace cualquier cinta al
 * atravesar una inflexión—. Por eso la de `d` positivo lleva la estela más
 * larga arriba y la más corta abajo: en ambos casos la larga es la de fuera.
 */
export const RIBBON = [
  { d: 0.95, topTail: 21.0, bottomTail: 5.8, width: 0.72 },
  { d: 0, topTail: 19.6, bottomTail: 4.4, width: 0.86 },
  { d: -0.95, topTail: 18.2, bottomTail: 3.0, width: 0.72 }
]

/** Una sola línea, más gruesa, para el icono de notificación. */
export const RIBBON_MINIMAL = [
  { d: 0, topTail: 20.4, bottomTail: 3.6, width: 1.9 }
]

/**
 * Glifo de salto (▷▷|). Ocupa el hueco que deja la «S» arriba a la derecha: los
 * barridos de los arcos nunca llegan a ese lado.
 */
export const SKIP = {
  triangles: [
    [{ x: 16.7, y: 7.9 }, { x: 18.35, y: 9.4 }, { x: 16.7, y: 10.9 }],
    [{ x: 18.0, y: 7.9 }, { x: 19.65, y: 9.4 }, { x: 18.0, y: 10.9 }]
  ],
  bar: { x: 20.35, y0: 8.2, y1: 10.6, width: 0.62 }
}

/**
 * Barras de onda: dos grupos en los huecos que quedan a los lados de la cinta
 * (a la izquierda por encima de la estela baja, a la derecha por debajo de la
 * alta). En el logotipo original son cuatro grupos, pero a tamaño de icono se
 * emborronan entre sí.
 */
export const WAVES = [
  { x: 5.5, y: 11.4, heights: [1.2, 2.1, 3.0, 1.9, 1.3] },
  { x: 16.9, y: 14.6, heights: [1.3, 2.3, 3.2, 2.0, 1.2] }
]
export const WAVE_GAP = 0.66
export const WAVE_STROKE = 0.46

/** Caja visual real del dibujo (trazo incluido), usada para centrar y escalar. */
export const GLYPH_BOX = { x0: 2.6, y0: 3.7, x1: 21.4, y1: 20.4 }

export const TIERS = { FULL: 'full', COMPACT: 'compact', MINIMAL: 'minimal' }

function pointOn (cx, cy, r, deg) {
  return { x: cx + r * Math.cos(deg * D), y: cy + r * Math.sin(deg * D) }
}

const round = (n) => Math.round(n * 1000) / 1000

/**
 * Transformación: escala uniforme `s` y traslación `(tx, ty)` sobre el lienzo
 * base de 24. `fit()` calcula la que encaja el dibujo en un cuadro concreto.
 */
export function fit (canvas, coverage) {
  const w = GLYPH_BOX.x1 - GLYPH_BOX.x0
  const h = GLYPH_BOX.y1 - GLYPH_BOX.y0
  const s = (canvas * coverage) / Math.max(w, h)
  return {
    s,
    tx: canvas / 2 - ((GLYPH_BOX.x0 + GLYPH_BOX.x1) / 2) * s,
    ty: canvas / 2 - ((GLYPH_BOX.y0 + GLYPH_BOX.y1) / 2) * s
  }
}

export const IDENTITY = { s: 1, tx: 0, ty: 0 }

const tp = (t, p) => ({ x: p.x * t.s + t.tx, y: p.y * t.s + t.ty })

/**
 * Descompone la marca en primitivas — arcos, segmentos y triángulos— ya
 * transformadas. Es la fuente que consumen tanto el generador de vectores como
 * el rasterizador, para que el PNG y el XML no puedan dibujar cosas distintas.
 */
export function markShapes (t = IDENTITY, tier = TIERS.FULL) {
  const strokes = []
  const fills = []

  const lines = tier === TIERS.MINIMAL ? RIBBON_MINIMAL : RIBBON

  for (const line of lines) {
    const topR = S_ARC_TOP.r + line.d
    const bottomR = S_ARC_BOTTOM.r - line.d
    const width = round(line.width * t.s)

    // Arco superior, de la coronilla hasta la cintura.
    strokes.push({
      kind: 'arc', role: 'ribbon',
      cx: S_ARC_TOP.cx * t.s + t.tx,
      cy: S_ARC_TOP.cy * t.s + t.ty,
      r: topR * t.s,
      from: S_ARC_TOP.from,
      to: S_ARC_TOP.to,
      width
    })

    // Arco inferior.
    strokes.push({
      kind: 'arc', role: 'ribbon',
      cx: S_ARC_BOTTOM.cx * t.s + t.tx,
      cy: S_ARC_BOTTOM.cy * t.s + t.ty,
      r: bottomR * t.s,
      from: S_ARC_BOTTOM.from,
      to: S_ARC_BOTTOM.to,
      width
    })

    // No hay costura entre los dos arcos: por construcción se tocan.

    // Estelas: salen en horizontal desde los extremos de cada arco.
    strokes.push({
      kind: 'seg',
      role: 'ribbon',
      a: tp(t, { x: S_ARC_TOP.cx, y: S_ARC_TOP.cy - topR }),
      b: tp(t, { x: line.topTail, y: S_ARC_TOP.cy - topR }),
      width
    })
    strokes.push({
      kind: 'seg',
      role: 'ribbon',
      a: tp(t, { x: S_ARC_BOTTOM.cx, y: S_ARC_BOTTOM.cy + bottomR }),
      b: tp(t, { x: line.bottomTail, y: S_ARC_BOTTOM.cy + bottomR }),
      width
    })
  }

  if (tier === TIERS.FULL) {
    for (const group of WAVES) {
      group.heights.forEach((h, i) => {
        const x = group.x + i * WAVE_GAP
        strokes.push({
          kind: 'seg',
          role: 'wave',
          a: tp(t, { x, y: group.y - h / 2 }),
          b: tp(t, { x, y: group.y + h / 2 }),
          width: round(WAVE_STROKE * t.s)
        })
      })
    }
  }

  for (const tri of SKIP.triangles) {
    fills.push({ kind: 'tri', points: tri.map(p => tp(t, p)) })
  }
  strokes.push({
    kind: 'seg',
    role: 'skip',
    a: tp(t, { x: SKIP.bar.x, y: SKIP.bar.y0 }),
    b: tp(t, { x: SKIP.bar.x, y: SKIP.bar.y1 }),
    width: round(SKIP.bar.width * t.s)
  })

  return { strokes, fills }
}

/** `d` de un arco en el dialecto que entienden SVG y los vectores de Android. */
function arcPath (shape) {
  const a = pointOn(shape.cx, shape.cy, shape.r, shape.from)
  const b = pointOn(shape.cx, shape.cy, shape.r, shape.to)
  const sweep = shape.to - shape.from
  const large = Math.abs(sweep) > 180 ? 1 : 0
  const dir = sweep > 0 ? 1 : 0
  const r = round(shape.r)
  return `M${round(a.x)},${round(a.y)} A${r},${r} 0 ${large} ${dir} ${round(b.x)},${round(b.y)}`
}

const segPath = (s) =>
  `M${round(s.a.x)},${round(s.a.y)} L${round(s.b.x)},${round(s.b.y)}`

const triPath = (f) =>
  `M${f.points.map(p => `${round(p.x)},${round(p.y)}`).join(' L')} Z`

/**
 * Agrupa los trazos por grosor: cada grupo sale como un único `path`, porque
 * tanto SVG como los vectores de Android definen el grosor por path y no por
 * subpath.
 */
export function strokeGroups (t = IDENTITY, tier = TIERS.FULL) {
  const { strokes } = markShapes(t, tier)
  const groups = new Map()
  for (const s of strokes) {
    // El papel entra en la clave además del grosor: aunque dos elementos
    // coincidieran de grosor, la web los anima por separado en el splash.
    const key = `${s.role}:${s.width}`
    if (!groups.has(key)) groups.set(key, { role: s.role, width: s.width, paths: [] })
    groups.get(key).paths.push(s.kind === 'arc' ? arcPath(s) : segPath(s))
  }
  return [...groups.values()].map(({ role, width, paths }) => ({
    role,
    width,
    d: paths.join(' ')
  }))
}

/** Todos los rellenos (los triángulos del glifo de salto) en un único path. */
export function fillPath (t = IDENTITY, tier = TIERS.FULL) {
  return markShapes(t, tier).fills.map(triPath).join(' ')
}

/**
 * Paleta de marca: el degradado del logotipo va del azul (abajo a la izquierda,
 * donde nace la «S») al lima (arriba a la derecha, hacia donde apunta el salto).
 */
export const BRAND = {
  ink: '#050B14',
  base: '#0B1220',
  deep: '#0D1B2A',
  blue: '#2F80F7',
  cyan: '#22D3EE',
  green: '#4ADE80',
  lime: '#BEF264',
  // El verde de la interfaz, que sigue siendo el acento del resto de la app.
  emerald: '#34D399'
}

/** Paradas del degradado, compartidas por SVG, vector de Android y raster. */
export const GRADIENT = [
  { offset: 0, color: BRAND.blue },
  { offset: 0.42, color: BRAND.cyan },
  { offset: 0.74, color: BRAND.green },
  { offset: 1, color: BRAND.lime }
]
