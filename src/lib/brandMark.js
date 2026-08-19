/**
 * Trazo de la marca Skippify para la interfaz web (flavicon, splash, cabeceras).
 *
 * ARCHIVO GENERADO por scripts/generate-brand-assets.mjs — no editar a mano.
 * Comparte geometría exacta con el icono del launcher y con el de notificación.
 */
export const BRAND_VIEWBOX = '0 0 24 24'

/** Un trazo por papel: la cinta, las barras de onda y la barra del salto. */
export const BRAND_STROKES = [
  { role: 'ribbon', width: 0.864, d: 'M13.68,2.549 A5.431,5.431 0 0 0 11.781,13.068 M11.781,13.068 A3.151,3.151 0 0 1 10.68,19.171 M13.68,2.549 L22.8,2.549 M10.68,19.171 L4.56,19.171 M13.68,4.829 A3.151,3.151 0 0 0 12.579,10.932 M12.579,10.932 A5.431,5.431 0 0 1 10.68,21.451 M13.68,4.829 L19.44,4.829 M10.68,21.451 L1.2,21.451' },
  { role: 'ribbon', width: 1.032, d: 'M13.68,3.689 A4.291,4.291 0 0 0 12.18,12 M12.18,12 A4.291,4.291 0 0 1 10.68,20.311 M13.68,3.689 L21.12,3.689 M10.68,20.311 L2.88,20.311' },
  { role: 'wave', width: 0.552, d: 'M4.2,10.5 L4.2,11.94 M4.992,9.96 L4.992,12.48 M5.784,9.42 L5.784,13.02 M6.576,10.08 L6.576,12.36 M7.368,10.44 L7.368,12 M17.88,14.28 L17.88,15.84 M18.672,13.68 L18.672,16.44 M19.464,13.14 L19.464,16.98 M20.256,13.86 L20.256,16.26 M21.048,14.34 L21.048,15.78' },
  { role: 'skip', width: 0.744, d: 'M22.02,7.38 L22.02,10.26' }
]

/**
 * La misma marca sin las barras de onda, para cuando se pinta pequeña (menos de
 * unos 24 px): a ese tamaño las ondas dejan de leerse como ondas y sólo
 * ensucian el contorno de la «S».
 */
export const BRAND_STROKES_COMPACT = [
  { role: 'ribbon', width: 0.864, d: 'M13.68,2.549 A5.431,5.431 0 0 0 11.781,13.068 M11.781,13.068 A3.151,3.151 0 0 1 10.68,19.171 M13.68,2.549 L22.8,2.549 M10.68,19.171 L4.56,19.171 M13.68,4.829 A3.151,3.151 0 0 0 12.579,10.932 M12.579,10.932 A5.431,5.431 0 0 1 10.68,21.451 M13.68,4.829 L19.44,4.829 M10.68,21.451 L1.2,21.451' },
  { role: 'ribbon', width: 1.032, d: 'M13.68,3.689 A4.291,4.291 0 0 0 12.18,12 M12.18,12 A4.291,4.291 0 0 1 10.68,20.311 M13.68,3.689 L21.12,3.689 M10.68,20.311 L2.88,20.311' },
  { role: 'skip', width: 0.744, d: 'M22.02,7.38 L22.02,10.26' }
]

/** Los dos triángulos del glifo de salto, que van rellenos y no trazados. */
export const BRAND_FILL = 'M17.64,7.02 L19.62,8.82 L17.64,10.62 Z M19.2,7.02 L21.18,8.82 L19.2,10.62 Z'

/** Paradas del degradado azul → lima, en el orden en que las pinta el SVG. */
export const BRAND_GRADIENT = [{"offset":0,"color":"#2F80F7"},{"offset":0.42,"color":"#22D3EE"},{"offset":0.74,"color":"#4ADE80"},{"offset":1,"color":"#BEF264"}]
