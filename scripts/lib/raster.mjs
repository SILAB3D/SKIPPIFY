/**
 * Rasterizador mínimo y codificador PNG en JS puro.
 *
 * El proyecto no tiene ImageMagick, Inkscape ni sharp, y los PNG del launcher
 * hay que regenerarlos en cinco densidades. Como las formas de la marca son
 * conocidas (segmentos, arcos y rectángulos redondeados) basta con evaluar su
 * distancia con signo por píxel: el antialiasing sale del propio valor de la
 * distancia, sin necesidad de supermuestrear.
 */
import { deflateSync } from 'node:zlib'

const clamp01 = (n) => (n < 0 ? 0 : n > 1 ? 1 : n)

/** Distancia con signo a una cápsula (segmento de grosor `hw`). */
export function sdSegment (px, py, x0, y0, x1, y1, hw) {
  const dx = x1 - x0
  const dy = y1 - y0
  const len2 = dx * dx + dy * dy
  const t = len2 === 0 ? 0 : clamp01(((px - x0) * dx + (py - y0) * dy) / len2)
  const cx = x0 + t * dx
  const cy = y0 + t * dy
  return Math.hypot(px - cx, py - cy) - hw
}

/**
 * Distancia a un arco trazado con extremos redondeados. Fuera del sector se cae
 * a los tapones, de ahí el mínimo con las dos cápsulas degeneradas de los topes.
 */
export function sdArc (px, py, cx, cy, r, fromDeg, toDeg, hw) {
  const a0 = Math.min(fromDeg, toDeg)
  const a1 = Math.max(fromDeg, toDeg)
  const base = (Math.atan2(py - cy, px - cx) * 180) / Math.PI
  // atan2 devuelve (−180, 180]; el sector puede vivir en cualquier vuelta, así
  // que se prueban las vueltas que pueden solaparlo (el barrido nunca pasa 360°).
  let inside = false
  for (let k = -2; k <= 2 && !inside; k++) {
    const ang = base + k * 360
    inside = ang >= a0 && ang <= a1
  }
  if (inside) return Math.abs(Math.hypot(px - cx, py - cy) - r) - hw

  const rad = (d) => (d * Math.PI) / 180
  const e0x = cx + r * Math.cos(rad(a0))
  const e0y = cy + r * Math.sin(rad(a0))
  const e1x = cx + r * Math.cos(rad(a1))
  const e1y = cy + r * Math.sin(rad(a1))
  return Math.min(
    Math.hypot(px - e0x, py - e0y),
    Math.hypot(px - e1x, py - e1y)
  ) - hw
}

/** Distancia a un rectángulo redondeado centrado en (cx, cy). */
export function sdRoundRect (px, py, cx, cy, halfW, halfH, r) {
  const qx = Math.abs(px - cx) - (halfW - r)
  const qy = Math.abs(py - cy) - (halfH - r)
  const ax = Math.max(qx, 0)
  const ay = Math.max(qy, 0)
  return Math.hypot(ax, ay) + Math.min(Math.max(qx, qy), 0) - r
}

export const sdCircle = (px, py, cx, cy, r) => Math.hypot(px - cx, py - cy) - r

export function hexToRgb (hex) {
  const h = hex.replace('#', '')
  return [
    parseInt(h.slice(0, 2), 16),
    parseInt(h.slice(2, 4), 16),
    parseInt(h.slice(4, 6), 16)
  ]
}

export function mixRgb (a, b, t) {
  const k = clamp01(t)
  return [
    a[0] + (b[0] - a[0]) * k,
    a[1] + (b[1] - a[1]) * k,
    a[2] + (b[2] - a[2]) * k
  ]
}

/** Lienzo RGBA premultiplicado-no: se compone en «source over» clásico. */
export class Canvas {
  constructor (width, height) {
    this.width = width
    this.height = height
    this.data = new Float64Array(width * height * 4)
  }

  /**
   * Pinta una forma. `sdf(x, y)` devuelve la distancia con signo en píxeles y
   * `paint(x, y)` el color ([r, g, b] 0-255 y alfa opcional 0-1).
   */
  draw (sdf, paint, alphaScale = 1) {
    const { width, height, data } = this
    for (let y = 0; y < height; y++) {
      for (let x = 0; x < width; x++) {
        const px = x + 0.5
        const py = y + 0.5
        const d = sdf(px, py)
        if (d > 1) continue
        const cov = clamp01(0.5 - d)
        if (cov <= 0) continue
        const col = paint(px, py)
        const a = cov * alphaScale * (col.length > 3 ? col[3] : 1)
        if (a <= 0) continue
        const i = (y * width + x) * 4
        const dst = data[i + 3]
        const out = a + dst * (1 - a)
        for (let c = 0; c < 3; c++) {
          data[i + c] = (col[c] * a + data[i + c] * dst * (1 - a)) / (out || 1)
        }
        data[i + 3] = out
      }
    }
  }

  fill (paint) {
    this.draw(() => -10, paint)
  }

  toPng () {
    const { width, height, data } = this
    const raw = Buffer.alloc((width * 4 + 1) * height)
    let p = 0
    for (let y = 0; y < height; y++) {
      raw[p++] = 0
      for (let x = 0; x < width; x++) {
        const i = (y * width + x) * 4
        for (let c = 0; c < 4; c++) {
          const v = c === 3 ? data[i + 3] * 255 : data[i + c]
          raw[p++] = Math.max(0, Math.min(255, Math.round(v)))
        }
      }
    }
    return encodePng(width, height, raw)
  }
}

function chunk (type, body) {
  const len = Buffer.alloc(4)
  len.writeUInt32BE(body.length)
  const typed = Buffer.concat([Buffer.from(type, 'ascii'), body])
  const crc = Buffer.alloc(4)
  crc.writeUInt32BE(crc32(typed) >>> 0)
  return Buffer.concat([len, typed, crc])
}

let CRC_TABLE = null
function crc32 (buf) {
  if (!CRC_TABLE) {
    CRC_TABLE = new Int32Array(256)
    for (let n = 0; n < 256; n++) {
      let c = n
      for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1
      CRC_TABLE[n] = c
    }
  }
  let c = -1
  for (let i = 0; i < buf.length; i++) c = CRC_TABLE[(c ^ buf[i]) & 0xff] ^ (c >>> 8)
  return c ^ -1
}

function encodePng (width, height, raw) {
  const ihdr = Buffer.alloc(13)
  ihdr.writeUInt32BE(width, 0)
  ihdr.writeUInt32BE(height, 4)
  ihdr[8] = 8      // bit depth
  ihdr[9] = 6      // RGBA
  ihdr[10] = 0
  ihdr[11] = 0
  ihdr[12] = 0
  return Buffer.concat([
    Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
    chunk('IHDR', ihdr),
    chunk('IDAT', deflateSync(raw, { level: 9 })),
    chunk('IEND', Buffer.alloc(0))
  ])
}
