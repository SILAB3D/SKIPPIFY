/**
 * Geometría única de la marca Skippify.
 *
 * El icono es una «S» monograma trazada con dos arcos (bowls) más una estela de
 * tres guiones de velocidad a su izquierda. No es un triángulo de reproducción:
 * ese era justo el problema del icono anterior, que se confundía con cualquier
 * reproductor de música.
 *
 * Todo se define en un lienzo de 24 × 24 y se escala desde aquí, de modo que el
 * flavicon web, el vector del launcher, el icono monocromo de notificación y los
 * PNG rasterizados salgan exactamente del mismo dibujo.
 */

const D = Math.PI / 180

/** Trazo de la «S»: dos arcos de 3.45 de radio unidos por una diagonal corta. */
export const S_ARC_TOP = { cx: 15.2, cy: 8.4, r: 3.45, from: 25, to: -260 }
export const S_ARC_BOTTOM = { cx: 15.2, cy: 15.6, r: 3.45, from: -80, to: 170 }
export const S_STROKE = 2.2

/**
 * Estela de velocidad: DOS guiones, uno a cada lado del eje horizontal.
 *
 * Antes eran tres (con el central sobresaliendo), lo que dejaba el conjunto en
 * cuatro elementos: un número par, sin un elemento que hiciera de centro. Ahora
 * la marca son tres elementos —la «S» y dos guiones simétricos respecto a
 * y = 12— y el eje central queda libre, que es justo donde se apoya la cintura
 * de la «S». A tamaño de flavicon (16 px) además se lee mucho mejor: tres
 * líneas finas tan juntas se emborronaban.
 */
export const TRAIL = [
  { x0: 4.6, x1: 8.5, y: 9.0 },
  { x0: 4.6, x1: 8.5, y: 15.0 }
]
export const TRAIL_STROKE = 1.6

/** Caja visual real del dibujo (trazo incluido), usada para centrar y escalar. */
export const GLYPH_BOX = { x0: 3.8, y0: 3.85, x1: 19.75, y1: 20.15 }

function pointOn (arc, deg) {
  return {
    x: arc.cx + arc.r * Math.cos(deg * D),
    y: arc.cy + arc.r * Math.sin(deg * D)
  }
}

export const S_POINTS = {
  start: pointOn(S_ARC_TOP, S_ARC_TOP.from),
  topEnd: pointOn(S_ARC_TOP, S_ARC_TOP.to),
  bottomStart: pointOn(S_ARC_BOTTOM, S_ARC_BOTTOM.from),
  end: pointOn(S_ARC_BOTTOM, S_ARC_BOTTOM.to)
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

/** `d` del trazo de la «S» (arcos SVG/Android: ambos entienden el comando A). */
export function sPath (t = IDENTITY) {
  const a = tp(t, S_POINTS.start)
  const b = tp(t, S_POINTS.topEnd)
  const c = tp(t, S_POINTS.bottomStart)
  const e = tp(t, S_POINTS.end)
  const r = round(S_ARC_TOP.r * t.s)
  return [
    `M${round(a.x)},${round(a.y)}`,
    `A${r},${r} 0 1 0 ${round(b.x)},${round(b.y)}`,
    `L${round(c.x)},${round(c.y)}`,
    `A${r},${r} 0 1 1 ${round(e.x)},${round(e.y)}`
  ].join(' ')
}

/** `d` de la estela completa (los tres guiones en un único subpath múltiple). */
export function trailPath (t = IDENTITY) {
  return TRAIL.map(({ x0, x1, y }) => {
    const a = tp(t, { x: x0, y })
    const b = tp(t, { x: x1, y })
    return `M${round(a.x)},${round(a.y)} L${round(b.x)},${round(b.y)}`
  }).join(' ')
}

export const sStrokeWidth = (t = IDENTITY) => round(S_STROKE * t.s)
export const trailStrokeWidth = (t = IDENTITY) => round(TRAIL_STROKE * t.s)

/** Paleta de marca, compartida con la interfaz (emerald → teal sobre pizarra). */
export const BRAND = {
  ink: '#050B14',
  base: '#0B1220',
  deep: '#0D1B2A',
  emerald: '#34D399',
  emeraldDeep: '#10B981',
  teal: '#2DD4BF',
  sky: '#38BDF8'
}
