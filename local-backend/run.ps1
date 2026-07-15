$ErrorActionPreference = "Stop"
[Console]::OutputEncoding = New-Object System.Text.UTF8Encoding($false)

$Root = Split-Path -Parent $MyInvocation.MyCommand.Path
$DataRoot = Join-Path $Root "data"
$SettingsPath = Join-Path $DataRoot "settings.json"

if (-not (Test-Path -LiteralPath $DataRoot)) {
    New-Item -ItemType Directory -Path $DataRoot -Force | Out-Null
}

$settings = [pscustomobject]@{}
if (Test-Path -LiteralPath $SettingsPath) {
    try {
        $rawSettings = Get-Content -Raw -Encoding UTF8 -LiteralPath $SettingsPath
        if ($rawSettings.Trim()) {
            $settings = $rawSettings | ConvertFrom-Json
        }
    } catch {
        throw "Cannot read data\settings.json: $($_.Exception.Message)"
    }
}

if (-not $settings.PSObject.Properties["share_hmac_key"] -or -not [string]$settings.share_hmac_key) {
    $bytes = New-Object byte[] 32
    $generator = [System.Security.Cryptography.RandomNumberGenerator]::Create()
    try {
        $generator.GetBytes($bytes)
    } finally {
        $generator.Dispose()
    }
    $key = [Convert]::ToBase64String($bytes).TrimEnd('=').Replace('+', '-').Replace('/', '_')
    $settings | Add-Member -NotePropertyName "share_hmac_key" -NotePropertyValue $key -Force
    $json = $settings | ConvertTo-Json -Depth 8
    [System.IO.File]::WriteAllText($SettingsPath, $json, (New-Object System.Text.UTF8Encoding($false)))
}

$env:VOCAB_SHARE_HMAC_KEY = [string]$settings.share_hmac_key
if (-not $env:VOCAB_ADMIN_SECRET -and $settings.PSObject.Properties["access_token"] -and [string]$settings.access_token) {
    # Existing databases keep their administrator password. This fallback is
    # used only for a new database without an explicit bootstrap secret.
    $env:VOCAB_ADMIN_SECRET = [string]$settings.access_token
}

$python = (Get-Command python.exe -ErrorAction SilentlyContinue).Source
if (-not $python) {
    $python = (Get-Command python -ErrorAction SilentlyContinue).Source
}
if (-not $python) {
    throw "Python 3 was not found on PATH."
}

Set-Location -LiteralPath $Root
& $python .\server.py --host 0.0.0.0 --port 8765
exit $LASTEXITCODE
