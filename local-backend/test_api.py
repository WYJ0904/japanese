import json
import os
import tempfile
import threading
import unittest
import urllib.error
import urllib.request
import uuid
from pathlib import Path
from unittest import mock


TEMPORARY = tempfile.TemporaryDirectory()
ROOT = Path(TEMPORARY.name)
os.environ["VOCAB_USERS_DB"] = str(ROOT / "data" / "users.sqlite3")
os.environ["VOCAB_USERS_TXT"] = str(ROOT / "users.txt")

import server  # noqa: E402
from account_store import ADMIN_SECRET  # noqa: E402


class AccountApiTests(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        cls.httpd = server.VocabServer(("127.0.0.1", 0), server.VocabHandler)
        cls.base = f"http://127.0.0.1:{cls.httpd.server_port}"
        cls.thread = threading.Thread(target=cls.httpd.serve_forever, daemon=True)
        cls.thread.start()
        status, admin = cls.request("POST", "/api/login", {"username": "wyj", "secret": ADMIN_SECRET})
        assert status == 200, admin
        cls.admin_session = admin["session"]

    @classmethod
    def tearDownClass(cls):
        cls.httpd.shutdown()
        cls.httpd.server_close()
        cls.thread.join(timeout=5)
        TEMPORARY.cleanup()

    @classmethod
    def request(cls, method, path, payload=None, session=""):
        headers = {"Content-Type": "application/json"}
        if session:
            headers["X-Session-Token"] = session
        data = None if payload is None else json.dumps(payload).encode("utf-8")
        request = urllib.request.Request(cls.base + path, data=data, headers=headers, method=method)
        try:
            with urllib.request.urlopen(request, timeout=15) as response:
                return response.status, json.loads(response.read().decode("utf-8"))
        except urllib.error.HTTPError as error:
            return error.code, json.loads(error.read().decode("utf-8"))

    def new_user(self):
        username = "u" + uuid.uuid4().hex[:10]
        status, data = self.request(
            "POST",
            "/api/register",
            {"username": username, "secret": "ABC123", "confirm_secret": "ABC123"},
        )
        self.assertEqual(status, 201, data)
        status, login = self.request("POST", "/api/login", {"username": username, "secret": "ABC123"})
        self.assertEqual(status, 200, login)
        return username, login["account"], login["session"]

    def test_admin_login_is_strict_and_admin_api_is_protected(self):
        status, _ = self.request("POST", "/api/login", {"username": "WYJ", "secret": ADMIN_SECRET})
        self.assertEqual(status, 403)
        status, users = self.request("GET", "/api/admin/users", session=self.admin_session)
        self.assertEqual(status, 200, users)
        self.assertTrue(any(item["username"] == "wyj" for item in users["users"]))
        _, _, normal_session = self.new_user()
        status, data = self.request("GET", "/api/admin/users", session=normal_session)
        self.assertEqual(status, 403, data)

    def test_registration_duplicate_case_and_reserved_name(self):
        username, _, _ = self.new_user()
        status, _ = self.request(
            "POST",
            "/api/register",
            {"username": username.upper(), "secret": "SECOND", "confirm_secret": "SECOND"},
        )
        self.assertEqual(status, 409)
        status, _ = self.request(
            "POST",
            "/api/register",
            {"username": "WyJ", "secret": "SECOND", "confirm_secret": "SECOND"},
        )
        self.assertEqual(status, 409)

    def test_free_account_allows_15_and_blocks_16_server_side(self):
        _, _, session = self.new_user()
        words15 = [f"word{i}" for i in range(15)]
        status, data = self.request(
            "POST", "/api/quiz/start", {"language": "english", "words": words15}, session
        )
        self.assertEqual(status, 200, data)
        self.assertEqual(data["max_words"], 15)
        status, data = self.request(
            "POST", "/api/quiz/start", {"language": "english", "words": words15 + ["word15"]}, session
        )
        self.assertEqual(status, 403, data)
        self.assertEqual(data["code"], "membership_required")

    def test_ai_vocabulary_suggestion_levels_and_membership_limit(self):
        _, _, session = self.new_user()
        with mock.patch("server.search_vocabulary_sources") as search:
            status, data = self.request(
                "POST",
                "/api/vocabulary/suggest",
                {"language": "english", "level": "middle_1", "count": 16},
                session,
            )
        self.assertEqual(status, 403, data)
        self.assertEqual(data["code"], "membership_required")
        search.assert_not_called()

        source = {
            "online": True,
            "candidates": [],
            "snippets": [{"title": "初一词汇", "description": "school study future careful important"}],
            "sources": [{"title": "课程词汇", "url": "https://example.test/words"}],
        }
        with mock.patch("server.search_vocabulary_sources", return_value=source), mock.patch(
            "server.call_ollama",
            return_value=json.dumps({"words": ["school", "study", "future", "careful", "important"]}),
        ):
            status, data = self.request(
                "POST",
                "/api/vocabulary/suggest",
                {"language": "english", "level": "middle_1", "count": 5},
                self.admin_session,
            )
        self.assertEqual(status, 200, data)
        self.assertEqual(data["level_label"], "初中一年级")
        self.assertEqual(len(data["words"]), 5)
        self.assertTrue(data["online"])

        status, data = self.request(
            "POST",
            "/api/vocabulary/suggest",
            {"language": "english", "level": "not-a-level", "count": 5},
            self.admin_session,
        )
        self.assertEqual(status, 400, data)
        self.assertEqual(data["code"], "suggest_level_invalid")

    def test_ai_vocabulary_suggestion_excludes_existing_words(self):
        source = {
            "online": True,
            "candidates": [],
            "snippets": [{"title": "初一词汇", "description": "school study future careful important"}],
            "sources": [{"title": "课程词汇", "url": "https://example.test/words"}],
        }
        responses = [
            json.dumps({"words": ["school", "study", "future"]}),
            json.dumps({"words": ["future", "careful", "important"]}),
        ]
        with mock.patch("server.search_vocabulary_sources", return_value=source), mock.patch(
            "server.call_ollama", side_effect=responses
        ):
            status, data = self.request(
                "POST",
                "/api/vocabulary/suggest",
                {
                    "language": "english",
                    "level": "middle_1",
                    "count": 3,
                    "exclude": ["school", "study"],
                },
                self.admin_session,
            )
        self.assertEqual(status, 200, data)
        self.assertEqual(data["words"], ["future", "careful", "important"])
        self.assertNotIn("school", data["words"])
        self.assertNotIn("study", data["words"])

    def test_japanese_suggestion_stays_inside_online_jlpt_candidates(self):
        candidates = ["食べる", "見る", "行く", "来る", "話す"]
        source = {
            "online": True,
            "candidates": candidates,
            "snippets": [],
            "sources": [{"title": "Jisho JLPT N5", "url": "https://jisho.org/search/%23jlpt-n5"}],
        }
        with mock.patch("server.search_vocabulary_sources", return_value=source), mock.patch(
            "server.call_ollama", return_value=json.dumps({"words": ["食べる", "東京", "見る"]})
        ):
            status, data = self.request(
                "POST",
                "/api/vocabulary/suggest",
                {"language": "japanese", "level": "n5", "count": 5},
                self.admin_session,
            )
        self.assertEqual(status, 200, data)
        self.assertEqual(len(data["words"]), 5)
        self.assertEqual(set(data["words"]), set(candidates))

    def test_vocabulary_source_cache_refetches_for_larger_japanese_request(self):
        first = ["一", "二", "三", "四", "五"]
        larger = first + ["六", "七", "八", "九", "十"]
        with server.STATE_LOCK:
            server.VOCABULARY_SOURCE_CACHE.clear()
        with mock.patch("server.jisho_level_candidates", side_effect=[first, larger]) as jisho:
            small = server.search_vocabulary_sources("japanese", "n5", 5)
            cached = server.search_vocabulary_sources("japanese", "n5", 5)
            expanded = server.search_vocabulary_sources("japanese", "n5", 10)
        self.assertEqual(small["candidates"], first)
        self.assertEqual(cached["candidates"], first)
        self.assertEqual(expanded["candidates"], larger)
        self.assertEqual(jisho.call_count, 2)
        with server.STATE_LOCK:
            server.VOCABULARY_SOURCE_CACHE.clear()

    def test_logout_invalidates_persistent_session(self):
        _, _, session = self.new_user()
        status, data = self.request("POST", "/api/logout", {}, session)
        self.assertEqual(status, 200, data)
        status, _ = self.request("GET", "/api/me", session=session)
        self.assertEqual(status, 401)

    def test_ai_unavailable_is_retryable_service_unavailable(self):
        _, _, session = self.new_user()
        status, started = self.request(
            "POST", "/api/quiz/start", {"language": "english", "words": ["apple"]}, session
        )
        self.assertEqual(status, 200, started)
        with mock.patch("server.ai_build_rubric", side_effect=server.AiUnavailable("AI timeout")):
            status, data = self.request(
                "POST",
                "/api/rubric",
                {"word": "apple", "quiz_session": started["quiz_session"]},
                session,
            )
        self.assertEqual(status, 503, data)
        self.assertTrue(data["retryable"])

    def test_trial_language_and_immediate_downgrade(self):
        _, account, session = self.new_user()
        status, data = self.request(
            "POST",
            "/api/admin/membership",
            {"user_id": account["id"], "membership": "trial_single_language", "trial_language": "english"},
            self.admin_session,
        )
        self.assertEqual(status, 200, data)
        words = [f"word{i}" for i in range(16)]
        status, _ = self.request("POST", "/api/quiz/start", {"language": "english", "words": words}, session)
        self.assertEqual(status, 200)
        status, _ = self.request("POST", "/api/quiz/start", {"language": "japanese", "words": words}, session)
        self.assertEqual(status, 403)
        status, _ = self.request(
            "POST", "/api/admin/membership", {"user_id": account["id"], "membership": "free"}, self.admin_session
        )
        self.assertEqual(status, 200)
        status, me = self.request("GET", "/api/me", session=session)
        self.assertEqual(status, 200, me)
        self.assertEqual(me["account"]["membership"], "free")

    def test_ban_secret_change_delete_and_txt_sync(self):
        username, account, session = self.new_user()
        status, _ = self.request(
            "POST", "/api/admin/ban", {"user_id": account["id"], "banned": True}, self.admin_session
        )
        self.assertEqual(status, 200)
        status, _ = self.request("GET", "/api/me", session=session)
        self.assertEqual(status, 401)
        status, _ = self.request("POST", "/api/login", {"username": username, "secret": "ABC123"})
        self.assertEqual(status, 403)
        self.request("POST", "/api/admin/ban", {"user_id": account["id"], "banned": False}, self.admin_session)
        _, login = self.request("POST", "/api/login", {"username": username, "secret": "ABC123"})
        session = login["session"]
        status, _ = self.request(
            "POST", "/api/admin/secret", {"user_id": account["id"], "secret": "NEW789"}, self.admin_session
        )
        self.assertEqual(status, 200)
        status, _ = self.request("GET", "/api/me", session=session)
        self.assertEqual(status, 401)
        status, login = self.request("POST", "/api/login", {"username": username, "secret": "NEW789"})
        self.assertEqual(status, 200)
        status, _ = self.request(
            "POST", "/api/account/delete", {"secret": "NEW789"}, login["session"]
        )
        self.assertEqual(status, 200)
        text = (ROOT / "users.txt").read_text(encoding="utf-8")
        self.assertNotIn(f"username={username}", text)

    def test_recharge_requires_manual_admin_processing_and_deduplicates(self):
        _, account, session = self.new_user()
        payload = {"plan": "monthly", "trial_language": ""}
        status, first = self.request("POST", "/api/recharge/request", payload, session)
        self.assertEqual(status, 201, first)
        status, second = self.request("POST", "/api/recharge/request", payload, session)
        self.assertEqual(status, 200, second)
        self.assertFalse(second["created"])
        status, me = self.request("GET", "/api/me", session=session)
        self.assertEqual(me["account"]["membership"], "free")
        status, processed = self.request(
            "POST",
            "/api/admin/recharge/process",
            {"request_id": first["request"]["id"], "action": "approve"},
            self.admin_session,
        )
        self.assertEqual(status, 200, processed)
        status, me = self.request("GET", "/api/me", session=session)
        self.assertEqual(me["account"]["membership"], "monthly")

    def test_admin_self_protection(self):
        status, admin = self.request("GET", "/api/me", session=self.admin_session)
        admin_id = admin["account"]["id"]
        paths = (
            ("/api/admin/ban", {"user_id": admin_id, "banned": True}),
            ("/api/admin/delete-user", {"user_id": admin_id}),
            ("/api/admin/membership", {"user_id": admin_id, "membership": "free"}),
            ("/api/admin/secret", {"user_id": admin_id, "secret": "NEW"}),
        )
        for path, payload in paths:
            status, data = self.request("POST", path, payload, self.admin_session)
            self.assertEqual(status, 403, data)


if __name__ == "__main__":
    unittest.main()
