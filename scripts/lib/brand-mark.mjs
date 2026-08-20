/**
 * Geometría única de la marca Skippify.
 *
 * La marca es una «S» maciza: dos arcos de sentido contrario trazados con un
 * único grosor, sin estelas, ondas ni glifos añadidos. Renuncia a ilustrar el
 * salto a cambio de aguantar cualquier tamaño —incluidos los 24 dp de la barra
 * de estado, donde todo lo accesorio se convertía en suciedad.
 *
 * Todo se define en un lienzo de 24 × 24 y se escala desde aquí, de modo que el
 * flavicon web, el vector del launcher, el icono monocromo de notificación y
 * los PNG rasterizados salgan exactamente del mismo dibujo.
 */

const D = Math.PI / 180

export const CANVAS = 24

/**
 * Los centros de los dos bucles se eligen a mano; el radio NO.
 *
 * Se calcula como la mitad de la distancia entre centros, que es la condición
 * para que las dos circunferencias sean tangentes: los arcos se tocan en un
 * punto y comparten tangente, así que la cintura de la «S» sale de un trazo
 * continuo sin necesidad de coserlos con un segmento.
 */
const S_CENTER_TOP = { cx: 13.1, cy: 8.3 }
const S_CENTER_BOTTOM = { cx: 10.9, cy: 15.7 }

const SPAN_X = S_CENTER_BOTTOM.cx - S_CENTER_TOP.cx
const SPAN_Y = S_CENTER_BOTTOM.cy - S_CENTER_TOP.cy

export const S_RADIUS = Math.hypot(SPAN_X, SPAN_Y) / 2

/** Dirección en la que se rozan los dos círculos. */
const TOUCH_DEG = Math.atan2(SPAN_Y, SPAN_X) / D

/**
 * Los extremos libres se quedan cinco grados antes de la vertical (−95° y 85°
 * en vez de ±90°). Rebasar la vertical enrolla la punta hacia dentro y la «S»
 * empieza a leerse como un «8»; quedarse corto la deja abierta y con impulso.
 */
export const S_ARC_TOP = {
  ...S_CENTER_TOP,
  r: S_RADIUS,
  from: -95,
  to: TOUCH_DEG - 360
}
export const S_ARC_BOTTOM = {
  ...S_CENTER_BOTTOM,
  r: S_RADIUS,
  from: TOUCH_DEG - 180,
  to: 85
}

export const S_ARCS = [S_ARC_TOP, S_ARC_BOTTOM]

/**
 * Un único grosor para toda la marca. Es deliberadamente alto —cerca de un
 * cuarto del radio—: por debajo, el trazo se rompe al rasterizar el icono de
 * notificación, que es el tamaño que manda.
 */
export const S_STROKE = 3.6

function pointOn (arc, deg) {
  return { x: arc.cx + arc.r * Math.cos(deg * D), y: arc.cy + arc.r * Math.sin(deg * D) }
}

const round = (n) => Math.round(n * 1000) / 1000

/**
 * Caja visual real del dibujo, trazo incluido.
 *
 * Se mide recorriendo los arcos en vez de anotarla a mano: mover un centro un
 * par de décimas descolocaba el encuadre y el icono se iba del centro sin que
 * nada avisara.
 */
function measureGlyphBox () {
  const half = S_STROKE / 2
  let x0 = Infinity; let y0 = Infinity; let x1 = -Infinity; let y1 = -Infinity

  for (const arc of S_ARCS) {
    const from = Math.min(arc.from, arc.to)
    const to = Math.max(arc.from, arc.to)
    const steps = 240
    for (let i = 0; i <= steps; i++) {
      const p = pointOn(arc, from + ((to - from) * i) / steps)
      if (p.x < x0) x0 = p.x
      if (p.y < y0) y0 = p.y
      if (p.x > x1) x1 = p.x
      if (p.y > y1) y1 = p.y
    }
  }

  return {
    x0: round(x0 - half),
    y0: round(y0 - half),
    x1: round(x1 + half),
    y1: round(y1 + half)
  }
}

export const GLYPH_BOX = measureGlyphBox()

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

/**
 * Los dos arcos ya transformados. Es la fuente que consumen tanto el generador
 * de vectores como el rasterizador, para que el PNG y el XML no puedan dibujar
 * cosas distintas.
 */
export function markShapes (t = IDENTITY) {
  return S_ARCS.map(arc => ({
    cx: arc.cx * t.s + t.tx,
    cy: arc.cy * t.s + t.ty,
    r: arc.r * t.s,
    from: arc.from,
    to: arc.to
  }))
}

/** `d` de la «S» completa: SVG y los vectores de Android hablan el mismo dialecto. */
export function sPath (t = IDENTITY) {
  return markShapes(t).map(arc => {
    const a = pointOn(arc, arc.from)
    const b = pointOn(arc, arc.to)
    const sweep = arc.to - arc.from
    const large = Math.abs(sweep) > 180 ? 1 : 0
    const dir = sweep > 0 ? 1 : 0
    const r = round(arc.r)
    return `M${round(a.x)},${round(a.y)} A${r},${r} 0 ${large} ${dir} ${round(b.x)},${round(b.y)}`
  }).join(' ')
}

export const sStrokeWidth = (t = IDENTITY) => round(S_STROKE * t.s)

/**
 * Paleta de marca: el degradado va del azul (abajo, donde nace la «S») al lima
 * (arriba, por donde sale).
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
