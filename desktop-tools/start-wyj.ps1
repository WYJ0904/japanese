param(
    [Alias("NoOpen")][switch]$NoBrowser,
    [switch]$SkipWatchdog,
    [switch]$Unattended,
    [switch]$CheckOnly,
    [switch]$Configure,
    [Alias("BackendRoot")][string]$RuntimeRoot
)

$ErrorActionPreference = "Stop"
[Console]::OutputEncoding = New-Object System.Text.UTF8Encoding($false)
[Net.ServicePointManager]::SecurityProtocol = [Net.SecurityProtocolType]::Tls12

$LauncherVersion = "10.0.0"
$FrontendRoot = Split-Path -Parent $PSScriptRoot
$BackendSourceRoot = Join-Path $FrontendRoot "local-backend"
$StateRoot = Join-Path $env:LOCALAPPDATA "WYJJapanese"
$LauncherConfigPath = Join-Path $StateRoot "launcher.json"
$LauncherLog = Join-Path $StateRoot "launcher.log"
$ProtocolStatePath = Join-Path $StateRoot "tunnel-protocol.txt"
$BackendPidPath = Join-Path $StateRoot "backend.pid"
$WatchdogScript = Join-Path $PSScriptRoot "watch-wyj.ps1"
$PowerShellExe = Join-Path $env:SystemRoot "System32\WindowsPowerShell\v1.0\powershell.exe"

$SiteUrl = "https://thewyj.uk"
$LocalStatusUrl = "http://127.0.0.1:8765/api/status"
$ApiStatusUrl = "https://api.thewyj.uk/api/status"
$PagesStatusUrl = "https://thewyj.uk/api/status"
$OllamaStatusUrl = "http://127.0.0.1:11434/api/tags"
$OllamaModel = "qwen3:8b"

$script:BackendRoot = ""
$script:CloudflaredExe = ""
$script:TunnelConfig = ""
$script:TunnelLog = ""
$script:PythonExe = ""
$script:ExpectedBackendBuild = ""
$script:FileLoggingEnabled = $true

function Initialize-LauncherState {
    try {
        if (-not (Test-Path -LiteralPath $StateRoot)) {
            New-Item -ItemType Directory -Path $StateRoot -Force | Out-Null
        }
    } catch {
        if ($CheckOnly) {
            $script:FileLoggingEnabled = $false
            return
        }
        throw "无法创建本机启动器配置目录。"
    }
    if ((Test-Path -LiteralPath $LauncherLog) -and ((Get-Item -LiteralPath $LauncherLog).Length -gt 1MB)) {
        $previousLog = $LauncherLog + ".previous"
        Remove-Item -LiteralPath $previousLog -Force -ErrorAction SilentlyContinue
        Move-Item -LiteralPath $LauncherLog -Destination $previousLog -Force
    }
}

function Write-LaunchLog {
    param(
        [Parameter(Mandatory = $true)][string]$Message,
        [ValidateSet("Black", "DarkBlue", "DarkGreen", "DarkCyan", "DarkRed", "DarkMagenta", "DarkYellow", "Gray", "DarkGray", "Blue", "Green", "Cyan", "Red", "Magenta", "Yellow", "White")]
        [string]$Color = "Gray"
    )
    Write-Host $Message -ForegroundColor $Color
    if (-not $script:FileLoggingEnabled) { return }
    try {
        Add-Content -LiteralPath $LauncherLog -Value ("{0} {1}" -f (Get-Date -Format "yyyy-MM-dd HH:mm:ss"), $Message) -Encoding UTF8
    } catch {
        # Logging must never prevent recovery.
    }
}

function ConvertTo-AbsolutePath {
    param([Parameter(Mandatory = $true)][string]$PathValue)
    $expanded = [Environment]::ExpandEnvironmentVariables($PathValue.Trim().Trim('"'))
    if ([string]::IsNullOrWhiteSpace($expanded)) {
        throw "运行目录不能为空。"
    }
    if (-not [IO.Path]::IsPathRooted($expanded)) {
        throw "运行目录必须是绝对路径。"
    }
    return [IO.Path]::GetFullPath($expanded)
}

function ConvertTo-QuotedNativePath {
    param([Parameter(Mandatory = $true)][string]$PathValue)
    if ($PathValue.Contains('"')) {
        throw "本机路径包含无效的引号。"
    }
    return '"' + $PathValue + '"'
}

function Get-LauncherConfig {
    if (-not (Test-Path -LiteralPath $LauncherConfigPath -PathType Leaf)) {
        return $null
    }
    try {
        $raw = Get-Content -Raw -Encoding UTF8 -LiteralPath $LauncherConfigPath
        if (-not $raw.Trim()) { return $null }
        return $raw | ConvertFrom-Json
    } catch {
        throw "启动器配置无法读取。请删除本机 launcher.json 后重新配置。"
    }
}

function Save-LauncherConfig {
    param([Parameter(Mandatory = $true)][string]$BackendRoot)
    $payload = [ordered]@{
        version = 1
        backend_root = (ConvertTo-AbsolutePath -PathValue $BackendRoot)
        updated_at = (Get-Date).ToUniversalTime().ToString("o")
    } | ConvertTo-Json
    $temporary = $LauncherConfigPath + ".tmp-" + [Guid]::NewGuid().ToString("N")
    try {
        [IO.File]::WriteAllText($temporary, $payload, (New-Object System.Text.UTF8Encoding($false)))
        Move-Item -LiteralPath $temporary -Destination $LauncherConfigPath -Force
    } finally {
        Remove-Item -LiteralPath $temporary -Force -ErrorAction SilentlyContinue
    }
}

function Test-LegacyRuntimeRoot {
    param([Parameter(Mandatory = $true)][string]$Candidate)
    try {
        $root = ConvertTo-AbsolutePath -PathValue $Candidate
        return (
            (Test-Path -LiteralPath (Join-Path $root "data\settings.json") -PathType Leaf) -and
            (Test-Path -LiteralPath (Join-Path $root "tools\cloudflared.exe") -PathType Leaf)
        )
    } catch {
        return $false
    }
}

function Find-LegacyRuntimeRoot {
    $candidates = @()
    $defaultRoot = Join-Path $StateRoot "backend"
    foreach ($candidate in @($defaultRoot, $BackendSourceRoot)) {
        if (Test-LegacyRuntimeRoot -Candidate $candidate) {
            $candidates += (ConvertTo-AbsolutePath -PathValue $candidate)
        }
    }

    $documents = [Environment]::GetFolderPath("MyDocuments")
    $codexRoot = if ($documents) { Join-Path $documents "Codex" } else { "" }
    if ($codexRoot -and (Test-Path -LiteralPath $codexRoot -PathType Container)) {
        $legacyDirectories = @(
            Get-ChildItem -LiteralPath $codexRoot -Directory -Filter "vocab-website" -Recurse -ErrorAction SilentlyContinue |
                Select-Object -First 20
        )
        foreach ($directory in $legacyDirectories) {
            if (Test-LegacyRuntimeRoot -Candidate $directory.FullName) {
                $candidates += (ConvertTo-AbsolutePath -PathValue $directory.FullName)
            }
        }
    }

    $unique = @($candidates | Sort-Object -Unique)
    if ($unique.Count -eq 0) { return "" }
    if ($unique.Count -eq 1) { return $unique[0] }

    $ranked = foreach ($candidate in $unique) {
        $database = Join-Path $candidate "data\users.sqlite3"
        $timestamp = if (Test-Path -LiteralPath $database -PathType Leaf) {
            (Get-Item -LiteralPath $database).LastWriteTimeUtc
        } else {
            (Get-Item -LiteralPath (Join-Path $candidate "data\settings.json")).LastWriteTimeUtc
        }
        [pscustomobject]@{ Path = $candidate; LastWriteTimeUtc = $timestamp }
    }
    return ($ranked | Sort-Object LastWriteTimeUtc -Descending | Select-Object -First 1).Path
}

function Resolve-RuntimeRoot {
    if ($Configure) {
        $selected = $RuntimeRoot
        if ([string]::IsNullOrWhiteSpace($selected)) {
            if ($Unattended) {
                throw "无人值守配置必须同时提供 -RuntimeRoot。"
            }
            $selected = Read-Host "请输入现有私有后端运行目录，或输入新的绝对路径"
        }
        $resolved = ConvertTo-AbsolutePath -PathValue $selected
        Save-LauncherConfig -BackendRoot $resolved
        Write-LaunchLog "已保存私有运行目录配置。" "Green"
        return $resolved
    }

    if (-not [string]::IsNullOrWhiteSpace($RuntimeRoot)) {
        return ConvertTo-AbsolutePath -PathValue $RuntimeRoot
    }
    if (-not [string]::IsNullOrWhiteSpace($env:VOCAB_BACKEND_ROOT)) {
        return ConvertTo-AbsolutePath -PathValue $env:VOCAB_BACKEND_ROOT
    }

    $config = Get-LauncherConfig
    if ($null -ne $config -and $config.PSObject.Properties["backend_root"] -and [string]$config.backend_root) {
        return ConvertTo-AbsolutePath -PathValue ([string]$config.backend_root)
    }

    $legacy = Find-LegacyRuntimeRoot
    if ($legacy) {
        if (-not $CheckOnly) {
            Save-LauncherConfig -BackendRoot $legacy
            Write-LaunchLog "已识别并保留现有私有运行目录。" "Green"
        }
        return $legacy
    }

    return ConvertTo-AbsolutePath -PathValue (Join-Path $StateRoot "backend")
}

function Set-ResolvedRuntimePaths {
    param([Parameter(Mandatory = $true)][string]$BackendRoot)
    $script:BackendRoot = ConvertTo-AbsolutePath -PathValue $BackendRoot
    $script:TunnelLog = Join-Path $script:BackendRoot "data\fixed-tunnel.log"
    $script:TunnelConfig = if (-not [string]::IsNullOrWhiteSpace($env:VOCAB_TUNNEL_CONFIG)) {
        ConvertTo-AbsolutePath -PathValue $env:VOCAB_TUNNEL_CONFIG
    } else {
        Join-Path $env:USERPROFILE ".cloudflared\config.yml"
    }
    $env:VOCAB_BACKEND_ROOT = $script:BackendRoot
    if ([string]::IsNullOrWhiteSpace($env:VOCAB_STATIC_DIR)) {
        $env:VOCAB_STATIC_DIR = $FrontendRoot
    }
}

function Resolve-PythonExecutable {
    $candidates = @()
    if (-not [string]::IsNullOrWhiteSpace($env:VOCAB_PYTHON_EXE)) {
        $candidates += [Environment]::ExpandEnvironmentVariables($env:VOCAB_PYTHON_EXE).Trim().Trim('"')
    }
    foreach ($commandName in @("python.exe", "python")) {
        $command = Get-Command $commandName -ErrorAction SilentlyContinue
        if ($command -and $command.Source) { $candidates += $command.Source }
    }
    foreach ($candidate in ($candidates | Select-Object -Unique)) {
        if (Test-Path -LiteralPath $candidate -PathType Leaf) {
            $resolved = [IO.Path]::GetFullPath($candidate)
            & $resolved -c "import sys; raise SystemExit(0 if sys.version_info >= (3, 8) else 1)" 2>$null
            if ($LASTEXITCODE -eq 0) { return $resolved }
        }
    }
    throw "找不到 Python 3。请安装 Python，或设置 VOCAB_PYTHON_EXE。"
}

function Resolve-CloudflaredExecutable {
    $candidates = @()
    if (-not [string]::IsNullOrWhiteSpace($env:VOCAB_CLOUDFLARED_EXE)) {
        $candidates += [Environment]::ExpandEnvironmentVariables($env:VOCAB_CLOUDFLARED_EXE).Trim().Trim('"')
    }
    $candidates += (Join-Path $script:BackendRoot "tools\cloudflared.exe")
    $command = Get-Command "cloudflared.exe" -ErrorAction SilentlyContinue
    if ($command -and $command.Source) { $candidates += $command.Source }
    $candidates += @(
        (Join-Path $env:LOCALAPPDATA "Microsoft\WinGet\Links\cloudflared.exe"),
        (Join-Path $env:ProgramFiles "cloudflared\cloudflared.exe")
    )
    foreach ($candidate in ($candidates | Select-Object -Unique)) {
        if ($candidate -and (Test-Path -LiteralPath $candidate -PathType Leaf)) {
            return [IO.Path]::GetFullPath($candidate)
        }
    }
    return ""
}

function Test-ApiOk {
    param([Parameter(Mandatory = $true)][string]$Url, [int]$TimeoutSec = 6)
    try {
        $result = Invoke-RestMethod -Uri $Url -TimeoutSec $TimeoutSec -Headers @{ "Cache-Control" = "no-cache" }
        return ($result.ok -eq $true)
    } catch {
        return $false
    }
}

function Test-HttpOk {
    param([Parameter(Mandatory = $true)][string]$Url, [int]$TimeoutSec = 6)
    try {
        $response = Invoke-WebRequest -UseBasicParsing -Uri $Url -TimeoutSec $TimeoutSec -Headers @{ "Cache-Control" = "no-cache" }
        return ($response.StatusCode -ge 200 -and $response.StatusCode -lt 300)
    } catch {
        return $false
    }
}

function Get-BackendStatus {
    try {
        return Invoke-RestMethod -Uri $LocalStatusUrl -TimeoutSec 4 -Headers @{ "Cache-Control" = "no-cache" }
    } catch {
        return $null
    }
}

function Test-BackendReady {
    $status = Get-BackendStatus
    if ($null -eq $status -or $status.ok -ne $true) { return $false }
    if ($script:ExpectedBackendBuild -and ([string]$status.build -ne $script:ExpectedBackendBuild)) {
        return $false
    }
    return $true
}

function Wait-ForCondition {
    param(
        [Parameter(Mandatory = $true)][scriptblock]$Check,
        [ValidateRange(1, 600)][int]$Seconds,
        [Parameter(Mandatory = $true)][string]$Label
    )
    $deadline = (Get-Date).AddSeconds($Seconds)
    do {
        if (& $Check) {
            Write-Host ""
            return $true
        }
        Write-Host "." -NoNewline
        Start-Sleep -Seconds 1
    } while ((Get-Date) -lt $deadline)
    Write-Host ""
    Write-LaunchLog "$Label 在 $Seconds 秒内没有就绪。" "Yellow"
    return $false
}

function Disable-LegacyAutoStart {
    $startupShortcut = Join-Path $env:APPDATA "Microsoft\Windows\Start Menu\Programs\Startup\WYJ网站本地服务.lnk"
    if (Test-Path -LiteralPath $startupShortcut -PathType Leaf) {
        Remove-Item -LiteralPath $startupShortcut -Force
        Write-LaunchLog "已删除旧开机启动快捷方式；网站保持手动启动。" "Yellow"
    }
}

function Test-SourceLayout {
    $required = @(
        "server.py",
        "account_store.py",
        "membership.py",
        "payment_assets.py",
        "temporary_store.py",
        "vocabulary_index.py",
        "run.ps1",
        "migrations\001_entitlements_up.sql",
        "migrations\002_single_language_orders_up.sql",
        "migrations\003_login_audit_up.sql",
        "migrations\004_payment_flow_up.sql"
    )
    foreach ($relativePath in $required) {
        $path = Join-Path $BackendSourceRoot $relativePath
        if (-not (Test-Path -LiteralPath $path -PathType Leaf)) {
            throw "后端源码缺失: $relativePath"
        }
    }
    if (-not (Test-Path -LiteralPath $WatchdogScript -PathType Leaf)) {
        throw "网络守护脚本缺失。"
    }
}

function Ensure-RuntimeLayout {
    foreach ($path in @(
        $script:BackendRoot,
        (Join-Path $script:BackendRoot "data"),
        (Join-Path $script:BackendRoot "data\payment\qrcodes"),
        (Join-Path $script:BackendRoot "migrations"),
        (Join-Path $script:BackendRoot "tools")
    )) {
        if (-not (Test-Path -LiteralPath $path -PathType Container)) {
            New-Item -ItemType Directory -Path $path -Force | Out-Null
        }
    }
}

function Copy-FileIfChanged {
    param(
        [Parameter(Mandatory = $true)][string]$Source,
        [Parameter(Mandatory = $true)][string]$Destination
    )
    $sourcePath = [IO.Path]::GetFullPath($Source)
    $destinationPath = [IO.Path]::GetFullPath($Destination)
    if ($sourcePath -eq $destinationPath) { return $false }
    if ((Test-Path -LiteralPath $destinationPath -PathType Leaf) -and
        ((Get-FileHash -Algorithm SHA256 -LiteralPath $sourcePath).Hash -eq
         (Get-FileHash -Algorithm SHA256 -LiteralPath $destinationPath).Hash)) {
        return $false
    }
    $temporary = $destinationPath + ".tmp-" + [Guid]::NewGuid().ToString("N")
    try {
        Copy-Item -LiteralPath $sourcePath -Destination $temporary -Force
        Move-Item -LiteralPath $temporary -Destination $destinationPath -Force
    } finally {
        Remove-Item -LiteralPath $temporary -Force -ErrorAction SilentlyContinue
    }
    return $true
}

function Read-ExpectedBackendBuild {
    $sourceServer = Get-Content -Raw -Encoding UTF8 -LiteralPath (Join-Path $BackendSourceRoot "server.py")
    $match = [regex]::Match($sourceServer, 'APP_BUILD\s*=\s*"([^"]+)"')
    if (-not $match.Success) {
        throw "无法读取后端源码版本号。"
    }
    $script:ExpectedBackendBuild = $match.Groups[1].Value
}

function Sync-BackendSource {
    $changed = $false
    foreach ($fileName in @(
        "server.py",
        "account_store.py",
        "membership.py",
        "payment_assets.py",
        "temporary_store.py",
        "vocabulary_index.py",
        "run.ps1"
    )) {
        $source = Join-Path $BackendSourceRoot $fileName
        $destination = Join-Path $script:BackendRoot $fileName
        if (Copy-FileIfChanged -Source $source -Destination $destination) {
            $changed = $true
        }
    }
    $sourceMigrations = Join-Path $BackendSourceRoot "migrations"
    $destinationMigrations = Join-Path $script:BackendRoot "migrations"
    foreach ($migration in Get-ChildItem -LiteralPath $sourceMigrations -File -Filter "*.sql") {
        $destination = Join-Path $destinationMigrations $migration.Name
        if (Copy-FileIfChanged -Source $migration.FullName -Destination $destination) {
            $changed = $true
        }
    }
    Read-ExpectedBackendBuild
    return $changed
}

function Test-PngFile {
    param([Parameter(Mandatory = $true)][string]$Path)
    if (-not (Test-Path -LiteralPath $Path -PathType Leaf)) { return $false }
    $item = Get-Item -LiteralPath $Path
    if ($item.Length -lt 8 -or $item.Length -gt 3MB) { return $false }
    $signature = New-Object byte[] 8
    $stream = [IO.File]::OpenRead($Path)
    try {
        if ($stream.Read($signature, 0, 8) -ne 8) { return $false }
    } finally {
        $stream.Dispose()
    }
    $expected = [byte[]](137, 80, 78, 71, 13, 10, 26, 10)
    for ($index = 0; $index -lt 8; $index++) {
        if ($signature[$index] -ne $expected[$index]) { return $false }
    }
    return $true
}

function Sync-PrivatePaymentAssets {
    $sourceRoot = Join-Path $BackendSourceRoot "data\payment\qrcodes"
    $destinationRoot = Join-Path $script:BackendRoot "data\payment\qrcodes"
    $plans = @(
        "trial_single_language",
        "dual_language_monthly",
        "tools_monthly",
        "all_access_monthly",
        "dual_language_lifetime",
        "all_access_lifetime"
    )
    $validCount = 0
    $copiedCount = 0
    foreach ($method in @("wechat", "alipay")) {
        foreach ($plan in $plans) {
            $fileName = "${method}_${plan}.png"
            $source = Join-Path $sourceRoot $fileName
            $destination = Join-Path $destinationRoot $fileName
            if (Test-PngFile -Path $source) {
                $validCount++
                if (Copy-FileIfChanged -Source $source -Destination $destination) {
                    $copiedCount++
                }
            }
        }
    }
    if ($validCount -eq 12) {
        if ($copiedCount -gt 0) {
            Write-LaunchLog "已安全同步 $copiedCount 张更新后的私有支付二维码。" "Green"
        } else {
            Write-LaunchLog "12 张私有支付二维码已就绪。" "Green"
        }
    } else {
        Write-LaunchLog "私有支付二维码仅就绪 $validCount/12；缺失方案将无法显示付款码。" "Yellow"
    }
    return $validCount
}

function Get-ListeningProcessIds {
    $ids = @()
    foreach ($line in (netstat -ano 2>$null)) {
        if ($line -match '^\s*TCP\s+\S+:8765\s+\S+\s+LISTENING\s+(\d+)\s*$') {
            $ids += [int]$Matches[1]
        }
    }
    return @($ids | Select-Object -Unique)
}

function Stop-ManagedBackend {
    $status = Get-BackendStatus
    if (($null -eq $status) -or ($status.ok -ne $true) -or
        ([string]$status.build -notmatch '^2026-\d{2}-\d{2}-[a-z][a-z0-9-]*$')) {
        throw "8765 端口未返回预期的 WYJ 后端状态，拒绝结束未知进程。"
    }
    foreach ($listenerId in @(Get-ListeningProcessIds)) {
        $process = Get-Process -Id $listenerId -ErrorAction SilentlyContinue
        $processPath = ""
        try { $processPath = [string]$process.Path } catch { }
        $commandLine = ""
        try {
            $commandLine = [string](Get-CimInstance Win32_Process -Filter "ProcessId=$listenerId" -ErrorAction Stop).CommandLine
        } catch { }
        if (($null -eq $process) -or
            ([IO.Path]::GetFileName($processPath) -notmatch '^python(?:w)?\.exe$') -or
            (-not $commandLine.ToLowerInvariant().Contains("server.py"))) {
            throw "8765 端口不是受管的 Python 后端，拒绝强制结束。"
        }
        Write-LaunchLog "检测到后端代码更新，正在安全重启本地后端..." "Yellow"
        Stop-Process -Id $listenerId -Force
        Wait-Process -Id $listenerId -Timeout 10 -ErrorAction SilentlyContinue
    }
}

function Ensure-Backend {
    param([switch]$RestartRequired)
    $status = Get-BackendStatus
    if ($null -ne $status -and $status.ok -eq $true -and
        ([string]$status.build -eq $script:ExpectedBackendBuild) -and
        (-not $RestartRequired)) {
        Write-LaunchLog "本地账户与支付后端正常。" "Green"
        return
    }
    if ($null -ne $status -and $status.ok -eq $true) {
        Stop-ManagedBackend
    } elseif (@(Get-ListeningProcessIds).Count -gt 0) {
        throw "8765 端口已被其他程序占用。"
    }

    $runScript = Join-Path $script:BackendRoot "run.ps1"
    $env:VOCAB_PYTHON_EXE = $script:PythonExe
    Write-LaunchLog "正在启动本地账户与支付后端..." "Yellow"
    $quotedRunScript = ConvertTo-QuotedNativePath -PathValue $runScript
    $process = Start-Process -FilePath $PowerShellExe -ArgumentList @(
        "-NoLogo", "-NoProfile", "-ExecutionPolicy", "Bypass", "-File", $quotedRunScript
    ) -WorkingDirectory $script:BackendRoot -WindowStyle Hidden -PassThru
    if (-not (Wait-ForCondition -Seconds 50 -Label "本地后端" -Check { Test-BackendReady })) {
        if ($process.HasExited) {
            throw "本地后端启动失败，退出码 $($process.ExitCode)。请查看运行目录 data 下的错误日志。"
        }
        throw "本地后端启动超时。"
    }
    $listenerIds = @(Get-ListeningProcessIds)
    if ($listenerIds.Count -gt 0) {
        Set-Content -LiteralPath $BackendPidPath -Value ([string]$listenerIds[0]) -Encoding ASCII
    }
    Write-LaunchLog "本地账户与支付后端正常。" "Green"
}

function Test-PublicBackendReady {
    return (
        (Test-ApiOk -Url $ApiStatusUrl -TimeoutSec 8) -and
        (Test-ApiOk -Url $PagesStatusUrl -TimeoutSec 8)
    )
}

function Get-PreferredTunnelProtocol {
    if (Test-Path -LiteralPath $ProtocolStatePath -PathType Leaf) {
        $saved = (Get-Content -Raw -Encoding UTF8 -LiteralPath $ProtocolStatePath).Trim().ToLowerInvariant()
        if ($saved -in @("quic", "http2")) { return $saved }
    }
    return "quic"
}

function Save-PreferredTunnelProtocol {
    param([ValidateSet("http2", "quic")][string]$Protocol)
    Set-Content -LiteralPath $ProtocolStatePath -Value $Protocol -Encoding ASCII
}

function Start-TunnelProcess {
    param([ValidateSet("http2", "quic")][string]$Protocol)
    $arguments = @(
        "tunnel", "--config", (ConvertTo-QuotedNativePath -PathValue $script:TunnelConfig),
        "--protocol", $Protocol, "--edge-ip-version", "4",
        "--loglevel", "info", "--logfile", (ConvertTo-QuotedNativePath -PathValue $script:TunnelLog),
        "run", "japanese-local-backend"
    )
    Write-LaunchLog ("启动 Tunnel 传输协议: " + $Protocol.ToUpperInvariant())
    return Start-Process -FilePath $script:CloudflaredExe -ArgumentList $arguments -WorkingDirectory $script:BackendRoot -WindowStyle Hidden -PassThru
}

function Get-ManagedTunnelProcesses {
    $managed = @()
    foreach ($process in @(Get-Process -Name "cloudflared" -ErrorAction SilentlyContinue)) {
        $processPath = ""
        try { $processPath = [IO.Path]::GetFullPath([string]$process.Path) } catch { }
        if (-not $processPath -or $processPath -ne $script:CloudflaredExe) { continue }

        $commandLine = ""
        try {
            $commandLine = [string](Get-CimInstance Win32_Process -Filter "ProcessId=$($process.Id)" -ErrorAction Stop).CommandLine
        } catch { }
        if (-not $commandLine) { continue }

        if (($commandLine.IndexOf("japanese-local-backend", [StringComparison]::OrdinalIgnoreCase) -ge 0) -or
            ($commandLine.IndexOf($script:TunnelConfig, [StringComparison]::OrdinalIgnoreCase) -ge 0)) {
            $managed += $process
        }
    }
    return @($managed)
}

function Ensure-Tunnel {
    if (Test-PublicBackendReady) {
        Write-LaunchLog "固定 Tunnel 与 Pages 代理正常。" "Green"
        return
    }
    $script:CloudflaredExe = Resolve-CloudflaredExecutable
    if (-not $script:CloudflaredExe) {
        throw "找不到 cloudflared。请放入运行目录 tools，或设置 VOCAB_CLOUDFLARED_EXE。"
    }
    if (-not (Test-Path -LiteralPath $script:TunnelConfig -PathType Leaf)) {
        throw "找不到 Tunnel 配置。请设置 VOCAB_TUNNEL_CONFIG。"
    }

    Write-LaunchLog "正在恢复固定 Tunnel..." "Yellow"
    $existing = @(Get-ManagedTunnelProcesses)
    if ($existing) {
        $existing | Stop-Process -Force
        $existing | Wait-Process -Timeout 10 -ErrorAction SilentlyContinue
    }

    $preferred = Get-PreferredTunnelProtocol
    $fallback = if ($preferred -eq "quic") { "http2" } else { "quic" }
    $lastProcess = $null
    foreach ($protocol in @($preferred, $fallback)) {
        $lastProcess = Start-TunnelProcess -Protocol $protocol
        $waitSeconds = if ($protocol -eq $preferred) { 40 } else { 55 }
        if (Wait-ForCondition -Seconds $waitSeconds -Label ("Tunnel " + $protocol.ToUpperInvariant()) -Check { Test-PublicBackendReady }) {
            Save-PreferredTunnelProtocol -Protocol $protocol
            Write-LaunchLog ("固定 Tunnel 已恢复并记住 " + $protocol.ToUpperInvariant() + "。") "Green"
            return
        }
        if ($lastProcess -and -not $lastProcess.HasExited) {
            Stop-Process -Id $lastProcess.Id -Force
            $lastProcess | Wait-Process -Timeout 10 -ErrorAction SilentlyContinue
        }
        if ($protocol -eq $preferred) {
            Write-LaunchLog ("正在改用 " + $fallback.ToUpperInvariant() + "...") "Yellow"
        }
    }
    throw "QUIC 与 HTTP/2 均未恢复公网连接。"
}

function Resolve-OllamaExecutable {
    $candidates = @()
    if (-not [string]::IsNullOrWhiteSpace($env:VOCAB_OLLAMA_EXE)) {
        $candidates += [Environment]::ExpandEnvironmentVariables($env:VOCAB_OLLAMA_EXE).Trim().Trim('"')
    }
    $command = Get-Command "ollama.exe" -ErrorAction SilentlyContinue
    if ($command -and $command.Source) { $candidates += $command.Source }
    $candidates += (Join-Path $env:LOCALAPPDATA "Programs\Ollama\ollama.exe")
    foreach ($candidate in ($candidates | Select-Object -Unique)) {
        if ($candidate -and (Test-Path -LiteralPath $candidate -PathType Leaf)) {
            return [IO.Path]::GetFullPath($candidate)
        }
    }
    return ""
}

function Ensure-OllamaModel {
    try {
        $running = Invoke-RestMethod -Uri "http://127.0.0.1:11434/api/ps" -TimeoutSec 5
        if ($running.models | Where-Object { ([string]$_.name -eq $OllamaModel) -or ([string]$_.model -eq $OllamaModel) }) {
            Write-LaunchLog ("本地 AI 模型已加载: " + $OllamaModel) "Green"
            return
        }
    } catch { }
    Write-LaunchLog ("正在预热本地 AI 模型 " + $OllamaModel + "...") "Yellow"
    $payload = @{
        model = $OllamaModel
        prompt = ""
        stream = $false
        keep_alive = "30m"
    } | ConvertTo-Json -Compress
    $null = Invoke-RestMethod -Uri "http://127.0.0.1:11434/api/generate" -Method Post -ContentType "application/json" -Body $payload -TimeoutSec 180
    Write-LaunchLog ("本地 AI 模型已加载: " + $OllamaModel) "Green"
}

function Ensure-Ollama {
    if (-not (Test-HttpOk -Url $OllamaStatusUrl -TimeoutSec 3)) {
        $ollamaExe = Resolve-OllamaExecutable
        if (-not $ollamaExe) {
            throw "找不到 Ollama；网站仍可使用账户、支付和本地搜索。"
        }
        Write-LaunchLog "正在启动本地 AI..." "Yellow"
        if (-not (Get-Process -Name "ollama" -ErrorAction SilentlyContinue)) {
            Start-Process -FilePath $ollamaExe -ArgumentList @("serve") -WorkingDirectory (Split-Path -Parent $ollamaExe) -WindowStyle Hidden
        }
        if (-not (Wait-ForCondition -Seconds 45 -Label "Ollama" -Check { Test-HttpOk -Url $OllamaStatusUrl -TimeoutSec 3 })) {
            throw "Ollama 启动超时；网站主体功能仍可使用。"
        }
    }
    Write-LaunchLog "本地 AI 服务正常。" "Green"
    Ensure-OllamaModel
}

function Ensure-Watchdog {
    if (-not (Test-Path -LiteralPath $WatchdogScript -PathType Leaf)) {
        throw "找不到网络守护程序。"
    }
    $quotedWatchdogScript = ConvertTo-QuotedNativePath -PathValue $WatchdogScript
    Start-Process -FilePath $PowerShellExe -ArgumentList @(
        "-NoLogo", "-NoProfile", "-ExecutionPolicy", "Bypass", "-File", $quotedWatchdogScript
    ) -WorkingDirectory $PSScriptRoot -WindowStyle Hidden
    Write-LaunchLog "持续在线守护已启动；断线时会自动修复。" "Green"
}

function Show-ConfigurationReport {
    $script:CloudflaredExe = Resolve-CloudflaredExecutable
    $sourceOk = $true
    try { Test-SourceLayout } catch { $sourceOk = $false }
    $runtimeExists = Test-Path -LiteralPath $script:BackendRoot -PathType Container
    $settingsExists = Test-Path -LiteralPath (Join-Path $script:BackendRoot "data\settings.json") -PathType Leaf
    $tunnelConfigExists = Test-Path -LiteralPath $script:TunnelConfig -PathType Leaf
    $qrCount = 0
    $qrRoot = Join-Path $script:BackendRoot "data\payment\qrcodes"
    if (Test-Path -LiteralPath $qrRoot -PathType Container) {
        $qrCount = @(Get-ChildItem -LiteralPath $qrRoot -Filter "*.png" -File).Count
    }
    Write-Host ""
    Write-Host "WYJ 启动器检查 V$LauncherVersion" -ForegroundColor Cyan
    Write-Host ("源码完整: " + $sourceOk)
    Write-Host ("私有运行目录存在: " + $runtimeExists)
    Write-Host ("运行配置存在: " + $settingsExists)
    Write-Host ("Python 可用: " + [bool]$script:PythonExe)
    Write-Host ("cloudflared 可用: " + [bool]$script:CloudflaredExe)
    Write-Host ("Tunnel 配置存在: " + $tunnelConfigExists)
    Write-Host ("私有支付二维码: $qrCount/12")
    Write-Host ("本地后端在线: " + (Test-BackendReady))
    Write-Host ("公网后端在线: " + (Test-PublicBackendReady))
    Write-Host ""
    return ($sourceOk -and [bool]$script:PythonExe)
}

function Invoke-WyjLauncher {
    Initialize-LauncherState
    $createdNew = $false
    $mutex = New-Object System.Threading.Mutex($true, "Local\WYJWebsiteLauncherV3", [ref]$createdNew)
    if (-not $createdNew) {
        Write-LaunchLog "另一个启动程序正在运行，请稍候。" "Yellow"
        $mutex.Dispose()
        return 0
    }

    try {
        Write-LaunchLog ("=== WYJ 网站启动与自修复 V" + $LauncherVersion + " ===") "Cyan"
        $resolvedRoot = Resolve-RuntimeRoot
        Set-ResolvedRuntimePaths -BackendRoot $resolvedRoot
        $script:PythonExe = Resolve-PythonExecutable
        Test-SourceLayout
        Read-ExpectedBackendBuild

        if ($CheckOnly) {
            if (Show-ConfigurationReport) { return 0 }
            return 2
        }

        Disable-LegacyAutoStart
        Ensure-RuntimeLayout
        $sourceChanged = Sync-BackendSource
        $null = Sync-PrivatePaymentAssets
        if ($sourceChanged) {
            Write-LaunchLog "后端代码与数据库迁移已原子同步。" "Green"
        } else {
            Write-LaunchLog "后端代码与数据库迁移已是最新版本。" "Green"
        }

        Ensure-Backend -RestartRequired:$sourceChanged
        Ensure-Tunnel

        $aiReady = $true
        try {
            Ensure-Ollama
        } catch {
            $aiReady = $false
            Write-LaunchLog ("本地 AI 暂未就绪: " + $_.Exception.Message) "Yellow"
        }

        if (-not (Test-HttpOk -Url $SiteUrl -TimeoutSec 12)) {
            throw "正式网站首页暂时无法访问。"
        }
        Write-LaunchLog "网站、账户、会员与支付服务均已就绪。" "Green"
        if (-not $aiReady) {
            Write-LaunchLog "AI 选词与首次释义判卷稍后可由守护程序继续恢复。" "Yellow"
        }
        if (-not $SkipWatchdog) {
            Ensure-Watchdog
        }
        if (-not $NoBrowser) {
            Start-Process $SiteUrl
        }
        Write-LaunchLog "启动完成。" "Cyan"
        return 0
    } catch {
        Write-LaunchLog ("启动失败: " + $_.Exception.Message) "Red"
        Write-LaunchLog ("可运行 -CheckOnly 查看组件状态；日志位于本机应用数据目录。") "Yellow"
        return 1
    } finally {
        if ($createdNew) {
            $mutex.ReleaseMutex()
        }
        $mutex.Dispose()
    }
}

if ($MyInvocation.InvocationName -ne ".") {
    exit (Invoke-WyjLauncher)
}
