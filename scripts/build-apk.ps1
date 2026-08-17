param(
    [Parameter(Mandatory = $false)]
    [string]$AppId = "com.skippify.app",

    [Parameter(Mandatory = $false)]
    [string]$AppName = "Skippify",

    [Parameter(Mandatory = $false)]
    [switch]$InstallMissing
)

$ErrorActionPreference = "Stop"

function Write-Step {
    param([string]$Message)
    Write-Host "[APK] $Message" -ForegroundColor Cyan
}

function Test-Command {
    param([string]$Name)
    return [bool](Get-Command $Name -ErrorAction SilentlyContinue)
}

function Ensure-Tool {
    param(
        [string]$CommandName,
        [string]$WingetId,
        [string]$FriendlyName
    )

    if (Test-Command $CommandName) {
        Write-Step "$FriendlyName detectado"
        return
    }

    if (-not $InstallMissing) {
        throw "$FriendlyName no está instalado. Ejecuta nuevamente con -InstallMissing para instalarlo automáticamente."
    }

    if (-not (Test-Command "winget")) {
        throw "winget no está disponible; instala manualmente $FriendlyName e inténtalo de nuevo."
    }

    Write-Step "Instalando $FriendlyName con winget..."
    winget install --id $WingetId --exact --silent --accept-source-agreements --accept-package-agreements | Out-Host

    if (-not (Test-Command $CommandName)) {
        throw "No se pudo detectar $FriendlyName tras la instalación. Cierra/reabre terminal e inténtalo otra vez."
    }

    Write-Step "$FriendlyName instalado correctamente"
}

$workspaceRoot  = Resolve-Path (Join-Path $PSScriptRoot "..")
$distDir        = Join-Path $workspaceRoot "dist"
$androidDir     = Join-Path $workspaceRoot "android"
$androidSrcDir  = Join-Path $workspaceRoot "android-src"
$javaPackageDir = Join-Path $androidDir "app\src\main\java\com\skippify\app"
$androidPublicDir = Join-Path $androidDir "app\src\main\assets\public"
$compressedAssetsDir = Join-Path $androidDir "app\build\intermediates\compressed_assets"
$packagedResDir = Join-Path $androidDir "app\build\intermediates\packaged_res"
$mergedResDir = Join-Path $androidDir "app\build\intermediates\merged_res"
$mergedResBlameDir = Join-Path $androidDir "app\build\intermediates\merged_res_blame_folder"
$mergeDebugResourcesDir = Join-Path $androidDir "app\build\intermediates\incremental\debug\mergeDebugResources"
$assetsIntermediatesDir = Join-Path $androidDir "app\build\intermediates\assets"
$mergeDebugAssetsDir = Join-Path $androidDir "app\build\intermediates\assets\debug\mergeDebugAssets"
$packageDebugResourcesDir = Join-Path $androidDir "app\build\intermediates\incremental\debug\packageDebugResources"
$apkVersionLabel = "v3.2"
$env:SKIPPIFY_APP_VERSION = $apkVersionLabel

# Ensure Node.js paths are available
foreach ($nodePath in @("C:\Program Files\nodejs", "$env:APPDATA\npm", "$env:ProgramFiles\nodejs")) {
    if ((Test-Path $nodePath) -and ($env:Path -notlike "*$nodePath*")) {
        $env:Path = "$nodePath;" + $env:Path
    }
}

# Ensure JDK 21 is in PATH
$jdk21Path = "C:\Program Files\Microsoft\jdk-21.0.10.7-hotspot"
if (Test-Path $jdk21Path) {
    $env:JAVA_HOME = $jdk21Path
    if (-not ($env:Path -like "*$jdk21Path\bin*")) {
        $env:Path = "$jdk21Path\bin;" + $env:Path
    }
}

Write-Step "Verificando dependencias base..."
Ensure-Tool -CommandName "node" -WingetId "OpenJS.NodeJS.LTS" -FriendlyName "Node.js LTS"
Ensure-Tool -CommandName "npm"  -WingetId "OpenJS.NodeJS.LTS" -FriendlyName "npm"
Ensure-Tool -CommandName "java" -WingetId "Microsoft.OpenJDK.21" -FriendlyName "JDK 21"

if (Test-Path $jdk21Path) {
    Write-Step "JAVA_HOME configurado a JDK 21"
}

# ─── 1. Install npm dependencies ───────────────────────────────────────────────
Write-Step "Instalando dependencias npm..."
Push-Location $workspaceRoot
npm install | Out-Host
Pop-Location

# ─── 2. Build Vue project with Vite ────────────────────────────────────────────
Write-Step "Compilando proyecto Vue con Vite..."
Write-Step "Versión de app para esta build: $env:SKIPPIFY_APP_VERSION"
Push-Location $workspaceRoot
npx vite build | Out-Host
Pop-Location

if (-not (Test-Path (Join-Path $distDir "index.html"))) {
    throw "La build de Vite falló: no se encontró dist/index.html"
}
Write-Step "Build de Vite completada"

# ─── 3. Add Android platform if not present ────────────────────────────────────
if (-not (Test-Path $androidDir)) {
    Write-Step "Creando proyecto Android (npx cap add android)..."
    Push-Location $workspaceRoot
    npx cap add android | Out-Host
    Pop-Location
}

# ─── 4. Sync web assets to Android ─────────────────────────────────────────────
Write-Step "Sincronizando proyecto Android (npx cap sync)..."
if (Test-Path $androidPublicDir) {
    Remove-Item -Path $androidPublicDir -Recurse -Force -ErrorAction SilentlyContinue
}
Push-Location $workspaceRoot
npx cap sync android | Out-Host
Pop-Location

# ─── 5. Inject native notification listener plugin ─────────────────────────────
# DuplicateSkipEngine.java faltaba en esta lista: el motor se editaba en
# android-src/ pero la APK seguía compilando la copia vieja de android/.
$notifSrcFiles = @(
    "SpotifyNotificationListener.java",
    "NotifListenerPlugin.java",
    "SkippifyForegroundService.java",
    "BootCompletedReceiver.java",
    "DuplicateSkipEngine.java"
)
foreach ($srcFile in $notifSrcFiles) {
    $src = Join-Path $androidSrcDir $srcFile
    $dst = Join-Path $javaPackageDir $srcFile
    if (Test-Path $src) {
        Copy-Item -Path $src -Destination $dst -Force
        Write-Step "Copiado: $srcFile"
    } else {
        Write-Host "[APK] AVISO: No se encontró $srcFile en android-src/" -ForegroundColor Yellow
    }
}

# Recursos nativos propios (icono monocromo de la notificación persistente).
$androidSrcResDir = Join-Path $androidSrcDir "res"
if (Test-Path $androidSrcResDir) {
    $androidResDir = Join-Path $androidDir "app\src\main\res"
    Get-ChildItem -Path $androidSrcResDir -Recurse -File | ForEach-Object {
        $relative = $_.FullName.Substring($androidSrcResDir.Length).TrimStart('\')
        $target = Join-Path $androidResDir $relative
        $targetDir = Split-Path $target -Parent
        if (-not (Test-Path $targetDir)) {
            New-Item -ItemType Directory -Path $targetDir -Force | Out-Null
        }
        Copy-Item -Path $_.FullName -Destination $target -Force
        Write-Step "Recurso copiado: $relative"
    }
}

# ─── 6. Patch MainActivity.java – register the plugin ──────────────────────────
$mainActivityPath = Join-Path $javaPackageDir "MainActivity.java"
$mainActivityContent = Get-Content $mainActivityPath -Raw
if ($mainActivityContent -notmatch "NotifListenerPlugin") {
    $importOld = 'import com\.getcapacitor\.BridgeActivity;'
    $importNew = "import android.os.Bundle;`nimport com.getcapacitor.BridgeActivity;"
    $classOld  = 'public class MainActivity extends BridgeActivity \{\}'
    $classNew  = "public class MainActivity extends BridgeActivity {`n    @Override`n    public void onCreate(Bundle savedInstanceState) {`n        registerPlugin(NotifListenerPlugin.class);`n        super.onCreate(savedInstanceState);`n    }`n}"
    $mainActivityContent = $mainActivityContent -replace $importOld, $importNew
    $mainActivityContent = $mainActivityContent -replace $classOld,  $classNew
    $mainActivityContent = $mainActivityContent -replace '^\xEF\xBB\xBF', '' -replace "^\uFEFF", ''
    $utf8NoBom = New-Object System.Text.UTF8Encoding($false)
    [System.IO.File]::WriteAllText($mainActivityPath, $mainActivityContent, $utf8NoBom)
    Write-Step "MainActivity.java parcheado con NotifListenerPlugin"
} else {
    Write-Step "MainActivity.java ya tiene NotifListenerPlugin"
}

# ─── 7. Patch AndroidManifest.xml ──────────────────────────────────────────────
$manifestPath    = Join-Path $androidDir "app\src\main\AndroidManifest.xml"
$manifestContent = Get-Content $manifestPath -Raw
$manifestChanged = $false

# FOREGROUND_SERVICE permissions
if ($manifestContent -notmatch 'FOREGROUND_SERVICE"') {
    $manifestContent = $manifestContent -replace '(<application)', "    <uses-permission android:name=`"android.permission.FOREGROUND_SERVICE`" />`n    <uses-permission android:name=`"android.permission.FOREGROUND_SERVICE_DATA_SYNC`" />`n    `$1"
    $manifestChanged = $true
    Write-Step "AndroidManifest.xml: permisos FOREGROUND_SERVICE añadidos"
} else {
    Write-Step "AndroidManifest.xml ya tiene permisos FOREGROUND_SERVICE"
}

# SpotifyNotificationListener service
if ($manifestContent -notmatch "SpotifyNotificationListener") {
    $nlServiceXml = @'

        <!-- Skippify: Spotify notification listener -->
        <service
            android:name=".SpotifyNotificationListener"
            android:label="@string/app_name"
            android:permission="android.permission.BIND_NOTIFICATION_LISTENER_SERVICE"
            android:exported="true">
            <intent-filter>
                <action android:name="android.service.notification.NotificationListenerService" />
            </intent-filter>
        </service>
'@
    $manifestContent = $manifestContent -replace '</application>', "$nlServiceXml`n    </application>"
    $manifestChanged = $true
    Write-Step "AndroidManifest.xml parcheado con SpotifyNotificationListener"
} else {
    Write-Step "AndroidManifest.xml ya contiene SpotifyNotificationListener"
}

# SkippifyForegroundService
if ($manifestContent -notmatch "SkippifyForegroundService") {
    $fgServiceXml = @'

        <!-- Skippify: foreground service – keeps process alive on aggressive OEMs -->
        <service
            android:name=".SkippifyForegroundService"
            android:foregroundServiceType="dataSync"
            android:exported="false" />
'@
    $manifestContent = $manifestContent -replace '</application>', "$fgServiceXml`n    </application>"
    $manifestChanged = $true
    Write-Step "AndroidManifest.xml parcheado con SkippifyForegroundService"
} else {
    Write-Step "AndroidManifest.xml ya contiene SkippifyForegroundService"
}

# Deep link OAuth de Spotify (pestaña Macros): la vuelta del navegador entra por
# skippify://spotify-auth y MainActivity la recoge en su intent.
if ($manifestContent -notmatch 'android:scheme="skippify"') {
    $authFilterXml = @'

            <!-- Skippify: retorno del login de Spotify (OAuth PKCE) -->
            <intent-filter>
                <action android:name="android.intent.action.VIEW" />
                <category android:name="android.intent.category.DEFAULT" />
                <category android:name="android.intent.category.BROWSABLE" />
                <data android:scheme="skippify" android:host="spotify-auth" />
            </intent-filter>
'@
    $manifestContent = $manifestContent -replace '(?s)(\r?\n\s*</activity>)', "$authFilterXml`$1"
    $manifestChanged = $true
    Write-Step "AndroidManifest.xml parcheado con el deep link de Spotify"
} else {
    Write-Step "AndroidManifest.xml ya contiene el deep link de Spotify"
}

# WAKE_LOCK: permite que el servicio termine una decisión de saltado aunque la
# pantalla se apague justo en ese instante.
if ($manifestContent -notmatch 'android.permission.WAKE_LOCK') {
    $manifestContent = $manifestContent -replace '(<uses-permission android:name="android.permission.INTERNET" />)', "`$1`n    <uses-permission android:name=`"android.permission.WAKE_LOCK`" />"
    $manifestChanged = $true
    Write-Step "AndroidManifest.xml: permiso WAKE_LOCK añadido"
}

if ($manifestChanged) {
    $utf8NoBom2 = New-Object System.Text.UTF8Encoding($false)
    [System.IO.File]::WriteAllText($manifestPath, $manifestContent, $utf8NoBom2)
    Write-Step "AndroidManifest.xml actualizado en disco"
}

# ─── 8. Configure Android SDK ──────────────────────────────────────────────────
$androidSdkRoot = "C:\Android\Sdk"
if (Test-Path $androidSdkRoot) {
    $env:ANDROID_HOME = $androidSdkRoot
    $env:ANDROID_SDK_ROOT = $androidSdkRoot
    # Sin BOM: `Set-Content -Encoding UTF8` lo añadía y Gradle leía la clave como
    # "﻿sdk.dir", así que la build sólo funcionaba si ANDROID_HOME estaba en
    # el entorno.
    $utf8NoBomSdk = New-Object System.Text.UTF8Encoding($false)
    [System.IO.File]::WriteAllText((Join-Path $androidDir "local.properties"), "sdk.dir=C\:/Android/Sdk`n", $utf8NoBomSdk)
    Write-Step "Android SDK configurado en $androidSdkRoot"
}

# ─── 9. Build APK ──────────────────────────────────────────────────────────────
$gradleWrapper = Join-Path $androidDir "gradlew.bat"
if (-not (Test-Path $gradleWrapper)) {
    throw "No se encontró gradlew.bat en $androidDir"
}

Write-Step "Compilando APK debug..."
Push-Location $androidDir
$packageTmpDir = Join-Path $androidDir "app\build\intermediates\incremental\packageDebug\tmp"
$buildSucceeded = $false
$maxAttempts = 3

for ($attempt = 1; $attempt -le $maxAttempts; $attempt++) {
    try {
        & .\gradlew.bat --stop | Out-Host
        if (Test-Path $compressedAssetsDir) {
            Remove-Item -Path $compressedAssetsDir -Recurse -Force -ErrorAction SilentlyContinue
        }
        if (Test-Path $packagedResDir) {
            Remove-Item -Path $packagedResDir -Recurse -Force -ErrorAction SilentlyContinue
        }
        if (Test-Path $mergedResDir) {
            Remove-Item -Path $mergedResDir -Recurse -Force -ErrorAction SilentlyContinue
        }
        if (Test-Path $mergedResBlameDir) {
            Remove-Item -Path $mergedResBlameDir -Recurse -Force -ErrorAction SilentlyContinue
        }
        if (Test-Path $mergeDebugResourcesDir) {
            Remove-Item -Path $mergeDebugResourcesDir -Recurse -Force -ErrorAction SilentlyContinue
        }
        if (Test-Path $assetsIntermediatesDir) {
            Remove-Item -Path $assetsIntermediatesDir -Recurse -Force -ErrorAction SilentlyContinue
        }
        if (Test-Path $mergeDebugAssetsDir) {
            Remove-Item -Path $mergeDebugAssetsDir -Recurse -Force -ErrorAction SilentlyContinue
        }
        if (Test-Path $packageDebugResourcesDir) {
            Remove-Item -Path $packageDebugResourcesDir -Recurse -Force -ErrorAction SilentlyContinue
        }
        if (Test-Path $packageTmpDir) {
            Remove-Item -Path $packageTmpDir -Recurse -Force -ErrorAction SilentlyContinue
        }

        & .\gradlew.bat assembleDebug | Out-Host
        $buildSucceeded = $true
        break
    }
    catch {
        if ($attempt -ge $maxAttempts) {
            throw
        }

        Write-Host "[APK] Reintento $($attempt + 1)/$maxAttempts tras bloqueo temporal de packageDebug..." -ForegroundColor Yellow
        Start-Sleep -Seconds 2
    }
}
Pop-Location

if (-not $buildSucceeded) {
    throw "No se pudo completar assembleDebug tras varios intentos."
}

$sourceApk = Join-Path $androidDir "app\build\outputs\apk\debug\app-debug.apk"
if (-not (Test-Path $sourceApk)) {
    throw "No se generó app-debug.apk"
}

$versionedApkName = "Skippify-$apkVersionLabel.apk"
$debugOutputDir = Join-Path $androidDir "app\build\outputs\apk\debug"
$targetOutputApk = Join-Path $debugOutputDir $versionedApkName
$targetApk = Join-Path $distDir $versionedApkName

# Publish the versioned artifact in both output folders.
Copy-Item -Path $sourceApk -Destination $targetOutputApk -Force
Copy-Item -Path $sourceApk -Destination $targetApk -Force

# Keep only the versioned APK after each run.
if (Test-Path $sourceApk) {
    Remove-Item -Path $sourceApk -Force
}

Write-Step "APK creada: $targetApk"
Write-Host ""
Write-Host "Instala con: adb install -r `"$targetApk`"" -ForegroundColor Green
