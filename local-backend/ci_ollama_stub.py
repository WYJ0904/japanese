#!/usr/bin/env python3
"""Deterministic Ollama-compatible fixture for isolated browser CI."""

from __future__ import annotations

import argparse
import json
from http import HTTPStatus
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer


ENGLISH_WORDS = (
    "apple",
    "book",
    "cat",
    "dog",
    "earth",
    "flower",
    "green",
    "house",
    "idea",
    "juice",
    "kite",
    "light",
    "music",
    "night",
    "orange",
    "paper",
    "queen",
    "river",
    "school",
    "table",
)

JAPANESE_FORMS = {
    "電話": ("でんわ", "電話"),
    "でんわ": ("でんわ", "電話"),
    "花": ("はな", "花"),
    "はな": ("はな", "花"),
    "みず": ("みず", "水"),
    "水": ("みず", "水"),
}


def decode_user_data(payload: dict) -> tuple[str, dict]:
    messages = payload.get("messages")
    if not isinstance(messages, list):
        return str(payload.get("prompt") or ""), {}

    system_text = "\n".join(
        str(item.get("content") or "")
        for item in messages
        if isinstance(item, dict) and item.get("role") == "system"
    )
    user_text = next(
        (
            str(item.get("content") or "")
            for item in reversed(messages)
            if isinstance(item, dict) and item.get("role") == "user"
        ),
        "",
    )
    try:
        user_data = json.loads(user_text)
    except (TypeError, json.JSONDecodeError):
        user_data = {}
    return system_text, user_data if isinstance(user_data, dict) else {}


def fixture_content(payload: dict) -> str:
    system_text, user_data = decode_user_data(payload)

    if {"language", "level", "count", "reference"} <= user_data.keys():
        excluded = {str(item).casefold() for item in user_data.get("exclude", [])}
        count = max(1, min(int(user_data.get("count") or 3), len(ENGLISH_WORDS)))
        words = [word for word in ENGLISH_WORDS if word.casefold() not in excluded][:count]
        return json.dumps({"words": words}, ensure_ascii=False)

    words = user_data.get("words")
    if isinstance(words, list):
        readings = {}
        written_forms = {}
        for item in words:
            word = str(item)
            reading, written = JAPANESE_FORMS.get(word, (word, word))
            readings[word] = reading
            written_forms[word] = written
        if "written_forms" in system_text and "readings" not in system_text:
            return json.dumps({"written_forms": written_forms}, ensure_ascii=False)
        return json.dumps(
            {"readings": readings, "written_forms": written_forms},
            ensure_ascii=False,
        )

    if "student_answer" in user_data:
        rubric = user_data.get("rubric") if isinstance(user_data.get("rubric"), dict) else {}
        return json.dumps(
            {
                "correct": False,
                "final_gloss": rubric.get("gloss", "测试释义"),
                "accepted": rubric.get("accepted", []),
            },
            ensure_ascii=False,
        )

    if "word" in user_data:
        word = str(user_data.get("word") or "")
        reading = JAPANESE_FORMS.get(word, ("", ""))[0]
        return json.dumps(
            {
                "gloss": "测试释义",
                "accepted": ["测试释义"],
                "notes": "CI fixture",
                "reading": reading,
            },
            ensure_ascii=False,
        )

    return json.dumps({"ok": True})


class FixtureHandler(BaseHTTPRequestHandler):
    server_version = "WYJ-CI-Ollama/1.0"

    def log_message(self, _format: str, *_args) -> None:
        return

    def write_json(self, status: HTTPStatus, payload: dict) -> None:
        body = json.dumps(payload, ensure_ascii=False).encode("utf-8")
        self.send_response(status)
        self.send_header("Content-Type", "application/json; charset=utf-8")
        self.send_header("Content-Length", str(len(body)))
        self.end_headers()
        self.wfile.write(body)

    def do_GET(self) -> None:
        if self.path == "/api/tags":
            self.write_json(HTTPStatus.OK, {"models": [{"name": "ci-fixture"}]})
            return
        self.write_json(HTTPStatus.NOT_FOUND, {"error": "fixture endpoint not found"})

    def do_POST(self) -> None:
        try:
            length = int(self.headers.get("Content-Length", "0"))
            payload = json.loads(self.rfile.read(length) or b"{}")
        except (ValueError, json.JSONDecodeError):
            self.write_json(HTTPStatus.BAD_REQUEST, {"error": "invalid JSON"})
            return

        content = fixture_content(payload if isinstance(payload, dict) else {})
        if self.path == "/api/chat":
            self.write_json(
                HTTPStatus.OK,
                {"message": {"role": "assistant", "content": content}, "done": True},
            )
            return
        if self.path == "/api/generate":
            self.write_json(HTTPStatus.OK, {"response": content, "done": True})
            return
        self.write_json(HTTPStatus.NOT_FOUND, {"error": "fixture endpoint not found"})


def main() -> None:
    parser = argparse.ArgumentParser()
    parser.add_argument("--host", default="127.0.0.1")
    parser.add_argument("--port", type=int, default=11435)
    args = parser.parse_args()
    ThreadingHTTPServer((args.host, args.port), FixtureHandler).serve_forever()


if __name__ == "__main__":
    main()
