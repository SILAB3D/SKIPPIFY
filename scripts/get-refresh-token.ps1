<#
.SYNOPSIS
    Obtiene el refresh_token de Spotify y lo guarda en spotify-credentials.ps1

.DESCRIPTION
    1. Pide tu Client ID y Client Secret (obtenidos en developer.spotify.com).
    2. Abre el navegador con la URL de autorización de Spotify.
    3. Levanta un servidor HTTP en localhost:8888 para capturar el código de retorno.
    4. Intercambia el código por tokens y guarda el refresh_token en spotify-credentials.ps1.

.EXAMPLE
    .\scripts\get-refresh-token.ps1
#>

$ErrorActionPreference = "Stop"
$root = Split-Path -Parent $PSScriptRoot
$callbackPort = 8888
$redirectUri  = "http://localhost:$callbackPort/callback"
$scopes       = "user-read-recently-played user-read-currently-playing user-read-playback-state"

Write-Host ""
Write-Host "═══════════════════════════════════════════════════════" -ForegroundColor Cyan
Write-Host "  SKIPPIFY – Obtener Refresh Token de Spotify" -ForegroundColor Cyan
Write-Host "═══════════════════════════════════════════════════════" -ForegroundColor Cyan
Write-Host ""
Write-Host "Necesitas una app en el Dashboard de Spotify:" -ForegroundColor Yellow
Write-Host "  1. Ve a: https://developer.spotify.com/dashboard" -ForegroundColor White
Write-Host "  2. Crea una app (nombre cualquiera)." -ForegroundColor White
Write-Host "  3. En Settings → Redirect URIs añade exactamente:" -ForegroundColor White
Write-Host "     $redirectUri" -ForegroundColor Green
Write-Host "  4. Copia el Client ID y Client Secret." -ForegroundColor White
Write-Host ""

# Leer credenciales existentes si ya están escritas
$credsFile = Join-Path $root "spotify-credentials.ps1"
$existingId     = ""
$existingSecret = ""

if (Test-Path $credsFile) {
    $content = Get-Content $credsFile -Raw
    if ($content -match 'SPOTIFY_CLIENT_ID\s*=\s*"([^"]+)"') {
        $v = $Matches[1]
        if ($v -notlike "*AQUI*") { $existingId = $v }
    }
    if ($content -match 'SPOTIFY_CLIENT_SECRET\s*=\s*"([^"]+)"') {
        $v = $Matches[1]
        if ($v -notlike "*AQUI*") { $existingSecret = $v }
    }
}

# Pedir Client ID
if ($existingId) {
    $shortId = $existingId.Substring([Math]::Max(0, $existingId.Length - 6))
    Write-Host "Client ID  [Enter para mantener '...$shortId']: " -NoNewline -ForegroundColor Cyan
} else {
    Write-Host "Client ID: " -NoNewline -ForegroundColor Cyan
}
$inputId = Read-Host
$clientId = if ($inputId.Trim()) { $inputId.Trim() } else { $existingId }

# Pedir Client Secret
if ($existingSecret) {
    Write-Host "Client Secret  [Enter para mantener actual]: " -NoNewline -ForegroundColor Cyan
} else {
    Write-Host "Client Secret: " -NoNewline -ForegroundColor Cyan
}
$inputSecret = Read-Host
$clientSecret = if ($inputSecret.Trim()) { $inputSecret.Trim() } else { $existingSecret }

if (-not $clientId -or -not $clientSecret) {
    Write-Host "❌  Se necesitan Client ID y Client Secret." -ForegroundColor Red
    exit 1
}

# ── Construir URL de autorización ────────────────────────────────────────────
$state            = [System.Guid]::NewGuid().ToString("N").Substring(0, 16)
$encodedScopes    = [Uri]::EscapeDataString($scopes)
$encodedRedirect  = [Uri]::EscapeDataString($redirectUri)
$authUrl = "https://accounts.spotify.com/authorize" +
           "?response_type=code" +
           "&client_id=$clientId" +
           "&scope=$encodedScopes" +
           "&redirect_uri=$encodedRedirect" +
           "&state=$state"

Write-Host ""
Write-Host "Abriendo el navegador para autorizar la app..." -ForegroundColor Green
Start-Process $authUrl
Write-Host "(Si no se abre, pega esta URL en tu navegador:" -ForegroundColor Gray
Write-Host " $authUrl )" -ForegroundColor Gray
Write-Host ""

# ── Servidor HTTP para capturar el callback ───────────────────────────────────
Write-Host "Esperando respuesta de Spotify en localhost:$callbackPort ..." -ForegroundColor Yellow

$listener = [System.Net.HttpListener]::new()
$listener.Prefixes.Add("http://localhost:$callbackPort/")
$listener.Start()

$context  = $listener.GetContext()     # bloquea hasta recibir la petición
$query    = $context.Request.Url.Query
$listener.Stop()

# Parsear query string manualmente
$params = @{}
$query.TrimStart('?') -split '&' | ForEach-Object {
    $kv = $_ -split '=', 2
    if ($kv.Length -eq 2) {
        $params[$kv[0]] = [Uri]::UnescapeDataString($kv[1])
    }
}

# Responder al navegador
$html = "<html><body style='font-family:sans-serif;text-align:center;padding-top:60px'><h2>✅ Autorización completada</h2><p>Puedes cerrar esta ventana y volver a PowerShell.</p></body></html>"
$responseBytes = [System.Text.Encoding]::UTF8.GetBytes($html)
$context.Response.ContentLength64 = $responseBytes.Length
$context.Response.OutputStream.Write($responseBytes, 0, $responseBytes.Length)
$context.Response.OutputStream.Close()

if ($params["error"]) {
    Write-Host "❌  Spotify devolvió error: $($params['error'])" -ForegroundColor Red
    exit 1
}
if (-not $params["code"]) {
    Write-Host "❌  No se recibió código de autorización." -ForegroundColor Red
    exit 1
}
if ($params["state"] -ne $state) {
    Write-Host "❌  State mismatch. Posible ataque CSRF." -ForegroundColor Red
    exit 1
}

$authCode = $params["code"]
Write-Host "Código de autorización recibido. Intercambiando por tokens..." -ForegroundColor Green

# ── Intercambiar código por tokens ────────────────────────────────────────────
$credentials = [Convert]::ToBase64String([System.Text.Encoding]::UTF8.GetBytes("${clientId}:${clientSecret}"))
$body = "grant_type=authorization_code&code=$authCode&redirect_uri=$([Uri]::EscapeDataString($redirectUri))"

try {
    $response = Invoke-RestMethod -Uri "https://accounts.spotify.com/api/token" `
        -Method POST `
        -Headers @{ Authorization = "Basic $credentials"; "Content-Type" = "application/x-www-form-urlencoded" } `
        -Body $body
} catch {
    Write-Host "❌  Error al obtener tokens: $_" -ForegroundColor Red
    exit 1
}

$refreshToken = $response.refresh_token
$accessToken  = $response.access_token

if (-not $refreshToken) {
    Write-Host "❌  No se recibió refresh_token en la respuesta." -ForegroundColor Red
    Write-Host "   Respuesta: $($response | ConvertTo-Json)" -ForegroundColor Gray
    exit 1
}

# ── Actualizar spotify-credentials.ps1 ───────────────────────────────────────
$newContent = @"
# ============================================================
#  SKIPPIFY  -  Credenciales Spotify
#  Generado por get-refresh-token.ps1
#  Este archivo NO debe subirse a control de versiones.
# ============================================================

`$env:SPOTIFY_CLIENT_ID     = "$clientId"
`$env:SPOTIFY_CLIENT_SECRET = "$clientSecret"
`$env:SPOTIFY_REFRESH_TOKEN = "$refreshToken"
"@

Set-Content -Path $credsFile -Value $newContent -Encoding UTF8

Write-Host ""
Write-Host "═══════════════════════════════════════════════════════" -ForegroundColor Green
Write-Host "  ✅  ¡Listo! Credenciales guardadas en:" -ForegroundColor Green
Write-Host "      spotify-credentials.ps1" -ForegroundColor White
Write-Host ""
Write-Host "  Ahora arranca el servidor con:" -ForegroundColor Yellow
Write-Host "  .\scripts\start-server.ps1" -ForegroundColor White
Write-Host "  .\scripts\start-server.ps1 -Tunnel   (con URL pública)" -ForegroundColor White
Write-Host "═══════════════════════════════════════════════════════" -ForegroundColor Green
Write-Host ""
