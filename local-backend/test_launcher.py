import base64
import re
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

    def test_backend_start_is_detached_redirected_and_checked_once(self):
        launcher = ROOT / "desktop-tools" / "start-wyj.ps1"
        text = launcher.read_text(encoding="utf-8")
        self.assertIn("-RedirectStandardInput $BackendStandardInputPath", text)
        self.assertIn("-RedirectStandardOutput $BackendStandardOutputPath", text)
        self.assertIn("-RedirectStandardError $BackendStandardErrorPath", text)
        self.assertIn("-RedirectStandardInput $TunnelStandardInputPath", text)
        self.assertIn("-RedirectStandardOutput $TunnelStandardOutputPath", text)
        self.assertIn("-RedirectStandardError $TunnelStandardErrorPath", text)
        self.assertIn("$BackendStartupProbeDelayMilliseconds = 2000", text)
        self.assertEqual(text.count("$backendReady = Test-BackendReady"), 1)
        self.assertNotIn("Wait-ForBackendStartup", text)
        self.assertNotIn("$BackendStartupTimeoutSeconds", text)
        self.assertNotIn("$script:BackendLaunchProcess.WaitForExit", text)

    def test_tunnel_origin_repair_uses_ipv4_and_preserves_credentials(self):
        launcher = ROOT / "desktop-tools" / "start-wyj.ps1"
        with tempfile.TemporaryDirectory() as directory:
            config = Path(directory) / "config.yml"
            config.write_text(
                "tunnel: tunnel-id\n"
                "credentials-file: C:/secret/tunnel.json\n"
                "ingress:\n"
                "  - hostname: api.example.test\n"
                "    service: http://localhost:8765\n"
                "  - service: http_status:404\n",
                encoding="utf-8",
            )
            config_path = str(config).replace("'", "''")
            script = textwrap.dedent(
                f"""
                . '{launcher}'
                $script:TunnelConfig = '{config_path}'
                Repair-TunnelOriginAddress
                Repair-TunnelOriginAddress
                $content = Get-Content -LiteralPath $script:TunnelConfig -Raw
                if ($content -match 'localhost:8765') {{ throw 'localhost was not repaired' }}
                if ($content -notmatch '127\\.0\\.0\\.1:8765') {{ throw 'IPv4 origin missing' }}
                if ($content -notmatch 'tunnel-id') {{ throw 'tunnel ID changed' }}
                if ($content -notmatch 'C:/secret/tunnel\\.json') {{ throw 'credentials changed' }}
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

    def test_tunnel_metrics_do_not_replace_public_availability(self):
        launcher = ROOT / "desktop-tools" / "start-wyj.ps1"
        script = textwrap.dedent(
            f"""
            . '{launcher}'
            function Test-PublicBackendReady {{ return $false }}
            function Get-TunnelHaConnections {{ return 2 }}
            $ready = Wait-ForStablePublicBackend -Seconds 1 -Label 'synthetic connector' -StableSuccesses 3 -IntervalMilliseconds 100
            if ($ready) {{ throw 'connector metrics incorrectly replaced public availability' }}
            """
        )
        self.run_powershell(script)

    def test_public_readiness_uses_the_real_pages_path(self):
        launcher = (ROOT / "desktop-tools" / "start-wyj.ps1").read_text(
            encoding="utf-8"
        )
        readiness = re.search(
            r"function Test-PublicBackendReady\s*\{(?P<body>.*?)\n\}",
            launcher,
            re.DOTALL,
        )
        self.assertIsNotNone(readiness)
        self.assertIn("$PublicBackendStatusUrls", readiness.group("body"))
        self.assertNotIn("$ApiStatusUrl", readiness.group("body"))
        self.assertIn('"https://thewyj.uk/api/status"', launcher)
        self.assertIn('"https://japanese-6pa.pages.dev/api/status"', launcher)

        watchdog = (ROOT / "desktop-tools" / "watch-wyj.ps1").read_text(
            encoding="utf-8"
        )
        public_urls = re.search(
            r"\$PublicStatusUrls\s*=\s*@\((?P<body>.*?)\)",
            watchdog,
            re.DOTALL,
        )
        self.assertIsNotNone(public_urls)
        self.assertIn('$CustomDomainStatusUrl = "https://thewyj.uk/api/status"', watchdog)
        self.assertIn('$PagesFallbackStatusUrl = "https://japanese-6pa.pages.dev/api/status"', watchdog)
        self.assertNotIn(
            "https://api.thewyj.uk/api/status",
            public_urls.group("body"),
        )

        api_probe = re.search(
            r"function Test-ApiOk\s*\{(?P<body>.*?)function Test-HttpOk",
            launcher,
            re.DOTALL,
        )
        self.assertIsNotNone(api_probe)
        self.assertLess(
            api_probe.group("body").index("Invoke-RestMethod"),
            api_probe.group("body").index("Test-UrlWithPython"),
        )

        endpoint_probe = re.search(
            r"function Test-Endpoint\s*\{(?P<body>.*?)function Get-TunnelHaConnections",
            watchdog,
            re.DOTALL,
        )
        self.assertIsNotNone(endpoint_probe)
        self.assertLess(
            endpoint_probe.group("body").index("Invoke-RestMethod"),
            endpoint_probe.group("body").index("Test-EndpointWithPython"),
        )
    def test_tunnel_candidate_keeps_first_end_to_end_success(self):
        launcher = (
            ROOT / "desktop-tools" / "start-wyj.ps1"
        ).read_text(encoding="utf-8")
        self.assertIn(
            '-StableSuccesses 1 -IntervalMilliseconds 2500 -Process $lastProcess',
            launcher,
        )
        self.assertIn(
            '-Seconds 20 -Label "现有固定 Tunnel" -StableSuccesses 5',
            launcher,
        )

    def test_python_https_probes_have_hard_timeouts_and_redirected_streams(self):
        launcher = (
            ROOT / "desktop-tools" / "start-wyj.ps1"
        ).read_text(encoding="utf-8")
        watchdog = (
            ROOT / "desktop-tools" / "watch-wyj.ps1"
        ).read_text(encoding="utf-8")
        self.assertIn("wyj-launcher-http-health-probe.py", launcher)
        self.assertIn("$ProbeTempRoot = [IO.Path]::GetTempPath()", launcher)
        self.assertIn("$probeProcess.WaitForExit($TimeoutSec * 1000)", launcher)
        self.assertNotIn("$null = & $script:PythonExe -c", launcher)
        self.assertIn("wyj-watchdog-http-health-probe.py", watchdog)
        self.assertIn("$ProbeTempRoot = [IO.Path]::GetTempPath()", watchdog)
        self.assertIn("$probeProcess.WaitForExit(8000)", watchdog)
        self.assertNotIn("$null = & $PythonExe -c", watchdog)
        for script in (launcher, watchdog):
            self.assertIn("System.Diagnostics.ProcessStartInfo", script)
            self.assertIn("$startInfo.UseShellExecute = $false", script)
            self.assertIn("$startInfo.RedirectStandardInput = $true", script)
            self.assertIn("$startInfo.RedirectStandardOutput = $true", script)
            self.assertIn("$startInfo.RedirectStandardError = $true", script)
            self.assertIn("$probeProcess.StandardInput.Close()", script)
            self.assertIn("$probeProcess.Kill()", script)
            self.assertIn("$probeProcess.Dispose()", script)
            self.assertIn("print('OK')", script)
            self.assertIn("$probeProcess.StandardOutput.ReadToEnd().Trim()", script)

    def test_saved_protocol_is_preserved_without_new_health_evidence(self):
        launcher = ROOT / "desktop-tools" / "start-wyj.ps1"
        with tempfile.TemporaryDirectory() as directory:
            protocol_state = Path(directory) / "tunnel-protocol.txt"
            protocol_state.write_text("quic", encoding="ascii")
            script = textwrap.dedent(
                f"""
                . '{launcher}'
                $script:ProtocolStatePath = '{protocol_state}'
                Remove-Item Env:VOCAB_TUNNEL_PROTOCOL -ErrorAction SilentlyContinue
                if ((Get-PreferredTunnelProtocol) -ne 'quic') {{ throw 'saved protocol was unexpectedly discarded' }}
                """
            )
            self.run_powershell(script)

    def test_recent_quic_failures_prefer_a_newer_http2_success(self):
        launcher = ROOT / "desktop-tools" / "start-wyj.ps1"
        with tempfile.TemporaryDirectory() as directory:
            temporary = Path(directory)
            protocol_state = temporary / "tunnel-protocol.txt"
            protocol_state.write_text("auto", encoding="ascii")
            tunnel_log = temporary / "fixed-tunnel.log"
            tunnel_log.write_text(
                "\n".join(
                    [
                        "HTTP/2 connection is blocked or unreachable",
                        "HTTP/2 connection successful",
                        "timeout: no recent network activity",
                        "failed to dial to edge with quic",
                        "timeout: no recent network activity",
                        "failed to dial to edge with quic",
                    ]
                ),
                encoding="utf-8",
            )
            script = textwrap.dedent(
                f"""
                . '{launcher}'
                $script:ProtocolStatePath = '{protocol_state}'
                $script:TunnelLog = '{tunnel_log}'
                $script:FileLoggingEnabled = $false
                Remove-Item Env:VOCAB_TUNNEL_PROTOCOL -ErrorAction SilentlyContinue
                if ((Get-PreferredTunnelProtocol) -ne 'http2') {{ throw 'HTTP2 was not preferred after repeated QUIC timeouts' }}
                """
            )
            self.run_powershell(script)

    def test_watchdog_repairs_persistent_public_failure(self):
        watchdog = (
            ROOT / "desktop-tools" / "watch-wyj.ps1"
        ).read_text(encoding="utf-8")
        self.assertIn('$connectorConnections = Get-TunnelHaConnections', watchdog)
        self.assertIn('$PublicProbeGraceFailures = 4', watchdog)
        self.assertIn('$WebsiteFailureThreshold = 3', watchdog)
        self.assertIn('$PagesFallbackStatusUrl = "https://japanese-6pa.pages.dev/api/status"', watchdog)
        self.assertIn('retry delayed for {1} seconds', watchdog)
        self.assertIn('$localOk -and $connectorOk', watchdog)
        self.assertIn('connector metrics are not accepted as public availability', watchdog)
        self.assertNotIn('$localOk -and ($publicOk -or $connectorOk)', watchdog)

    def test_source_selection_and_historical_seventy_yuan_qr_fallback(self):
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
                    qr_source / f"{method}_japanese_lifetime.png",
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
                    if (-not (Test-Path -LiteralPath (Join-Path $script:BackendRoot "data\\payment\\qrcodes\\${{method}}_japanese_lifetime.png") -PathType Leaf)) {{ throw 'current Japanese QR missing' }}
                    if (-not (Test-Path -LiteralPath (Join-Path $script:BackendRoot "data\\payment\\qrcodes\\${{method}}_dual_language_lifetime.png") -PathType Leaf)) {{ throw 'historical dual-language QR fallback missing' }}
                }}
                """
            )
            self.run_powershell(script)


    def test_mihomo_party_persistent_routing_is_safe_and_idempotent(self):
        launcher = ROOT / "desktop-tools" / "start-wyj.ps1"
        with tempfile.TemporaryDirectory() as directory:
            root = Path(directory) / "mihomo-party"
            (root / "override").mkdir(parents=True)
            (root / "mihomo.yaml").write_text(
                "mode: global\ndns:\n  fake-ip-filter:\n    - +.lan\n",
                encoding="utf-8",
            )
            (root / "override.yaml").write_text(
                "items:\n  - id: keep-existing\n    type: local\n",
                encoding="utf-8",
            )
            root_ps = str(root).replace("'", "''")
            backup_ps = str(Path(directory) / "backups").replace("'", "''")
            script = textwrap.dedent(
                f"""
                . '{launcher}'
                $first = Install-MihomoPartyPersistentRouting -PartyRoot '{root_ps}' -BackupRoot '{backup_ps}'
                if (-not $first.Enabled -or -not $first.Changed) {{ throw 'repair did not run' }}
                $all = (Get-Content -Raw (Join-Path '{root_ps}' 'mihomo.yaml')) + (Get-Content -Raw (Join-Path '{root_ps}' 'override.yaml')) + (Get-Content -Raw (Join-Path '{root_ps}' 'override\\wyj-cloudflared-direct.yaml'))
                foreach ($marker in @('mode: rule', '+.argotunnel.com', 'keep-existing', 'wyj-cloudflared-direct', 'PROCESS-NAME,cloudflared.exe,DIRECT', 'DOMAIN-SUFFIX,argotunnel.com,DIRECT', 'MATCH,GLOBAL')) {{
                    if (-not $all.Contains($marker)) {{ throw "missing marker: $marker" }}
                }}
                $second = Install-MihomoPartyPersistentRouting -PartyRoot '{root_ps}' -BackupRoot '{backup_ps}'
                if ($second.Changed) {{ throw 'repair is not idempotent' }}
                """
            )
            self.run_powershell(script)

    def test_mihomo_party_guard_is_session_scoped_and_redirected(self):
        launcher = (ROOT / "desktop-tools" / "start-wyj.ps1").read_text(encoding="utf-8")
        for marker in (
            "PROCESS-NAME,cloudflared.exe,DIRECT",
            "DOMAIN-SUFFIX,argotunnel.com,DIRECT",
            "MATCH,GLOBAL",
            "/configs?force=true",
            "-RedirectStandardInput $MihomoGuardStandardInputPath",
            "-RedirectStandardOutput $MihomoGuardStandardOutputPath",
            "-RedirectStandardError $MihomoGuardStandardErrorPath",
        ):
            self.assertIn(marker, launcher)
        encoded = re.search(r'\$encoded = "([A-Za-z0-9+/=]+)"', launcher)
        self.assertIsNotNone(encoded)
        guard = base64.b64decode(encoded.group(1)).decode("utf-8")
        self.assertIn("while (Get-Process -Id $ClashPartyPid", guard)
        self.assertIn("Set-MihomoRuleMode", guard)
        self.assertNotIn("Start Menu\\Programs\\Startup", guard)

if __name__ == "__main__":
    unittest.main()
