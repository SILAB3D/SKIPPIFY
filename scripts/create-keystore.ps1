<#
.SYNOPSIS
    Genera de una vez el keystore de release de Skippify.

.DESCRIPTION
    El canal de actualización automática depende de que todas las APK vayan
    firmadas con la MISMA clave: Android identifica una app por
    (applicationId + firma), así que una APK firmada con otra clave no se
    considera una actualización sino una app distinta, y la instalación falla
    con INSTALL_FAILED_UPDATE_INCOMPATIBLE.

    Esto se ejecuta UNA sola vez. El .jks resultante hay que guardarlo bien:
    si se pierde, ningún dispositivo con Skippify instalada podrá volver a
    actualizarse (habría que desinstalar y reinstalar a mano, perdiendo datos).

    Genera dos ficheros, ambos ignorados por git:
      - skippify-release.jks          la clave
      - android-keystore.properties   las contraseñas, que lee build-apk.ps1
#>
param(
    [Parameter(Mandatory = $false)]
    [string]$KeystorePath = "",

    [Parameter(Mandatory = $false)]
    [string]$Alias = "skippify",

    # Si no se indica, se genera una contraseña aleatoria fuerte.
    [Parameter(Mandatory = $false)]
    [string]$Password = "",

    [Parameter(Mandatory = $false)]
    [int]$ValidityDays = 10950   # 30 años: más que la vida útil de la app
)

$ErrorActionPreference = "Stop"

function Write-Step {
    param([string]$Message)
    Write-Host "[KEYSTORE] $Message" -ForegroundColor Cyan
}

$workspaceRoot = Resolve-Path (Join-Path $PSScriptRoot "..")
if (-not $KeystorePath) {
    $KeystorePath = Join-Path $workspaceRoot "skippify-release.jks"
}
$propsPath = Join-Path $workspaceRoot "android-keystore.properties"

# Asegura keytool: viene con el JDK que ya exige build-apk.ps1.
$jdk21Path = "C:\Program Files\Microsoft\jdk-21.0.10.7-hotspot"
if (Test-Path $jdk21Path) {
    $env:JAVA_HOME = $jdk21Path
    if (-not ($env:Path -like "*$jdk21Path\bin*")) {
        $env:Path = "$jdk21Path\bin;" + $env:Path
    }
}
if (-not (Get-Command keytool -ErrorAction SilentlyContinue)) {
    throw "No se encontró keytool. Instala el JDK 21 (winget install Microsoft.OpenJDK.21) e inténtalo de nuevo."
}

# Nunca se sobrescribe: hacerlo dejaría sin actualizaciones a los móviles que ya
# tengan instalada una APK firmada con la clave anterior.
if (Test-Path $KeystorePath) {
    Write-Host ""
    Write-Host "Ya existe un keystore en:" -ForegroundColor Yellow
    Write-Host "  $KeystorePath" -ForegroundColor Yellow
    Write-Host ""
    Write-Host "No se toca. Si de verdad quieres uno nuevo, muévelo a otro sitio primero," -ForegroundColor Yellow
    Write-Host "sabiendo que las instalaciones existentes dejarán de poder actualizarse." -ForegroundColor Yellow
    exit 0
}

if (-not $Password) {
    # 24 caracteres de un alfabeto sin ambigüedades (ni O/0 ni l/1).
    $alphabet = "ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz23456789".ToCharArray()
    $bytes = New-Object byte[] 24
    [System.Security.Cryptography.RandomNumberGenerator]::Create().GetBytes($bytes)
    $Password = -join ($bytes | ForEach-Object { $alphabet[$_ % $alphabet.Length] })
    Write-Step "Contraseña generada automáticamente"
}

Write-Step "Creando keystore RSA 2048 con validez de $ValidityDays días..."

# El DN no lo ve nadie: la APK se distribuye por GitHub, no por Play Store.
$dn = "CN=Skippify, OU=Skippify, O=Skippify, L=Unknown, ST=Unknown, C=ES"

& keytool -genkeypair `
    -keystore $KeystorePath `
    -alias $Alias `
    -keyalg RSA `
    -keysize 2048 `
    -validity $ValidityDays `
    -storepass $Password `
    -keypass $Password `
    -dname $dn `
    -storetype PKCS12 | Out-Host

if ($LASTEXITCODE -ne 0 -or -not (Test-Path $KeystorePath)) {
    throw "keytool no pudo generar el keystore."
}

$propsContent = @"
# Skippify — credenciales de firma de release.
# Generado por scripts/create-keystore.ps1. NO subir a git.
storeFile=$KeystorePath
storePassword=$Password
keyAlias=$Alias
keyPassword=$Password
"@
$utf8NoBom = New-Object System.Text.UTF8Encoding($false)
[System.IO.File]::WriteAllText($propsPath, $propsContent, $utf8NoBom)

# Para los secrets de GitHub Actions hace falta el .jks en base64.
$base64Path = Join-Path $workspaceRoot "android-keystore.base64.txt"
[System.IO.File]::WriteAllText(
    $base64Path,
    [Convert]::ToBase64String([System.IO.File]::ReadAllBytes($KeystorePath)),
    $utf8NoBom
)

Write-Host ""
Write-Step "Keystore creado: $KeystorePath"
Write-Step "Credenciales:    $propsPath"
Write-Host ""
Write-Host "── Siguiente paso: secrets del repositorio ──────────────────────────" -ForegroundColor Green
Write-Host ""
Write-Host "En GitHub → Settings → Secrets and variables → Actions, crea:" -ForegroundColor Green
Write-Host ""
Write-Host "  SKIPPIFY_KEYSTORE_BASE64   el contenido de android-keystore.base64.txt"
Write-Host "  SKIPPIFY_KEYSTORE_PASSWORD $Password"
Write-Host "  SKIPPIFY_KEY_ALIAS         $Alias"
Write-Host "  SKIPPIFY_KEY_PASSWORD      $Password"
Write-Host ""
Write-Host "GUARDA una copia de $([System.IO.Path]::GetFileName($KeystorePath)) fuera del proyecto." -ForegroundColor Yellow
Write-Host "Si se pierde, los móviles con Skippify ya instalada no podrán actualizarse." -ForegroundColor Yellow
Write-Host ""
