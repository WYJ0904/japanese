param(
    [Alias("NoOpen")][switch]$NoBrowser,
    [switch]$SkipWatchdog
)

$ErrorActionPreference = "Stop"
[Console]::OutputEncoding = New-Object System.Text.UTF8Encoding($false)
[Net.ServicePointManager]::SecurityProtocol = [Net.SecurityProtocolType]::Tls12

$LauncherVersion = "8.3.1"

$FrontendRoot = "C:\Users\78252\Documents\Codex\2026-07-05\cloudflare-pages-1-zip-2-html"
$BackendSourceRoot = Join-Path $FrontendRoot "local-backend"
$BackendRoot = "C:\Users\78252\Documents\Codex\2026-06-27\presentations-plugin-presentations-openai-primary-runtime\outputs\vocab-website"
$DesktopToolRoot = Split-Path -Parent $PSScriptRoot
$SiteUrl = "https://thewyj.uk"
$LocalStatusUrl = "http://127.0.0.1:8765/api/status"
$OllamaStatusUrl = "http://127.0.0.1:11434/api/tags"
$OllamaModel = "qwen3:8b"
$ApiStatusUrl = "https://api.thewyj.uk/api/status"
$PagesStatusUrl = "https://thewyj.uk/api/status"
$LauncherLog = Join-Path $PSScriptRoot "启动日志.txt"
$OllamaExe = Join-Path $env:LOCALAPPDATA "Programs\Ollama\ollama.exe"
$CloudflaredExe = Join-Path $BackendRoot "tools\cloudflared.exe"
$TunnelConfig = Join-Path $env:USERPROFILE ".cloudflared\config.yml"
$TunnelLog = Join-Path $BackendRoot "data\fixed-tunnel.log"
$ProtocolStatePath = Join-Path $PSScriptRoot "隧道协议.txt"
$WatchdogScript = Join-Path $PSScriptRoot "watch-wyj.ps1"
$script:ExpectedBackendBuild = ""

function Initialize-LauncherLog {
    if ((Test-Path -LiteralPath $LauncherLog) -and ((Get-Item -LiteralPath $LauncherLog).Length -gt 1MB)) {
        $previousLog = Join-Path $PSScriptRoot "启动日志-previous.txt"
        Remove-Item -LiteralPath $previousLog -Force -ErrorAction SilentlyContinue
        Move-Item -LiteralPath $LauncherLog -Destination $previousLog -Force
    }
}

function Disable-LegacyAutoStart {
    $startupShortcut = Join-Path $env:APPDATA "Microsoft\Windows\Start Menu\Programs\Startup\WYJ网站本地服务.lnk"
    if (Test-Path -LiteralPath $startupShortcut) {
        Remove-Item -LiteralPath $startupShortcut -Force
        Write-LaunchLog "已删除旧开机启动快捷方式；网站保持手动启动。" "Yellow"
    }
}

function Write-LaunchLog {
    param([string]$Message, [string]$Color = "Gray")
    Write-Host $Message -ForegroundColor $Color
    try {
        Add-Content -LiteralPath $LauncherLog -Value ("{0} {1}" -f (Get-Date -Format "yyyy-MM-dd HH:mm:ss"), $Message) -Encoding UTF8
    } catch {
        # Logging must not block startup.
    }
}

function Test-HttpOk {
    param([string]$Url, [int]$TimeoutSec = 5)
    try {
        $response = Invoke-WebRequest -UseBasicParsing -Uri $Url -TimeoutSec $TimeoutSec
        return ($response.StatusCode -ge 200 -and $response.StatusCode -lt 300)
    } catch {
        return $false
    }
}

function Test-ApiOk {
    param([string]$Url, [int]$TimeoutSec = 6)
    try {
        $result = Invoke-RestMethod -Uri $Url -TimeoutSec $TimeoutSec -Headers @{ "Cache-Control" = "no-cache" }
        return ($result.ok -eq $true)
    } catch {
        return $false
    }
}

function Test-BackendReady {
    try {
        $result = Invoke-RestMethod -Uri $LocalStatusUrl -TimeoutSec 5 -Headers @{ "Cache-Control" = "no-cache" }
        if ($result.ok -ne $true) { return $false }
        if ($script:ExpectedBackendBuild -and ([string]$result.build -ne $script:ExpectedBackendBuild)) { return $false }
        return $true
    } catch {
        return $false
    }
}

function Wait-Until {
    param([scriptblock]$Check, [int]$Seconds, [string]$Label)
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
    Write-LaunchLog "$Label 在 $Seconds 秒内没有恢复。" "Yellow"
    return $false
}

function Stop-ManagedBackend {
    $status = $null
    try { $status = Invoke-RestMethod -Uri $LocalStatusUrl -TimeoutSec 3 } catch { }
    if (($null -eq $status) -or ($status.ok -ne $true) -or ([string]$status.build -notmatch '^2026-\d{2}-\d{2}-[a-z][a-z0-9-]*$')) {
        throw "8765 端口未返回预期的 WYJ 账户后端状态，未强制结束。请查看启动日志。"
    }
    $listenerIds = netstat -ano | ForEach-Object {
        if ($_ -match '^\s*TCP\s+\S+:8765\s+\S+\s+LISTENING\s+(\d+)\s*$') { [int]$Matches[1] }
    } | Select-Object -Unique
    foreach ($listenerId in $listenerIds) {
        $process = Get-Process -Id $listenerId -ErrorAction SilentlyContinue
        $processPath = ""
        try { $processPath = [string]$process.Path } catch { }
        if (($null -eq $process) -or ([IO.Path]::GetFileName($processPath) -notmatch '^python(?:w)?\.exe$')) {
            throw "8765 端口不是由 Python 后端监听，未强制结束。请查看启动日志。"
        }
        Write-LaunchLog "检测到后端代码更新，正在安全重启本地后端..." "Yellow"
        Stop-Process -Id $listenerId -Force
        Wait-Process -Id $listenerId -Timeout 10 -ErrorAction SilentlyContinue
    }
}

function Sync-BackendSource {
    if (-not (Test-Path -LiteralPath $BackendSourceRoot)) {
        throw "找不到账户后端源码: $BackendSourceRoot"
    }
    if (-not (Test-Path -LiteralPath $BackendRoot)) {
        New-Item -ItemType Directory -Path $BackendRoot -Force | Out-Null
    }
    $changed = $false
    foreach ($fileName in @("server.py", "account_store.py", "membership.py", "temporary_store.py", "run.ps1")) {
        $source = Join-Path $BackendSourceRoot $fileName
        $destination = Join-Path $BackendRoot $fileName
        if (-not (Test-Path -LiteralPath $source)) {
            throw "账户后端源码缺失: $source"
        }
        $same = (Test-Path -LiteralPath $destination) -and
            ((Get-FileHash -Algorithm SHA256 -LiteralPath $source).Hash -eq
             (Get-FileHash -Algorithm SHA256 -LiteralPath $destination).Hash)
        if (-not $same) {
            Copy-Item -LiteralPath $source -Destination $destination -Force
            $changed = $true
        }
    }
    $sourceMigrations = Join-Path $BackendSourceRoot "migrations"
    $destinationMigrations = Join-Path $BackendRoot "migrations"
    if (-not (Test-Path -LiteralPath $sourceMigrations)) {
        throw "数据库迁移源码缺失: $sourceMigrations"
    }
    if (-not (Test-Path -LiteralPath $destinationMigrations)) {
        New-Item -ItemType Directory -Path $destinationMigrations -Force | Out-Null
    }
    foreach ($migration in Get-ChildItem -LiteralPath $sourceMigrations -File -Filter "*.sql") {
        $destination = Join-Path $destinationMigrations $migration.Name
        $same = (Test-Path -LiteralPath $destination) -and
            ((Get-FileHash -Algorithm SHA256 -LiteralPath $migration.FullName).Hash -eq
             (Get-FileHash -Algorithm SHA256 -LiteralPath $destination).Hash)
        if (-not $same) {
            Copy-Item -LiteralPath $migration.FullName -Destination $destination -Force
            $changed = $true
        }
    }
    $sourceBuild = ""
    $sourceServer = Get-Content -Raw -Encoding UTF8 -LiteralPath (Join-Path $BackendSourceRoot "server.py")
    $sourceBuildMatch = [regex]::Match($sourceServer, 'APP_BUILD\s*=\s*"([^"]+)"')
    if ($sourceBuildMatch.Success) { $sourceBuild = $sourceBuildMatch.Groups[1].Value }
    if (-not $sourceBuild) { throw "无法读取后端源码版本号。" }
    $script:ExpectedBackendBuild = $sourceBuild
    $runningStatus = $null
    try { $runningStatus = Invoke-RestMethod -Uri $LocalStatusUrl -TimeoutSec 3 } catch { }
    $runningBuild = if ($null -ne $runningStatus) { [string]$runningStatus.build } else { "" }
    $restartNeeded = $changed -or (($runningStatus.ok -eq $true) -and $sourceBuild -and ($runningBuild -ne $sourceBuild))
    if ($restartNeeded) {
        if ($runningStatus.ok -eq $true) { Stop-ManagedBackend }
        Write-LaunchLog "账户后端源码已同步。" "Green"
    } else {
        Write-LaunchLog "账户后端源码已是最新版本。" "Green"
    }
}

function Ensure-Ollama {
    if (Test-HttpOk -Url $OllamaStatusUrl -TimeoutSec 3) {
        Write-LaunchLog "本地 AI 服务正常。" "Green"
        Ensure-OllamaModel
        return
    }
    if (-not (Test-Path -LiteralPath $OllamaExe)) {
        throw "找不到 Ollama: $OllamaExe"
    }
    Write-LaunchLog "正在启动本地 AI..." "Yellow"
    $existing = Get-Process -Name "ollama" -ErrorAction SilentlyContinue
    if (-not $existing) {
        Start-Process -FilePath $OllamaExe -ArgumentList @("serve") -WorkingDirectory (Split-Path -Parent $OllamaExe) -WindowStyle Hidden
    }
    if (-not (Wait-Until -Seconds 45 -Label "Ollama" -Check { Test-HttpOk -Url $OllamaStatusUrl -TimeoutSec 3 })) {
        throw "Ollama 启动失败，请查看启动日志。"
    }
    Write-LaunchLog "本地 AI 服务正常。" "Green"
    Ensure-OllamaModel
}

function Ensure-OllamaModel {
    try {
        $running = Invoke-RestMethod -Uri "http://127.0.0.1:11434/api/ps" -TimeoutSec 5
        if ($running.models | Where-Object { ([string]$_.name -eq $OllamaModel) -or ([string]$_.model -eq $OllamaModel) }) {
            Write-LaunchLog ("本地 AI 模型已加载: " + $OllamaModel) "Green"
            return
        }
    } catch { }
    Write-LaunchLog ("正在预热本地 AI 模型 " + $OllamaModel + "，首次可能需要一些时间...") "Yellow"
    $payload = @{
        model = $OllamaModel
        prompt = ""
        stream = $false
        keep_alive = "30m"
    } | ConvertTo-Json -Compress
    try {
        $null = Invoke-RestMethod -Uri "http://127.0.0.1:11434/api/generate" -Method Post -ContentType "application/json" -Body $payload -TimeoutSec 180
    } catch {
        throw ("本地 AI 模型预热失败: " + $_.Exception.Message)
    }
    Write-LaunchLog ("本地 AI 模型已加载: " + $OllamaModel) "Green"
}

function Ensure-Backend {
    if (Test-BackendReady) {
        Write-LaunchLog "本地后端正常。" "Green"
        return
    }
    $runScript = Join-Path $BackendRoot "run.ps1"
    if (-not (Test-Path -LiteralPath $runScript)) {
        throw "找不到本地后端启动脚本: $runScript"
    }
    Write-LaunchLog "正在启动本地后端..." "Yellow"
    Start-Process powershell.exe -ArgumentList @(
        "-NoProfile", "-ExecutionPolicy", "Bypass", "-File", $runScript
    ) -WorkingDirectory $BackendRoot -WindowStyle Hidden
    if (-not (Wait-Until -Seconds 45 -Label "本地后端" -Check { Test-BackendReady })) {
        throw "本地后端启动失败或版本未更新，请查看启动日志。"
    }
    Write-LaunchLog "本地后端正常。" "Green"
}

function Start-TunnelProcess {
    param([ValidateSet("http2", "quic")][string]$Protocol)
    $arguments = @(
        "tunnel", "--config", $TunnelConfig,
        "--protocol", $Protocol, "--edge-ip-version", "4",
        "--loglevel", "info", "--logfile", $TunnelLog,
        "run", "japanese-local-backend"
    )
    Write-LaunchLog ("启动 Tunnel 传输协议: " + $Protocol)
    return Start-Process -FilePath $CloudflaredExe -ArgumentList $arguments -WorkingDirectory $BackendRoot -WindowStyle Hidden -PassThru
}

function Get-PreferredTunnelProtocol {
    if (Test-Path -LiteralPath $ProtocolStatePath) {
        $saved = (Get-Content -Raw -Encoding UTF8 -LiteralPath $ProtocolStatePath).Trim().ToLowerInvariant()
        if ($saved -in @("quic", "http2")) {
            return $saved
        }
    }
    return "quic"
}

function Save-PreferredTunnelProtocol {
    param([ValidateSet("http2", "quic")][string]$Protocol)
    Set-Content -LiteralPath $ProtocolStatePath -Value $Protocol -Encoding UTF8
}

function Ensure-Tunnel {
    $apiHealthy = Test-ApiOk -Url $ApiStatusUrl -TimeoutSec 8
    $pagesHealthy = Test-ApiOk -Url $PagesStatusUrl -TimeoutSec 8
    if ($apiHealthy -and $pagesHealthy) {
        Write-LaunchLog "固定 Tunnel 与 Pages 代理正常。" "Green"
        return
    }
    if (-not (Test-Path -LiteralPath $CloudflaredExe)) {
        throw "找不到 cloudflared: $CloudflaredExe"
    }
    if (-not (Test-Path -LiteralPath $TunnelConfig)) {
        throw "找不到 Tunnel 配置: $TunnelConfig"
    }
    Write-LaunchLog "正在修复固定 Tunnel..." "Yellow"
    $existing = Get-Process -Name "cloudflared" -ErrorAction SilentlyContinue | Where-Object {
        try { $_.Path -eq $CloudflaredExe } catch { $false }
    }
    if ($existing) {
        $existing | Stop-Process -Force
        $existing | Wait-Process -Timeout 10 -ErrorAction SilentlyContinue
    }
    $preferred = Get-PreferredTunnelProtocol
    $fallback = if ($preferred -eq "quic") { "http2" } else { "quic" }
    $process = $null
    $recovered = $false

    foreach ($protocol in @($preferred, $fallback)) {
        $process = Start-TunnelProcess -Protocol $protocol
        $waitSeconds = if ($protocol -eq $preferred) { 40 } else { 55 }
        $recovered = Wait-Until -Seconds $waitSeconds -Label ("Tunnel " + $protocol.ToUpperInvariant()) -Check {
            (Test-ApiOk -Url $ApiStatusUrl -TimeoutSec 8) -and (Test-ApiOk -Url $PagesStatusUrl -TimeoutSec 8)
        }
        if ($recovered) {
            Save-PreferredTunnelProtocol -Protocol $protocol
            Write-LaunchLog ("已记住可用 Tunnel 协议: " + $protocol.ToUpperInvariant()) "Green"
            break
        }
        if ($process -and -not $process.HasExited) {
            Stop-Process -Id $process.Id -Force
            $process | Wait-Process -Timeout 10 -ErrorAction SilentlyContinue
        }
        if ($protocol -eq $preferred) {
            Write-LaunchLog ("Tunnel " + $protocol.ToUpperInvariant() + " 不可用，尝试 " + $fallback.ToUpperInvariant() + "...") "Yellow"
        }
    }

    if (-not $recovered) {
        if ($process -and $process.HasExited) {
            throw "cloudflared 已退出，退出码 $($process.ExitCode)。请查看启动日志。"
        }
        throw "QUIC 与 HTTP/2 都没有恢复。请查看启动日志。"
    }
    Write-LaunchLog "固定 Tunnel 与 Pages 代理正常。" "Green"
}

function Ensure-Watchdog {
    if (-not (Test-Path -LiteralPath $WatchdogScript)) {
        throw "找不到网络守护程序: $WatchdogScript"
    }
    $powerShellExe = Join-Path $env:SystemRoot "System32\WindowsPowerShell\v1.0\powershell.exe"
    Start-Process -FilePath $powerShellExe -ArgumentList @(
        "-NoProfile", "-ExecutionPolicy", "Bypass", "-File", $WatchdogScript
    ) -WorkingDirectory $PSScriptRoot -WindowStyle Hidden
    Write-LaunchLog "持续在线守护已启动；断线时会自动修复。" "Green"
}

Initialize-LauncherLog
$createdNew = $false
$mutex = New-Object System.Threading.Mutex($true, "Local\WYJWebsiteLauncherV3", [ref]$createdNew)
if (-not $createdNew) {
    Write-LaunchLog "另一个启动程序正在运行，请稍候。" "Yellow"
    $mutex.Dispose()
    exit 0
}

try {
    Write-LaunchLog ("=== WYJ的网站启动与自修复 V" + $LauncherVersion + " ===") "Cyan"
    Disable-LegacyAutoStart
    $requiredPaths = @(
        $BackendRoot,
        (Join-Path $BackendRoot "data\settings.json"),
        $CloudflaredExe,
        $TunnelConfig,
        $WatchdogScript
    )
    foreach ($requiredPath in $requiredPaths) {
        if (-not (Test-Path -LiteralPath $requiredPath)) {
            throw "启动所需文件不存在: $requiredPath"
        }
    }
    Sync-BackendSource
    foreach ($backendPath in @(
        (Join-Path $BackendRoot "run.ps1"),
        (Join-Path $BackendRoot "server.py"),
        (Join-Path $BackendRoot "account_store.py"),
        (Join-Path $BackendRoot "membership.py"),
        (Join-Path $BackendRoot "temporary_store.py"),
        (Join-Path $BackendRoot "migrations\001_entitlements_up.sql"),
        (Join-Path $BackendRoot "migrations\002_single_language_orders_up.sql"),
        (Join-Path $BackendRoot "migrations\003_login_audit_up.sql")
    )) {
        if (-not (Test-Path -LiteralPath $backendPath)) {
            throw "后端同步后仍缺少文件: $backendPath"
        }
    }
    Ensure-Backend
    Ensure-Tunnel
    $aiReady = $true
    try {
        Ensure-Ollama
    } catch {
        $aiReady = $false
        Write-LaunchLog ("本地 AI 暂未就绪，网站和账户服务已经可用: " + $_.Exception.Message) "Yellow"
    }
    if (-not (Test-HttpOk -Url $SiteUrl -TimeoutSec 12)) {
        throw "正式网站暂时无法访问: $SiteUrl"
    }
    Write-LaunchLog "网站可用: $SiteUrl" "Green"
    if (-not $aiReady) {
        Write-LaunchLog "当前可登录、管理账户和使用已保存数据；AI 选词与首次释义判卷需稍后重新运行启动程序。" "Yellow"
    }
    if (-not $SkipWatchdog) {
        Ensure-Watchdog
    }
    if (-not $NoBrowser) {
        Start-Process $SiteUrl
    }
    Write-LaunchLog "启动完成。" "Cyan"
    exit 0
} catch {
    Write-LaunchLog ("启动失败: " + $_.Exception.Message) "Red"
    Write-LaunchLog ("请检查日志后再次运行启动程序: " + $LauncherLog) "Yellow"
    exit 1
} finally {
    if ($createdNew) {
        $mutex.ReleaseMutex()
    }
    $mutex.Dispose()
}
