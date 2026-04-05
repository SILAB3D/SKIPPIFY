param(
    [Parameter(Mandatory = $false)]
    [string]$WebAppUrl = "",

    [Parameter(Mandatory = $false)]
    [string]$AppId = "com.skippify.app",

    [Parameter(Mandatory = $false)]
    [string]$AppName = "Skippify",

    [Parameter(Mandatory = $false)]
    [switch]$InstallMissing,

    [Parameter(Mandatory = $false)]
    [switch]$UseHttp
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

$workspaceRoot = Resolve-Path (Join-Path $PSScriptRoot "..")
$buildRoot = Join-Path $workspaceRoot ".apk-build"
$wwwDir = Join-Path $buildRoot "www"
$distDir = Join-Path $workspaceRoot "dist"
$sourceIndex = Join-Path $workspaceRoot "index.html"
$sourceEvents = Join-Path $workspaceRoot "events.json"

# Ensure common Node.js install paths are in PATH
foreach ($nodePath in @("C:\Program Files\nodejs", "$env:APPDATA\npm", "$env:ProgramFiles\nodejs")) {
    if ((Test-Path $nodePath) -and ($env:Path -notlike "*$nodePath*")) {
        $env:Path = "$nodePath;" + $env:Path
    }
}

# Ensure JDK 21 is in PATH before checking
$jdk21Path = "C:\Program Files\Microsoft\jdk-21.0.10.7-hotspot"
if (Test-Path $jdk21Path) {
    $env:JAVA_HOME = $jdk21Path
    if (-not ($env:Path -like "*$jdk21Path\bin*")) {
        $env:Path = "$jdk21Path\bin;" + $env:Path
    }
}

Write-Step "Verificando dependencias base..."
Ensure-Tool -CommandName "node" -WingetId "OpenJS.NodeJS.LTS" -FriendlyName "Node.js LTS"
Ensure-Tool -CommandName "npm" -WingetId "OpenJS.NodeJS.LTS" -FriendlyName "npm"
Ensure-Tool -CommandName "java" -WingetId "Microsoft.OpenJDK.21" -FriendlyName "JDK 21"

if (Test-Path $jdk21Path) {
    Write-Step "JAVA_HOME configurado a JDK 21"
}

Write-Step "Preparando estructura de build en $buildRoot"
if (-not (Test-Path $buildRoot)) {
    New-Item -ItemType Directory -Path $buildRoot | Out-Null
}
if (-not (Test-Path $wwwDir)) {
    New-Item -ItemType Directory -Path $wwwDir | Out-Null
}
if (-not (Test-Path $distDir)) {
    New-Item -ItemType Directory -Path $distDir | Out-Null
}

$packageJsonPath = Join-Path $buildRoot "package.json"
if (-not (Test-Path $packageJsonPath)) {
    Write-Step "Creando package.json base"
    $packageJson = @"
{
  "name": "skippify-apk-build",
  "version": "1.0.0",
  "private": true,
  "description": "APK build wrapper for Skippify"
}
"@
    Set-Content -Path $packageJsonPath -Value $packageJson -Encoding UTF8
}

Write-Step "Instalando dependencias de Capacitor"
Push-Location $buildRoot
npm install --save @capacitor/core @capacitor/android | Out-Host
npm install --save-dev @capacitor/cli | Out-Host
Pop-Location

if (Test-Path $sourceIndex) {
        Copy-Item -Path $sourceIndex -Destination (Join-Path $wwwDir "index.html") -Force
        Write-Step "Se empaquetó index.html local en la APK"
}
else {
        $dummyHtml = @"
<!doctype html>
<html lang=\"es\">
<head>
    <meta charset=\"UTF-8\" />
    <meta name=\"viewport\" content=\"width=device-width, initial-scale=1.0\" />
    <title>$AppName</title>
</head>
<body>
    <h1>$AppName</h1>
    <p>Wrapper Android generado automáticamente.</p>
</body>
</html>
"@
        Set-Content -Path (Join-Path $wwwDir "index.html") -Value $dummyHtml -Encoding UTF8
}

if (Test-Path $sourceEvents) {
        Copy-Item -Path $sourceEvents -Destination (Join-Path $wwwDir "events.json") -Force
}

$serverBlock = ""
if (-not [string]::IsNullOrWhiteSpace($WebAppUrl)) {
    $clearText = if ($UseHttp) { "true" } else { "false" }
    $serverBlock = @"
  server: {
    url: '$WebAppUrl',
    cleartext: $clearText
  }
"@
}

$serverConfig = ""
if (-not [string]::IsNullOrWhiteSpace($WebAppUrl)) {
    $serverConfig = @"
    "server": {
        "url": "$WebAppUrl",
        "cleartext": $(if ($UseHttp) { 'true' } else { 'false' })
    },
"@
    Write-Step "Modo remoto habilitado: $WebAppUrl"
}

$capacitorConfig = @"
{
    "appId": "$AppId",
    "appName": "$AppName",
    "webDir": "www",
$serverConfig    "android": {
        "allowMixedContent": true
    }
}
"@
Set-Content -Path (Join-Path $buildRoot "capacitor.config.json") -Value $capacitorConfig -Encoding UTF8
if (Test-Path (Join-Path $buildRoot "capacitor.config.ts")) {
        Remove-Item (Join-Path $buildRoot "capacitor.config.ts") -Force
}

$androidDir = Join-Path $buildRoot "android"
Push-Location $buildRoot
if (-not (Test-Path $androidDir)) {
    Write-Step "Creando proyecto Android (cap add android)"
    npx cap add android | Out-Host
}

Write-Step "Sincronizando proyecto Android"
npx cap sync android | Out-Host
Pop-Location

# ══════════════════════════════════════════════════════════════════════════════
#  NOTIFICATION LISTENER PLUGIN  –  inject after every cap sync
# ══════════════════════════════════════════════════════════════════════════════
$androidSrcDir  = Join-Path $workspaceRoot "android-src"
$javaPackageDir = Join-Path $androidDir "app\src\main\java\com\skippify\app"

# 1. Copy Java source files
$notifSrcFiles = @("SpotifyNotificationListener.java", "NotifListenerPlugin.java", "SkippifyForegroundService.java")
foreach ($srcFile in $notifSrcFiles) {
    $src = Join-Path $androidSrcDir $srcFile
    $dst = Join-Path $javaPackageDir $srcFile
    if (Test-Path $src) {
        Copy-Item -Path $src -Destination $dst -Force
        Write-Step "Copiado: $srcFile"
    } else {
        Write-Host "[APK] AVISO: No se encontro $srcFile en android-src/" -ForegroundColor Yellow
    }
}

# 2. Patch MainActivity.java  – register the plugin
$mainActivityPath = Join-Path $javaPackageDir "MainActivity.java"
$mainActivityContent = Get-Content $mainActivityPath -Raw
if ($mainActivityContent -notmatch "NotifListenerPlugin") {
    $importOld = 'import com\.getcapacitor\.BridgeActivity;'
    $importNew = "import android.os.Bundle;`nimport com.getcapacitor.BridgeActivity;"
    $classOld  = 'public class MainActivity extends BridgeActivity \{\}'
    $classNew  = "public class MainActivity extends BridgeActivity {`n    @Override`n    public void onCreate(Bundle savedInstanceState) {`n        registerPlugin(NotifListenerPlugin.class);`n        super.onCreate(savedInstanceState);`n    }`n}"
    $mainActivityContent = $mainActivityContent -replace $importOld, $importNew
    $mainActivityContent = $mainActivityContent -replace $classOld,  $classNew
    # Strip any leading BOM and write without BOM – Java compiler rejects UTF-8 BOM
    $mainActivityContent = $mainActivityContent -replace '^\xEF\xBB\xBF', '' -replace "^\uFEFF", ''
    $utf8NoBom = New-Object System.Text.UTF8Encoding($false)
    [System.IO.File]::WriteAllText($mainActivityPath, $mainActivityContent, $utf8NoBom)
    Write-Step "MainActivity.java parcheado con NotifListenerPlugin"
} else {
    Write-Step "MainActivity.java ya tiene NotifListenerPlugin"
}

# 3. Patch AndroidManifest.xml – idempotent: apply every needed change and write once
$manifestPath    = Join-Path $androidDir "app\src\main\AndroidManifest.xml"
$manifestContent = Get-Content $manifestPath -Raw
$manifestChanged = $false

# 3a. FOREGROUND_SERVICE permissions (Android 9+ / Samsung One UI requirement)
if ($manifestContent -notmatch 'FOREGROUND_SERVICE"') {
    $manifestContent = $manifestContent -replace '(<application)', "    <uses-permission android:name=`"android.permission.FOREGROUND_SERVICE`" />`n    <uses-permission android:name=`"android.permission.FOREGROUND_SERVICE_DATA_SYNC`" />`n    `$1"
    $manifestChanged = $true
    Write-Step "AndroidManifest.xml: permisos FOREGROUND_SERVICE añadidos"
} else {
    Write-Step "AndroidManifest.xml ya tiene permisos FOREGROUND_SERVICE"
}

# 3b. SpotifyNotificationListener service
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

# 3c. SkippifyForegroundService (keeps process alive on Samsung One UI / MIUI)
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

# Write manifest only if something changed
if ($manifestChanged) {
    $utf8NoBom2 = New-Object System.Text.UTF8Encoding($false)
    [System.IO.File]::WriteAllText($manifestPath, $manifestContent, $utf8NoBom2)
    Write-Step "AndroidManifest.xml actualizado en disco"
}
# ══════════════════════════════════════════════════════════════════════════════

$androidSdkRoot = "C:\Android\Sdk"
if (Test-Path $androidSdkRoot) {
    $env:ANDROID_HOME = $androidSdkRoot
    $env:ANDROID_SDK_ROOT = $androidSdkRoot
    Set-Content -Path (Join-Path $androidDir "local.properties") -Value "sdk.dir=C:\\Android\\Sdk" -Encoding UTF8
    Write-Step "Android SDK configurado en $androidSdkRoot"
}

$gradleWrapper = Join-Path $androidDir "gradlew.bat"
if (-not (Test-Path $gradleWrapper)) {
    throw "No se encontró gradlew.bat en $androidDir"
}

Write-Step "Compilando APK debug"
Push-Location $androidDir
& .\gradlew.bat assembleDebug | Out-Host
Pop-Location

$sourceApk = Join-Path $androidDir "app\build\outputs\apk\debug\app-debug.apk"
if (-not (Test-Path $sourceApk)) {
    throw "No se generó app-debug.apk"
}

$targetApk = Join-Path $distDir "skippify-debug.apk"
Copy-Item -Path $sourceApk -Destination $targetApk -Force

Write-Step "APK creada: $targetApk"
Write-Host "" 
Write-Host "Instala con: adb install -r \"$targetApk\"" -ForegroundColor Green
