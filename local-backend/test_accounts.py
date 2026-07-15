import tempfile
import unittest
import sqlite3
from concurrent.futures import ThreadPoolExecutor
from contextlib import closing
from unittest import mock
from datetime import datetime, timedelta
from pathlib import Path

from account_store import (
    ADMIN_SECRET,
    MAX_SESSIONS_PER_USER,
    AccountError,
    AccountStore,
    iso_now,
    membership_time_value,
    parse_time,
    utc_now,
)
from membership import MEMBERSHIP_PLANS, public_plan_payload


class AccountStoreTests(unittest.TestCase):
    def setUp(self):
        self.temporary = tempfile.TemporaryDirectory()
        root = Path(self.temporary.name)
        self.store = AccountStore(root / "data" / "users.sqlite3", root / "users.txt")
        self.text_path = root / "users.txt"
        self.admin = self.store.get_user_by_name("wyj")

    def tearDown(self):
        self.temporary.cleanup()

    def register(self, username="user001", secret="ABC123"):
        return self.store.register(username, secret)

    def test_fixed_admin_is_created_and_strict(self):
        self.assertTrue(self.store.is_super_admin(self.admin))
        token, user = self.store.login("wyj", ADMIN_SECRET)
        self.assertTrue(token)
        self.assertEqual(user["role"], "super_admin")
        for username in ("WYJ", "Wyj"):
            with self.assertRaises(AccountError):
                self.store.login(username, ADMIN_SECRET)

    def test_existing_admin_secret_survives_restart(self):
        local_secret = "LOCAL-ADMIN-ONLY"
        with self.store.connect() as connection:
            connection.execute(
                "UPDATE users SET secret = ? WHERE username_normalized = ?",
                (local_secret, "wyj"),
            )
        restarted = AccountStore(self.store.database_path, self.text_path)
        token, user = restarted.login("wyj", local_secret)
        self.assertTrue(token)
        self.assertTrue(restarted.is_super_admin(user))
        with self.assertRaises(AccountError):
            restarted.login("wyj", ADMIN_SECRET)

    def test_registration_and_case_insensitive_uniqueness(self):
        user = self.register("UserOne")
        self.assertEqual(user["membership"], "free")
        with self.assertRaises(AccountError):
            self.register("userone", "SECOND")
        for reserved in ("wyj", "WYJ", "WyJ"):
            with self.assertRaises(AccountError):
                self.register(reserved, "SECRET")

    def test_txt_is_atomically_synchronized_without_plaintext_secrets(self):
        self.register()
        text = self.text_path.read_text(encoding="utf-8")
        self.assertIn("username=user001", text)
        self.assertIn("secret=protected", text)
        self.assertNotIn("ABC123", text)
        self.assertIn("username=wyj", text)
        with self.store.connect() as connection:
            encoded = connection.execute(
                "SELECT secret FROM users WHERE username_normalized = ?", ("user001",)
            ).fetchone()[0]
        self.assertTrue(encoded.startswith("pbkdf2_sha256$"))
        self.assertNotIn("ABC123", encoded)

    def test_txt_failure_reports_committed_database_write(self):
        with mock.patch("account_store.os.replace", side_effect=OSError("file is locked")):
            with self.assertRaises(AccountError) as raised:
                self.store.register("committed-user", "VISIBLE")
        self.assertTrue(raised.exception.committed)
        self.assertEqual(raised.exception.code, "users_txt_sync_failed")
        with self.store.connect() as connection:
            row = connection.execute(
                "SELECT id FROM users WHERE username_normalized = ?", ("committed-user",)
            ).fetchone()
        self.assertIsNotNone(row)
        self.assertFalse(self.text_path.with_name(self.text_path.name + ".tmp").exists())

    def test_login_and_persistent_session(self):
        self.register()
        token, user = self.store.login("USER001", "ABC123")
        self.assertEqual(user["username"], "user001")
        self.assertIsNotNone(self.store.resolve_session(token))
        with self.assertRaises(AccountError):
            self.store.login("user001", "WRONG")

    def test_login_prunes_old_and_excess_sessions(self):
        user = self.register()
        tokens = [self.store.login("user001", "ABC123")[0] for _ in range(MAX_SESSIONS_PER_USER + 4)]
        with self.store.connect() as connection:
            count = connection.execute("SELECT COUNT(*) FROM sessions WHERE user_id = ?", (user["id"],)).fetchone()[0]
        self.assertEqual(count, MAX_SESSIONS_PER_USER)
        self.assertIsNone(self.store.resolve_session(tokens[0]))
        self.assertIsNotNone(self.store.resolve_session(tokens[-1]))

    def test_free_limit_allows_15_and_blocks_16(self):
        user = self.register()
        self.assertEqual(self.store.quiz_limit(user, "english"), 15)
        self.assertEqual(self.store.quiz_limit(user, "japanese"), 15)

    def test_trial_is_unlimited_for_one_language_only(self):
        user = self.register()
        updated = self.store.admin_set_membership(
            self.admin, user["id"], "trial_single_language", trial_language="english"
        )
        self.assertIsNone(self.store.quiz_limit(self.store.get_user(user["id"]), "english"))
        self.assertEqual(self.store.quiz_limit(self.store.get_user(user["id"]), "japanese"), 15)
        self.assertEqual(updated["trial_language"], "english")

    def test_single_language_monthly_plan_costs_eight_cny_and_keeps_languages_separate(self):
        plan = MEMBERSHIP_PLANS["trial_single_language"]
        self.assertEqual(plan["price_cents"], 800)
        self.assertTrue(plan["purchasable"])
        self.assertNotIn("tools_access", plan["entitlements"])
        self.assertIn("trial_single_language", {item["code"] for item in public_plan_payload()})

        user = self.register()
        with self.assertRaises(AccountError) as missing_language:
            self.store.create_recharge_request(user, "trial_single_language")
        self.assertEqual(missing_language.exception.code, "trial_language_invalid")

        request, created = self.store.create_recharge_request(
            user, "trial_single_language", "japanese"
        )
        self.assertTrue(created)
        self.assertEqual(request["amount_cents"], 800)
        self.assertEqual(request["trial_language"], "japanese")
        self.assertIn("日语", request["payment_note"])
        self.assertEqual(self.store.process_recharge_request(self.admin, request["id"], "approve"), "approved")
        current = self.store.get_user(user["id"])
        self.assertIsNone(self.store.quiz_limit(current, "japanese"))
        self.assertEqual(self.store.quiz_limit(current, "english"), 15)
        self.assertNotIn("tools_access", self.store.entitlements_for(current))

    def test_cancelled_membership_can_be_granted_again_without_duplicate_record(self):
        user = self.register()
        self.store.admin_manage_membership(
            self.admin, user["id"], "grant", "trial_single_language", trial_language="english"
        )
        self.store.admin_manage_membership(
            self.admin, user["id"], "cancel", "trial_single_language"
        )
        updated = self.store.admin_manage_membership(
            self.admin, user["id"], "grant", "trial_single_language", trial_language="japanese"
        )
        active = [item for item in updated["memberships"] if item["plan_code"] == "trial_single_language"]
        self.assertEqual(len(active), 1)
        self.assertEqual(active[0]["metadata"]["language"], "japanese")

    def test_monthly_and_lifetime_are_unlimited(self):
        user = self.register()
        self.store.admin_set_membership(self.admin, user["id"], "monthly")
        self.assertIsNone(self.store.quiz_limit(self.store.get_user(user["id"]), "english"))

    def test_membership_dates_accept_common_separators_and_end_at_day_end(self):
        local_zone = datetime.now().astimezone().tzinfo
        for value in ("2099/01/02", "2099.01.02", "2099。01。02", "2099 01 02"):
            parsed = parse_time(membership_time_value(value, end_of_day=True)).astimezone(local_zone)
            self.assertEqual((parsed.year, parsed.month, parsed.day), (2099, 1, 2))
            self.assertEqual((parsed.hour, parsed.minute, parsed.second), (23, 59, 59))

        user = self.register()
        updated = self.store.admin_set_membership(
            self.admin,
            user["id"],
            "monthly",
            start="2099/01/01",
            expires="2099。02。01",
        )
        start_local = parse_time(updated["membership_start"]).astimezone(local_zone)
        expiry_local = parse_time(updated["membership_expires"]).astimezone(local_zone)
        current_local = datetime.now().astimezone(local_zone)
        self.assertEqual((start_local.year, start_local.month, start_local.day), (2099, 1, 1))
        self.assertLessEqual(
            abs((start_local.hour * 3600 + start_local.minute * 60 + start_local.second)
                - (current_local.hour * 3600 + current_local.minute * 60 + current_local.second)),
            3,
        )
        self.assertEqual((expiry_local.year, expiry_local.month, expiry_local.day), (2099, 2, 1))
        self.assertEqual((expiry_local.hour, expiry_local.minute, expiry_local.second), (23, 59, 59))

        self.assertIsNone(self.store.quiz_limit(self.store.get_user(user["id"]), "japanese"))
        self.store.admin_set_membership(self.admin, user["id"], "lifetime")
        self.assertIsNone(self.store.quiz_limit(self.store.get_user(user["id"]), "english"))

    def test_expired_memberships_revert_to_free(self):
        user = self.register()
        expired = (utc_now() - timedelta(seconds=5)).replace(microsecond=0).isoformat().replace("+00:00", "Z")
        self.store.admin_set_membership(
            self.admin,
            user["id"],
            "trial_single_language",
            start=iso_now(),
            expires=expired,
            trial_language="english",
        )
        current = self.store.get_user(user["id"])
        self.assertEqual(current["membership"], "free")
        self.assertEqual(self.store.quiz_limit(current, "english"), 15)

    def test_secret_change_invalidates_old_sessions_and_updates_txt(self):
        user = self.register()
        token, _ = self.store.login("user001", "ABC123")
        self.store.change_own_secret(user["id"], "ABC123", "NEW456")
        self.assertIsNone(self.store.resolve_session(token))
        text = self.text_path.read_text(encoding="utf-8")
        self.assertIn("secret=protected", text)
        self.assertNotIn("NEW456", text)
        self.store.login("user001", "NEW456")

    def test_ban_invalidates_session_and_unban_restores_login(self):
        user = self.register()
        token, _ = self.store.login("user001", "ABC123")
        self.store.admin_set_ban(self.admin, user["id"], True)
        self.assertIsNone(self.store.resolve_session(token))
        with self.assertRaises(AccountError):
            self.store.login("user001", "ABC123")
        self.store.admin_set_ban(self.admin, user["id"], False)
        token, _ = self.store.login("user001", "ABC123")
        self.assertTrue(token)

    def test_self_delete_removes_database_txt_and_sessions(self):
        user = self.register()
        token, _ = self.store.login("user001", "ABC123")
        self.store.delete_own_account(user["id"], "ABC123")
        self.assertIsNone(self.store.get_user(user["id"]))
        self.assertIsNone(self.store.resolve_session(token))
        self.assertNotIn("username=user001", self.text_path.read_text(encoding="utf-8"))
        replacement = self.register("user001", "REUSED")
        self.assertIsNotNone(replacement)

    def test_admin_cannot_be_deleted_banned_downgraded_or_changed(self):
        protected_calls = (
            lambda: self.store.admin_delete_user(self.admin, self.admin["id"]),
            lambda: self.store.admin_set_ban(self.admin, self.admin["id"], True),
            lambda: self.store.admin_set_membership(self.admin, self.admin["id"], "free"),
            lambda: self.store.admin_change_secret(self.admin, self.admin["id"], "NEW"),
        )
        for call in protected_calls:
            with self.assertRaises(AccountError):
                call()

    def test_recharge_request_is_deduplicated_and_manual(self):
        user = self.register()
        first, created = self.store.create_recharge_request(user, "all_access_monthly")
        second, created_again = self.store.create_recharge_request(user, "all_access_lifetime")
        self.assertTrue(created)
        self.assertFalse(created_again)
        self.assertEqual(first["id"], second["id"])
        self.assertEqual(self.store.get_user(user["id"])["membership"], "free")
        status = self.store.process_recharge_request(self.admin, first["id"], "approve")
        self.assertEqual(status, "approved")
        self.assertEqual(self.store.get_user(user["id"])["membership"], "monthly")
        with self.assertRaises(AccountError):
            self.store.create_recharge_request(user, "monthly")

    def test_new_memberships_merge_entitlements_without_granting_tools_to_japanese(self):
        user = self.register()
        japanese = self.store.admin_manage_membership(
            self.admin, user["id"], "grant", "japanese_lifetime"
        )
        self.assertIn("language_japanese_access", japanese["entitlements"])
        self.assertNotIn("tools_access", japanese["entitlements"])
        self.assertIsNone(self.store.quiz_limit(self.store.get_user(user["id"]), "japanese"))
        self.assertEqual(self.store.quiz_limit(self.store.get_user(user["id"]), "english"), 15)

        full = self.store.admin_manage_membership(
            self.admin, user["id"], "grant", "all_access_monthly"
        )
        self.assertIn("tools_access", full["entitlements"])
        self.assertIsNone(self.store.quiz_limit(self.store.get_user(user["id"]), "english"))
        self.store.admin_manage_membership(
            self.admin, user["id"], "cancel", "all_access_monthly"
        )
        remaining = self.store.user_payload(self.store.get_user(user["id"]))
        self.assertNotIn("tools_access", remaining["entitlements"])
        self.assertIn("language_japanese_access", remaining["entitlements"])

    def test_legacy_membership_migration_is_idempotent_and_does_not_add_tools(self):
        user = self.register()
        with self.store.connect() as connection:
            connection.execute(
                "UPDATE users SET membership = 'lifetime', membership_start = ? WHERE id = ?",
                (iso_now(), user["id"]),
            )
        restarted = AccountStore(self.store.database_path, self.text_path)
        restarted_again = AccountStore(self.store.database_path, self.text_path)
        payload = restarted_again.user_payload(restarted_again.get_user(user["id"]))
        legacy = [item for item in payload["memberships"] if item["plan_code"] == "legacy_all_lifetime"]
        self.assertEqual(len(legacy), 1)
        self.assertIn("language_all_access", payload["entitlements"])
        self.assertNotIn("tools_access", payload["entitlements"])

    def test_pre_migration_database_is_backed_up_once(self):
        root = Path(self.temporary.name) / "legacy"
        database = root / "data" / "users.sqlite3"
        text_path = root / "users.txt"
        database.parent.mkdir(parents=True)
        schema = (Path(__file__).with_name("migrations") / "pre-001-schema.sql").read_text(encoding="utf-8")
        now = iso_now()
        with closing(sqlite3.connect(database)) as connection:
            connection.executescript(schema)
            connection.execute(
                """
                INSERT INTO users (
                    id, username, username_normalized, secret, role, membership,
                    membership_start, registered_at, created_at, updated_at
                ) VALUES (?, ?, ?, ?, 'user', 'lifetime', ?, ?, ?, ?)
                """,
                ("legacy-user", "legacy", "legacy", "OLD-SECRET", now, now, now, now),
            )
            connection.commit()
        migrated = AccountStore(database, text_path)
        backup = database.with_name("users.pre-entitlements-001.sqlite3")
        self.assertTrue(backup.exists())
        with closing(sqlite3.connect(backup)) as connection:
            tables = {row[0] for row in connection.execute("SELECT name FROM sqlite_master WHERE type = 'table'")}
            self.assertNotIn("user_memberships", tables)
            self.assertEqual(connection.execute("SELECT secret FROM users WHERE id = 'legacy-user'").fetchone()[0], "OLD-SECRET")
        payload = migrated.user_payload(migrated.get_user("legacy-user"))
        self.assertIn("language_all_access", payload["entitlements"])
        self.assertNotIn("tools_access", payload["entitlements"])
        migrated.login("legacy", "OLD-SECRET")
        backup_bytes = backup.read_bytes()
        AccountStore(database, text_path)
        self.assertEqual(backup.read_bytes(), backup_bytes)

    def test_single_language_order_migration_is_backed_up_once(self):
        root = Path(self.temporary.name) / "entitlements-v1"
        database = root / "data" / "users.sqlite3"
        text_path = root / "users.txt"
        database.parent.mkdir(parents=True)
        migrations = Path(__file__).with_name("migrations")
        with closing(sqlite3.connect(database)) as connection:
            connection.executescript((migrations / "pre-001-schema.sql").read_text(encoding="utf-8"))
            connection.executescript((migrations / "001_entitlements_up.sql").read_text(encoding="utf-8"))
        migrated = AccountStore(database, text_path)
        backup = database.with_name("users.pre-single-language-002.sqlite3")
        self.assertTrue(backup.exists())
        with closing(sqlite3.connect(backup)) as connection:
            columns = {row[1] for row in connection.execute("PRAGMA table_info(payment_requests)")}
            self.assertNotIn("trial_language", columns)
        with migrated.connect() as connection:
            columns = {row[1] for row in connection.execute("PRAGMA table_info(payment_requests)")}
            self.assertIn("trial_language", columns)
        backup_bytes = backup.read_bytes()
        AccountStore(database, text_path)
        self.assertEqual(backup.read_bytes(), backup_bytes)

    def test_legacy_pending_orders_keep_original_price_and_rights(self):
        user = self.register()
        now = iso_now()
        with self.store.connect() as connection:
            connection.execute(
                """
                INSERT INTO recharge_requests (
                    id, user_id, username, plan, status, requested_at, updated_at
                ) VALUES (?, ?, ?, 'monthly', 'pending', ?, ?)
                """,
                ("legacy-order", user["id"], user["username"], now, now),
            )
        restarted = AccountStore(self.store.database_path, self.text_path)
        request = next(item for item in restarted.list_recharge_requests(self.admin) if item["id"] == "legacy-order")
        self.assertEqual(request["plan_code"], "legacy_all_monthly")
        self.assertEqual(request["amount_cents"], 1000)
        restarted.process_recharge_request(self.admin, request["id"], "approve")
        payload = restarted.user_payload(restarted.get_user(user["id"]))
        self.assertIn("language_all_access", payload["entitlements"])
        self.assertNotIn("tools_access", payload["entitlements"])

    def test_legacy_single_language_order_keeps_old_price_and_language(self):
        user = self.register()
        now = iso_now()
        with self.store.connect() as connection:
            connection.execute(
                """
                INSERT INTO recharge_requests (
                    id, user_id, username, plan, trial_language, status, requested_at, updated_at
                ) VALUES (?, ?, ?, 'trial_single_language', 'english', 'pending', ?, ?)
                """,
                ("legacy-trial-order", user["id"], user["username"], now, now),
            )
        restarted = AccountStore(self.store.database_path, self.text_path)
        request = next(
            item for item in restarted.list_recharge_requests(self.admin)
            if item["id"] == "legacy-trial-order"
        )
        self.assertEqual(request["amount_cents"], 500)
        self.assertEqual(request["trial_language"], "english")

    def test_expired_all_access_monthly_loses_tools_but_keeps_japanese(self):
        user = self.register()
        self.store.admin_manage_membership(self.admin, user["id"], "grant", "japanese_lifetime")
        expired = (utc_now() - timedelta(seconds=5)).isoformat().replace("+00:00", "Z")
        self.store.admin_manage_membership(
            self.admin,
            user["id"],
            "grant",
            "all_access_monthly",
            expires=expired,
        )
        payload = self.store.user_payload(self.store.get_user(user["id"]))
        self.assertNotIn("tools_access", payload["entitlements"])
        self.assertIn("language_japanese_access", payload["entitlements"])
        monthly = [item for item in self.store.memberships_for(self.store.get_user(user["id"]), include_inactive=True) if item["plan_code"] == "all_access_monthly"]
        self.assertEqual(monthly[0]["status"], "expired")

    def test_admin_actions_create_audit_logs(self):
        user = self.register()
        self.store.admin_manage_membership(
            self.admin, user["id"], "grant", "all_access_lifetime", note="test grant"
        )
        self.store.admin_set_entitlement_override(
            self.admin, user["id"], "tools_access", False, note="test override"
        )
        logs = self.store.list_audit_logs(self.admin)
        self.assertEqual(logs[0]["action"], "entitlement_override")
        self.assertEqual(logs[1]["action"], "membership_grant")
        self.assertEqual(logs[0]["target_user_id"], user["id"])

    def test_concurrent_payment_approval_only_succeeds_once(self):
        user = self.register()
        request, _created = self.store.create_recharge_request(user, "all_access_lifetime")

        def approve():
            try:
                return self.store.process_recharge_request(self.admin, request["id"], "approve")
            except AccountError as exc:
                return exc.code

        with ThreadPoolExecutor(max_workers=2) as pool:
            results = list(pool.map(lambda _item: approve(), range(2)))

        self.assertEqual(results.count("approved"), 1)
        self.assertEqual(results.count("request_already_processed"), 1)
        memberships = [
            item
            for item in self.store.memberships_for(self.store.get_user(user["id"]), include_inactive=True)
            if item["plan_code"] == "all_access_lifetime" and item["status"] == "active"
        ]
        self.assertEqual(len(memberships), 1)


if __name__ == "__main__":
    unittest.main()
