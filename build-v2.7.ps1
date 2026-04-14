param(
    [switch]$SkipClean = $false
)

$ProjectPath = Split-Path -Parent $MyInvocation.MyCommand.Path
$AndroidPath = Join-Path $ProjectPath "android"

Write-Host "========== Building Skippify v2.7 APK ==========" -ForegroundColor Cyan

$env:ANDROID_HOME = "C:\Android\Sdk"
$env:ANDROID_SDK_ROOT = "C:\Android\Sdk"

Push-Location $AndroidPath
Write-Host "Working directory: " -NoNewline
Get-Location | ForEach-Object { Write-Host $_ -ForegroundColor Green }

try {
    Write-Host "`n[1/2] Assembling Release APK..." -ForegroundColor Yellow
    & .\gradlew.bat assembleRelease --no-daemon

    if ($LASTEXITCODE -eq 0) {
        Write-Host "`n[2/2] Build completed successfully!" -ForegroundColor Green
        Write-Host "`nLooking for generated APK..." -ForegroundColor Yellow

        $apks = Get-ChildItem -Path "app/build/outputs/apk" -Recurse -Filter "*.apk" -ErrorAction SilentlyContinue
        foreach ($apk in $apks) {
            $sizeMB = [math]::Round($apk.Length / 1MB, 2)
            Write-Host ("  Found: {0} ({1} MB)" -f $apk.Name, $sizeMB) -ForegroundColor Green
            Write-Host ("    Path: {0}" -f $apk.FullName)
        }
    } else {
        Write-Host ("`n[ERROR] Build failed with exit code {0}" -f $LASTEXITCODE) -ForegroundColor Red
    }
} finally {
    Pop-Location
}