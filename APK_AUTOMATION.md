# Automatización de APK (Android)

Este proyecto compila la APK con Capacitor y la distribuye por su propio canal de
actualización: cada push a `main` publica una release y las instalaciones
existentes se actualizan solas.

## Archivos principales

- `scripts/build-apk.ps1` — compila la APK firmada
- `scripts/create-keystore.ps1` — genera la clave de firma (una única vez)
- `.github/workflows/release-apk.yml` — compila y publica en cada push

## Qué hace la build

1. Verifica herramientas necesarias (`node`, `npm`, `java` JDK 21)
2. (Opcional) instala dependencias faltantes con `winget`
3. Compila el proyecto Vue y sincroniza el wrapper Android con Capacitor
4. Copia las fuentes nativas de `android-src/` y parchea manifiesto y Gradle
5. Compila y **firma** la APK (`assembleRelease`)
6. Deja en `dist/` la APK versionada y `latest.json`

## Primera puesta en marcha

```powershell
Set-ExecutionPolicy -Scope Process Bypass
.\scripts\create-keystore.ps1     # sólo la primera vez
.\scripts\build-apk.ps1
```

`create-keystore.ps1` imprime al final los cuatro secrets que hay que crear en
GitHub → Settings → Secrets and variables → Actions.

## Ejecución normal

```powershell
.\scripts\build-apk.ps1                    # release firmada (la que se distribuye)
.\scripts\build-apk.ps1 -BuildType debug   # prueba local de usar y tirar
```

## Canal de actualización automática

Al hacer push a `main`, el workflow compila la APK firmada y la publica como
release. La app consulta la última release al arrancar, se descarga la APK sola
en segundo plano y sólo pide confirmación para instalarla — Android no permite
que una app normal instale nada en silencio, ese toque es inevitable.

### Versionado

El `versionCode` es **el número de commits** (`git rev-list --count HEAD`), no la
versión de `package.json`. Android sólo acepta actualizar a un `versionCode`
estrictamente mayor, y así cualquier push genera uno nuevo sin tener que
acordarse de subir la versión a mano. `package.json` sigue mandando en el
`versionName`, que es lo que se ve en la interfaz.

**Consecuencia:** no reescribas la historia de `main` (nada de `rebase` ni
`push --force`). Si el número de commits baja, las releases nuevas dejarían de
verse como actualizaciones.

### La clave de firma

Android identifica una app por `applicationId` + firma. Todas las APK van
firmadas con `skippify-release.jks`, que está fuera de git.

**Guarda una copia fuera del proyecto.** Si se pierde, ningún móvil con Skippify
instalada podrá volver a actualizarse: habría que desinstalar y reinstalar,
perdiendo el historial.

### Piezas implicadas

| Pieza | Papel |
|---|---|
| `android-src/UpdaterPlugin.java` | descarga la APK e invoca al instalador |
| `src/composables/useAppUpdate.js` | consulta la release y compara versiones |
| `src/components/UpdateBanner.vue` | el aviso con progreso de descarga |
| `dist/latest.json` | el `versionCode` publicado, que es lo que se compara |

### Si el aviso no aparece

- El repositorio tiene que ser **público**: la app consulta la API de GitHub sin
  credenciales, y en uno privado recibe un 404 y se calla.
- El fallo es silencioso por diseño: sin red, o si GitHub responde con un 403 por
  límite de peticiones, la app funciona igual y no ofrece nada.

## Instalar en dispositivo Android

```powershell
adb install -r (Get-ChildItem .\dist\Skippify-v*.apk | Sort-Object LastWriteTime -Descending | Select-Object -First 1).FullName
```

Sólo hace falta la primera vez: a partir de ahí la app se actualiza sola.

## Nota importante sobre Spotify

Para detectar correctamente eventos y parámetros de Spotify en la APK, el
backend que gestiona OAuth y la sincronización con Spotify debe ser accesible y
estable.

## Eventos en segundo plano

La APK guarda en almacenamiento interno los eventos de play/pause/stop detectados por el `NotificationListenerService` aunque la WebView esté en segundo plano.
Cuando vuelves a abrir la app, esos eventos se drenan automáticamente y se convierten en segmentos aproximados (`ms_played` inferido por timestamps) para añadirlos al historial.

Limitaciones de Android a tener en cuenta:

- Si el usuario hace **Force stop** a la app, Android detiene servicios y no se registrará nada hasta volver a abrirla.
- Algunos modos agresivos de batería/OEM pueden limitar servicios; el permiso de acceso a notificaciones debe permanecer habilitado.

## Recursos gráficos de la marca

El icono de la app, el splash nativo y el icono monocromo de notificación salen
todos de la misma geometría (`scripts/lib/brand-mark.mjs`). Para regenerarlos:

```powershell
npm run icons
```

Escribe en `android-src/res/` (vectores del launcher, PNG en cinco densidades y
los `splash.png` de cada orientación) y actualiza `src/lib/brandMark.js`, que es
lo que usa la interfaz web. `build-apk.ps1` copia después ese árbol al proyecto
Android, así que no hay que tocar nada dentro de `android/`.

## Comprobación rápida antes de compilar

```powershell
npm run smoke
```

Renderiza todas las rutas en Node y recorre el asistente de calibración contra
un motor simulado. No sustituye a probar la APK en el móvil, pero detecta al
instante plantillas rotas y errores de ejecución.
