import json
import base64
import os
import tempfile
import threading
import unittest
import urllib.error
import urllib.request
import uuid
from concurrent.futures import ThreadPoolExecutor
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
    def request(cls, method, path, payload=None, session="", extra_headers=None):
        headers = {"Content-Type": "application/json"}
        if session:
            headers["X-Session-Token"] = session
        if extra_headers:
            headers.update(extra_headers)
        data = None if payload is None else json.dumps(payload).encode("utf-8")
        request = urllib.request.Request(cls.base + path, data=data, headers=headers, method=method)
        try:
            with urllib.request.urlopen(request, timeout=15) as response:
                return response.status, json.loads(response.read().decode("utf-8"))
        except urllib.error.HTTPError as error:
            return error.code, json.loads(error.read().decode("utf-8"))

    @classmethod
    def request_raw(cls, method, path, payload=None, session=""):
        headers = {"Content-Type": "application/json"}
        if session:
            headers["X-Session-Token"] = session
        data = None if payload is None else json.dumps(payload).encode("utf-8")
        request = urllib.request.Request(cls.base + path, data=data, headers=headers, method=method)
        try:
            with urllib.request.urlopen(request, timeout=30) as response:
                return response.status, dict(response.headers.items()), response.read()
        except urllib.error.HTTPError as error:
            return error.code, dict(error.headers.items()), error.read()

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

    def test_wrong_book_sanitizer_keeps_newest_entries(self):
        source = {
            f"word-{index}": {"wrong_count": index, "correct_answer": f"meaning-{index}"}
            for index in range(server.MAX_WRONG_BOOK_ITEMS + 10)
        }
        cleaned = server.sanitize_wrong_book(source)
        self.assertEqual(len(cleaned), server.MAX_WRONG_BOOK_ITEMS)
        self.assertNotIn("word-0", cleaned)
        self.assertIn(f"word-{server.MAX_WRONG_BOOK_ITEMS + 9}", cleaned)

    def test_japanese_cognate_meaning_accepts_clear_chinese_synonym(self):
        rubric = {
            "language": "日语",
            "gloss": "植物的花",
            "accepted": ["花朵", "花儿", "花卉"],
            "reading": "はな",
        }
        result = server.judge_answer("花", "花", rubric, "strict")
        self.assertTrue(result["correct"], result)

    def test_ollama_ready_result_is_briefly_cached(self):
        response = mock.MagicMock()
        response.status = 200
        opener = mock.MagicMock()
        opener.open.return_value.__enter__.return_value = response
        server.OLLAMA_READY_CACHE.update({"checked_at": 0.0, "value": False})
        with mock.patch("server.urllib.request.build_opener", return_value=opener):
            self.assertTrue(server.ollama_is_ready())
            self.assertTrue(server.ollama_is_ready())
        self.assertEqual(opener.open.call_count, 1)

    def test_registration_rate_limiter_uses_client_address(self):
        handler = mock.MagicMock()
        handler.headers = {}
        handler.client_address = ("203.0.113.7", 12345)
        server.REGISTER_ATTEMPTS.clear()

    def test_rate_limit_key_ignores_spoofed_forwarded_for_without_cloudflare(self):
        handler = mock.MagicMock()
        handler.headers = {"X-Forwarded-For": "198.51.100.99"}
        handler.client_address = ("203.0.113.7", 12345)
        self.assertEqual(server.request_client_key(handler), "203.0.113.7")
        handler.headers = {"CF-Connecting-IP": "198.51.100.10"}
        self.assertEqual(server.request_client_key(handler), "198.51.100.10")
        with mock.patch.object(server, "REGISTER_MAX_ATTEMPTS", 2):
            self.assertFalse(server.register_limited(handler, record=True))
            self.assertTrue(server.register_limited(handler, record=True))
            self.assertTrue(server.register_limited(handler))
        server.REGISTER_ATTEMPTS.clear()

    def test_status_endpoint_handles_concurrent_burst(self):
        with mock.patch("server.ollama_is_ready", return_value=True):
            with ThreadPoolExecutor(max_workers=24) as pool:
                results = list(pool.map(lambda _: self.request("GET", "/api/status"), range(120)))
        self.assertTrue(all(status == 200 and data.get("ok") for status, data in results))
        self.assertTrue(all(data.get("build") == server.APP_BUILD for _, data in results))

    def test_pdf_export_returns_structurally_valid_multilingual_document(self):
        _, _, session = self.new_user()
        wrong_book = {
            f"word-{index}-\u5b66\u6821": {
                "wrong_count": (index % 4) + 1,
                "last_answer": "\u5b66\u6821 / \u304c\u3063\u3053\u3046",
                "correct_answer": "school; \u5b66\u6821",
                "accepted": ["school", "\u5b66\u6821"],
                "last_time": "2026-07-15 17:00:00",
            }
            for index in range(36)
        }
        status, headers, content = self.request_raw(
            "POST",
            "/api/export-pdf",
            {
                "wrongBook": wrong_book,
                "title": "WYJ\u7684\u7f51\u7ad9\u591a\u8bed\u8a00\u9519\u9898\u672c",
                "meta": {
                    "profile": "PDF \u6d4b\u8bd5",
                    "scope": "\u5386\u53f2\u9519\u9898",
                    "language": "japanese",
                    "practice_mode": "dictation",
                    "grading_mode": "strict",
                },
            },
            session,
        )
        self.assertEqual(status, 200)
        self.assertIn("application/pdf", headers.get("Content-Type", ""))
        self.assertIn("attachment;", headers.get("Content-Disposition", ""))
        self.assertTrue(content.startswith(b"%PDF-1.4"))
        self.assertTrue(content.rstrip().endswith(b"%%EOF"))
        self.assertGreater(len(content), 1000)
        xref_offset = int(content.rsplit(b"startxref\n", 1)[1].splitlines()[0])
        self.assertEqual(content[xref_offset:xref_offset + 5], b"xref\n")

    def test_admin_login_is_strict_and_admin_api_is_protected(self):
        status, _ = self.request("POST", "/api/login", {"username": "WYJ", "secret": ADMIN_SECRET})
        self.assertEqual(status, 403)
        status, users = self.request("GET", "/api/admin/users", session=self.admin_session)
        self.assertEqual(status, 200, users)
        self.assertTrue(any(item["username"] == "wyj" for item in users["users"]))
        _, _, normal_session = self.new_user()
        status, data = self.request("GET", "/api/admin/users", session=normal_session)
        self.assertEqual(status, 403, data)

    def test_admin_user_api_never_exposes_login_secrets(self):
        username, account, _ = self.new_user()
        replacement = "Api-Reset-Secret-789!"
        status, response = self.request(
            "POST",
            "/api/admin/secret",
            {"user_id": account["id"], "secret": replacement},
            self.admin_session,
        )
        self.assertEqual(status, 200, response)
        self.assertNotIn("secret", response)
        status, users = self.request("GET", "/api/admin/users", session=self.admin_session)
        self.assertEqual(status, 200, users)
        target = next(item for item in users["users"] if item["username"] == username)
        self.assertNotIn("secret", target)
        serialized = json.dumps(users, ensure_ascii=False)
        self.assertNotIn("ABC123", serialized)
        self.assertNotIn(replacement, serialized)

    def test_login_audit_records_network_context_and_is_admin_only(self):
        username = "audit" + uuid.uuid4().hex[:8]
        status, registered = self.request(
            "POST",
            "/api/register",
            {"username": username, "secret": "Audit123", "confirm_secret": "Audit123"},
        )
        self.assertEqual(status, 201, registered)
        headers = {
            "X-WYJ-Proxy": "pages",
            "X-WYJ-Client-IP": "203.0.113.88",
            "X-WYJ-Client-Country": "CN",
            "X-WYJ-Client-Region": "Guangdong",
            "X-WYJ-Client-City": "Shenzhen",
            "User-Agent": "Audit-Browser/1.0",
        }
        status, _ = self.request("POST", "/api/login", {"username": username, "secret": "wrong-value"}, extra_headers=headers)
        self.assertEqual(status, 403)
        status, login = self.request("POST", "/api/login", {"username": username, "secret": "Audit123"}, extra_headers=headers)
        self.assertEqual(status, 200, login)
        status, denied = self.request("GET", "/api/admin/login-logs", session=login["session"])
        self.assertEqual(status, 403, denied)
        status, data = self.request("GET", "/api/admin/login-logs", session=self.admin_session)
        self.assertEqual(status, 200, data)
        matching = [item for item in data["logs"] if item["username"] == username]
        self.assertGreaterEqual(len(matching), 2)
        self.assertTrue(matching[0]["success"])
        self.assertEqual(matching[0]["ip_address"], "203.0.113.88")
        self.assertEqual(matching[0]["city"], "Shenzhen")
        self.assertIn("Audit-Browser/1.0", matching[0]["user_agent"])
        serialized = json.dumps(matching, ensure_ascii=False)
        self.assertNotIn("Audit123", serialized)
        self.assertNotIn("wrong-value", serialized)

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

    def test_single_language_plan_is_public_and_recharge_requires_a_language(self):
        status, data = self.request("GET", "/api/membership/plans")
        self.assertEqual(status, 200, data)
        plan = next(item for item in data["plans"] if item["code"] == "trial_single_language")
        self.assertEqual(plan["price_cents"], 800)
        self.assertEqual(plan["price"], "8")
        self.assertTrue(plan["purchasable"])
        self.assertNotIn("tools_access", plan["entitlements"])

        _, _, session = self.new_user()
        status, invalid = self.request(
            "POST", "/api/recharge/request", {"plan": "trial_single_language"}, session
        )
        self.assertEqual(status, 400, invalid)
        self.assertEqual(invalid["code"], "trial_language_invalid")
        status, created = self.request(
            "POST",
            "/api/recharge/request",
            {"plan": "trial_single_language", "trial_language": "english"},
            session,
        )
        self.assertEqual(status, 201, created)
        self.assertEqual(created["request"]["amount_cents"], 800)
        self.assertEqual(created["request"]["trial_language"], "english")

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

    def test_large_vocabulary_request_is_filled_in_batches(self):
        source = {"online": True, "candidates": [], "readings": {}, "snippets": [], "sources": []}
        pool = [f"word{chr(97 + first)}{chr(97 + second)}" for first in range(8) for second in range(26)]

        def batch(_language, _label, count, _source, exclude=None, batch_index=0):
            excluded = {str(word).casefold() for word in exclude or []}
            available = [word for word in pool if word.casefold() not in excluded]
            return available[:count]

        with mock.patch("server.search_vocabulary_sources", return_value=source), mock.patch(
            "server.ai_vocabulary_batch", side_effect=batch
        ) as generate:
            status, data = self.request(
                "POST",
                "/api/vocabulary/suggest",
                {"language": "english", "level": "cet_4", "count": 200},
                self.admin_session,
            )
        self.assertEqual(status, 200, data)
        self.assertEqual(len(data["words"]), 200)
        self.assertEqual(len(set(data["words"])), 200)
        self.assertEqual(generate.call_count, 4)

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

    def test_japanese_suggestion_and_reading_endpoint_return_kana(self):
        source = {
            "online": True,
            "candidates": ["学校", "食べる"],
            "readings": {"学校": "がっこう", "食べる": "たべる"},
            "written_forms": {"学校": "学校", "食べる": "食べる"},
            "snippets": [],
            "sources": [{"title": "Jisho JLPT N5", "url": "https://jisho.org/search/%23jlpt-n5"}],
        }
        with mock.patch("server.search_vocabulary_sources", return_value=source), mock.patch(
            "server.call_ollama", return_value=json.dumps({"words": ["学校", "食べる"]})
        ):
            status, data = self.request(
                "POST",
                "/api/vocabulary/suggest",
                {"language": "japanese", "level": "n5", "count": 2},
                self.admin_session,
            )
        self.assertEqual(status, 200, data)
        self.assertEqual(data["readings"], {"学校": "がっこう", "食べる": "たべる"})
        self.assertEqual(data["written_forms"], {"学校": "学校", "食べる": "食べる"})

        status, started = self.request(
            "POST",
            "/api/quiz/start",
            {"language": "japanese", "words": ["学校", "がっこう", "コーヒー"]},
            self.admin_session,
        )
        self.assertEqual(status, 200, started)
        resolved = (
            {"学校": "がっこう", "がっこう": "がっこう", "コーヒー": "コーヒー"},
            {"学校": "学校", "がっこう": "学校", "コーヒー": "コーヒー"},
        )
        with mock.patch("server.resolve_japanese_forms", return_value=resolved):
            status, readings = self.request(
                "POST",
                "/api/japanese/readings",
                {"words": ["学校", "がっこう", "コーヒー"], "quiz_session": started["quiz_session"]},
                self.admin_session,
            )
        self.assertEqual(status, 200, readings)
        self.assertEqual(readings["readings"]["がっこう"], "がっこう")
        self.assertEqual(readings["written_forms"]["がっこう"], "学校")
        self.assertEqual(readings["written_forms"]["コーヒー"], "コーヒー")

        status, denied = self.request(
            "POST",
            "/api/japanese/readings",
            {"words": ["東京"], "quiz_session": started["quiz_session"]},
            self.admin_session,
        )
        self.assertEqual(status, 403, denied)
        self.assertEqual(denied["code"], "word_not_authorized")

    def test_jisho_keeps_common_katakana_without_forcing_rare_kanji(self):
        payload = {
            "data": [
                {
                    "jlpt": ["jlpt-n5"],
                    "japanese": [{"word": "珈琲", "reading": "コーヒー"}],
                },
                {
                    "jlpt": ["jlpt-n5"],
                    "japanese": [{"word": "学校", "reading": "がっこう"}],
                },
            ]
        }
        with mock.patch("server.web_get", return_value=json.dumps(payload).encode("utf-8")):
            candidates, readings, written_forms = server.jisho_level_candidates("n5", 2)
        self.assertEqual(set(candidates), {"コーヒー", "学校"})
        self.assertEqual(readings["コーヒー"], "コーヒー")
        self.assertEqual(written_forms["コーヒー"], "コーヒー")

    def test_jisho_exact_lookup_adds_common_kanji_for_hiragana_input(self):
        payload = {
            "data": [
                {
                    "is_common": True,
                    "japanese": [{"word": "水", "reading": "みず"}],
                    "senses": [{"tags": []}],
                }
            ]
        }
        with server.STATE_LOCK:
            server.JAPANESE_FORM_CACHE.clear()
        with mock.patch("server.web_get", return_value=json.dumps(payload).encode("utf-8")), mock.patch(
            "server.ai_japanese_form_batch"
        ) as ai:
            readings, written_forms = server.resolve_japanese_forms(["みず"])
        self.assertEqual(readings["みず"], "みず")
        self.assertEqual(written_forms["みず"], "水")
        ai.assert_not_called()

    def test_jisho_exact_lookup_keeps_katakana_without_network_or_ai(self):
        with server.STATE_LOCK:
            server.JAPANESE_FORM_CACHE.clear()
        with mock.patch("server.web_get") as web, mock.patch("server.ai_japanese_form_batch") as ai:
            readings, written_forms = server.resolve_japanese_forms(["コーヒー"])
        self.assertEqual(readings["コーヒー"], "コーヒー")
        self.assertEqual(written_forms["コーヒー"], "コーヒー")
        web.assert_not_called()
        ai.assert_not_called()

    def test_ai_resolves_kanji_and_kana_inputs_without_manual_pairs(self):
        response = {
            "readings": {
                "学校": "がっこう",
                "がっこう": "がっこう",
                "テレビ": "テレビ",
            },
            "written_forms": {
                "学校": "学校",
                "がっこう": "学校",
                "テレビ": "テレビ",
            },
        }
        with mock.patch("server.call_ollama", return_value=json.dumps(response, ensure_ascii=False)):
            readings, written_forms = server.ai_japanese_form_batch(["学校", "がっこう", "テレビ"])
        self.assertEqual(readings["学校"], "がっこう")
        self.assertEqual(written_forms["がっこう"], "学校")
        self.assertEqual(written_forms["テレビ"], "テレビ")

    def test_ai_rechecks_hiragana_that_was_copied_as_written_form(self):
        first = {
            "readings": {"みず": "みず"},
            "written_forms": {"みず": "みず"},
        }
        corrected = {"written_forms": {"みず": "水"}}
        with mock.patch(
            "server.call_ollama",
            side_effect=[json.dumps(first, ensure_ascii=False), json.dumps(corrected, ensure_ascii=False)],
        ) as ollama:
            readings, written_forms = server.ai_japanese_form_batch(["みず"])
        self.assertEqual(readings["みず"], "みず")
        self.assertEqual(written_forms["みず"], "水")
        self.assertEqual(ollama.call_count, 2)

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
        payload = {"plan": "all_access_monthly"}
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
        status, tools = self.request("GET", "/api/tools/access", session=session)
        self.assertEqual(status, 200, tools)
        self.assertTrue(tools["account"]["tools_access"])

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

    def test_membership_catalog_prices_and_order_confirmation(self):
        status, plans = self.request("GET", "/api/membership/plans")
        self.assertEqual(status, 200, plans)
        by_code = {item["code"]: item for item in plans["plans"]}
        self.assertEqual(by_code["japanese_lifetime"]["price_cents"], 7000)
        self.assertEqual(by_code["trial_single_language"]["price_cents"], 800)
        self.assertEqual(by_code["tools_monthly"]["price_cents"], 2000)
        self.assertEqual(by_code["dual_language_monthly"]["price_cents"], 2000)
        self.assertEqual(by_code["all_access_monthly"]["price_cents"], 3000)
        self.assertEqual(by_code["all_access_lifetime"]["price_cents"], 10000)
        self.assertNotIn("tools_access", by_code["japanese_lifetime"]["entitlements"])
        self.assertIn("tools_access", by_code["tools_monthly"]["entitlements"])
        self.assertNotIn("language_all_access", by_code["tools_monthly"]["entitlements"])
        self.assertIn("language_all_access", by_code["dual_language_monthly"]["entitlements"])
        self.assertNotIn("tools_access", by_code["dual_language_monthly"]["entitlements"])
        self.assertEqual(
            set(by_code),
            {"trial_single_language", "tools_monthly", "dual_language_monthly", "japanese_lifetime", "all_access_monthly", "all_access_lifetime"},
        )

        _, _, session = self.new_user()
        status, order = self.request(
            "POST", "/api/recharge/request", {"plan": "all_access_lifetime"}, session
        )
        self.assertEqual(status, 201, order)
        self.assertEqual(order["request"]["amount_cents"], 10000)
        self.assertRegex(order["request"]["order_number"], r"^WYJ-\d{8}-[A-F0-9]{8}$")
        status, confirmed = self.request(
            "POST", "/api/recharge/confirm", {"request_id": order["request"]["id"]}, session
        )
        self.assertEqual(status, 200, confirmed)
        self.assertEqual(confirmed["request"]["status"], "user_paid")
        status, legacy = self.request("POST", "/api/recharge/request", {"plan": "monthly"}, session)
        self.assertEqual(status, 400, legacy)
        self.assertEqual(legacy["code"], "plan_invalid")

    def test_tools_access_uses_merged_server_entitlements(self):
        _, account, session = self.new_user()
        status, denied = self.request("GET", "/api/tools/access", session=session)
        self.assertEqual(status, 403, denied)

        status, _ = self.request(
            "POST",
            "/api/admin/membership/manage",
            {"user_id": account["id"], "action": "grant", "plan_code": "japanese_lifetime"},
            self.admin_session,
        )
        self.assertEqual(status, 200)
        status, _ = self.request("GET", "/api/tools/access", session=session)
        self.assertEqual(status, 403)

        status, granted = self.request(
            "POST",
            "/api/admin/membership/manage",
            {"user_id": account["id"], "action": "grant", "plan_code": "all_access_monthly"},
            self.admin_session,
        )
        self.assertEqual(status, 200, granted)
        status, access = self.request("GET", "/api/tools/access", session=session)
        self.assertEqual(status, 200, access)
        self.assertTrue(access["account"]["tools_access"])

        status, _ = self.request(
            "POST", "/api/tools/favorite", {"tool_id": "json-format", "favorite": True, "pinned": True}, session
        )
        self.assertEqual(status, 200)
        status, _ = self.request("POST", "/api/tools/recent", {"tool_id": "json-format"}, session)
        self.assertEqual(status, 200)
        status, preferences = self.request("GET", "/api/tools/preferences", session=session)
        self.assertEqual(status, 200, preferences)
        self.assertEqual(preferences["favorites"][0]["tool_id"], "json-format")
        self.assertEqual(preferences["recent"][0]["tool_id"], "json-format")

        status, _ = self.request(
            "POST",
            "/api/admin/membership/manage",
            {"user_id": account["id"], "action": "cancel", "plan_code": "all_access_monthly"},
            self.admin_session,
        )
        self.assertEqual(status, 200)
        status, me = self.request("GET", "/api/me", session=session)
        self.assertIn("language_japanese_access", me["account"]["entitlements"])
        self.assertNotIn("tools_access", me["account"]["entitlements"])
        status, _ = self.request("GET", "/api/tools/access", session=session)
        self.assertEqual(status, 403)

    def test_new_twenty_cny_monthly_plans_are_enforced_by_api(self):
        _, account, session = self.new_user()
        words = [f"word{index}" for index in range(16)]
        status, granted = self.request(
            "POST",
            "/api/admin/membership/manage",
            {"user_id": account["id"], "action": "grant", "plan_code": "tools_monthly"},
            self.admin_session,
        )
        self.assertEqual(status, 200, granted)
        status, _ = self.request("GET", "/api/tools/access", session=session)
        self.assertEqual(status, 200)
        status, denied = self.request("POST", "/api/quiz/start", {"language": "english", "words": words}, session)
        self.assertEqual(status, 403, denied)

        self.request(
            "POST",
            "/api/admin/membership/manage",
            {"user_id": account["id"], "action": "cancel", "plan_code": "tools_monthly"},
            self.admin_session,
        )
        status, granted = self.request(
            "POST",
            "/api/admin/membership/manage",
            {"user_id": account["id"], "action": "grant", "plan_code": "dual_language_monthly"},
            self.admin_session,
        )
        self.assertEqual(status, 200, granted)
        status, _ = self.request("POST", "/api/quiz/start", {"language": "english", "words": words}, session)
        self.assertEqual(status, 200)
        status, _ = self.request("POST", "/api/quiz/start", {"language": "japanese", "words": words}, session)
        self.assertEqual(status, 200)
        status, denied = self.request("GET", "/api/tools/access", session=session)
        self.assertEqual(status, 403, denied)

    def test_own_secret_change_rejects_mismatched_confirmation(self):
        username, _account, session = self.new_user()
        status, data = self.request(
            "POST",
            "/api/account/secret",
            {"current_secret": "ABC123", "new_secret": "Changed123", "confirm_secret": "Different123"},
            session,
        )
        self.assertEqual(status, 400, data)
        self.assertEqual(data["code"], "secret_mismatch")
        status, _ = self.request("POST", "/api/login", {"username": username, "secret": "ABC123"})
        self.assertEqual(status, 200)

    def test_tool_history_handles_concurrent_writes(self):
        _, account, session = self.new_user()
        status, _ = self.request(
            "POST",
            "/api/admin/membership/manage",
            {"user_id": account["id"], "action": "grant", "plan_code": "all_access_lifetime"},
            self.admin_session,
        )
        self.assertEqual(status, 200)

        with ThreadPoolExecutor(max_workers=16) as pool:
            results = list(
                pool.map(
                    lambda index: self.request(
                        "POST", "/api/tools/recent", {"tool_id": f"stress-tool-{index}"}, session
                    ),
                    range(40),
                )
            )

        self.assertTrue(all(status == 200 for status, _data in results), results)
        status, preferences = self.request("GET", "/api/tools/preferences", session=session)
        self.assertEqual(status, 200, preferences)
        self.assertEqual(len(preferences["recent"]), 30)

    def test_temporary_text_file_clipboard_and_room_lifecycle(self):
        _, account, session = self.new_user()
        status, _ = self.request(
            "POST",
            "/api/admin/membership/manage",
            {"user_id": account["id"], "action": "grant", "plan_code": "all_access_lifetime"},
            self.admin_session,
        )
        self.assertEqual(status, 200)

        status, created = self.request(
            "POST",
            "/api/temporary/text",
            {"content": "临时内容", "password": "secret", "minutes": 5, "max_views": 2, "destroy_after_read": True},
            session,
        )
        self.assertEqual(status, 201, created)
        share_id = created["share"]["id"]
        status, _ = self.request("POST", "/api/share/text/read", {"id": share_id, "password": "wrong"})
        self.assertEqual(status, 403)
        status, opened = self.request("POST", "/api/share/text/read", {"id": share_id, "password": "secret"})
        self.assertEqual(status, 200, opened)
        self.assertEqual(opened["share"]["content"], "临时内容")
        status, _ = self.request("POST", "/api/share/text/read", {"id": share_id, "password": "secret"})
        self.assertEqual(status, 404)

        encoded = base64.b64encode(b"safe file").decode("ascii")
        status, file_created = self.request(
            "POST",
            "/api/temporary/file",
            {"file_name": "../../safe.txt", "mime_type": "text/plain", "base64": encoded, "minutes": 5, "max_downloads": 1},
            session,
        )
        self.assertEqual(status, 201, file_created)
        status, file_opened = self.request(
            "POST", "/api/share/file/read", {"id": file_created["file"]["id"]}
        )
        self.assertEqual(status, 200, file_opened)
        self.assertEqual(file_opened["file"]["file_name"], "safe.txt")
        self.assertEqual(base64.b64decode(file_opened["file"]["base64"]), b"safe file")

        status, rejected_file = self.request(
            "POST",
            "/api/temporary/file",
            {
                "file_name": "fake.png",
                "mime_type": "image/png",
                "base64": base64.b64encode(b"not a png").decode("ascii"),
                "minutes": 5,
            },
            session,
        )
        self.assertEqual(status, 400, rejected_file)
        self.assertEqual(rejected_file["code"], "file_signature_invalid")

        status, clipboard = self.request(
            "POST", "/api/temporary/clipboard", {"content": "跨设备", "minutes": 5, "destroy_after_read": True}, session
        )
        self.assertEqual(status, 201, clipboard)
        self.assertRegex(clipboard["clipboard"]["code"], r"^\d{6}$")
        status, clip_read = self.request(
            "POST", "/api/share/clipboard/read", {"code": clipboard["clipboard"]["code"]}
        )
        self.assertEqual(status, 200, clip_read)
        self.assertEqual(clip_read["clipboard"]["content"], "跨设备")

        status, room = self.request(
            "POST", "/api/temporary/room", {"password": "room-pass", "minutes": 5, "max_messages": 3}, session
        )
        self.assertEqual(status, 201, room)
        room_id = room["room"]["id"]
        status, posted = self.request(
            "POST", "/api/share/room/post", {"id": room_id, "password": "room-pass", "author": "访客", "message": "你好"}
        )
        self.assertEqual(status, 201, posted)
        self.assertEqual(posted["room"]["messages"][0]["message"], "你好")

    def test_cross_origin_post_is_rejected(self):
        status, data = self.request(
            "POST",
            "/api/login",
            {"username": "nobody", "secret": "bad"},
            extra_headers={"Origin": "https://evil.example"},
        )
        self.assertEqual(status, 403, data)
        self.assertEqual(data["code"], "origin_forbidden")


if __name__ == "__main__":
    unittest.main()
