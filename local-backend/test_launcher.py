import os
import shutil
import subprocess
import tempfile
import textwrap
import time
import unittest
from pathlib import Path


ROOT = Path(__file__).resolve().parents[1]
POWERSHELL = shutil.which("powershell.exe") or shutil.which("powershell")


@unittest.skipUnless(os.name == "nt" and POWERSHELL, "Windows PowerShell launcher test")
class LauncherStabilityTests(unittest.TestCase):
    def run_powershell(self, script, *, environment=None, timeout=20):
        completed = subprocess.run(
            [
                POWERSHELL,
                "-NoLogo",
                "-NoProfile",
                "-ExecutionPolicy",
                "Bypass",
                "-Command",
                script,
            ],
            cwd=ROOT,
            env=environment,
            capture_output=True,
            text=True,
            encoding="utf-8",
            errors="replace",
            timeout=timeout,
            check=False,
        )
        self.assertEqual(
            completed.returncode,
            0,
            f"stdout:\n{completed.stdout}\nstderr:\n{completed.stderr}",
        )
        return completed

    def test_early_backend_exit_is_detected_and_report_is_exported(self):
        launcher = ROOT / "desktop-tools" / "start-wyj.ps1"
        with tempfile.TemporaryDirectory() as directory:
            temporary = Path(directory)
            failure_log = temporary / "后台启动错误.txt"
            report = temporary / "启动错误报告.txt"
            launcher_log = temporary / "启动日志.txt"
            runtime = temporary / "runtime"
            runtime.mkdir()
            for relative in (
                "server.py",
                "account_store.py",
                "membership.py",
                "payment_assets.py",
                "temporary_store.py",
                "vocabulary_index.py",
                "run.ps1",
            ):
                (runtime / relative).write_text("", encoding="utf-8")
            (runtime / "migrations").mkdir()
            (runtime / "migrations" / "004_payment_flow_up.sql").write_text(
                "", encoding="utf-8"
            )
            script = textwrap.dedent(
                f"""
                . '{launcher}'
                function Test-BackendReady {{ return $false }}
                function Get-ListeningProcessIds {{ return @() }}
                $script:BackendFailureLogPath = '{failure_log}'
                $script:ErrorReportPath = '{report}'
                $script:LauncherLog = '{launcher_log}'
                $script:LauncherEntryRoot = '{temporary}'
                $script:StateRoot = '{temporary}'
                $script:BackendRoot = '{runtime}'
                $script:FrontendRoot = ''
                $script:ExpectedBackendBuild = 'test-build'
                $script:CurrentPhase = 'fault injection'
                $process = Start-Process -FilePath $env:ComSpec -ArgumentList @('/c', 'exit 7') -PassThru -WindowStyle Hidden
                $clock = [Diagnostics.Stopwatch]::StartNew()
                $ready = Wait-ForBackendStartup -Process $process -Seconds 10
                $clock.Stop()
                if ($ready) {{ throw 'unexpected readiness' }}
                if ($clock.Elapsed.TotalSeconds -ge 5) {{ throw 'early exit was not detected' }}
                Set-Content -LiteralPath $script:BackendFailureLogPath -Encoding UTF8 -Value 'ModuleNotFoundError: No module named payment_assets'
                if ((Get-BackendFailureSummary) -notmatch 'ModuleNotFoundError') {{ throw 'failure summary missing' }}
                try {{ throw 'synthetic launcher failure' }} catch {{ $exported = Write-LauncherErrorReport -ErrorRecord $_ }}
                if (-not (Test-Path -LiteralPath $exported -PathType Leaf)) {{ throw 'report missing' }}
                $text = Get-Content -Raw -Encoding UTF8 -LiteralPath $exported
                if ($text -notmatch 'fault injection' -or $text -notmatch 'synthetic launcher failure') {{ throw 'report content missing' }}
                if ($text -match 'share_hmac_key|access_token|tunnel_token') {{ throw 'sensitive setting leaked' }}
                """
            )
            self.run_powershell(script)

    def test_backend_runner_captures_bounded_python_failure_output(self):
        runner = ROOT / "local-backend" / "run.ps1"
        with tempfile.TemporaryDirectory() as directory:
            temporary = Path(directory)
            copied_runner = temporary / "run.ps1"
            shutil.copy2(runner, copied_runner)
            fake_python = temporary / "fake-python.cmd"
            fake_python.write_text(
                "@echo off\r\n"
                "echo ModuleNotFoundError: No module named payment_assets 1>&2\r\n"
                "exit /b 7\r\n",
                encoding="ascii",
            )
            failure_log = temporary / "后台启动错误.txt"
            environment = os.environ.copy()
            environment["VOCAB_PYTHON_EXE"] = str(fake_python)
            environment["VOCAB_BACKEND_FAILURE_LOG"] = str(failure_log)
            started = time.monotonic()
            completed = subprocess.run(
                [
                    POWERSHELL,
                    "-NoLogo",
                    "-NoProfile",
                    "-ExecutionPolicy",
                    "Bypass",
                    "-File",
                    str(copied_runner),
                ],
                cwd=temporary,
                env=environment,
                capture_output=True,
                timeout=15,
                check=False,
            )
            failure_text = (
                failure_log.read_text(encoding="utf-8-sig")
                if failure_log.is_file()
                else "[failure log missing]"
            )
            self.assertEqual(
                completed.returncode,
                7,
                f"stdout={completed.stdout!r}\nstderr={completed.stderr!r}\nreport={failure_text}",
            )
            self.assertLess(time.monotonic() - started, 8)
            self.assertTrue(failure_log.is_file())
            report = failure_text
            self.assertIn("ModuleNotFoundError", report)
            self.assertLess(len(report.splitlines()), 130)

    def test_tunnel_readiness_requires_consecutive_uncached_successes(self):
        launcher = ROOT / "desktop-tools" / "start-wyj.ps1"
        script = textwrap.dedent(
            f"""
            . '{launcher}'
            $script:probeCalls = 0
            function Test-PublicBackendReady {{
                $script:probeCalls++
                switch ($script:probeCalls) {{
                    1 {{ return $false }}
                    2 {{ return $true }}
                    3 {{ return $true }}
                    4 {{ return $false }}
                    default {{ return $true }}
                }}
            }}
            $ready = Wait-ForStablePublicBackend -Seconds 3 -Label 'synthetic tunnel' -StableSuccesses 3 -IntervalMilliseconds 100
            if (-not $ready) {{ throw 'stable tunnel was not accepted' }}
            if ($script:probeCalls -ne 7) {{ throw "consecutive success guard failed: $script:probeCalls" }}
            """
        )
        self.run_powershell(script)

    def test_tunnel_metrics_fallback_preserves_a_connected_connector(self):
        launcher = ROOT / "desktop-tools" / "start-wyj.ps1"
        script = textwrap.dedent(
            f"""
            . '{launcher}'
            function Test-PublicBackendReady {{ return $false }}
            function Get-TunnelHaConnections {{ return 2 }}
            $script:TunnelValidationDegraded = $false
            $ready = Wait-ForStablePublicBackend -Seconds 2 -Label 'synthetic connector' -StableSuccesses 3 -IntervalMilliseconds 100 -AcceptHealthyConnector
            if (-not $ready) {{ throw 'healthy connector fallback was rejected' }}
            if (-not $script:TunnelValidationDegraded) {{ throw 'degraded validation was not recorded' }}
            """
        )
        self.run_powershell(script)

    def test_watchdog_does_not_restart_cloudflared_for_http_probe_jitter(self):
        watchdog = (
            ROOT / "desktop-tools" / "watch-wyj.ps1"
        ).read_text(encoding="utf-8")
        self.assertIn('$connectorConnections = Get-TunnelHaConnections', watchdog)
        self.assertIn('$localOk -and ($publicOk -or $connectorOk)', watchdog)
        self.assertIn('so it will not be restarted', watchdog)

    def test_source_selection_and_legacy_seventy_yuan_qr_fallback(self):
        launcher = ROOT / "desktop-tools" / "start-wyj.ps1"
        with tempfile.TemporaryDirectory() as directory:
            temporary = Path(directory)
            source_backend = temporary / "source" / "local-backend"
            qr_source = source_backend / "data" / "payment" / "qrcodes"
            qr_source.mkdir(parents=True)
            runtime = temporary / "runtime"
            (runtime / "data" / "payment" / "qrcodes").mkdir(parents=True)
            current_plans = (
                "trial_single_language",
                "dual_language_monthly",
                "tools_monthly",
                "all_access_monthly",
                "all_access_lifetime",
            )
            for method in ("wechat", "alipay"):
                for plan in current_plans:
                    shutil.copy2(
                        ROOT / "icon-192.png",
                        qr_source / f"{method}_{plan}.png",
                    )
                shutil.copy2(
                    ROOT / "icon-192.png",
                    qr_source / f"{method}_dual_language_lifetime.png",
                )
            script = textwrap.dedent(
                f"""
                . '{launcher}' -SourceRoot '{ROOT}'
                $resolved = Resolve-SourceRoot
                if ([IO.Path]::GetFullPath($resolved) -ne [IO.Path]::GetFullPath('{ROOT}')) {{ throw 'source selection failed' }}
                $script:BackendSourceRoot = '{source_backend}'
                $script:BackendRoot = '{runtime}'
                $script:FileLoggingEnabled = $false
                $count = Sync-PrivatePaymentAssets
                if ($count -ne 12) {{ throw "unexpected QR count: $count" }}
                foreach ($method in @('wechat', 'alipay')) {{
                    if (-not (Test-Path -LiteralPath (Join-Path $script:BackendRoot "data\\payment\\qrcodes\\${{method}}_japanese_lifetime.png") -PathType Leaf)) {{ throw 'Japanese QR fallback missing' }}
                    if (-not (Test-Path -LiteralPath (Join-Path $script:BackendRoot "data\\payment\\qrcodes\\${{method}}_dual_language_lifetime.png") -PathType Leaf)) {{ throw 'historical QR compatibility missing' }}
                }}
                """
            )
            self.run_powershell(script)


if __name__ == "__main__":
    unittest.main()
