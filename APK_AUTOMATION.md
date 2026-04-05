# Automatización de APK (Android)

Este proyecto incluye un script para generar una APK debug automáticamente con Capacitor.

## Archivo principal

- `scripts/build-apk.ps1`

## Qué hace

1. Verifica herramientas necesarias (`node`, `npm`, `java` JDK 21)
2. (Opcional) instala dependencias faltantes con `winget`
3. Crea un wrapper Android con Capacitor en `.apk-build/`
4. Compila la APK (`assembleDebug`)
5. Copia el resultado a `dist/Skippify-v1.x.apk` (versionado incremental automático)

El contador de `x` se persiste en `.apk-version-v1.txt` para que no se reinicie cuando Vite limpia `dist/`.

## Ejecución recomendada

```powershell
Set-ExecutionPolicy -Scope Process Bypass
.\scripts\build-apk.ps1 -InstallMissing -WebAppUrl "https://TU_URL_PUBLICA" -AppId "com.skippify.app" -AppName "Skippify"
```

## Si tu URL usa HTTP local

```powershell
.\scripts\build-apk.ps1 -InstallMissing -WebAppUrl "http://192.168.1.50:5500" -UseHttp
```

## Instalar en dispositivo Android

```powershell
adb install -r (Get-ChildItem .\dist\Skippify-v1.*.apk | Sort-Object LastWriteTime -Descending | Select-Object -First 1).FullName
```

## Nota importante sobre Spotify

Para detectar correctamente eventos y parámetros de Spotify en la APK, la URL configurada en `-WebAppUrl` debe apuntar a un backend accesible y estable que gestione OAuth y sincronización con Spotify.

## Eventos en segundo plano

La APK guarda en almacenamiento interno los eventos de play/pause/stop detectados por el `NotificationListenerService` aunque la WebView esté en segundo plano.
Cuando vuelves a abrir la app, esos eventos se drenan automáticamente y se convierten en segmentos aproximados (`ms_played` inferido por timestamps) para añadirlos al historial.

Limitaciones de Android a tener en cuenta:

- Si el usuario hace **Force stop** a la app, Android detiene servicios y no se registrará nada hasta volver a abrirla.
- Algunos modos agresivos de batería/OEM pueden limitar servicios; el permiso de acceso a notificaciones debe permanecer habilitado.
