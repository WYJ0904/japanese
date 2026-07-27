$ErrorActionPreference = "Stop"
[Console]::OutputEncoding = New-Object System.Text.UTF8Encoding($false)

$Root = Split-Path -Parent $MyInvocation.MyCommand.Path
$DataRoot = Join-Path $Root "data"
$SettingsPath = Join-Path $DataRoot "settings.json"
$FailureLogPath = if (-not [string]::IsNullOrWhiteSpace($env:VOCAB_BACKEND_FAILURE_LOG)) {
    [IO.Path]::GetFullPath([Environment]::ExpandEnvironmentVariables($env:VOCAB_BACKEND_FAILURE_LOG).Trim().Trim('"'))
} else {
    Join-Path $DataRoot "后台启动错误.txt"
}
$CapturedOutput = New-Object "System.Collections.Generic.Queue[string]"
$CapturedOutputLimit = 120

function Add-CapturedOutputLine {
    param($Value)
    $line = ([string]$Value -replace "`0", "").TrimEnd()
    if ($line.Length -gt 2000) {
        $line = $line.Substring(0, 2000) + " [已截断]"
    }
    $CapturedOutput.Enqueue($line)
    while ($CapturedOutput.Count -gt $CapturedOutputLimit) {
        $null = $CapturedOutput.Dequeue()
    }
}

function Write-BackendFailureLog {
    param(
        [Parameter(Mandatory = $true)][string]$Summary,
        [string[]]$Lines = @()
    )
    try {
        $directory = Split-Path -Parent $FailureLogPath
        if (-not (Test-Path -LiteralPath $directory -PathType Container)) {
            New-Item -ItemType Directory -Path $directory -Force | Out-Null
        }
        $content = New-Object System.Collections.Generic.List[string]
        $content.Add("WYJ 本地后端启动错误")
        $content.Add(("生成时间: " + (Get-Date -Format "yyyy-MM-dd HH:mm:ss zzz")))
        $content.Add(("摘要: " + $Summary))
        $content.Add("")
        foreach ($line in $Lines) {
            $content.Add([string]$line)
        }
        $temporary = $FailureLogPath + ".tmp-" + [Guid]::NewGuid().ToString("N")
        try {
            [IO.File]::WriteAllLines($temporary, $content, (New-Object System.Text.UTF8Encoding($true)))
            Move-Item -LiteralPath $temporary -Destination $FailureLogPath -Force
        } finally {
            Remove-Item -LiteralPath $temporary -Force -ErrorAction SilentlyContinue
        }
    } catch {
        # A secondary logging failure must not hide the original process exit.
    }
}

trap {
    $message = $_.Exception.Message
    Add-CapturedOutputLine -Value $_
    Write-BackendFailureLog -Summary ("PowerShell 启动阶段失败: " + $message) -Lines @($CapturedOutput)
    [Console]::Error.WriteLine($message)
    exit 1
}

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

$python = ""
if ($env:VOCAB_PYTHON_EXE -and (Test-Path -LiteralPath $env:VOCAB_PYTHON_EXE -PathType Leaf)) {
    $python = [IO.Path]::GetFullPath($env:VOCAB_PYTHON_EXE)
}
if (-not $python) {
    $python = (Get-Command python.exe -ErrorAction SilentlyContinue).Source
}
if (-not $python) {
    $python = (Get-Command python -ErrorAction SilentlyContinue).Source
}
if (-not $python) {
    throw "Python 3 was not found. Set VOCAB_PYTHON_EXE or add Python to PATH."
}

Set-Location -LiteralPath $Root
$serverPath = Join-Path $Root "server.py"
$previousErrorActionPreference = $ErrorActionPreference
try {
    # Windows PowerShell 5 represents native stderr as non-terminating
    # ErrorRecord objects. Continue keeps them in the bounded capture pipeline.
    $ErrorActionPreference = "Continue"
    & $python $serverPath --host 0.0.0.0 --port 8765 2>&1 |
        ForEach-Object { Add-CapturedOutputLine -Value $_ }
    $pythonExitCode = $LASTEXITCODE
} finally {
    $ErrorActionPreference = $previousErrorActionPreference
}
if ($pythonExitCode -ne 0) {
    Write-BackendFailureLog -Summary ("Python 后端退出，退出码 " + $pythonExitCode) -Lines @($CapturedOutput)
    $lastLine = if ($CapturedOutput.Count) { [string]$CapturedOutput.ToArray()[-1] } else { "没有捕获到 Python 输出。" }
    [Console]::Error.WriteLine($lastLine)
}
exit $pythonExitCode
