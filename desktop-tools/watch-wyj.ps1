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
$LogPath = Join-Path $PSScriptRoot "watchdog.log"
$LocalStatusUrl = "http://127.0.0.1:8765/api/status"
$OllamaStatusUrl = "http://127.0.0.1:11434/api/tags"
$PublicStatusUrl = "https://thewyj.uk/api/status"
$WebsiteRepairCooldownSeconds = 120
$AiRepairCooldownSeconds = 600

function Write-WatchdogLog {
    param([string]$Message)
    try {
        if ((Test-Path -LiteralPath $LogPath) -and ((Get-Item -LiteralPath $LogPath).Length -gt 1MB)) {
            Remove-Item -LiteralPath ($LogPath + ".old") -Force -ErrorAction SilentlyContinue
            Move-Item -LiteralPath $LogPath -Destination ($LogPath + ".old") -Force
        }
        Add-Content -LiteralPath $LogPath -Encoding UTF8 -Value ("{0} {1}" -f (Get-Date -Format "yyyy-MM-dd HH:mm:ss"), $Message)
    } catch {}
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

$createdNew = $false
$mutex = New-Object System.Threading.Mutex($true, "Local\WYJWebsiteWatchdogV1", [ref]$createdNew)
if (-not $createdNew) {
    $mutex.Dispose()
    exit 0
}

try {
    [WYJPowerState]::KeepSystemAwake()
    Write-WatchdogLog "watchdog started"
    $consecutiveFailures = 0
    $lastRepairAt = [datetime]::MinValue
    while ($true) {
        Start-Sleep -Seconds $IntervalSeconds
        $localOk = Test-Endpoint -Url $LocalStatusUrl -RequireOk
        $ollamaOk = Test-Endpoint -Url $OllamaStatusUrl
        $publicOk = Test-Endpoint -Url $PublicStatusUrl -RequireOk
        if ($localOk -and $ollamaOk -and $publicOk) {
            $consecutiveFailures = 0
            continue
        }

        $consecutiveFailures++
        Write-WatchdogLog ("health failure {0}/2 local={1} ollama={2} public={3}" -f $consecutiveFailures, $localOk, $ollamaOk, $publicOk)
        if ($consecutiveFailures -lt 2) { continue }

        $repairCooldown = if ((-not $localOk) -or (-not $publicOk)) { $WebsiteRepairCooldownSeconds } else { $AiRepairCooldownSeconds }
        if (((Get-Date) - $lastRepairAt).TotalSeconds -lt $repairCooldown) {
            continue
        }

        Write-WatchdogLog "starting automatic repair"
        $lastRepairAt = Get-Date
        try {
            $repair = Start-Process -FilePath $PowerShellExe -ArgumentList @(
                "-NoProfile", "-ExecutionPolicy", "Bypass", "-File", $Launcher, "-NoBrowser", "-SkipWatchdog"
            ) -WorkingDirectory $PSScriptRoot -WindowStyle Hidden -PassThru
            $finished = $repair.WaitForExit(240000)
            if ($finished) {
                Write-WatchdogLog ("automatic repair exit code: " + $repair.ExitCode)
            } else {
                Write-WatchdogLog "automatic repair timed out after 240 seconds"
                Stop-Process -Id $repair.Id -Force -ErrorAction SilentlyContinue
            }
        } catch {
            Write-WatchdogLog ("automatic repair failed: " + $_.Exception.Message)
        }
        $consecutiveFailures = 0
        Start-Sleep -Seconds 15
    }
} finally {
    [WYJPowerState]::RestoreDefaults()
    if ($createdNew) { $mutex.ReleaseMutex() }
    $mutex.Dispose()
}
