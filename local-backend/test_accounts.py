import tempfile
import unittest
from unittest import mock
from datetime import timedelta
from pathlib import Path

from account_store import ADMIN_SECRET, AccountError, AccountStore, iso_now, utc_now


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

    def test_registration_and_case_insensitive_uniqueness(self):
        user = self.register("UserOne")
        self.assertEqual(user["membership"], "free")
        with self.assertRaises(AccountError):
            self.register("userone", "SECOND")
        for reserved in ("wyj", "WYJ", "WyJ"):
            with self.assertRaises(AccountError):
                self.register(reserved, "SECRET")

    def test_plaintext_txt_is_atomically_synchronized(self):
        self.register()
        text = self.text_path.read_text(encoding="utf-8")
        self.assertIn("username=user001", text)
        self.assertIn("secret=ABC123", text)
        self.assertIn("username=wyj", text)

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

    def test_monthly_and_lifetime_are_unlimited(self):
        user = self.register()
        self.store.admin_set_membership(self.admin, user["id"], "monthly")
        self.assertIsNone(self.store.quiz_limit(self.store.get_user(user["id"]), "english"))
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
        self.assertIn("secret=NEW456", self.text_path.read_text(encoding="utf-8"))

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
        first, created = self.store.create_recharge_request(user, "monthly")
        second, created_again = self.store.create_recharge_request(user, "lifetime")
        self.assertTrue(created)
        self.assertFalse(created_again)
        self.assertEqual(first["id"], second["id"])
        self.assertEqual(self.store.get_user(user["id"])["membership"], "free")
        status = self.store.process_recharge_request(self.admin, first["id"], "approve")
        self.assertEqual(status, "activated")
        self.assertEqual(self.store.get_user(user["id"])["membership"], "monthly")


if __name__ == "__main__":
    unittest.main()
