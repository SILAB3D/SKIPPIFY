$port = 5500
$root = Split-Path -Parent $MyInvocation.MyCommand.Path
$eventsFile = Join-Path $root 'events.json'
$spotifyClientId = $env:SPOTIFY_CLIENT_ID
$spotifyClientSecret = $env:SPOTIFY_CLIENT_SECRET
$spotifyRefreshToken = $env:SPOTIFY_REFRESH_TOKEN
$spotifyAccessToken = $null
$spotifyAccessTokenExpiresAt = Get-Date "2000-01-01T00:00:00Z"
$spotifyLastSyncAt = $null

if (-not (Test-Path $eventsFile -PathType Leaf)) {
    Set-Content -Path $eventsFile -Value '[]' -Encoding UTF8
}

function Read-Events {
    param([string]$Path)

    if (-not (Test-Path $Path -PathType Leaf)) {
        return @()
    }

    $raw = Get-Content -Path $Path -Raw -Encoding UTF8
    if ([string]::IsNullOrWhiteSpace($raw)) {
        return @()
    }

    try {
        $parsed = $raw | ConvertFrom-Json
        if ($null -eq $parsed) { return @() }
        if ($parsed -is [System.Array]) { return @($parsed) }
        return @($parsed)
    }
    catch {
        return @()
    }
}

function Write-Events {
    param(
        [string]$Path,
        [object[]]$Items
    )

    $itemsArray = @($Items)
    if ($itemsArray.Count -eq 0) {
        $json = '[]'
    }
    elseif ($itemsArray.Count -eq 1) {
        $single = $itemsArray[0] | ConvertTo-Json -Depth 8
        $json = "[$single]"
    }
    else {
        $json = $itemsArray | ConvertTo-Json -Depth 8
    }
    Set-Content -Path $Path -Value $json -Encoding UTF8
}

function Write-JsonResponse {
    param(
        [Parameter(Mandatory=$true)]$Context,
        [Parameter(Mandatory=$true)]$Payload,
        [int]$StatusCode = 200
    )

    if ($Payload -is [System.Array]) {
        $payloadArray = @($Payload)
        if ($payloadArray.Count -eq 0) {
            $json = '[]'
        }
        elseif ($payloadArray.Count -eq 1) {
            $single = $payloadArray[0] | ConvertTo-Json -Depth 8
            $json = "[$single]"
        }
        else {
            $json = $payloadArray | ConvertTo-Json -Depth 8
        }
    }
    else {
        $json = $Payload | ConvertTo-Json -Depth 8
    }
    $bytes = [System.Text.Encoding]::UTF8.GetBytes($json)
    $Context.Response.StatusCode = $StatusCode
    $Context.Response.ContentType = 'application/json; charset=utf-8'
    $Context.Response.ContentLength64 = $bytes.Length
    $Context.Response.OutputStream.Write($bytes, 0, $bytes.Length)
}

function ConvertTo-DoubleOrNull {
    param($Value)

    if ($null -eq $Value) {
        return $null
    }

    $number = 0.0
    if ([double]::TryParse([string]$Value, [ref]$number)) {
        return $number
    }

    return $null
}

function Resolve-Genres {
    param($Event)

    if ($null -eq $Event) {
        return @()
    }

    if ($Event.PSObject.Properties.Name -contains 'genres') {
        $genres = $Event.genres
        if ($genres -is [System.Array]) {
            return @($genres | Where-Object { -not [string]::IsNullOrWhiteSpace([string]$_) } | ForEach-Object { [string]$_ })
        }

        if (-not [string]::IsNullOrWhiteSpace([string]$genres)) {
            return @([string]$genres)
        }
    }

    if ($Event.PSObject.Properties.Name -contains 'genre' -and -not [string]::IsNullOrWhiteSpace([string]$Event.genre)) {
        return @([string]$Event.genre)
    }

    return @()
}

function Build-Analytics {
    param([object[]]$Events)

    $eventsArray = @($Events | Sort-Object { [DateTime]$_.played_at })

    $incompleteCount = 0
    $completeCount = 0

    foreach ($item in $eventsArray) {
        $durationMs = ConvertTo-DoubleOrNull -Value $item.duration_ms
        $playedMs = ConvertTo-DoubleOrNull -Value $item.ms_played
        if ($null -eq $durationMs -or $durationMs -le 0 -or $null -eq $playedMs) {
            continue
        }

        if (($playedMs / $durationMs) -lt 0.9) {
            $incompleteCount++
        }
        else {
            $completeCount++
        }
    }

    $sessionGapMinutes = 30
    $sessions = @()
    $sessionStart = $null
    $sessionEnd = $null

    foreach ($item in $eventsArray) {
        $playedAt = [DateTime]$item.played_at
        if ($null -eq $sessionStart) {
            $sessionStart = $playedAt
            $sessionEnd = $playedAt
            continue
        }

        $gap = $playedAt - $sessionEnd
        if ($gap.TotalMinutes -gt $sessionGapMinutes) {
            $sessions += [PSCustomObject]@{
                started_at = $sessionStart.ToString('o')
                ended_at = $sessionEnd.ToString('o')
                duration_minutes = [math]::Round(($sessionEnd - $sessionStart).TotalMinutes, 2)
            }
            $sessionStart = $playedAt
            $sessionEnd = $playedAt
        }
        else {
            $sessionEnd = $playedAt
        }
    }

    if ($null -ne $sessionStart) {
        $sessions += [PSCustomObject]@{
            started_at = $sessionStart.ToString('o')
            ended_at = $sessionEnd.ToString('o')
            duration_minutes = [math]::Round(($sessionEnd - $sessionStart).TotalMinutes, 2)
        }
    }

    $sessionDurations = @($sessions | ForEach-Object { [double]$_.duration_minutes })
    $avgSessionDuration = if ($sessionDurations.Count -gt 0) { [math]::Round((($sessionDurations | Measure-Object -Average).Average), 2) } else { 0 }
    $maxSessionDuration = if ($sessionDurations.Count -gt 0) { [math]::Round((($sessionDurations | Measure-Object -Maximum).Maximum), 2) } else { 0 }
    $totalSessionMinutes = if ($sessionDurations.Count -gt 0) { [math]::Round((($sessionDurations | Measure-Object -Sum).Sum), 2) } else { 0 }

    $genreMap = @{}
    foreach ($item in $eventsArray) {
        $genres = Resolve-Genres -Event $item
        foreach ($genre in $genres) {
            if (-not $genreMap.ContainsKey($genre)) {
                $genreMap[$genre] = 0
            }
            $genreMap[$genre]++
        }
    }

    $genresList = @($genreMap.GetEnumerator() |
        Sort-Object Value -Descending |
        ForEach-Object {
            [PSCustomObject]@{
                genre = $_.Key
                listens = $_.Value
            }
        })

    $trackedPlays = $incompleteCount + $completeCount
    $incompleteRate = if ($trackedPlays -gt 0) { [math]::Round((100.0 * $incompleteCount / $trackedPlays), 2) } else { 0 }

    return [PSCustomObject]@{
        incomplete_plays = [PSCustomObject]@{
            count = $incompleteCount
            tracked = $trackedPlays
            rate_percent = $incompleteRate
        }
        sessions = [PSCustomObject]@{
            count = @($sessions).Count
            average_minutes = $avgSessionDuration
            total_minutes = $totalSessionMinutes
            longest_minutes = $maxSessionDuration
            items = @($sessions | Sort-Object { [DateTime]$_.started_at } -Descending | Select-Object -First 10)
        }
        genres = [PSCustomObject]@{
            unique = @($genresList).Count
            top = @($genresList | Select-Object -First 8)
        }
    }
}

function Get-SpotifyAccessToken {
    if ([string]::IsNullOrWhiteSpace($spotifyClientId) -or [string]::IsNullOrWhiteSpace($spotifyClientSecret) -or [string]::IsNullOrWhiteSpace($spotifyRefreshToken)) {
        throw 'Spotify no configurado: define SPOTIFY_CLIENT_ID, SPOTIFY_CLIENT_SECRET y SPOTIFY_REFRESH_TOKEN.'
    }

    $now = Get-Date
    if ($spotifyAccessToken -and $spotifyAccessTokenExpiresAt -gt $now.AddSeconds(30)) {
        return $spotifyAccessToken
    }

    $tokenResponse = Invoke-RestMethod -Method Post -Uri 'https://accounts.spotify.com/api/token' -ContentType 'application/x-www-form-urlencoded' -Body @{
        grant_type = 'refresh_token'
        refresh_token = $spotifyRefreshToken
        client_id = $spotifyClientId
        client_secret = $spotifyClientSecret
    }

    $script:spotifyAccessToken = $tokenResponse.access_token
    $expiresIn = 3600
    if ($tokenResponse.PSObject.Properties.Name -contains 'expires_in') {
        $expiresIn = [int]$tokenResponse.expires_in
    }
    $script:spotifyAccessTokenExpiresAt = (Get-Date).AddSeconds($expiresIn)
    return $script:spotifyAccessToken
}

function Invoke-SpotifyApi {
    param(
        [string]$Path,
        [string]$Method = 'GET'
    )

    $token = Get-SpotifyAccessToken
    $headers = @{ Authorization = "Bearer $token" }
    return Invoke-RestMethod -Method $Method -Uri ("https://api.spotify.com" + $Path) -Headers $headers
}

function Sync-SpotifyEvents {
    param([string]$EventsPath)

    $response = Invoke-SpotifyApi -Path '/v1/me/player/recently-played?limit=50'
    $items = @()
    if ($response -and $response.PSObject.Properties.Name -contains 'items') {
        $items = @($response.items)
    }

    $events = Read-Events -Path $EventsPath
    $keySet = New-Object 'System.Collections.Generic.HashSet[string]'
    foreach ($event in $events) {
        $key = "{0}|{1}|{2}" -f $event.played_at, $event.track, $event.artist
        [void]$keySet.Add($key)
    }

    $inserted = 0
    foreach ($item in $items) {
        if ($null -eq $item.track) { continue }
        $trackName = [string]$item.track.name
        $artistName = if ($item.track.artists -and $item.track.artists.Count -gt 0) { [string]$item.track.artists[0].name } else { 'Desconocido' }
        $playedAt = [string]$item.played_at
        $durationMs = if ($item.track.duration_ms) { [int]$item.track.duration_ms } else { $null }

        $key = "{0}|{1}|{2}" -f $playedAt, $trackName, $artistName
        if ($keySet.Contains($key)) { continue }

        $eventObj = [PSCustomObject]@{
            played_at = $playedAt
            track = $trackName
            artist = $artistName
            duration_ms = $durationMs
            source = 'spotify'
        }

        $events = @($events) + @($eventObj)
        [void]$keySet.Add($key)
        $inserted++
    }

    $events = @($events | Sort-Object { [DateTime]$_.played_at } -Descending)
    Write-Events -Path $EventsPath -Items $events
    $script:spotifyLastSyncAt = (Get-Date).ToString('o')

    return [PSCustomObject]@{
        inserted = $inserted
        total = @($events).Count
        synced_at = $script:spotifyLastSyncAt
    }
}

function Get-SpotifyCurrentTrack {
    try {
        $response = Invoke-SpotifyApi -Path '/v1/me/player/currently-playing'
    }
    catch {
        return $null
    }

    if ($null -eq $response -or $null -eq $response.item) {
        return $null
    }

    $artistName = if ($response.item.artists -and $response.item.artists.Count -gt 0) { [string]$response.item.artists[0].name } else { 'Desconocido' }
    return [PSCustomObject]@{
        track = [string]$response.item.name
        artist = $artistName
        duration_ms = if ($response.item.duration_ms) { [int]$response.item.duration_ms } else { $null }
        progress_ms = if ($response.progress_ms) { [int]$response.progress_ms } else { $null }
        is_currently_playing = if ($response.is_playing) { [bool]$response.is_playing } else { $false }
    }
}
$listener = New-Object System.Net.HttpListener
# '+' escucha en todas las interfaces (WiFi, Ethernet, …)
# Necesita que urlacl esté registrado o ejecutarse como admin.
$listener.Prefixes.Add("http://+:$port/")
$listener.Start()

$localIp = (Get-NetIPAddress -AddressFamily IPv4 |
    Where-Object { $_.IPAddress -notmatch '^127\.' -and $_.PrefixOrigin -ne 'WellKnown' } |
    Select-Object -First 1).IPAddress

Write-Host "Servidor iniciado en http://localhost:$port" -ForegroundColor Green
if ($localIp) {
    Write-Host "Acceso desde dispositivos en red: http://${localIp}:$port" -ForegroundColor Cyan
}

try {
    while ($listener.IsListening) {
        $context = $listener.GetContext()
        if ($null -eq $context) { continue }
        $requestPath = $context.Request.Url.LocalPath.TrimStart('/')
        if ([string]::IsNullOrWhiteSpace($requestPath)) { $requestPath = 'index.html' }
        $context.Response.Headers['Cache-Control'] = 'no-store, no-cache, must-revalidate'
        $context.Response.Headers['Access-Control-Allow-Origin'] = '*'
        $context.Response.Headers['Access-Control-Allow-Methods'] = 'GET, POST, DELETE, OPTIONS'
        $context.Response.Headers['Access-Control-Allow-Headers'] = 'Content-Type, Authorization'

        if ($context.Request.HttpMethod.ToUpperInvariant() -eq 'OPTIONS') {
            $context.Response.StatusCode = 204
            $context.Response.OutputStream.Close()
            continue
        }

        if ($requestPath -eq 'api/events') {
            $method = $context.Request.HttpMethod.ToUpperInvariant()

            if ($method -eq 'GET') {
                $events = Read-Events -Path $eventsFile
                $sorted = @($events | Sort-Object { [DateTime]$_.played_at } -Descending)
                Write-JsonResponse -Context $context -Payload $sorted
                $context.Response.OutputStream.Close()
                continue
            }

            if ($method -eq 'POST') {
                $reader = New-Object System.IO.StreamReader($context.Request.InputStream, $context.Request.ContentEncoding)
                $body = $reader.ReadToEnd()
                $reader.Close()

                try {
                    $payload = $body | ConvertFrom-Json
                }
                catch {
                    Write-JsonResponse -Context $context -Payload @{ error = 'JSON inválido' } -StatusCode 400
                    $context.Response.OutputStream.Close()
                    continue
                }

                if (-not $payload.played_at -or -not $payload.track -or -not $payload.artist) {
                    Write-JsonResponse -Context $context -Payload @{ error = 'Faltan campos requeridos: played_at, track, artist' } -StatusCode 400
                    $context.Response.OutputStream.Close()
                    continue
                }

                $events = Read-Events -Path $eventsFile
                $exists = $events | Where-Object {
                    $_.played_at -eq $payload.played_at -and $_.track -eq $payload.track -and $_.artist -eq $payload.artist
                }

                if (-not $exists) {
                    $events = @($events) + @($payload)
                    $events = @($events | Sort-Object { [DateTime]$_.played_at } -Descending)
                    Write-Events -Path $eventsFile -Items $events
                }

                Write-JsonResponse -Context $context -Payload @{ ok = $true; total = @($events).Count }
                $context.Response.OutputStream.Close()
                continue
            }

            if ($method -eq 'DELETE') {
                $range = $context.Request.QueryString['range']
                $events = Read-Events -Path $eventsFile
                $before = @($events).Count

                if ($range -eq 'all') {
                    $events = @()
                }
                else {
                    $months = 0
                    [void][int]::TryParse($range, [ref]$months)
                    if ($months -le 0) {
                        Write-JsonResponse -Context $context -Payload @{ error = 'Parámetro range inválido' } -StatusCode 400
                        $context.Response.OutputStream.Close()
                        continue
                    }

                    $cutoff = Get-Date
                    $cutoff = $cutoff.AddMonths(-$months)
                    $events = @($events | Where-Object { [DateTime]$_.played_at -ge $cutoff })
                }

                Write-Events -Path $eventsFile -Items $events
                $after = @($events).Count
                Write-JsonResponse -Context $context -Payload @{ ok = $true; removed = ($before - $after); remaining = $after }
                $context.Response.OutputStream.Close()
                continue
            }

            Write-JsonResponse -Context $context -Payload @{ error = 'Método no soportado' } -StatusCode 405
            $context.Response.OutputStream.Close()
            continue
        }

        if ($requestPath -eq 'api/analytics') {
            $method = $context.Request.HttpMethod.ToUpperInvariant()
            if ($method -ne 'GET') {
                Write-JsonResponse -Context $context -Payload @{ error = 'Método no soportado' } -StatusCode 405
                $context.Response.OutputStream.Close()
                continue
            }

            $events = Read-Events -Path $eventsFile
            $analytics = Build-Analytics -Events $events
            Write-JsonResponse -Context $context -Payload $analytics
            $context.Response.OutputStream.Close()
            continue
        }

        if ($requestPath -eq 'api/spotify/status') {
            if ($context.Request.HttpMethod.ToUpperInvariant() -ne 'GET') {
                Write-JsonResponse -Context $context -Payload @{ error = 'Método no soportado' } -StatusCode 405
                $context.Response.OutputStream.Close()
                continue
            }

            $configured = -not [string]::IsNullOrWhiteSpace($spotifyClientId) -and -not [string]::IsNullOrWhiteSpace($spotifyClientSecret) -and -not [string]::IsNullOrWhiteSpace($spotifyRefreshToken)
            Write-JsonResponse -Context $context -Payload @{ configured = $configured; last_sync_at = $spotifyLastSyncAt }
            $context.Response.OutputStream.Close()
            continue
        }

        if ($requestPath -eq 'api/spotify/sync') {
            $method = $context.Request.HttpMethod.ToUpperInvariant()
            if ($method -ne 'POST' -and $method -ne 'GET') {
                Write-JsonResponse -Context $context -Payload @{ error = 'Método no soportado' } -StatusCode 405
                $context.Response.OutputStream.Close()
                continue
            }

            try {
                $result = Sync-SpotifyEvents -EventsPath $eventsFile
                Write-JsonResponse -Context $context -Payload @{ ok = $true; inserted = $result.inserted; total = $result.total; synced_at = $result.synced_at }
            }
            catch {
                Write-JsonResponse -Context $context -Payload @{ ok = $false; error = $_.Exception.Message } -StatusCode 500
            }
            $context.Response.OutputStream.Close()
            continue
        }

        if ($requestPath -eq 'api/spotify/current') {
            if ($context.Request.HttpMethod.ToUpperInvariant() -ne 'GET') {
                Write-JsonResponse -Context $context -Payload @{ error = 'Método no soportado' } -StatusCode 405
                $context.Response.OutputStream.Close()
                continue
            }

            try {
                $current = Get-SpotifyCurrentTrack
                Write-JsonResponse -Context $context -Payload @{ ok = $true; current = $current }
            }
            catch {
                Write-JsonResponse -Context $context -Payload @{ ok = $false; error = $_.Exception.Message } -StatusCode 500
            }
            $context.Response.OutputStream.Close()
            continue
        }

        $filePath = Join-Path $root $requestPath
        if (Test-Path $filePath -PathType Leaf) {
            $bytes = [System.IO.File]::ReadAllBytes($filePath)
            switch ([System.IO.Path]::GetExtension($filePath).ToLowerInvariant()) {
                '.html' { $context.Response.ContentType = 'text/html; charset=utf-8' }
                '.js' { $context.Response.ContentType = 'application/javascript; charset=utf-8' }
                '.css' { $context.Response.ContentType = 'text/css; charset=utf-8' }
                default { $context.Response.ContentType = 'application/octet-stream' }
            }
            $context.Response.ContentLength64 = $bytes.Length
            $context.Response.OutputStream.Write($bytes, 0, $bytes.Length)
        }
        else {
            $context.Response.StatusCode = 404
            $message = [System.Text.Encoding]::UTF8.GetBytes('404 - Not Found')
            $context.Response.ContentType = 'text/plain; charset=utf-8'
            $context.Response.ContentLength64 = $message.Length
            $context.Response.OutputStream.Write($message, 0, $message.Length)
        }
        $context.Response.OutputStream.Close()
    }
}
finally {
    $listener.Stop()
    $listener.Close()
}
