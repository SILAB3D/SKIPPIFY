/**
 * Una imagen por propuesta: el icono grande y, debajo, los tamaños reales a los
 * que hay que juzgarlo (launcher de 48 px y máscara de notificación).
 */
import { writeFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { Canvas } from '../../scripts/lib/raster.mjs'
import { CONCEPTOS, celdaLauncher, celdaMono, blit } from './concepts-lib.mjs'

// Las imágenes se escriben junto al script, no en el directorio de trabajo.
const AQUI = dirname(fileURLToPath(import.meta.url))

const NOMBRES = ['A-bucle-roto', 'B-onda-saltada', 'C-monograma', 'D-salto-negativo']

CONCEPTOS.forEach((concepto, i) => {
  const hoja = new Canvas(560, 460)
  hoja.fill(() => [16, 18, 24])

  // El icono a tamaño de escaparate.
  blit(hoja, celdaLauncher(concepto, 320), 120, 30)

  // Y la realidad: cómo se ve de verdad en el cajón de apps y en la barra.
  blit(hoja, celdaLauncher(concepto, 96), 120, 380)
  blit(hoja, celdaLauncher(concepto, 48), 250, 404)
  blit(hoja, celdaMono(concepto, 48), 330, 404)
  blit(hoja, celdaMono(concepto, 24), 400, 416)

  writeFileSync(join(AQUI, `concepto-${NOMBRES[i]}.png`), hoja.toPng())
  console.log('  ·', NOMBRES[i])
})
