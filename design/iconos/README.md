# Propuestas de icono

Cuatro direcciones para el icono de Skippify, pendientes de elegir. Ninguna está
incorporada todavía: la marca en uso sigue siendo la de
`scripts/lib/brand-mark.mjs`.

| Imagen | Propuesta | Idea |
|---|---|---|
| `concepto-A-bucle-roto.png` | Bucle roto | Anillo de repetición abierto por la derecha con el glifo de salto en el hueco |
| `concepto-B-onda-saltada.png` | Onda saltada | Barras de espectro interrumpidas por un doble chevrón |
| `concepto-C-monograma.png` | Monograma macizo | La «S» en dos arcos tangentes de un solo trazo grueso |
| `concepto-D-salto-negativo.png` | Salto en negativo | Pastilla maciza con el glifo de salto recortado |

`comparativa.png` las pone las cuatro juntas.

Cada imagen muestra el icono grande y, debajo, los tamaños a los que hay que
juzgarlo de verdad: 96 px, 48 px (cajón de aplicaciones) y las máscaras blancas
de la barra de notificación, donde Android descarta el color y sólo conserva la
silueta.

## Regenerar

```powershell
node design/iconos/concepts.mjs design/iconos/comparativa.png
node design/iconos/individuales.mjs
```

Los conceptos se definen en `concepts.mjs`, cada uno como una función que
devuelve arcos, segmentos y triángulos sobre un lienzo de 24 × 24 — las mismas
primitivas que usa el rasterizador de `scripts/lib/raster.mjs`. `concepts-lib.mjs`
es ese mismo fichero sin el bloque que compone la hoja, para poder reutilizar los
conceptos desde otros scripts.

Cuando se elija una, su geometría pasa a `scripts/lib/brand-mark.mjs` y de ahí
sale todo lo demás (launcher, splash, notificación y flavicon) con `npm run icons`.
