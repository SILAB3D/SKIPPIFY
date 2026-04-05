<#
.SYNOPSIS
    Arranca el backend de Skippify de forma limpia.

.DESCRIPTION
    1. Mata cualquier proceso que esté escuchando en el puerto 5500.
    2. Carga las credenciales Spotify desde spotify-credentials.ps1.
    3. Lanza server.ps1.
    4. (Opcional) Si se pasa -Tunnel, abre un túnel ngrok y muestra la URL pública.

.PARAMETER Tunnel
    Abre un túnel ngrok en el puerto 5500 y muestra la URL pública
    para que puedas pegarla en la app.

.EXAMPLE
    .\scripts\start-server.ps1
    .\scripts\start-server.ps1 -Tunnel
#>
param(
    [switch]$Tunnel
)

$ErrorActionPreference = "Stop"
$root = Split-Path -Parent $PSScriptRoot   # carpeta raíz de Skippify

# ── 0. Verificar privilegios de administrador ────────────────────────────────
$isAdmin = ([Security.Principal.WindowsPrincipal][Security.Principal.WindowsIdentity]::GetCurrent()).IsInRole([Security.Principal.WindowsBuiltInRole]::Administrator)
if (-not $isAdmin) {
    Write-Host "⚠  Relanzando con privilegios de administrador (necesario para red local)..." -ForegroundColor Yellow
    $args2 = "-ExecutionPolicy Bypass -File `"$PSCommandPath`""
    if ($Tunnel) { $args2 += " -Tunnel" }
    Start-Process powershell -Verb RunAs -ArgumentList $args2
    exit 0
}

# ── 1. Liberar puerto 5500 ────────────────────────────────────────────────────
Write-Host "[1/5] Comprobando si el puerto 5500 está ocupado..." -ForegroundColor Cyan

$connections = Get-NetTCPConnection -LocalPort 5500 -ErrorAction SilentlyContinue
if ($connections) {
    $pids = $connections.OwningProcess | Sort-Object -Unique | Where-Object { $_ -ne 4 }
    foreach ($pid in $pids) {
        try {
            $proc = Get-Process -Id $pid -ErrorAction SilentlyContinue
            if ($proc) {
                Write-Host "   → Matando proceso $($proc.Name) (PID $pid)" -ForegroundColor Yellow
                Stop-Process -Id $pid -Force
            }
        } catch { <# ignorar si ya no existe #> }
    }
    Start-Sleep -Milliseconds 800
    Write-Host "   Puerto 5500 liberado." -ForegroundColor Green
} else {
    Write-Host "   Puerto 5500 libre." -ForegroundColor Green
}

# ── 1b. Registrar urlacl para escuchar en todas las interfaces ────────────────
$urlacl = netsh http show urlacl url="http://+:5500/" 2>&1
if ($urlacl -notmatch 'Reserved URL') {
    Write-Host "   Registrando http://+:5500/ en urlacl..." -ForegroundColor Yellow
    netsh http add urlacl url="http://+:5500/" user="Everyone" | Out-Null
    Write-Host "   urlacl registrado." -ForegroundColor Green
} else {
    Write-Host "   urlacl ya registrado." -ForegroundColor Green
}

# ── 1c. Regla de firewall ─────────────────────────────────────────────────────
$fwRule = Get-NetFirewallRule -DisplayName "Skippify-5500" -ErrorAction SilentlyContinue
if (-not $fwRule) {
    Write-Host "   Abriendo puerto 5500 en el firewall de Windows..." -ForegroundColor Yellow
    New-NetFirewallRule -DisplayName "Skippify-5500" -Direction Inbound -Protocol TCP -LocalPort 5500 -Action Allow -Profile Any | Out-Null
    Write-Host "   Firewall configurado." -ForegroundColor Green
} else {
    Write-Host "   Regla de firewall ya existe." -ForegroundColor Green
}

# ── 2. Cargar credenciales Spotify ────────────────────────────────────────────
Write-Host "[2/5] Cargando credenciales Spotify..." -ForegroundColor Cyan

$credsFile = Join-Path $root "spotify-credentials.ps1"

if (-not (Test-Path $credsFile)) {
    Write-Host ""
    Write-Host "⚠  No se encontró spotify-credentials.ps1 en $root" -ForegroundColor Red
    Write-Host "   Crea el archivo con tus credenciales y vuelve a ejecutar." -ForegroundColor Red
    Write-Host "   Ejemplo:"
    Write-Host '   $env:SPOTIFY_CLIENT_ID     = "tu_client_id"'
    Write-Host '   $env:SPOTIFY_CLIENT_SECRET = "tu_client_secret"'
    Write-Host '   $env:SPOTIFY_REFRESH_TOKEN = "tu_refresh_token"'
    Write-Host ""
    Write-Host "   Puedes obtener tu refresh_token ejecutando:" -ForegroundColor Yellow
    Write-Host "   .\scripts\get-refresh-token.ps1" -ForegroundColor Yellow
    exit 1
}

. $credsFile   # dot-source para que las variables queden en el scope actual

$missing = @()
if (-not $env:SPOTIFY_CLIENT_ID     -or $env:SPOTIFY_CLIENT_ID -like "*AQUI*")     { $missing += "SPOTIFY_CLIENT_ID" }
if (-not $env:SPOTIFY_CLIENT_SECRET -or $env:SPOTIFY_CLIENT_SECRET -like "*AQUI*") { $missing += "SPOTIFY_CLIENT_SECRET" }
if (-not $env:SPOTIFY_REFRESH_TOKEN -or $env:SPOTIFY_REFRESH_TOKEN -like "*AQUI*") { $missing += "SPOTIFY_REFRESH_TOKEN" }

if ($missing.Count -gt 0) {
    Write-Host ""
    Write-Host "⚠  Rellena estas variables en spotify-credentials.ps1:" -ForegroundColor Red
    $missing | ForEach-Object { Write-Host "   • $_" -ForegroundColor Red }
    Write-Host ""
    Write-Host "   Ejecuta .\scripts\get-refresh-token.ps1 para obtener el refresh_token." -ForegroundColor Yellow
    exit 1
}
Write-Host "   Credenciales cargadas correctamente." -ForegroundColor Green

# ── 3. (Opcional) Túnel ngrok ─────────────────────────────────────────────────
$publicUrl = $null

if ($Tunnel) {
    Write-Host "[3/5] Iniciando túnel ngrok en puerto 5500..." -ForegroundColor Cyan

    $ngrok = Get-Command ngrok -ErrorAction SilentlyContinue
    if (-not $ngrok) {
        # Intentar instalar ngrok vía winget
        Write-Host "   ngrok no encontrado. Intentando instalar con winget..." -ForegroundColor Yellow
        try {
            winget install --id Ngrok.Ngrok -e --silent | Out-Null
            $env:PATH += ";$env:LOCALAPPDATA\Microsoft\WinGet\Links"
        } catch {
            Write-Host "   No se pudo instalar ngrok automáticamente." -ForegroundColor Red
            Write-Host "   Descárgalo de https://ngrok.com/download e inténtalo de nuevo." -ForegroundColor Red
            Write-Host "   Continuando sin túnel..." -ForegroundColor Yellow
            $Tunnel = $false
        }
    }

    if ($Tunnel) {
        # Iniciar ngrok en background
        $ngrokJob = Start-Process ngrok -ArgumentList "http 5500 --log=stdout" -PassThru -WindowStyle Hidden
        Start-Sleep -Seconds 3

        # Obtener URL pública de la API local de ngrok
        try {
            $tunnelInfo = Invoke-RestMethod "http://127.0.0.1:4040/api/tunnels" -ErrorAction Stop
            $publicUrl = ($tunnelInfo.tunnels | Where-Object { $_.proto -eq "https" } | Select-Object -First 1).public_url
            if (-not $publicUrl) {
                $publicUrl = ($tunnelInfo.tunnels | Select-Object -First 1).public_url
            }
        } catch {
            Write-Host "   No se pudo obtener la URL de ngrok. Continúa sin túnel." -ForegroundColor Yellow
            $Tunnel = $false
        }
    }
} else {
    Write-Host "[3/5] Modo red local (sin túnel)." -ForegroundColor Cyan
    # Detectar IP local
    $localIp = (Get-NetIPAddress -AddressFamily IPv4 |
                Where-Object { $_.IPAddress -notmatch "^127\." -and $_.PrefixOrigin -ne "WellKnown" } |
                Select-Object -First 1).IPAddress
    if ($localIp) {
        $publicUrl = "http://${localIp}:5500"
        Write-Host "   IP local detectada: $localIp" -ForegroundColor Green
    } else {
        Write-Host "   ⚠  No se detectó IP local. Asegúrate de estar conectado a una red." -ForegroundColor Yellow
    }
}

# ── 4. Lanzar servidor ────────────────────────────────────────────────────────
Write-Host "[4/5] Arrancando server.ps1..." -ForegroundColor Cyan

$serverScript = Join-Path $root "server.ps1"

Write-Host ""
Write-Host "════════════════════════════════════════════════════════" -ForegroundColor Magenta
Write-Host "  SKIPPIFY Backend en marcha" -ForegroundColor Magenta
Write-Host "  Local:   http://localhost:5500" -ForegroundColor Gray
if ($publicUrl) {
    Write-Host ""
    Write-Host "  ► URL para el móvil Android (pégala en la app):" -ForegroundColor Green
    Write-Host "    $publicUrl" -ForegroundColor White -BackgroundColor DarkGreen
    Write-Host ""
    Write-Host "  En la app: Conexión Spotify → introduce la URL → Guardar" -ForegroundColor Yellow
    Write-Host "  Asegúrate de que el móvil esté en la MISMA red WiFi." -ForegroundColor Yellow
} else {
    Write-Host ""
    Write-Host "  ⚠  No se pudo determinar la URL de red." -ForegroundColor Red
    Write-Host "  Ejecuta con -Tunnel para obtener una URL pública via ngrok." -ForegroundColor Yellow
}
Write-Host "════════════════════════════════════════════════════════" -ForegroundColor Magenta
Write-Host ""
Write-Host "  [5/5] Escuchando peticiones... Ctrl+C para detener." -ForegroundColor Gray
Write-Host ""

# Ejecutar en el mismo proceso (bloquea hasta Ctrl+C)
& powershell.exe -ExecutionPolicy Bypass -File $serverScript
