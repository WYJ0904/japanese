import json
import re
import sqlite3
import unittest
from html.parser import HTMLParser
from pathlib import Path


ROOT = Path(__file__).resolve().parent.parent


class IdCollector(HTMLParser):
    def __init__(self):
        super().__init__(convert_charrefs=True)
        self.ids = []

    def handle_starttag(self, _tag, attrs):
        attributes = dict(attrs)
        if attributes.get("id"):
            self.ids.append(attributes["id"])


class StaticSiteTests(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        cls.html = (ROOT / "index.html").read_text(encoding="utf-8")
        cls.app = (ROOT / "app.js").read_text(encoding="utf-8")
        cls.tools = (ROOT / "tools.js").read_text(encoding="utf-8")
        cls.styles = (ROOT / "styles.css").read_text(encoding="utf-8")
        cls.worker = (ROOT / "sw.js").read_text(encoding="utf-8")

    def test_html_ids_are_unique_and_app_references_exist(self):
        parser = IdCollector()
        parser.feed(self.html)
        duplicates = sorted({item for item in parser.ids if parser.ids.count(item) > 1})
        self.assertEqual(duplicates, [])
        html_ids = set(parser.ids)
        direct_references = set(re.findall(r'\$\("([A-Za-z0-9_-]+)"\)', self.app))
        self.assertEqual(sorted(direct_references - html_ids), [])
        required = {
            "entryScreen", "authPanel", "modulePicker", "projectPicker",
            "projectApp", "toolsPanel", "membershipModal", "adminPanel",
            "shareViewer", "toolWorkbenchDescription", "paymentLanguage",
        }
        self.assertEqual(sorted(required - html_ids), [])

    def test_manifest_and_service_worker_shell_are_deployable(self):
        manifest = json.loads((ROOT / "manifest.webmanifest").read_text(encoding="utf-8"))
        self.assertEqual(manifest["name"], "WYJ\u7684\u7f51\u7ad9")
        self.assertEqual(manifest["short_name"], "WYJ")
        self.assertEqual(manifest["start_url"], "/")
        cache_source = self.worker.split("const CORE_SHELL = [", 1)[1].split("];", 1)[0]
        cache_source += self.worker.split("const OPTIONAL_BRAND_ASSETS = [", 1)[1].split("];", 1)[0]
        cached_paths = re.findall(r'"(/[^"?]+)(?:\?[^\"]+)?"', cache_source)
        for path in cached_paths:
            if path == "/":
                continue
            self.assertTrue((ROOT / path.lstrip("/")).exists(), path)
        self.assertIn("/assets/logo.png", self.worker)
        self.assertIn("/assets/splash-screen.png", self.worker)
        self.assertRegex(self.worker, r'const CACHE = "wyj-shell-[^"]+"')
        release_token = "20260715-tools5"
        for asset in ("manifest.webmanifest", "styles.css", "tools.js", "app.js"):
            self.assertIn(f'/{asset}?v={release_token}', self.html)
            self.assertIn(f'/{asset}?v={release_token}', self.worker)
        self.assertIn(f'const CACHE = "wyj-shell-{release_token}"', self.worker)
        self.assertIn('const APP_VERSION = "2026-07-15-tools5"', self.app)
        server = (ROOT / "local-backend" / "server.py").read_text(encoding="utf-8")
        self.assertIn('APP_BUILD = "2026-07-15-tools5"', server)

    def test_tool_catalog_is_complete_and_unique(self):
        source = self.tools.split("const toolRows = {", 1)[1].split("const TOOLS =", 1)[0]
        expected_counts = {"text": 29, "file": 17, "image": 30, "random": 22, "temporary": 5}
        all_ids = []
        for category, expected_count in expected_counts.items():
            match = re.search(rf"\n    {category}: \[(.*?)\n    \],", source, re.S)
            self.assertIsNotNone(match, category)
            rows = re.findall(
                r'\["([a-z0-9-]+)",\s*"([^"]+)",\s*"([^"]+)"(?:,\s*"([^"]*)")?\]',
                match.group(1),
            )
            ids = [row[0] for row in rows]
            self.assertEqual(len(ids), expected_count, category)
            self.assertTrue(all(row[1].strip() and row[2].strip() for row in rows), category)
            all_ids.extend(ids)
        self.assertEqual(len(all_ids), 103)
        self.assertEqual(len(set(all_ids)), 103)
        self.assertIn("function fuzzyToolScore", self.tools)
        self.assertIn("function boundedEditDistance", self.tools)
        self.assertIn("searchTools", self.tools)
        self.assertIn("isAdjacentTransposition(compactToken, word)", self.tools)
        self.assertNotIn('category?.description || ""', self.tools)

    def test_initial_flow_and_security_headers_are_present(self):
        self.assertRegex(self.html, r'id="entryScreen"[^>]*aria-hidden="false"')
        self.assertRegex(self.html, r'id="appShell"[^>]*aria-hidden="true"')
        headers = (ROOT / "_headers").read_text(encoding="utf-8")
        self.assertIn("Content-Security-Policy:", headers)
        self.assertIn("frame-ancestors 'none'", headers)
        self.assertIn("Permissions-Policy:", headers)
        self.assertEqual((ROOT / "_redirects").read_text(encoding="utf-8").strip(), "/* /index.html 200")

    def test_branding_and_launcher_contract(self):
        combined = self.html + self.app + self.worker
        self.assertNotIn("\u5916\u8bed\u8bcd\u6d4b", combined)
        self.assertNotIn("\u5355\u8bcd\u6d4b", combined)
        launcher = (ROOT / "desktop-tools" / "start-wyj.ps1").read_text(encoding="utf-8-sig")
        self.assertIn("membership.py", launcher)
        self.assertIn("temporary_store.py", launcher)
        self.assertIn("run.ps1", launcher)
        self.assertIn("002_single_language_orders_up.sql", launcher)
        self.assertIn('$LauncherVersion = "8.1.2"', launcher)
        self.assertNotIn("WScript.Shell", launcher)
        self.assertNotIn("CreateShortcut", launcher)
        self.assertNotIn("Register-ScheduledTask", launcher)
        self.assertIn("Disable-LegacyAutoStart", launcher)

    def test_migration_is_idempotent_and_rollback_preserves_legacy_tables(self):
        migrations = ROOT / "local-backend" / "migrations"
        before = (migrations / "pre-001-schema.sql").read_text(encoding="utf-8")
        upgrade = (migrations / "001_entitlements_up.sql").read_text(encoding="utf-8")
        downgrade = (migrations / "001_entitlements_down.sql").read_text(encoding="utf-8")
        upgrade_two = (migrations / "002_single_language_orders_up.sql").read_text(encoding="utf-8")
        downgrade_two = (migrations / "002_single_language_orders_down.sql").read_text(encoding="utf-8")
        connection = sqlite3.connect(":memory:")
        try:
            connection.executescript(before)
            connection.executescript(upgrade)
            connection.executescript(upgrade)
            applied = connection.execute(
                "SELECT COUNT(*) FROM schema_migrations WHERE version = '001_entitlements'"
            ).fetchone()[0]
            self.assertEqual(applied, 1)
            connection.executescript(upgrade_two)
            trial_language_column = {
                row[1] for row in connection.execute("PRAGMA table_info(payment_requests)")
            }
            self.assertIn("trial_language", trial_language_column)
            connection.executescript(downgrade_two)
            trial_language_column = {
                row[1] for row in connection.execute("PRAGMA table_info(payment_requests)")
            }
            self.assertNotIn("trial_language", trial_language_column)
            connection.executescript(downgrade)
            tables = {
                row[0]
                for row in connection.execute("SELECT name FROM sqlite_master WHERE type = 'table'")
            }
            self.assertTrue({"users", "sessions", "recharge_requests"}.issubset(tables))
            self.assertNotIn("user_memberships", tables)
            self.assertNotIn("payment_requests", tables)
            self.assertNotIn("temporary_files", tables)
        finally:
            connection.close()


if __name__ == "__main__":
    unittest.main()
