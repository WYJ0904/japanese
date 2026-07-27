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

$Launcher = Join-Path $PSScriptRoot "start-wyj.ps1"
$PowerShellExe = Join-Path $env:SystemRoot "System32\WindowsPowerShell\v1.0\powershell.exe"
$StateRoot = Join-Path $env:LOCALAPPDATA "WYJJapanese"
$LogPath = Join-Path $StateRoot "watchdog.log"
$LocalStatusUrl = "http://127.0.0.1:8765/api/status"
$OllamaStatusUrl = "http://127.0.0.1:11434/api/tags"
$PublicStatusUrl = "https://thewyj.uk/api/status"
$WebsiteRepairCooldownSeconds = 120
$AiRepairCooldownSeconds = 600
$RepairTimeoutMilliseconds = 480000

function Initialize-WatchdogState {
    if (-not (Test-Path -LiteralPath $StateRoot)) {
        New-Item -ItemType Directory -Path $StateRoot -Force | Out-Null
    }
}

function Write-WatchdogLog {
    param([string]$Message)
    try {
        if ((Test-Path -LiteralPath $LogPath) -and ((Get-Item -LiteralPath $LogPath).Length -gt 1MB)) {
            Remove-Item -LiteralPath ($LogPath + ".old") -Force -ErrorAction SilentlyContinue
            Move-Item -LiteralPath $LogPath -Destination ($LogPath + ".old") -Force
        }
        Add-Content -LiteralPath $LogPath -Encoding UTF8 -Value ("{0} {1}" -f (Get-Date -Format "yyyy-MM-dd HH:mm:ss"), $Message)
    } catch { }
}

function Test-Endpoint {
    param([string]$Url, [switch]$RequireOk)
    try {
        $result = Invoke-RestMethod -Uri $Url -TimeoutSec 8 -Headers @{ "Cache-Control" = "no-cache" }
        if ($RequireOk) { return ($result.ok -eq $true) }
        return ($null -ne $result)
    } catch {
        return $false
    }
}

function Start-Repair {
    param([string]$Reason)
    if (-not (Test-Path -LiteralPath $Launcher -PathType Leaf)) {
        Write-WatchdogLog "repair skipped: launcher missing"
        return
    }
    Write-WatchdogLog ("starting automatic repair: " + $Reason)
    try {
        $quotedLauncher = '"' + $Launcher + '"'
        $repair = Start-Process -FilePath $PowerShellExe -ArgumentList @(
            "-NoLogo", "-NoProfile", "-ExecutionPolicy", "Bypass", "-File", $quotedLauncher,
            "-Unattended", "-NoBrowser", "-SkipWatchdog"
        ) -WorkingDirectory $PSScriptRoot -WindowStyle Hidden -PassThru
        $finished = $repair.WaitForExit($RepairTimeoutMilliseconds)
        if ($finished) {
            Write-WatchdogLog ("automatic repair exit code: " + $repair.ExitCode)
        } else {
            Write-WatchdogLog ("automatic repair timed out after {0} seconds" -f ($RepairTimeoutMilliseconds / 1000))
            Stop-Process -Id $repair.Id -Force -ErrorAction SilentlyContinue
        }
    } catch {
        Write-WatchdogLog ("automatic repair failed: " + $_.Exception.Message)
    }
}

Initialize-WatchdogState
$createdNew = $false
$mutex = New-Object System.Threading.Mutex($true, "Local\WYJWebsiteWatchdogV1", [ref]$createdNew)
if (-not $createdNew) {
    $mutex.Dispose()
    exit 0
}

try {
    [WYJPowerState]::KeepSystemAwake()
    Write-WatchdogLog "watchdog V2 started"
    $websiteFailures = 0
    $aiFailures = 0
    $lastWebsiteRepairAt = [datetime]::MinValue
    $lastAiRepairAt = [datetime]::MinValue

    while ($true) {
        Start-Sleep -Seconds $IntervalSeconds
        $localOk = Test-Endpoint -Url $LocalStatusUrl -RequireOk
        $publicOk = Test-Endpoint -Url $PublicStatusUrl -RequireOk
        $ollamaOk = Test-Endpoint -Url $OllamaStatusUrl

        if ($localOk -and $publicOk) {
            $websiteFailures = 0
        } else {
            $websiteFailures++
            Write-WatchdogLog ("website health failure {0}/2 local={1} public={2}" -f $websiteFailures, $localOk, $publicOk)
        }

        if ($ollamaOk) {
            $aiFailures = 0
        } else {
            $aiFailures++
            if ($aiFailures -eq 1 -or $aiFailures -eq 3) {
                Write-WatchdogLog ("AI health failure {0}/3" -f $aiFailures)
            }
        }

        if ($websiteFailures -ge 2 -and
            ((Get-Date) - $lastWebsiteRepairAt).TotalSeconds -ge $WebsiteRepairCooldownSeconds) {
            $lastWebsiteRepairAt = Get-Date
            Start-Repair -Reason "website"
            $websiteFailures = 0
            Start-Sleep -Seconds 15
            continue
        }

        if ($aiFailures -ge 3 -and
            ((Get-Date) - $lastAiRepairAt).TotalSeconds -ge $AiRepairCooldownSeconds) {
            $lastAiRepairAt = Get-Date
            Start-Repair -Reason "AI"
            $aiFailures = 0
            Start-Sleep -Seconds 15
        }
    }
} finally {
    [WYJPowerState]::RestoreDefaults()
    if ($createdNew) { $mutex.ReleaseMutex() }
    $mutex.Dispose()
}
