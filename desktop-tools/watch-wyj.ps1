param(
    [ValidateRange(15, 300)][int]$IntervalSeconds = 25
)

$ErrorActionPreference = "Continue"
[Net.ServicePointManager]::SecurityProtocol = [Net.SecurityProtocolType]::Tls12

Add-Type @"
using System.Runtime.InteropServices;
public static class WYJPowerState {
    [DllImport("kernel32.dll")]
    private static extern uint SetThreadExecutionState(uint flags);
    public static void KeepSystemAwake() { SetThreadExecutionState(0x80000001); }
    public static void RestoreDefaults() { SetThreadExecutionState(0x80000000); }
}
"@

$WatchdogVersion = "3.0.0"
$Launcher = Join-Path $PSScriptRoot "start-wyj.ps1"
$PowerShellExe = Join-Path $env:SystemRoot "System32\WindowsPowerShell\v1.0\powershell.exe"
$EntryRoot = if (-not [string]::IsNullOrWhiteSpace($env:WYJ_LAUNCHER_ENTRY_DIR)) {
    [IO.Path]::GetFullPath([Environment]::ExpandEnvironmentVariables($env:WYJ_LAUNCHER_ENTRY_DIR).Trim().Trim('"'))
} else {
    $PSScriptRoot
}
$LogPath = Join-Path $EntryRoot "守护日志.txt"
$LocalStatusUrl = "http://127.0.0.1:8765/api/status"
$OllamaStatusUrl = "http://127.0.0.1:11434/api/tags"
$PublicStatusUrls = @(
    "https://api.thewyj.uk/api/status",
    "https://thewyj.uk/api/status"
)
$WebsiteRepairCooldownSeconds = 120
$AiRepairCooldownSeconds = 600
$RepairFailureLimit = 3
$RepairSuspendSeconds = 1800
$RepairTimeoutMilliseconds = 480000

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

$null = Repair-DuplicatePathEnvironment

function Initialize-WatchdogState {
    if (-not (Test-Path -LiteralPath $EntryRoot -PathType Container)) {
        New-Item -ItemType Directory -Path $EntryRoot -Force | Out-Null
    }
}

function Write-WatchdogLog {
    param([string]$Message)
    try {
        if ((Test-Path -LiteralPath $LogPath) -and ((Get-Item -LiteralPath $LogPath).Length -gt 1MB)) {
            Remove-Item -LiteralPath ($LogPath + ".previous") -Force -ErrorAction SilentlyContinue
            Move-Item -LiteralPath $LogPath -Destination ($LogPath + ".previous") -Force
        }
        Add-Content -LiteralPath $LogPath -Encoding UTF8 -Value ("{0} {1}" -f (Get-Date -Format "yyyy-MM-dd HH:mm:ss"), $Message)
    } catch { }
}

function Test-Endpoint {
    param([string]$Url, [switch]$RequireOk)
    try {
        $separator = if ($Url.Contains("?")) { "&" } else { "?" }
        $probeUrl = $Url + $separator + "watchdog_probe=" + [Guid]::NewGuid().ToString("N")
        $result = Invoke-RestMethod -Uri $probeUrl -TimeoutSec 8 -Headers @{ "Cache-Control" = "no-store, no-cache" }
        if ($RequireOk) { return ($result.ok -eq $true) }
        return ($null -ne $result)
    } catch {
        return $false
    }
}

function Get-RepairDelaySeconds {
    param(
        [ValidateRange(1, 100)][int]$FailureStreak,
        [ValidateRange(1, 3600)][int]$BaseCooldownSeconds
    )
    if ($FailureStreak -ge $RepairFailureLimit) {
        return $RepairSuspendSeconds
    }
    $multiplier = [Math]::Pow(2, [Math]::Max(0, $FailureStreak - 1))
    return [int][Math]::Min($RepairSuspendSeconds, $BaseCooldownSeconds * $multiplier)
}

function Test-LauncherBusy {
    $createdNew = $false
    $probe = $null
    try {
        $probe = New-Object System.Threading.Mutex($true, "Local\WYJWebsiteLauncherV3", [ref]$createdNew)
        if ($createdNew) {
            $probe.ReleaseMutex()
            return $false
        }
        return $true
    } catch {
        return $true
    } finally {
        if ($null -ne $probe) { $probe.Dispose() }
    }
}

function Start-Repair {
    param([string]$Reason)
    if (-not (Test-Path -LiteralPath $Launcher -PathType Leaf)) {
        Write-WatchdogLog "repair skipped: launcher missing"
        return $false
    }
    Write-WatchdogLog ("starting automatic repair: " + $Reason)
    try {
        $quotedLauncher = '"' + $Launcher + '"'
        $repair = Start-Process -FilePath $PowerShellExe -ArgumentList @(
            "-NoLogo", "-NoProfile", "-ExecutionPolicy", "Bypass", "-File", $quotedLauncher,
            "-Unattended", "-NoBrowser", "-SkipWatchdog"
        ) -WorkingDirectory $PSScriptRoot -WindowStyle Hidden -PassThru
        $finished = $repair.WaitForExit($RepairTimeoutMilliseconds)
        if (-not $finished) {
            Write-WatchdogLog ("automatic repair timed out after {0} seconds" -f ($RepairTimeoutMilliseconds / 1000))
            Stop-Process -Id $repair.Id -Force -ErrorAction SilentlyContinue
            return $false
        }
        Write-WatchdogLog ("automatic repair exit code: " + $repair.ExitCode)
        return ($repair.ExitCode -eq 0)
    } catch {
        Write-WatchdogLog ("automatic repair failed: " + $_.Exception.Message)
        return $false
    }
}

function Update-RepairBackoff {
    param(
        [Parameter(Mandatory = $true)][string]$Service,
        [Parameter(Mandatory = $true)][bool]$Succeeded,
        [Parameter(Mandatory = $true)][ref]$FailureStreak,
        [Parameter(Mandatory = $true)][ref]$NextRepairAt,
        [ValidateRange(1, 3600)][int]$BaseCooldownSeconds
    )
    if ($Succeeded) {
        $FailureStreak.Value = 0
        $NextRepairAt.Value = (Get-Date).AddSeconds($BaseCooldownSeconds)
        return
    }
    $FailureStreak.Value++
    $delay = Get-RepairDelaySeconds -FailureStreak $FailureStreak.Value -BaseCooldownSeconds $BaseCooldownSeconds
    $NextRepairAt.Value = (Get-Date).AddSeconds($delay)
    if ($FailureStreak.Value -ge $RepairFailureLimit) {
        Write-WatchdogLog ("{0} repair failed {1} consecutive times; suspended for {2} minutes" -f $Service, $FailureStreak.Value, ($delay / 60))
    } else {
        Write-WatchdogLog ("{0} repair failed; retry delayed for {1} seconds" -f $Service, $delay)
    }
}

Initialize-WatchdogState
$createdNew = $false
$mutex = New-Object System.Threading.Mutex($true, "Local\WYJWebsiteWatchdogV2", [ref]$createdNew)
if (-not $createdNew) {
    $mutex.Dispose()
    exit 0
}

try {
    [WYJPowerState]::KeepSystemAwake()
    Write-WatchdogLog ("watchdog V" + $WatchdogVersion + " started")
    $websiteFailures = 0
    $aiFailures = 0
    $websiteRepairFailureStreak = 0
    $aiRepairFailureStreak = 0
    $nextWebsiteRepairAt = [datetime]::MinValue
    $nextAiRepairAt = [datetime]::MinValue

    while ($true) {
        Start-Sleep -Seconds $IntervalSeconds
        $localOk = Test-Endpoint -Url $LocalStatusUrl -RequireOk
        $publicOk = $true
        foreach ($publicStatusUrl in $PublicStatusUrls) {
            if (-not (Test-Endpoint -Url $publicStatusUrl -RequireOk)) {
                $publicOk = $false
                break
            }
        }
        $ollamaOk = Test-Endpoint -Url $OllamaStatusUrl

        if ($localOk -and $publicOk) {
            $websiteFailures = 0
            $websiteRepairFailureStreak = 0
        } else {
            $websiteFailures++
            Write-WatchdogLog ("website health failure {0}/2 local={1} public={2}" -f $websiteFailures, $localOk, $publicOk)
        }

        if ($ollamaOk) {
            $aiFailures = 0
            $aiRepairFailureStreak = 0
        } else {
            $aiFailures++
            if ($aiFailures -eq 1 -or $aiFailures -eq 3) {
                Write-WatchdogLog ("AI health failure {0}/3" -f $aiFailures)
            }
        }

        $now = Get-Date
        if ($websiteFailures -ge 2 -and $now -ge $nextWebsiteRepairAt) {
            if (Test-LauncherBusy) {
                Write-WatchdogLog "website repair deferred: launcher is already running"
                $websiteFailures = 0
                $nextWebsiteRepairAt = $now.AddSeconds(60)
                continue
            }
            $repairOk = Start-Repair -Reason "website"
            Update-RepairBackoff -Service "website" -Succeeded $repairOk `
                -FailureStreak ([ref]$websiteRepairFailureStreak) `
                -NextRepairAt ([ref]$nextWebsiteRepairAt) `
                -BaseCooldownSeconds $WebsiteRepairCooldownSeconds
            $websiteFailures = 0
            Start-Sleep -Seconds 15
            continue
        }

        if ($aiFailures -ge 3 -and $now -ge $nextAiRepairAt) {
            if (Test-LauncherBusy) {
                Write-WatchdogLog "AI repair deferred: launcher is already running"
                $aiFailures = 0
                $nextAiRepairAt = $now.AddSeconds(60)
                continue
            }
            $repairOk = Start-Repair -Reason "AI"
            Update-RepairBackoff -Service "AI" -Succeeded $repairOk `
                -FailureStreak ([ref]$aiRepairFailureStreak) `
                -NextRepairAt ([ref]$nextAiRepairAt) `
                -BaseCooldownSeconds $AiRepairCooldownSeconds
            $aiFailures = 0
            Start-Sleep -Seconds 15
        }
    }
} finally {
    [WYJPowerState]::RestoreDefaults()
    if ($createdNew) { $mutex.ReleaseMutex() }
    $mutex.Dispose()
}
