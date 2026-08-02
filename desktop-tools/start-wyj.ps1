param(
    [Alias("NoOpen")][switch]$NoBrowser,
    [switch]$SkipWatchdog,
    [switch]$Unattended,
    [switch]$CheckOnly,
    [switch]$Configure,
    [Alias("BackendRoot")][string]$RuntimeRoot,
    [Alias("FrontendRoot")][string]$SourceRoot
)

$ErrorActionPreference = "Stop"
[Console]::OutputEncoding = New-Object System.Text.UTF8Encoding($false)
[Net.ServicePointManager]::SecurityProtocol = [Net.SecurityProtocolType]::Tls12

$LauncherVersion = "11.0.0"
$FrontendRoot = ""
$BackendSourceRoot = ""
$StateRoot = Join-Path $env:LOCALAPPDATA "WYJJapanese"
$LauncherEntryRoot = if (-not [string]::IsNullOrWhiteSpace($env:WYJ_LAUNCHER_ENTRY_DIR)) {
    [IO.Path]::GetFullPath([Environment]::ExpandEnvironmentVariables($env:WYJ_LAUNCHER_ENTRY_DIR).Trim().Trim('"'))
} else {
    $PSScriptRoot
}
$LauncherConfigPath = Join-Path $StateRoot "launcher.json"
$LauncherLog = Join-Path $LauncherEntryRoot "启动日志.txt"
$ErrorReportPath = Join-Path $LauncherEntryRoot "启动错误报告.txt"
$PreviousErrorReportPath = Join-Path $LauncherEntryRoot "启动错误报告-previous.txt"
$BackendFailureLogPath = Join-Path $LauncherEntryRoot "后台启动错误.txt"
$BackendStandardInputPath = Join-Path $StateRoot "backend-stdin.empty"
$BackendStandardOutputPath = Join-Path $LauncherEntryRoot "后台标准输出.txt"
$BackendStandardErrorPath = Join-Path $LauncherEntryRoot "后台标准错误.txt"
$TunnelStandardInputPath = Join-Path $StateRoot "tunnel-stdin.empty"
$TunnelStandardOutputPath = Join-Path $LauncherEntryRoot "Tunnel标准输出.txt"
$TunnelStandardErrorPath = Join-Path $LauncherEntryRoot "Tunnel标准错误.txt"
$script:MihomoPartyRoot = Join-Path $env:APPDATA "mihomo-party"
$MihomoGuardScriptPath = Join-Path $StateRoot "mihomo-tunnel-guard.ps1"
$MihomoGuardPidPath = Join-Path $StateRoot "mihomo-tunnel-guard.pid"
$MihomoGuardStandardInputPath = Join-Path $StateRoot "mihomo-tunnel-guard.stdin.txt"
$MihomoGuardStandardOutputPath = Join-Path $StateRoot "mihomo-tunnel-guard.out.log"
$MihomoGuardStandardErrorPath = Join-Path $StateRoot "mihomo-tunnel-guard.err.log"
$ProbeTempRoot = [IO.Path]::GetTempPath()
$PythonProbeScriptPath = Join-Path $ProbeTempRoot "wyj-launcher-http-health-probe.py"
$ProtocolStatePath = Join-Path $StateRoot "tunnel-protocol.txt"
$BackendPidPath = Join-Path $StateRoot "backend.pid"
$WatchdogScript = Join-Path $PSScriptRoot "watch-wyj.ps1"
$PowerShellExe = Join-Path $env:SystemRoot "System32\WindowsPowerShell\v1.0\powershell.exe"
$BackendStartupProbeDelayMilliseconds = 2000

$SiteUrl = "https://thewyj.uk"
$LocalStatusUrl = "http://127.0.0.1:8765/api/status"
$ApiStatusUrl = "https://api.thewyj.uk/api/status"
$PagesStatusUrl = "https://thewyj.uk/api/status"
$PagesFallbackStatusUrl = "https://japanese-6pa.pages.dev/api/status"
$PublicBackendStatusUrls = @($PagesStatusUrl, $PagesFallbackStatusUrl)
$TunnelMetricsUrl = "http://127.0.0.1:20241/metrics"
$OllamaStatusUrl = "http://127.0.0.1:11434/api/tags"
$OllamaModel = "qwen3:8b"
$HealthProbeUserAgent = "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36 WYJHealthProbe/11.0.0"

$script:BackendRoot = ""
$script:CloudflaredExe = ""
$script:TunnelConfig = ""
$script:TunnelLog = ""
$script:PythonExe = ""
$script:ExpectedBackendBuild = ""
$script:FileLoggingEnabled = $true
$script:CurrentPhase = "初始化"
$script:BackendLaunchProcess = $null
$script:LaunchStartedAt = Get-Date
$script:DuplicatePathWasRepaired = $false

function Repair-DuplicatePathEnvironment {
    try {
        $pathNames = @(
            [Environment]::GetEnvironmentVariables("Process").Keys |
                Where-Object {
                    [string]::Equals(
                        [string]$_,
                        "Path",
                        [StringComparison]::OrdinalIgnoreCase
                    )
                }
        )
        if ($pathNames.Count -le 1) { return $false }

        $pathValue = @(
            foreach ($pathName in $pathNames) {
                [string][Environment]::GetEnvironmentVariable([string]$pathName, "Process")
            }
        ) | Where-Object { -not [string]::IsNullOrWhiteSpace($_) } |
            Sort-Object Length -Descending |
            Select-Object -First 1
        if ([string]::IsNullOrWhiteSpace($pathValue)) { return $false }

        foreach ($pathName in $pathNames) {
            [Environment]::SetEnvironmentVariable([string]$pathName, $null, "Process")
        }
        [Environment]::SetEnvironmentVariable("Path", [string]$pathValue, "Process")
        return $true
    } catch {
        return $false
    }
}

$script:DuplicatePathWasRepaired = Repair-DuplicatePathEnvironment

function Initialize-LauncherState {
    try {
        foreach ($directory in @($StateRoot, $LauncherEntryRoot)) {
            if (-not (Test-Path -LiteralPath $directory -PathType Container)) {
                New-Item -ItemType Directory -Path $directory -Force | Out-Null
            }
        }
    } catch {
        if ($CheckOnly) {
            $script:FileLoggingEnabled = $false
            return
        }
        throw "无法创建启动器配置或报告目录。"
    }
    if ((Test-Path -LiteralPath $LauncherLog) -and ((Get-Item -LiteralPath $LauncherLog).Length -gt 1MB)) {
        $previousLog = Join-Path $LauncherEntryRoot "启动日志-previous.txt"
        Remove-Item -LiteralPath $previousLog -Force -ErrorAction SilentlyContinue
        Move-Item -LiteralPath $LauncherLog -Destination $previousLog -Force
    }
    if (Test-Path -LiteralPath $ErrorReportPath -PathType Leaf) {
        Remove-Item -LiteralPath $PreviousErrorReportPath -Force -ErrorAction SilentlyContinue
        Move-Item -LiteralPath $ErrorReportPath -Destination $PreviousErrorReportPath -Force
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

function Get-TextFileTail {
    param(
        [Parameter(Mandatory = $true)][string]$Path,
        [ValidateRange(1, 500)][int]$Lines = 80
    )
    if (-not (Test-Path -LiteralPath $Path -PathType Leaf)) { return @() }
    try {
        return @(Get-Content -LiteralPath $Path -Encoding UTF8 -Tail $Lines -ErrorAction Stop)
    } catch {
        return @("[无法读取日志: $($_.Exception.Message)]")
    }
}

function Get-BuildFromServerFile {
    param([Parameter(Mandatory = $true)][string]$Path)
    if (-not (Test-Path -LiteralPath $Path -PathType Leaf)) { return "文件缺失" }
    try {
        $source = Get-Content -Raw -Encoding UTF8 -LiteralPath $Path
        $match = [regex]::Match($source, 'APP_BUILD\s*=\s*"([^"]+)"')
        if ($match.Success) { return $match.Groups[1].Value }
    } catch { }
    return "无法识别"
}

function Write-LauncherErrorReport {
    param([Parameter(Mandatory = $true)]$ErrorRecord)
    $report = New-Object System.Collections.Generic.List[string]
    $report.Add("WYJ 启动错误报告")
    $report.Add(("生成时间: " + (Get-Date -Format "yyyy-MM-dd HH:mm:ss zzz")))
    $report.Add(("启动器版本: " + $LauncherVersion))
    $report.Add(("失败阶段: " + $script:CurrentPhase))
    $report.Add(("运行时长: {0:N1} 秒" -f ((Get-Date) - $script:LaunchStartedAt).TotalSeconds))
    $report.Add(("错误类型: " + $ErrorRecord.Exception.GetType().FullName))
    $report.Add(("错误信息: " + $ErrorRecord.Exception.Message))
    if ($ErrorRecord.ScriptStackTrace) {
        $report.Add(("脚本位置: " + (($ErrorRecord.ScriptStackTrace -replace "`r?`n", " | ").Trim())))
    }
    $report.Add("")
    $report.Add("=== 组件状态 ===")
    $report.Add(("源码目录: " + $(if ($FrontendRoot) { $FrontendRoot } else { "尚未识别" })))
    $report.Add(("私有运行目录: " + $(if ($script:BackendRoot) { $script:BackendRoot } else { "尚未识别" })))
    $report.Add(("预期后端版本: " + $(if ($script:ExpectedBackendBuild) { $script:ExpectedBackendBuild } else { "尚未读取" })))
    $runtimeServer = if ($script:BackendRoot) { Join-Path $script:BackendRoot "server.py" } else { "" }
    $report.Add(("运行目录后端版本: " + $(if ($runtimeServer) { Get-BuildFromServerFile -Path $runtimeServer } else { "尚未识别" })))
    $pythonVersion = "不可用"
    if ($script:PythonExe -and (Test-Path -LiteralPath $script:PythonExe -PathType Leaf)) {
        try { $pythonVersion = (& $script:PythonExe --version 2>&1 | Select-Object -First 1).ToString().Trim() } catch { }
    }
    $report.Add(("Python: " + $pythonVersion))
    $report.Add(("本地后端在线: " + [bool](Test-BackendReady)))
    $listenerIds = @(Get-ListeningProcessIds)
    $report.Add(("8765 监听进程: " + $(if ($listenerIds.Count) { $listenerIds -join ", " } else { "无" })))
    $tunnelConnections = Get-TunnelHaConnections
    $report.Add(("Tunnel 活动连接: " + $tunnelConnections))
    $report.Add(("Tunnel 诊断: " + (Get-TunnelDiagnosticSummary)))
    if ($null -ne $script:BackendLaunchProcess) {
        try { $script:BackendLaunchProcess.Refresh() } catch { }
        $exitDescription = if ($script:BackendLaunchProcess.HasExited) {
            "已退出，退出码 " + $script:BackendLaunchProcess.ExitCode
        } else {
            "仍在运行，进程 " + $script:BackendLaunchProcess.Id
        }
        $report.Add(("后台启动进程: " + $exitDescription))
    }
    $report.Add("")
    $report.Add("=== 运行目录依赖 ===")
    foreach ($relativePath in @(
        "server.py",
        "account_store.py",
        "membership.py",
        "payment_assets.py",
        "temporary_store.py",
        "vocabulary_index.py",
        "run.ps1",
        "migrations\004_payment_flow_up.sql"
    )) {
        $present = $script:BackendRoot -and (Test-Path -LiteralPath (Join-Path $script:BackendRoot $relativePath) -PathType Leaf)
        $report.Add(("[{0}] {1}" -f $(if ($present) { "存在" } else { "缺失" }), $relativePath))
    }
    $report.Add("")
    $report.Add("=== 后台标准错误（末尾） ===")
    $standardErrorLines = @(Get-TextFileTail -Path $BackendStandardErrorPath -Lines 120)
    if ($standardErrorLines.Count) {
        foreach ($line in $standardErrorLines) { $report.Add([string]$line) }
    } else {
        $report.Add("[后台标准错误为空。]")
    }
    $report.Add("")
    $report.Add("=== 后台故障摘要（末尾） ===")
    $backendLines = @(Get-TextFileTail -Path $BackendFailureLogPath -Lines 120)
    if ($backendLines.Count) {
        foreach ($line in $backendLines) { $report.Add([string]$line) }
    } else {
        $report.Add("[没有生成后台故障摘要。]")
    }
    $report.Add("")
    $report.Add("=== 启动日志（末尾） ===")
    foreach ($line in @(Get-TextFileTail -Path $LauncherLog -Lines 100)) {
        $report.Add([string]$line)
    }
    $report.Add("")
    $report.Add("报告不包含数据库内容、登录密钥、Tunnel 凭据或付款码。")

    $target = $ErrorReportPath
    try {
        $temporary = $target + ".tmp-" + [Guid]::NewGuid().ToString("N")
        try {
            [IO.File]::WriteAllLines($temporary, $report, (New-Object System.Text.UTF8Encoding($true)))
            Move-Item -LiteralPath $temporary -Destination $target -Force
        } finally {
            Remove-Item -LiteralPath $temporary -Force -ErrorAction SilentlyContinue
        }
    } catch {
        $target = Join-Path $StateRoot "启动错误报告.txt"
        [IO.File]::WriteAllLines($target, $report, (New-Object System.Text.UTF8Encoding($true)))
    }
    return $target
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

function Test-SourceRoot {
    param([Parameter(Mandatory = $true)][string]$Candidate)
    try {
        $root = ConvertTo-AbsolutePath -PathValue $Candidate
        return (
            (Test-Path -LiteralPath (Join-Path $root "index.html") -PathType Leaf) -and
            (Test-Path -LiteralPath (Join-Path $root "local-backend\server.py") -PathType Leaf) -and
            (Test-Path -LiteralPath (Join-Path $root "desktop-tools\start-wyj.ps1") -PathType Leaf)
        )
    } catch {
        return $false
    }
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
    param(
        [Parameter(Mandatory = $true)][string]$BackendRoot,
        [string]$SourceRootValue = $FrontendRoot
    )
    $payload = [ordered]@{
        version = 1
        backend_root = (ConvertTo-AbsolutePath -PathValue $BackendRoot)
        source_root = if ($SourceRootValue) { ConvertTo-AbsolutePath -PathValue $SourceRootValue } else { "" }
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

function Find-SourceRoot {
    $candidates = @()
    foreach ($candidate in @(
        $PSScriptRoot,
        (Split-Path -Parent $PSScriptRoot),
        (Split-Path -Parent (Split-Path -Parent $PSScriptRoot))
    )) {
        if ($candidate -and (Test-SourceRoot -Candidate $candidate)) {
            $candidates += (ConvertTo-AbsolutePath -PathValue $candidate)
        }
    }

    $documents = [Environment]::GetFolderPath("MyDocuments")
    $codexRoot = if ($documents) { Join-Path $documents "Codex" } else { "" }
    if ($codexRoot -and (Test-Path -LiteralPath $codexRoot -PathType Container)) {
        $queue = New-Object "System.Collections.Generic.Queue[object]"
        $queue.Enqueue([pscustomobject]@{ Path = $codexRoot; Depth = 0 })
        $visited = 0
        $skipNames = @(".git", ".agents", ".codex", ".venv", "venv", "node_modules", "__pycache__", "data", "tools", "outputs")
        while ($queue.Count -gt 0 -and $visited -lt 4000) {
            $entry = $queue.Dequeue()
            $visited++
            if (Test-SourceRoot -Candidate $entry.Path) {
                $candidates += (ConvertTo-AbsolutePath -PathValue $entry.Path)
            }
            if ($entry.Depth -ge 4) { continue }
            foreach ($directory in @(Get-ChildItem -LiteralPath $entry.Path -Directory -ErrorAction SilentlyContinue)) {
                if ($directory.Name -in $skipNames) { continue }
                if (($directory.Attributes -band [IO.FileAttributes]::ReparsePoint) -ne 0) { continue }
                $queue.Enqueue([pscustomobject]@{
                    Path = $directory.FullName
                    Depth = $entry.Depth + 1
                })
            }
        }
    }

    $unique = @($candidates | Sort-Object -Unique)
    if ($unique.Count -eq 0) { return "" }
    $ranked = foreach ($candidate in $unique) {
        [pscustomobject]@{
            Path = $candidate
            LastWriteTimeUtc = (Get-Item -LiteralPath (Join-Path $candidate "local-backend\server.py")).LastWriteTimeUtc
        }
    }
    return ($ranked | Sort-Object LastWriteTimeUtc -Descending | Select-Object -First 1).Path
}

function Resolve-SourceRoot {
    if (-not [string]::IsNullOrWhiteSpace($SourceRoot)) {
        $resolved = ConvertTo-AbsolutePath -PathValue $SourceRoot
        if (-not (Test-SourceRoot -Candidate $resolved)) {
            throw "-SourceRoot 不是完整的网站源码目录。"
        }
        return $resolved
    }
    if (-not [string]::IsNullOrWhiteSpace($env:VOCAB_SOURCE_ROOT)) {
        $resolved = ConvertTo-AbsolutePath -PathValue $env:VOCAB_SOURCE_ROOT
        if (-not (Test-SourceRoot -Candidate $resolved)) {
            throw "VOCAB_SOURCE_ROOT 不是完整的网站源码目录。"
        }
        return $resolved
    }

    $localCandidate = Split-Path -Parent $PSScriptRoot
    if (Test-SourceRoot -Candidate $localCandidate) {
        return ConvertTo-AbsolutePath -PathValue $localCandidate
    }

    $config = Get-LauncherConfig
    if ($null -ne $config -and $config.PSObject.Properties["source_root"] -and [string]$config.source_root) {
        $configured = ConvertTo-AbsolutePath -PathValue ([string]$config.source_root)
        if (Test-SourceRoot -Candidate $configured) {
            return $configured
        }
    }

    $discovered = Find-SourceRoot
    if ($discovered) { return $discovered }
    throw "找不到完整的网站源码。请使用 -SourceRoot 指定包含 local-backend 的目录。"
}

function Set-ResolvedSourcePaths {
    param([Parameter(Mandatory = $true)][string]$ResolvedSourceRoot)
    $script:FrontendRoot = ConvertTo-AbsolutePath -PathValue $ResolvedSourceRoot
    $script:BackendSourceRoot = Join-Path $script:FrontendRoot "local-backend"
    $env:VOCAB_SOURCE_ROOT = $script:FrontendRoot
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

function Repair-TunnelOriginAddress {
    if (-not $script:TunnelConfig -or
        -not (Test-Path -LiteralPath $script:TunnelConfig -PathType Leaf)) {
        throw "找不到固定 Tunnel 配置: $script:TunnelConfig"
    }

    $content = [IO.File]::ReadAllText($script:TunnelConfig)
    $pattern = '(?im)^(\s*service:\s*)http://localhost:8765(\s*)$'
    if (-not [regex]::IsMatch($content, $pattern)) {
        return
    }

    $updated = [regex]::Replace(
        $content,
        $pattern,
        '${1}http://127.0.0.1:8765${2}'
    )
    $temporaryPath = $script:TunnelConfig + ".tmp-" + [Guid]::NewGuid().ToString("N")
    try {
        [IO.File]::WriteAllText(
            $temporaryPath,
            $updated,
            (New-Object System.Text.UTF8Encoding($false))
        )
        Move-Item -LiteralPath $temporaryPath -Destination $script:TunnelConfig -Force
    } finally {
        if (Test-Path -LiteralPath $temporaryPath) {
            Remove-Item -LiteralPath $temporaryPath -Force
        }
    }
    Write-LaunchLog "已将 Tunnel 本地上游固定为 IPv4，避免 localhost 解析到不可监听的 IPv6 地址。" "Green"
}

function Set-Utf8TextFileAtomically {
    param(
        [Parameter(Mandatory = $true)][string]$Path,
        [Parameter(Mandatory = $true)][AllowEmptyString()][string]$Content
    )
    $parent = Split-Path -Parent $Path
    if ($parent -and -not (Test-Path -LiteralPath $parent -PathType Container)) {
        New-Item -ItemType Directory -Path $parent -Force | Out-Null
    }
    $temporaryPath = $Path + ".tmp-" + [Guid]::NewGuid().ToString("N")
    try {
        [IO.File]::WriteAllText(
            $temporaryPath,
            $Content,
            (New-Object System.Text.UTF8Encoding($false))
        )
        Move-Item -LiteralPath $temporaryPath -Destination $Path -Force
    } finally {
        Remove-Item -LiteralPath $temporaryPath -Force -ErrorAction SilentlyContinue
    }
}

function Backup-MihomoPartyFile {
    param(
        [Parameter(Mandatory = $true)][string]$Path,
        [Parameter(Mandatory = $true)][string]$BackupRoot
    )
    if (-not (Test-Path -LiteralPath $Path -PathType Leaf)) { return }
    if (-not (Test-Path -LiteralPath $BackupRoot -PathType Container)) {
        New-Item -ItemType Directory -Path $BackupRoot -Force | Out-Null
    }
    $stamp = Get-Date -Format "yyyyMMdd-HHmmss-fff"
    $name = $stamp + "-" + [IO.Path]::GetFileName($Path)
    Copy-Item -LiteralPath $Path -Destination (Join-Path $BackupRoot $name) -Force
}

function Set-MihomoDnsFilterContent {
    param([Parameter(Mandatory = $true)][AllowEmptyString()][string]$Content)
    if ([regex]::IsMatch(
        $Content,
        '(?im)^[ \t]*-[ \t]*["'']?\+\.argotunnel\.com["'']?[ \t]*\r?$'
    )) {
        return $Content
    }

    $newline = if ($Content.Contains("`r`n")) { "`r`n" } else { "`n" }
    $emptyFilter = [regex]::Match(
        $Content,
        '(?m)^(?<indent>[ \t]+)fake-ip-filter:[ \t]*\[[ \t]*\][ \t]*\r?$'
    )
    if ($emptyFilter.Success) {
        $indent = $emptyFilter.Groups["indent"].Value
        $replacement = (
            $indent + "fake-ip-filter:" + $newline +
            $indent + "  - +.argotunnel.com"
        )
        return (
            $Content.Substring(0, $emptyFilter.Index) +
            $replacement +
            $Content.Substring($emptyFilter.Index + $emptyFilter.Length)
        )
    }

    $filter = [regex]::Match(
        $Content,
        '(?m)^(?<indent>[ \t]+)fake-ip-filter:[ \t]*\r?$'
    )
    if ($filter.Success) {
        $itemIndent = $filter.Groups["indent"].Value + "  "
        $replacement = $filter.Value + $newline + $itemIndent + "- +.argotunnel.com"
        return (
            $Content.Substring(0, $filter.Index) +
            $replacement +
            $Content.Substring($filter.Index + $filter.Length)
        )
    }

    $dns = [regex]::Match($Content, '(?m)^dns:[ \t]*\r?$')
    if ($dns.Success) {
        $replacement = (
            $dns.Value + $newline +
            "  fake-ip-filter:" + $newline +
            "    - +.argotunnel.com"
        )
        return (
            $Content.Substring(0, $dns.Index) +
            $replacement +
            $Content.Substring($dns.Index + $dns.Length)
        )
    }
    return $Content
}

function Set-MihomoWorkRoutingContent {
    param([Parameter(Mandatory = $true)][AllowEmptyString()][string]$Content)
    $newline = if ($Content.Contains("`r`n")) { "`r`n" } else { "`n" }
    $updated = [regex]::Replace(
        $Content,
        '(?im)^(?:\uFEFF)?mode:[ \t]*(?:global|rule)[ \t]*(?:#.*)?\r?$',
        'mode: rule',
        1
    )
    $updated = Set-MihomoDnsFilterContent -Content $updated

    $rules = @(
        "rules:",
        "  - PROCESS-NAME,cloudflared.exe,DIRECT",
        "  - DOMAIN-SUFFIX,argotunnel.com,DIRECT",
        "  - MATCH,GLOBAL"
    ) -join $newline
    $rulesBlock = [regex]::Match(
        $updated,
        '(?ms)^rules:[ \t]*(?:\r?\n).*?(?=^[A-Za-z0-9_-]+:[ \t]*|\z)'
    )
    if ($rulesBlock.Success) {
        $updated = (
            $updated.Substring(0, $rulesBlock.Index) +
            $rules + $newline +
            $updated.Substring($rulesBlock.Index + $rulesBlock.Length)
        )
    } else {
        $updated = $updated.TrimEnd("`r", "`n") + $newline + $rules + $newline
    }
    return $updated
}

function Set-MihomoTextFileIfChanged {
    param(
        [Parameter(Mandatory = $true)][string]$Path,
        [Parameter(Mandatory = $true)][AllowEmptyString()][string]$Content,
        [Parameter(Mandatory = $true)][string]$BackupRoot
    )
    $current = if (Test-Path -LiteralPath $Path -PathType Leaf) {
        [IO.File]::ReadAllText($Path)
    } else {
        $null
    }
    if ($null -ne $current -and $current -ceq $Content) { return $false }
    if ($null -ne $current) {
        Backup-MihomoPartyFile -Path $Path -BackupRoot $BackupRoot
    }
    Set-Utf8TextFileAtomically -Path $Path -Content $Content
    return $true
}

function Install-MihomoPartyPersistentRouting {
    param(
        [string]$PartyRoot = $script:MihomoPartyRoot,
        [string]$BackupRoot = (Join-Path $StateRoot "config-backups\mihomo-party")
    )
    $result = [ordered]@{
        Available = $false
        Enabled = $false
        Mode = ""
        Changed = $false
    }
    if (-not $PartyRoot -or
        -not (Test-Path -LiteralPath $PartyRoot -PathType Container)) {
        return [pscustomobject]$result
    }

    $persistentPath = Join-Path $PartyRoot "mihomo.yaml"
    if (-not (Test-Path -LiteralPath $persistentPath -PathType Leaf)) {
        return [pscustomobject]$result
    }
    $result.Available = $true
    $persistent = [IO.File]::ReadAllText($persistentPath)
    $modeMatch = [regex]::Match(
        $persistent,
        '(?im)^(?:\uFEFF)?mode:[ \t]*(?<mode>[A-Za-z0-9_-]+)[ \t]*(?:#.*)?\r?$'
    )
    if (-not $modeMatch.Success) {
        $result.Mode = "unknown"
        return [pscustomobject]$result
    }
    $result.Mode = $modeMatch.Groups["mode"].Value.ToLowerInvariant()
    if ($result.Mode -eq "direct") {
        return [pscustomobject]$result
    }
    if ($result.Mode -notin @("global", "rule")) {
        return [pscustomobject]$result
    }
    $result.Enabled = $true

    $persistentUpdated = [regex]::Replace(
        $persistent,
        '(?im)^(?:\uFEFF)?mode:[ \t]*(?:global|rule)[ \t]*(?:#.*)?\r?$',
        'mode: rule',
        1
    )
    $persistentUpdated = Set-MihomoDnsFilterContent -Content $persistentUpdated
    if (Set-MihomoTextFileIfChanged -Path $persistentPath -Content $persistentUpdated -BackupRoot $BackupRoot) {
        $result.Changed = $true
    }

    $newline = if ($persistent.Contains("`r`n")) { "`r`n" } else { "`n" }
    $overrideIndexPath = Join-Path $PartyRoot "override.yaml"
    $overrideIndex = if (Test-Path -LiteralPath $overrideIndexPath -PathType Leaf) {
        [IO.File]::ReadAllText($overrideIndexPath)
    } else {
        "items:" + $newline
    }
    if (-not [regex]::IsMatch(
        $overrideIndex,
        '(?im)^[ \t]*-[ \t]*id:[ \t]*wyj-cloudflared-direct[ \t]*\r?$'
    )) {
        $updatedMilliseconds = [long](
            ([DateTime]::UtcNow - [DateTime]"1970-01-01").TotalMilliseconds
        )
        $item = @(
            "  - id: wyj-cloudflared-direct",
            "    name: WYJ Cloudflare Tunnel Direct",
            "    type: local",
            "    ext: yaml",
            "    global: true",
            ("    updated: " + $updatedMilliseconds)
        ) -join $newline
        if ([regex]::IsMatch($overrideIndex, '(?im)^items:[ \t]*\[[ \t]*\][ \t]*\r?$')) {
            $overrideIndex = [regex]::Replace(
                $overrideIndex,
                '(?im)^items:[ \t]*\[[ \t]*\][ \t]*\r?$',
                ("items:" + $newline + $item),
                1
            )
        } elseif ([regex]::IsMatch($overrideIndex, '(?im)^items:[ \t]*\r?$')) {
            $itemsBlock = [regex]::Match(
                $overrideIndex,
                '(?ms)^items:[ \t]*(?:\r?\n).*?(?=^[A-Za-z0-9_-]+:[ \t]*|\z)'
            )
            if ($itemsBlock.Success) {
                $replacement = $itemsBlock.Value.TrimEnd("`r", "`n") + $newline + $item + $newline
                $overrideIndex = (
                    $overrideIndex.Substring(0, $itemsBlock.Index) +
                    $replacement +
                    $overrideIndex.Substring($itemsBlock.Index + $itemsBlock.Length)
                )
            }
        } else {
            $overrideIndex = (
                $overrideIndex.TrimEnd("`r", "`n") + $newline +
                "items:" + $newline + $item + $newline
            )
        }
    }
    if (Set-MihomoTextFileIfChanged -Path $overrideIndexPath -Content $overrideIndex -BackupRoot $BackupRoot) {
        $result.Changed = $true
    }

    $overridePath = Join-Path $PartyRoot "override\wyj-cloudflared-direct.yaml"
    $overrideContent = @(
        "rules:",
        "  - PROCESS-NAME,cloudflared.exe,DIRECT",
        "  - DOMAIN-SUFFIX,argotunnel.com,DIRECT",
        "  - MATCH,GLOBAL",
        ""
    ) -join $newline
    if (Set-MihomoTextFileIfChanged -Path $overridePath -Content $overrideContent -BackupRoot $BackupRoot) {
        $result.Changed = $true
    }
    return [pscustomobject]$result
}
function Resolve-MihomoExecutable {
    $candidates = @()
    foreach ($programRoot in @($env:ProgramFiles, ${env:ProgramFiles(x86)})) {
        if ($programRoot) {
            $candidates += (Join-Path $programRoot "Clash Party\resources\sidecar\mihomo.exe")
        }
    }
    foreach ($candidate in $candidates) {
        if ($candidate -and (Test-Path -LiteralPath $candidate -PathType Leaf)) {
            return [IO.Path]::GetFullPath($candidate)
        }
    }
    return ""
}

function Test-MihomoConfigurationFile {
    param(
        [Parameter(Mandatory = $true)][string]$Path,
        [string]$MihomoExe = (Resolve-MihomoExecutable)
    )
    if (-not $MihomoExe) { return $true }
    $startInfo = New-Object System.Diagnostics.ProcessStartInfo
    $startInfo.FileName = $MihomoExe
    $startInfo.Arguments = "-t -f " + (ConvertTo-QuotedNativePath -PathValue $Path)
    $startInfo.WorkingDirectory = Split-Path -Parent $Path
    $startInfo.UseShellExecute = $false
    $startInfo.CreateNoWindow = $true
    $startInfo.RedirectStandardInput = $true
    $startInfo.RedirectStandardOutput = $true
    $startInfo.RedirectStandardError = $true
    $process = New-Object System.Diagnostics.Process
    $process.StartInfo = $startInfo
    try {
        if (-not $process.Start()) { return $false }
        $process.StandardInput.Close()
        if (-not $process.WaitForExit(10000)) {
            try { $process.Kill() } catch { }
            return $false
        }
        return ($process.ExitCode -eq 0)
    } finally {
        $process.Dispose()
    }
}

function Get-MihomoPartyControlContext {
    param([string]$PartyRoot = $script:MihomoPartyRoot)
    $logsRoot = Join-Path $PartyRoot "logs"
    if (-not (Test-Path -LiteralPath $logsRoot -PathType Container)) { return $null }
    $appLog = Get-ChildItem -LiteralPath $logsRoot -Filter "clash-party-*.log" -File |
        Sort-Object LastWriteTimeUtc -Descending |
        Select-Object -First 1
    if (-not $appLog) { return $null }
    $ipcLine = Get-Content -LiteralPath $appLog.FullName -Encoding UTF8 -Tail 5000 |
        Where-Object { $_ -match 'Using IPC path:\s*(\\\\\.\\pipe\\\S+)' } |
        Select-Object -Last 1
    if (-not $ipcLine) { return $null }
    $ipcMatch = [regex]::Match(
        [string]$ipcLine,
        'Using IPC path:\s*(\\\\\.\\pipe\\\S+)'
    )
    if (-not $ipcMatch.Success) { return $null }
    $mainProcess = Get-Process -Name "Clash Party" -ErrorAction SilentlyContinue |
        Sort-Object StartTime |
        Select-Object -First 1
    if (-not $mainProcess) { return $null }
    return [pscustomobject]@{
        Pipe = $ipcMatch.Groups[1].Value
        AppLogPath = $appLog.FullName
        ProcessId = $mainProcess.Id
    }
}

function Invoke-MihomoNamedPipeRequest {
    param(
        [Parameter(Mandatory = $true)][string]$PipePath,
        [Parameter(Mandatory = $true)][ValidateSet("PATCH", "PUT")][string]$Method,
        [Parameter(Mandatory = $true)][string]$RequestPath,
        [Parameter(Mandatory = $true)][AllowEmptyString()][string]$Body
    )
    $pipeName = $PipePath -replace '^\\\\\.\\pipe\\', ''
    $bodyBytes = [Text.Encoding]::UTF8.GetBytes($Body)
    $head = (
        "$Method $RequestPath HTTP/1.1`r`n" +
        "Host: localhost`r`n" +
        "Content-Type: application/json`r`n" +
        "Content-Length: $($bodyBytes.Length)`r`n" +
        "Connection: close`r`n`r`n"
    )
    $pipe = [IO.Pipes.NamedPipeClientStream]::new(
        ".",
        $pipeName,
        [IO.Pipes.PipeDirection]::InOut,
        [IO.Pipes.PipeOptions]::None
    )
    $reader = $null
    try {
        $pipe.Connect(1500)
        $headBytes = [Text.Encoding]::ASCII.GetBytes($head)
        $pipe.Write($headBytes, 0, $headBytes.Length)
        if ($bodyBytes.Length) {
            $pipe.Write($bodyBytes, 0, $bodyBytes.Length)
        }
        $pipe.Flush()
        $reader = [IO.StreamReader]::new(
            $pipe,
            [Text.Encoding]::UTF8,
            $false,
            4096,
            $true
        )
        $statusLine = $reader.ReadLine()
        return ([string]$statusLine -match '^HTTP/\d(?:\.\d)? 2\d\d ')
    } catch {
        return $false
    } finally {
        if ($reader) { $reader.Dispose() }
        $pipe.Dispose()
    }
}

function Get-MihomoTunnelGuardSource {
    $encoded = "cGFyYW0oCiAgICBbUGFyYW1ldGVyKE1hbmRhdG9yeSA9ICR0cnVlKV1baW50XSRDbGFzaFBhcnR5UGlkLAogICAgW1BhcmFtZXRlcihNYW5kYXRvcnkgPSAkdHJ1ZSldW3N0cmluZ10kV29ya0NvbmZpZ1BhdGgsCiAgICBbUGFyYW1ldGVyKE1hbmRhdG9yeSA9ICR0cnVlKV1bc3RyaW5nXSRBcHBMb2dQYXRoCikKCiRFcnJvckFjdGlvblByZWZlcmVuY2UgPSAnU2lsZW50bHlDb250aW51ZScKCmZ1bmN0aW9uIFNldC1NaWhvbW9SdWxlTW9kZSB7CiAgICAkbGluZSA9IEdldC1Db250ZW50IC1MaXRlcmFsUGF0aCAkQXBwTG9nUGF0aCAtRW5jb2RpbmcgVVRGOCB8CiAgICAgICAgV2hlcmUtT2JqZWN0IHsgJF8gLW1hdGNoICdVc2luZyBJUEMgcGF0aDpccyooXFxcXFwuXFxwaXBlXFxcUyspJyB9IHwKICAgICAgICBTZWxlY3QtT2JqZWN0IC1MYXN0IDEKICAgIGlmICgtbm90ICRsaW5lIC1vciAkbGluZSAtbm90bWF0Y2ggJ1VzaW5nIElQQyBwYXRoOlxzKihcXFxcXC5cXHBpcGVcXFxTKyknKSB7IHJldHVybiB9CiAgICAkcGlwZU5hbWUgPSAkbWF0Y2hlc1sxXSAtcmVwbGFjZSAnXlxcXFxcLlxccGlwZVxcJywgJycKICAgICRib2R5Qnl0ZXMgPSBbU3lzdGVtLlRleHQuRW5jb2RpbmddOjpVVEY4LkdldEJ5dGVzKCd7Im1vZGUiOiJydWxlIn0nKQogICAgJGhlYWQgPSAiUEFUQ0ggL2NvbmZpZ3MgSFRUUC8xLjFgcmBuSG9zdDogbG9jYWxob3N0YHJgbkNvbnRlbnQtVHlwZTogYXBwbGljYXRpb24vanNvbmByYG5Db250ZW50LUxlbmd0aDogJCgkYm9keUJ5dGVzLkxlbmd0aClgcmBuQ29ubmVjdGlvbjogY2xvc2VgcmBuYHJgbiIKICAgICRwaXBlID0gW1N5c3RlbS5JTy5QaXBlcy5OYW1lZFBpcGVDbGllbnRTdHJlYW1dOjpuZXcoJy4nLCAkcGlwZU5hbWUsIFtTeXN0ZW0uSU8uUGlwZXMuUGlwZURpcmVjdGlvbl06OkluT3V0LCBbU3lzdGVtLklPLlBpcGVzLlBpcGVPcHRpb25zXTo6Tm9uZSkKICAgIHRyeSB7CiAgICAgICAgJHBpcGUuQ29ubmVjdCgxNTAwKQogICAgICAgICRoZWFkQnl0ZXMgPSBbU3lzdGVtLlRleHQuRW5jb2RpbmddOjpBU0NJSS5HZXRCeXRlcygkaGVhZCkKICAgICAgICAkcGlwZS5Xcml0ZSgkaGVhZEJ5dGVzLCAwLCAkaGVhZEJ5dGVzLkxlbmd0aCkKICAgICAgICAkcGlwZS5Xcml0ZSgkYm9keUJ5dGVzLCAwLCAkYm9keUJ5dGVzLkxlbmd0aCkKICAgICAgICAkcGlwZS5GbHVzaCgpCiAgICAgICAgJHJlYWRlciA9IFtTeXN0ZW0uSU8uU3RyZWFtUmVhZGVyXTo6bmV3KCRwaXBlLCBbU3lzdGVtLlRleHQuRW5jb2RpbmddOjpVVEY4LCAkZmFsc2UsIDQwOTYsICR0cnVlKQogICAgICAgICRyZXNwb25zZSA9ICRyZWFkZXIuUmVhZFRvRW5kKCkKICAgICAgICBpZiAoKCRyZXNwb25zZSAtc3BsaXQgImByP2BuIilbMF0gLW1hdGNoICcgMlxkXGQgJykgewogICAgICAgICAgICBXcml0ZS1PdXRwdXQgKChHZXQtRGF0ZSAtRm9ybWF0IG8pICsgJyBtb2RlPXJ1bGUnKQogICAgICAgIH0KICAgIH0gZmluYWxseSB7CiAgICAgICAgaWYgKCRyZWFkZXIpIHsgJHJlYWRlci5EaXNwb3NlKCkgfQogICAgICAgICRwaXBlLkRpc3Bvc2UoKQogICAgfQp9CgokbGFzdFdyaXRlID0gW0RhdGVUaW1lXTo6TWluVmFsdWUKd2hpbGUgKEdldC1Qcm9jZXNzIC1JZCAkQ2xhc2hQYXJ0eVBpZCAtRXJyb3JBY3Rpb24gU2lsZW50bHlDb250aW51ZSkgewogICAgJGN1cnJlbnRXcml0ZSA9IGlmIChUZXN0LVBhdGggLUxpdGVyYWxQYXRoICRXb3JrQ29uZmlnUGF0aCkgewogICAgICAgIChHZXQtSXRlbSAtTGl0ZXJhbFBhdGggJFdvcmtDb25maWdQYXRoKS5MYXN0V3JpdGVUaW1lVXRjCiAgICB9IGVsc2UgewogICAgICAgIFtEYXRlVGltZV06Ok1pblZhbHVlCiAgICB9CiAgICBpZiAoJGN1cnJlbnRXcml0ZSAtbmUgJGxhc3RXcml0ZSkgewogICAgICAgIFN0YXJ0LVNsZWVwIC1NaWxsaXNlY29uZHMgMzAwCiAgICAgICAgU2V0LU1paG9tb1J1bGVNb2RlCiAgICAgICAgJGxhc3RXcml0ZSA9ICRjdXJyZW50V3JpdGUKICAgIH0KICAgIFN0YXJ0LVNsZWVwIC1TZWNvbmRzIDEKfQ=="
    return [Text.Encoding]::UTF8.GetString([Convert]::FromBase64String($encoded))
}

function Start-MihomoTunnelGuard {
    param(
        [Parameter(Mandatory = $true)]$ControlContext,
        [Parameter(Mandatory = $true)][string]$WorkConfigPath
    )
    $source = Get-MihomoTunnelGuardSource
    Set-Utf8TextFileAtomically -Path $MihomoGuardScriptPath -Content $source
    foreach ($streamPath in @(
        $MihomoGuardStandardInputPath,
        $MihomoGuardStandardOutputPath,
        $MihomoGuardStandardErrorPath
    )) {
        if (-not (Test-Path -LiteralPath $streamPath -PathType Leaf)) {
            Set-Utf8TextFileAtomically -Path $streamPath -Content ""
        }
    }

    if (Test-Path -LiteralPath $MihomoGuardPidPath -PathType Leaf) {
        $oldPid = 0
        [void][int]::TryParse(
            ([IO.File]::ReadAllText($MihomoGuardPidPath).Trim()),
            [ref]$oldPid
        )
        if ($oldPid -gt 0) {
            $old = Get-Process -Id $oldPid -ErrorAction SilentlyContinue
            if ($old) {
                $commandLine = ""
                try {
                    $commandLine = [string](
                        Get-CimInstance Win32_Process -Filter "ProcessId=$oldPid" -ErrorAction Stop
                    ).CommandLine
                } catch { }
                if ($commandLine.IndexOf(
                    $MihomoGuardScriptPath,
                    [StringComparison]::OrdinalIgnoreCase
                ) -ge 0) {
                    Stop-Process -Id $oldPid -Force -ErrorAction SilentlyContinue
                    $old | Wait-Process -Timeout 5 -ErrorAction SilentlyContinue
                }
            }
        }
    }

    $arguments = @(
        "-NoLogo",
        "-NoProfile",
        "-ExecutionPolicy", "Bypass",
        "-File", (ConvertTo-QuotedNativePath -PathValue $MihomoGuardScriptPath),
        "-ClashPartyPid", [string]$ControlContext.ProcessId,
        "-WorkConfigPath", (ConvertTo-QuotedNativePath -PathValue $WorkConfigPath),
        "-AppLogPath", (ConvertTo-QuotedNativePath -PathValue $ControlContext.AppLogPath)
    )
    $guard = Start-Process -FilePath $PowerShellExe -ArgumentList $arguments `
        -WorkingDirectory $StateRoot -WindowStyle Hidden -PassThru `
        -RedirectStandardInput $MihomoGuardStandardInputPath `
        -RedirectStandardOutput $MihomoGuardStandardOutputPath `
        -RedirectStandardError $MihomoGuardStandardErrorPath
    Set-Utf8TextFileAtomically -Path $MihomoGuardPidPath -Content ([string]$guard.Id)
}

function Repair-MihomoPartyTunnelRouting {
    $backupRoot = Join-Path $StateRoot "config-backups\mihomo-party"
    $persistent = Install-MihomoPartyPersistentRouting `
        -PartyRoot $script:MihomoPartyRoot `
        -BackupRoot $backupRoot
    if (-not $persistent.Available) {
        Write-LaunchLog "Clash Party was not detected; using the current system network settings." "Gray"
        return
    }
    if (-not $persistent.Enabled) {
        if ($persistent.Mode -eq "direct") {
            Write-LaunchLog "Clash Party is already in direct mode." "Green"
        } else {
            Write-LaunchLog "Clash Party mode could not be repaired safely." "Yellow"
        }
        return
    }
    if ($persistent.Changed) {
        Write-LaunchLog "Clash Party tunnel routing was saved and the prior files were backed up." "Green"
    } else {
        Write-LaunchLog "Clash Party tunnel routing is ready." "Green"
    }

    $workConfigPath = Join-Path $script:MihomoPartyRoot "work\config.yaml"
    $control = Get-MihomoPartyControlContext -PartyRoot $script:MihomoPartyRoot
    if (-not $control -or
        -not (Test-Path -LiteralPath $workConfigPath -PathType Leaf)) {
        Write-LaunchLog "Clash Party is not running; the persistent rule will apply next time it opens." "Gray"
        return
    }

    $workCurrent = [IO.File]::ReadAllText($workConfigPath)
    $workUpdated = Set-MihomoWorkRoutingContent -Content $workCurrent
    $mihomoExe = Resolve-MihomoExecutable
    if ($workUpdated -cne $workCurrent) {
        $temporary = $workConfigPath + ".wyj-" + [Guid]::NewGuid().ToString("N")
        try {
            [IO.File]::WriteAllText(
                $temporary,
                $workUpdated,
                (New-Object Text.UTF8Encoding($false))
            )
            if (-not (Test-MihomoConfigurationFile -Path $temporary -MihomoExe $mihomoExe)) {
                throw "Clash Party work config validation failed; the original file was preserved."
            }
            Backup-MihomoPartyFile -Path $workConfigPath -BackupRoot $backupRoot
            Move-Item -LiteralPath $temporary -Destination $workConfigPath -Force
        } finally {
            Remove-Item -LiteralPath $temporary -Force -ErrorAction SilentlyContinue
        }
    }

    $reloadBody = @{ path = $workConfigPath } | ConvertTo-Json -Compress
    $reloaded = Invoke-MihomoNamedPipeRequest `
        -PipePath $control.Pipe `
        -Method "PUT" `
        -RequestPath "/configs?force=true" `
        -Body $reloadBody
    $modeSet = Invoke-MihomoNamedPipeRequest `
        -PipePath $control.Pipe `
        -Method "PATCH" `
        -RequestPath "/configs" `
        -Body '{"mode":"rule"}'
    if ($reloaded -or $modeSet) {
        Write-LaunchLog "Clash Party hot reload succeeded: cloudflared is DIRECT; other traffic remains GLOBAL." "Green"
    } else {
        Write-LaunchLog "Clash Party hot reload did not answer; the session guard will retry." "Yellow"
    }
    Start-MihomoTunnelGuard -ControlContext $control -WorkConfigPath $workConfigPath
    Write-LaunchLog "The proxy compatibility guard is active only for this manual session." "Green"
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

function Test-UrlWithPython {
    param(
        [Parameter(Mandatory = $true)][string]$Url,
        [ValidateRange(1, 60)][int]$TimeoutSec,
        [ValidateSet("api", "http")][string]$Mode,
        [string]$ExpectedBuild = ""
    )
    if (-not $script:PythonExe -or
        -not (Test-Path -LiteralPath $script:PythonExe -PathType Leaf)) {
        return $false
    }
    $probeCode = @'
import json
import os
import sys
import urllib.request

url = os.environ['WYJ_PROBE_URL']
timeout = float(os.environ['WYJ_PROBE_TIMEOUT'])
mode = os.environ['WYJ_PROBE_MODE']
expected = os.environ.get('WYJ_PROBE_EXPECTED', '')
user_agent = os.environ['WYJ_PROBE_USER_AGENT']
request = urllib.request.Request(
    url,
    headers={
        'Accept': 'application/json' if mode == 'api' else '*/*',
        'Cache-Control': 'no-store, no-cache',
        'Pragma': 'no-cache',
        'User-Agent': user_agent,
    },
)
try:
    with urllib.request.urlopen(request, timeout=timeout) as response:
        if not 200 <= response.status < 300:
            raise RuntimeError('unexpected HTTP status')
        if mode == 'api':
            payload = json.load(response)
            if payload.get('ok') is not True:
                raise RuntimeError('API is not ready')
            if expected and str(payload.get('build', '')) != expected:
                raise RuntimeError('backend build mismatch')
except Exception as error:
    print(type(error).__name__ + ': ' + str(error), file=sys.stderr)
    raise SystemExit(1)
print('OK')
'@
    if (-not (Test-Path -LiteralPath $ProbeTempRoot -PathType Container)) {
        New-Item -ItemType Directory -Path $ProbeTempRoot -Force | Out-Null
    }
    [IO.File]::WriteAllText(
        $PythonProbeScriptPath,
        $probeCode,
        (New-Object System.Text.UTF8Encoding($false))
    )

    $startInfo = New-Object System.Diagnostics.ProcessStartInfo
    $startInfo.FileName = $script:PythonExe
    $startInfo.Arguments = ConvertTo-QuotedNativePath -PathValue $PythonProbeScriptPath
    $startInfo.WorkingDirectory = $ProbeTempRoot
    $startInfo.UseShellExecute = $false
    $startInfo.CreateNoWindow = $true
    $startInfo.RedirectStandardInput = $true
    $startInfo.RedirectStandardOutput = $true
    $startInfo.RedirectStandardError = $true
    $startInfo.EnvironmentVariables["WYJ_PROBE_URL"] = $Url
    $startInfo.EnvironmentVariables["WYJ_PROBE_TIMEOUT"] = [string]$TimeoutSec
    $startInfo.EnvironmentVariables["WYJ_PROBE_MODE"] = $Mode
    $startInfo.EnvironmentVariables["WYJ_PROBE_EXPECTED"] = $ExpectedBuild
    $startInfo.EnvironmentVariables["WYJ_PROBE_USER_AGENT"] = $HealthProbeUserAgent
    $probeProcess = $null
    try {
        $probeProcess = New-Object System.Diagnostics.Process
        $probeProcess.StartInfo = $startInfo
        if (-not $probeProcess.Start()) { return $false }
        $probeProcess.StandardInput.Close()
        if (-not $probeProcess.WaitForExit($TimeoutSec * 1000)) {
            try { $probeProcess.Kill() } catch { }
            return $false
        }
        $probeResult = $probeProcess.StandardOutput.ReadToEnd().Trim()
        $null = $probeProcess.StandardError.ReadToEnd()
        return ($probeProcess.ExitCode -eq 0 -and $probeResult -eq "OK")
    } catch {
        return $false
    } finally {
        if ($null -ne $probeProcess) {
            try { $probeProcess.Dispose() } catch { }
        }
    }
}

function Test-ApiOk {
    param([Parameter(Mandatory = $true)][string]$Url, [int]$TimeoutSec = 6)
    $separator = if ($Url.Contains("?")) { "&" } else { "?" }
    $probeUrl = $Url + $separator + "launcher_probe=" + [Guid]::NewGuid().ToString("N")
    try {
        $result = Invoke-RestMethod -Uri $probeUrl -TimeoutSec $TimeoutSec -UserAgent $HealthProbeUserAgent -Headers @{
            "Accept" = "application/json"
            "Cache-Control" = "no-store, no-cache"
            "Pragma" = "no-cache"
        }
        if ($result.ok -ne $true) { return $false }
        if ($script:ExpectedBackendBuild -and ([string]$result.build -ne $script:ExpectedBackendBuild)) {
            return $false
        }
        return $true
    } catch {
        if ($Url.StartsWith("https://", [StringComparison]::OrdinalIgnoreCase) -and
            $script:PythonExe -and
            (Test-Path -LiteralPath $script:PythonExe -PathType Leaf)) {
            return Test-UrlWithPython -Url $probeUrl -TimeoutSec $TimeoutSec -Mode "api" -ExpectedBuild $script:ExpectedBackendBuild
        }
        return $false
    }
}

function Test-HttpOk {
    param([Parameter(Mandatory = $true)][string]$Url, [int]$TimeoutSec = 6)
    try {
        $response = Invoke-WebRequest -UseBasicParsing -Uri $Url -TimeoutSec $TimeoutSec -UserAgent $HealthProbeUserAgent -Headers @{
            "Cache-Control" = "no-cache"
            "Pragma" = "no-cache"
        }
        return ($response.StatusCode -ge 200 -and $response.StatusCode -lt 300)
    } catch {
        if ($Url.StartsWith("https://", [StringComparison]::OrdinalIgnoreCase) -and
            $script:PythonExe -and
            (Test-Path -LiteralPath $script:PythonExe -PathType Leaf)) {
            return Test-UrlWithPython -Url $Url -TimeoutSec $TimeoutSec -Mode "http"
        }
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

function Get-BackendFailureSummary {
    $lines = @(
        Get-TextFileTail -Path $BackendFailureLogPath -Lines 40 |
            Where-Object { -not [string]::IsNullOrWhiteSpace([string]$_) }
    )
    if (-not $lines.Count) { return "" }
    $preferred = @($lines | Where-Object { $_ -match 'ModuleNotFoundError|ImportError|SyntaxError|Error:|Exception:' })
    $selected = if ($preferred.Count) { [string]$preferred[-1] } else { [string]$lines[-1] }
    return ($selected -replace '\s+', ' ').Trim()
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
        [pscustomobject]@{ Code = "trial_single_language"; LegacyCode = "" },
        [pscustomobject]@{ Code = "dual_language_monthly"; LegacyCode = "" },
        [pscustomobject]@{ Code = "tools_monthly"; LegacyCode = "" },
        [pscustomobject]@{ Code = "all_access_monthly"; LegacyCode = "" },
        [pscustomobject]@{ Code = "japanese_lifetime"; LegacyCode = "dual_language_lifetime" },
        [pscustomobject]@{ Code = "all_access_lifetime"; LegacyCode = "" }
    )
    $validCount = 0
    $copiedCount = 0
    foreach ($method in @("wechat", "alipay")) {
        foreach ($plan in $plans) {
            $fileName = "${method}_$($plan.Code).png"
            $source = Join-Path $sourceRoot $fileName
            if ((-not (Test-PngFile -Path $source)) -and $plan.LegacyCode) {
                $source = Join-Path $sourceRoot "${method}_$($plan.LegacyCode).png"
            }
            $destination = Join-Path $destinationRoot $fileName
            if (Test-PngFile -Path $source) {
                $validCount++
                if (Copy-FileIfChanged -Source $source -Destination $destination) {
                    $copiedCount++
                }
            }
        }
        $historicalSource = Join-Path $sourceRoot "${method}_dual_language_lifetime.png"
        if (-not (Test-PngFile -Path $historicalSource)) {
            $historicalSource = Join-Path $sourceRoot "${method}_japanese_lifetime.png"
        }
        $historicalDestination = Join-Path $destinationRoot "${method}_dual_language_lifetime.png"
        if (Test-PngFile -Path $historicalSource) {
            $null = Copy-FileIfChanged -Source $historicalSource -Destination $historicalDestination
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
    $env:VOCAB_BACKEND_FAILURE_LOG = $BackendFailureLogPath
    if (Test-Path -LiteralPath $BackendFailureLogPath -PathType Leaf) {
        Remove-Item -LiteralPath ($BackendFailureLogPath + ".previous") -Force -ErrorAction SilentlyContinue
        Move-Item -LiteralPath $BackendFailureLogPath -Destination ($BackendFailureLogPath + ".previous") -Force
    }
    Write-LaunchLog "正在启动本地账户与支付后端..." "Yellow"
    $quotedRunScript = ConvertTo-QuotedNativePath -PathValue $runScript
    if (-not (Test-Path -LiteralPath $StateRoot -PathType Container)) {
        New-Item -ItemType Directory -Path $StateRoot -Force | Out-Null
    }
    if (-not (Test-Path -LiteralPath $BackendStandardInputPath -PathType Leaf)) {
        New-Item -ItemType File -Path $BackendStandardInputPath -Force | Out-Null
    }
    foreach ($logPath in @($BackendStandardOutputPath, $BackendStandardErrorPath)) {
        Set-Content -LiteralPath $logPath -Value "" -Encoding UTF8
    }
    $script:BackendLaunchProcess = Start-Process -FilePath $PowerShellExe -ArgumentList @(
        "-NoLogo", "-NoProfile", "-ExecutionPolicy", "Bypass", "-File", $quotedRunScript
    ) -WorkingDirectory $script:BackendRoot -WindowStyle Hidden -PassThru `
        -RedirectStandardInput $BackendStandardInputPath `
        -RedirectStandardOutput $BackendStandardOutputPath `
        -RedirectStandardError $BackendStandardErrorPath

    Start-Sleep -Milliseconds $BackendStartupProbeDelayMilliseconds
    $backendReady = Test-BackendReady
    if (-not $backendReady) {
        try { $script:BackendLaunchProcess.Refresh() } catch { }
        if ($script:BackendLaunchProcess.HasExited) {
            $summary = Get-BackendFailureSummary
            $detail = if ($summary) { "：$summary" } else { "" }
            throw "本地后端启动后立即退出（退出码 $($script:BackendLaunchProcess.ExitCode)）$detail"
        }
        throw "本地后端已作为独立后台进程启动，但 2 秒后的单次健康检查未通过。请查看 $BackendStandardErrorPath"
    }
    Set-Content -LiteralPath $BackendPidPath -Value ([string]$script:BackendLaunchProcess.Id) -Encoding ASCII
    Write-LaunchLog "本地账户与支付后端正常。" "Green"
}

function Test-PublicBackendReady {
    # Both URLs validate Pages Function -> Tunnel -> local backend. The Pages
    # hostname prevents a local custom-domain DNS/proxy issue from restarting
    # an otherwise healthy tunnel.
    foreach ($statusUrl in $PublicBackendStatusUrls) {
        if (Test-ApiOk -Url $statusUrl -TimeoutSec 6) { return $true }
    }
    return $false
}

function Get-TunnelHaConnections {
    try {
        $response = Invoke-WebRequest -UseBasicParsing -Uri $TunnelMetricsUrl -TimeoutSec 2
        $match = [regex]::Match(
            [string]$response.Content,
            '(?m)^cloudflared_tunnel_ha_connections\s+([0-9]+(?:\.[0-9]+)?)\s*$'
        )
        if ($match.Success) {
            return [int][Math]::Floor([double]$match.Groups[1].Value)
        }
    } catch { }
    return 0
}

function Get-TunnelDiagnosticSummary {
    if (-not $script:TunnelLog -or
        -not (Test-Path -LiteralPath $script:TunnelLog -PathType Leaf)) {
        return "暂无 Tunnel 日志"
    }
    try {
        $tail = (Get-Content -LiteralPath $script:TunnelLog -Encoding UTF8 -Tail 500) -join "`n"
        $findings = New-Object System.Collections.Generic.List[string]
        if ($tail -match 'HTTP/2 connection is blocked or unreachable|TLS handshake with edge error') {
            $findings.Add("HTTP/2 到 Cloudflare Edge 的连接不可用")
        }
        if ($tail -match 'timeout: no recent network activity|failed to dial to edge with quic') {
            $findings.Add("QUIC 曾发生网络超时并由 cloudflared 自动重连")
        }
        if ($tail -match 'Registered tunnel connection') {
            $findings.Add("日志中存在成功注册的 Tunnel 连接")
        }
        if ($findings.Count) { return ($findings -join "；") }
    } catch { }
    return "未识别到明确的 Tunnel 错误"
}

function Wait-ForStablePublicBackend {
    param(
        [ValidateRange(1, 600)][int]$Seconds,
        [Parameter(Mandatory = $true)][string]$Label,
        [ValidateRange(1, 20)][int]$StableSuccesses = 5,
        [ValidateRange(100, 10000)][int]$IntervalMilliseconds = 3000,
        $Process = $null
    )
    $deadline = (Get-Date).AddSeconds($Seconds)
    $consecutiveSuccesses = 0
    do {
        if ($null -ne $Process) {
            try {
                $Process.Refresh()
                if ($Process.HasExited) {
                    Write-Host ""
                    Write-LaunchLog ("$Label 进程已提前退出（退出码 $($Process.ExitCode)）。") "Yellow"
                    return $false
                }
            } catch { }
        }

        if (Test-PublicBackendReady) {
            $consecutiveSuccesses++
            if ($consecutiveSuccesses -ge $StableSuccesses) {
                Write-Host ""
                return $true
            }
        } else {
            $consecutiveSuccesses = 0
        }

        Write-Host "." -NoNewline
        $remainingMilliseconds = [Math]::Max(
            0,
            [int](($deadline - (Get-Date)).TotalMilliseconds)
        )
        if ($remainingMilliseconds -le 0) { break }
        Start-Sleep -Milliseconds ([Math]::Min($IntervalMilliseconds, $remainingMilliseconds))
    } while ((Get-Date) -lt $deadline)
    Write-Host ""
    Write-LaunchLog "$Label 在 $Seconds 秒内没有连续稳定就绪。" "Yellow"
    return $false
}

function Test-RecentQuicInstabilityWithHttp2Available {
    if (-not $script:TunnelLog -or
        -not (Test-Path -LiteralPath $script:TunnelLog -PathType Leaf)) {
        return $false
    }
    try {
        $tail = (Get-Content -LiteralPath $script:TunnelLog -Encoding UTF8 -Tail 800) -join "`n"
        $quicFailures = [regex]::Matches(
            $tail,
            'timeout: no recent network activity|failed to dial to edge with quic'
        ).Count
        if ($quicFailures -lt 4) { return $false }

        $lastHttp2Pass = $tail.LastIndexOf(
            "HTTP/2 connection successful",
            [StringComparison]::OrdinalIgnoreCase
        )
        $lastHttp2Failure = [Math]::Max(
            $tail.LastIndexOf(
                "HTTP/2 connection is blocked or unreachable",
                [StringComparison]::OrdinalIgnoreCase
            ),
            $tail.LastIndexOf(
                "TLS handshake with edge error",
                [StringComparison]::OrdinalIgnoreCase
            )
        )
        return ($lastHttp2Pass -ge 0 -and $lastHttp2Pass -gt $lastHttp2Failure)
    } catch {
        return $false
    }
}

function Get-PreferredTunnelProtocol {
    if (-not [string]::IsNullOrWhiteSpace($env:VOCAB_TUNNEL_PROTOCOL)) {
        $configured = $env:VOCAB_TUNNEL_PROTOCOL.Trim().ToLowerInvariant()
        if ($configured -in @("auto", "quic", "http2")) { return $configured }
    }
    if (Test-RecentQuicInstabilityWithHttp2Available) {
        Write-LaunchLog "检测到近期 QUIC 连续超时，且最新 HTTP/2 预检可用；本次优先使用 HTTP/2。" "Yellow"
        return "http2"
    }
    if (Test-Path -LiteralPath $ProtocolStatePath -PathType Leaf) {
        $saved = (Get-Content -Raw -Encoding UTF8 -LiteralPath $ProtocolStatePath).Trim().ToLowerInvariant()
        if ($saved -in @("auto", "quic", "http2")) { return $saved }
    }
    return "auto"
}

function Save-PreferredTunnelProtocol {
    param([ValidateSet("auto", "http2", "quic")][string]$Protocol)
    Set-Content -LiteralPath $ProtocolStatePath -Value $Protocol -Encoding ASCII
}

function Start-TunnelProcess {
    param([ValidateSet("auto", "http2", "quic")][string]$Protocol)
    $arguments = @(
        "tunnel", "--config", (ConvertTo-QuotedNativePath -PathValue $script:TunnelConfig),
        "--protocol", $Protocol, "--edge-ip-version", "4",
        "--retries", "8",
        "--metrics", "127.0.0.1:20241",
        "--loglevel", "info", "--logfile", (ConvertTo-QuotedNativePath -PathValue $script:TunnelLog),
        "run", "japanese-local-backend"
    )
    Write-LaunchLog ("启动 Tunnel 传输协议: " + $Protocol.ToUpperInvariant())
    if (-not (Test-Path -LiteralPath $TunnelStandardInputPath -PathType Leaf)) {
        New-Item -ItemType File -Path $TunnelStandardInputPath -Force | Out-Null
    }
    return Start-Process -FilePath $script:CloudflaredExe -ArgumentList $arguments `
        -WorkingDirectory $script:BackendRoot -WindowStyle Hidden -PassThru `
        -RedirectStandardInput $TunnelStandardInputPath `
        -RedirectStandardOutput $TunnelStandardOutputPath `
        -RedirectStandardError $TunnelStandardErrorPath
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
    $script:CloudflaredExe = Resolve-CloudflaredExecutable
    if (-not $script:CloudflaredExe) {
        throw "找不到 cloudflared。请放入运行目录 tools，或设置 VOCAB_CLOUDFLARED_EXE。"
    }
    if (-not (Test-Path -LiteralPath $script:TunnelConfig -PathType Leaf)) {
        throw "找不到 Tunnel 配置。请设置 VOCAB_TUNNEL_CONFIG。"
    }

    $connectorConnections = Get-TunnelHaConnections
    if (Test-PublicBackendReady) {
        if (Wait-ForStablePublicBackend -Seconds 20 -Label "现有固定 Tunnel" -StableSuccesses 5 -IntervalMilliseconds 3000) {
            Write-LaunchLog "固定 Tunnel 与 Pages 代理连续稳定。" "Green"
            return
        }
        Write-LaunchLog "现有 Tunnel 响应不稳定，准备主动重连。" "Yellow"
    } elseif ($connectorConnections -gt 0) {
        Write-LaunchLog (
            "Tunnel 显示 $connectorConnections 条活动连接，但公网接口不可用；" +
            "先等待短暂网络抖动恢复。"
        ) "Yellow"
        if (Wait-ForStablePublicBackend -Seconds 20 -Label "现有固定 Tunnel 恢复" -StableSuccesses 3 -IntervalMilliseconds 2500) {
            Write-LaunchLog "公网接口已自行恢复。" "Green"
            return
        }
        Write-LaunchLog "连接指标与实际公网状态不一致，准备主动重连。" "Yellow"
    }

    Write-LaunchLog "正在恢复固定 Tunnel..." "Yellow"
    $existing = @(Get-ManagedTunnelProcesses)
    if ($existing) {
        $existing | Stop-Process -Force
        $existing | Wait-Process -Timeout 10 -ErrorAction SilentlyContinue
    }

    $preferred = Get-PreferredTunnelProtocol
    $protocols = New-Object System.Collections.Generic.List[string]
    foreach ($protocol in @($preferred, "auto", "quic", "http2")) {
        if (-not $protocols.Contains($protocol)) { $protocols.Add($protocol) }
    }
    $lastProcess = $null
    foreach ($protocol in $protocols) {
        $lastProcess = Start-TunnelProcess -Protocol $protocol
        $waitSeconds = if ($protocol -eq "auto") { 65 } else { 45 }
        if (Wait-ForStablePublicBackend -Seconds $waitSeconds -Label ("Tunnel " + $protocol.ToUpperInvariant()) -StableSuccesses 1 -IntervalMilliseconds 2500 -Process $lastProcess) {
            Save-PreferredTunnelProtocol -Protocol $protocol
            Write-LaunchLog ("固定 Tunnel 已恢复并记住 " + $protocol.ToUpperInvariant() + "。") "Green"
            return
        }
        if ($lastProcess -and -not $lastProcess.HasExited) {
            Stop-Process -Id $lastProcess.Id -Force
            $lastProcess | Wait-Process -Timeout 10 -ErrorAction SilentlyContinue
        }
        Write-LaunchLog "当前传输方式没有稳定恢复，继续尝试下一种方式..." "Yellow"
    }
    try {
        $null = Start-TunnelProcess -Protocol "auto"
        Save-PreferredTunnelProtocol -Protocol "auto"
        Write-LaunchLog "所有传输方式均未稳定；已保留 AUTO 在后台继续自动回退与重连。" "Yellow"
    } catch {
        Write-LaunchLog ("无法保留 Tunnel 后台重连: " + $_.Exception.Message) "Yellow"
    }
    throw "AUTO、QUIC 与 HTTP/2 均未恢复公网连接。"
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

function Get-ManagedWatchdogProcesses {
    $managed = @()
    $watchdogFullPath = [IO.Path]::GetFullPath($WatchdogScript)
    foreach ($process in @(Get-Process -Name "powershell" -ErrorAction SilentlyContinue)) {
        $commandLine = ""
        try {
            $commandLine = [string](Get-CimInstance Win32_Process -Filter "ProcessId=$($process.Id)" -ErrorAction Stop).CommandLine
        } catch { }
        if ($commandLine -and
            $commandLine.IndexOf($watchdogFullPath, [StringComparison]::OrdinalIgnoreCase) -ge 0) {
            $managed += $process
        }
    }
    return @($managed)
}

function Ensure-Watchdog {
    if (-not (Test-Path -LiteralPath $WatchdogScript -PathType Leaf)) {
        throw "找不到网络守护程序。"
    }
    $existing = @(Get-ManagedWatchdogProcesses)
    if ($existing.Count) {
        Write-LaunchLog "正在替换旧版或已存在的守护程序..." "Yellow"
        $existing | Stop-Process -Force -ErrorAction SilentlyContinue
        $existing | Wait-Process -Timeout 10 -ErrorAction SilentlyContinue
    }
    $env:VOCAB_PYTHON_EXE = $script:PythonExe
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
    Write-Host ("源码定位方式: " + $(if ($SourceRoot -or $env:VOCAB_SOURCE_ROOT) { "显式配置" } else { "自动识别" }))
    Write-Host ("私有运行目录存在: " + $runtimeExists)
    Write-Host ("运行配置存在: " + $settingsExists)
    Write-Host ("Python 可用: " + [bool]$script:PythonExe)
    Write-Host ("cloudflared 可用: " + [bool]$script:CloudflaredExe)
    Write-Host ("Tunnel 配置存在: " + $tunnelConfigExists)
    Write-Host ("私有支付二维码: $qrCount/12")
    Write-Host ("本地后端在线: " + (Test-BackendReady))
    Write-Host ("公网后端在线: " + (Test-PublicBackendReady))
    Write-Host ("启动日志: " + $LauncherLog)
    Write-Host ("失败报告: " + $ErrorReportPath)
    Write-Host ""
    return ($sourceOk -and [bool]$script:PythonExe)
}

function Invoke-WyjLauncher {
    $script:LaunchStartedAt = Get-Date
    $script:CurrentPhase = "初始化启动器"
    Initialize-LauncherState
    $createdNew = $false
    $mutex = New-Object System.Threading.Mutex($true, "Local\WYJWebsiteLauncherV3", [ref]$createdNew)
    $ownsMutex = $createdNew
    try {
        if (-not $ownsMutex) {
            Write-LaunchLog "另一个启动程序正在运行，最多等待 15 秒..." "Yellow"
            try {
                $ownsMutex = $mutex.WaitOne(15000)
            } catch [Threading.AbandonedMutexException] {
                $ownsMutex = $true
            }
            if (-not $ownsMutex) {
                throw "另一个启动程序仍在运行；已停止本次重复启动。"
            }
        }
        if ($script:DuplicatePathWasRepaired) {
            Write-LaunchLog "已修复当前进程中重复的 Path/PATH 环境变量。" "Green"
        }
        Write-LaunchLog ("=== WYJ 网站启动与自修复 V" + $LauncherVersion + " ===") "Cyan"
        $script:CurrentPhase = "定位网站源码"
        $resolvedSource = Resolve-SourceRoot
        Set-ResolvedSourcePaths -ResolvedSourceRoot $resolvedSource
        $script:CurrentPhase = "定位私有运行目录"
        $resolvedRoot = Resolve-RuntimeRoot
        Set-ResolvedRuntimePaths -BackendRoot $resolvedRoot
        if (-not $CheckOnly) {
            Save-LauncherConfig -BackendRoot $resolvedRoot -SourceRootValue $resolvedSource
        }
        $script:CurrentPhase = "检查 Python 与源码"
        $script:PythonExe = Resolve-PythonExecutable
        Test-SourceLayout
        Read-ExpectedBackendBuild

        if ($CheckOnly) {
            $script:CurrentPhase = "只读组件检查"
            if (Show-ConfigurationReport) { return 0 }
            return 2
        }

        $script:CurrentPhase = "准备私有运行目录"
        Disable-LegacyAutoStart
        Ensure-RuntimeLayout
        $script:CurrentPhase = "同步后端代码与付款资源"
        $sourceChanged = Sync-BackendSource
        $null = Sync-PrivatePaymentAssets
        if ($sourceChanged) {
            Write-LaunchLog "后端代码与数据库迁移已原子同步。" "Green"
        } else {
            Write-LaunchLog "后端代码与数据库迁移已是最新版本。" "Green"
        }

        $script:CurrentPhase = "启动本地账户与支付后端"
        Ensure-Backend -RestartRequired:$sourceChanged
        $script:CurrentPhase = "修复 Tunnel 本地上游"
        Repair-TunnelOriginAddress
        $script:CurrentPhase = "Clash Party tunnel compatibility"
        Repair-MihomoPartyTunnelRouting
        $script:CurrentPhase = "恢复固定 Tunnel"
        Ensure-Tunnel

        $aiReady = $true
        $script:CurrentPhase = "启动可选本地 AI"
        try {
            Ensure-Ollama
        } catch {
            $aiReady = $false
            Write-LaunchLog ("本地 AI 暂未就绪: " + $_.Exception.Message) "Yellow"
        }

        $script:CurrentPhase = "检查正式网站"
        if (-not (Test-HttpOk -Url $SiteUrl -TimeoutSec 12)) {
            throw "正式网站首页暂时无法访问。"
        }
        if (-not (Wait-ForStablePublicBackend -Seconds 12 -Label "正式账户与支付接口" -StableSuccesses 3 -IntervalMilliseconds 2000)) {
            throw "固定 Tunnel 在启动完成前再次失去连接。"
        }
        Write-LaunchLog "网站、账户、会员与支付服务均已就绪。" "Green"
        if (-not $aiReady) {
            Write-LaunchLog "AI 选词与首次释义判卷稍后可由守护程序继续恢复。" "Yellow"
        }
        if (-not $SkipWatchdog) {
            $script:CurrentPhase = "刷新持续在线守护"
            Ensure-Watchdog
        }
        if (-not $NoBrowser) {
            Start-Process $SiteUrl
        }
        $script:CurrentPhase = "完成"
        Write-LaunchLog "启动完成。" "Cyan"
        return 0
    } catch {
        $failure = $_
        Write-LaunchLog ("启动失败: " + $failure.Exception.Message) "Red"
        $reportPath = Write-LauncherErrorReport -ErrorRecord $failure
        Write-LaunchLog ("已自动导出错误报告: " + $reportPath) "Yellow"
        Write-LaunchLog ("修复后可重新双击启动；也可使用 -CheckOnly 只检查组件。") "Yellow"
        return 1
    } finally {
        if ($ownsMutex) {
            $mutex.ReleaseMutex()
        }
        $mutex.Dispose()
    }
}

if ($MyInvocation.InvocationName -ne ".") {
    exit (Invoke-WyjLauncher)
}
