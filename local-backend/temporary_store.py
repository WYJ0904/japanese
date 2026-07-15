import hashlib
import hmac
import json
import os
import re
import secrets
import sqlite3
import threading
import uuid
from contextlib import contextmanager
from datetime import timedelta
from pathlib import Path

from account_store import AccountError, hash_secret, iso_now, parse_time, utc_now, verify_secret


MAX_TEMP_TEXT_BYTES = 100 * 1024
MAX_TEMP_FILE_BYTES = 350 * 1024
MAX_ROOM_MESSAGE_BYTES = 4 * 1024
MAX_TEMP_LIFETIME_MINUTES = 7 * 24 * 60
ALLOWED_FILE_TYPES = {
    ".txt": {"text/plain"},
    ".csv": {"text/csv", "application/csv", "text/plain"},
    ".json": {"application/json", "text/json", "text/plain"},
    ".pdf": {"application/pdf"},
    ".png": {"image/png"},
    ".jpg": {"image/jpeg"},
    ".jpeg": {"image/jpeg"},
    ".webp": {"image/webp"},
    ".gif": {"image/gif"},
    ".zip": {"application/zip", "application/x-zip-compressed"},
}
CODE_PEPPER = (
    os.environ.get("VOCAB_SHARE_HMAC_KEY", "").strip()
    or os.environ.get("VOCAB_ADMIN_SECRET", "").strip()
    or secrets.token_urlsafe(32)
).encode("utf-8")


def clean_text(value, limit_bytes):
    text = str(value or "").replace("\x00", "")
    text = "".join(char for char in text if char in "\n\r\t" or ord(char) >= 32)
    encoded = text.encode("utf-8")
    if len(encoded) > limit_bytes:
        raise AccountError(f"内容不能超过 {limit_bytes // 1024} KB", 413, "temporary_content_too_large")
    return text


def expiry_value(minutes):
    try:
        safe_minutes = int(minutes or 10)
    except (TypeError, ValueError) as exc:
        raise AccountError("过期时间无效", 400, "expiry_invalid") from exc
    if not 1 <= safe_minutes <= MAX_TEMP_LIFETIME_MINUTES:
        raise AccountError("过期时间必须在 1 分钟到 7 天之间", 400, "expiry_invalid")
    return (utc_now() + timedelta(minutes=safe_minutes)).replace(microsecond=0).isoformat().replace("+00:00", "Z")


def safe_int(value, minimum, maximum, fallback):
    try:
        result = int(value)
    except (TypeError, ValueError):
        result = fallback
    return max(minimum, min(maximum, result))


def code_digest(code):
    return hmac.new(CODE_PEPPER, str(code or "").encode("utf-8"), hashlib.sha256).hexdigest()


class TemporaryStore:
    def __init__(self, database_path):
        self.database_path = Path(database_path)
        self.lock = threading.RLock()

    @contextmanager
    def connect(self):
        connection = sqlite3.connect(str(self.database_path), timeout=15)
        connection.row_factory = sqlite3.Row
        connection.execute("PRAGMA foreign_keys = ON")
        connection.execute("PRAGMA busy_timeout = 15000")
        try:
            yield connection
            connection.commit()
        except Exception:
            connection.rollback()
            raise
        finally:
            connection.close()

    def cleanup_expired(self):
        now = iso_now()
        with self.lock, self.connect() as connection:
            removed = 0
            for table in ("temporary_texts", "temporary_files", "temporary_clipboards", "temporary_rooms"):
                removed += connection.execute(
                    f"DELETE FROM {table} WHERE expires_at <= ?", (now,)
                ).rowcount
        return removed

    @staticmethod
    def _check_password(provided, encoded):
        if encoded and not verify_secret(provided, encoded):
            raise AccountError("访问密码错误", 403, "share_password_invalid")

    def create_text(self, user, content, password="", minutes=60, max_views=10, destroy_after_read=False, kind="text"):
        content = clean_text(content, MAX_TEMP_TEXT_BYTES)
        if not content:
            raise AccountError("分享内容不能为空", 400, "temporary_content_required")
        kind = str(kind or "text").strip().lower()
        if kind not in {"text", "qr", "wifi", "contact"}:
            kind = "text"
        record_id = secrets.token_urlsafe(18)
        now = iso_now()
        expires_at = expiry_value(minutes)
        max_views = safe_int(max_views, 1, 1000, 10)
        with self.lock, self.connect() as connection:
            connection.execute(
                """
                INSERT INTO temporary_texts (
                    id, owner_user_id, kind, content, password_hash, expires_at,
                    max_views, destroy_after_read, created_at
                ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
                """,
                (
                    record_id,
                    user["id"],
                    kind,
                    content,
                    hash_secret(password) if password else "",
                    expires_at,
                    max_views,
                    int(bool(destroy_after_read)),
                    now,
                ),
            )
        return {
            "id": record_id,
            "kind": kind,
            "expires_at": expires_at,
            "max_views": max_views,
            "destroy_after_read": bool(destroy_after_read),
            "password_required": bool(password),
        }

    def read_text(self, record_id, password=""):
        self.cleanup_expired()
        with self.lock, self.connect() as connection:
            row = connection.execute("SELECT * FROM temporary_texts WHERE id = ?", (str(record_id or ""),)).fetchone()
            if not row:
                raise AccountError("分享不存在或已过期", 404, "share_not_found")
            self._check_password(password, row["password_hash"])
            next_count = row["view_count"] + 1
            result = {
                "id": row["id"],
                "kind": row["kind"],
                "content": row["content"],
                "expires_at": row["expires_at"],
                "view_count": next_count,
                "max_views": row["max_views"],
            }
            if row["destroy_after_read"] or next_count >= row["max_views"]:
                connection.execute("DELETE FROM temporary_texts WHERE id = ?", (row["id"],))
                result["destroyed"] = True
            else:
                connection.execute("UPDATE temporary_texts SET view_count = ? WHERE id = ?", (next_count, row["id"]))
                result["destroyed"] = False
            return result

    @staticmethod
    def _content_matches_extension(extension, content):
        signatures = {
            ".pdf": (b"%PDF-",),
            ".png": (b"\x89PNG\r\n\x1a\n",),
            ".jpg": (b"\xff\xd8\xff",),
            ".jpeg": (b"\xff\xd8\xff",),
            ".gif": (b"GIF87a", b"GIF89a"),
            ".zip": (b"PK\x03\x04", b"PK\x05\x06", b"PK\x07\x08"),
        }
        if extension in signatures:
            return any(content.startswith(signature) for signature in signatures[extension])
        if extension == ".webp":
            return len(content) >= 12 and content[:4] == b"RIFF" and content[8:12] == b"WEBP"
        if extension in {".txt", ".csv", ".json"}:
            encodings = ("utf-8-sig", "utf-16") if content.startswith((b"\xff\xfe", b"\xfe\xff")) else ("utf-8-sig",)
            decoded = None
            for encoding in encodings:
                try:
                    decoded = content.decode(encoding)
                    break
                except UnicodeDecodeError:
                    continue
            if decoded is None or "\x00" in decoded:
                return False
            if extension == ".json":
                try:
                    json.loads(decoded)
                except (json.JSONDecodeError, TypeError):
                    return False
            return True
        return False

    @staticmethod
    def validate_file(file_name, mime_type, content):
        name = Path(str(file_name or "").replace("\\", "/")).name
        if not name or name in {".", ".."} or not re.fullmatch(r"[\w .()\-\u4e00-\u9fff\u3040-\u30ff]{1,120}", name):
            raise AccountError("文件名无效", 400, "file_name_invalid")
        extension = Path(name).suffix.lower()
        mime = str(mime_type or "application/octet-stream").lower().split(";", 1)[0]
        if extension not in ALLOWED_FILE_TYPES or mime not in ALLOWED_FILE_TYPES[extension]:
            raise AccountError("不支持该文件类型或类型与扩展名不匹配", 400, "file_type_invalid")
        if len(content) > MAX_TEMP_FILE_BYTES:
            raise AccountError(f"临时文件不能超过 {MAX_TEMP_FILE_BYTES // 1024} KB", 413, "file_too_large")
        if not content:
            raise AccountError("文件不能为空", 400, "file_empty")
        if not TemporaryStore._content_matches_extension(extension, content):
            raise AccountError("文件内容与扩展名不匹配或格式无效", 400, "file_signature_invalid")
        return name, mime

    def create_file(self, user, file_name, mime_type, content, password="", minutes=60, max_downloads=5, destroy_after_download=False):
        name, mime = self.validate_file(file_name, mime_type, content)
        record_id = secrets.token_urlsafe(18)
        now = iso_now()
        expires_at = expiry_value(minutes)
        max_downloads = safe_int(max_downloads, 1, 100, 5)
        with self.lock, self.connect() as connection:
            connection.execute(
                """
                INSERT INTO temporary_files (
                    id, owner_user_id, file_name, mime_type, size_bytes, content,
                    password_hash, expires_at, max_downloads, destroy_after_download, created_at
                ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
                """,
                (
                    record_id,
                    user["id"],
                    name,
                    mime,
                    len(content),
                    sqlite3.Binary(content),
                    hash_secret(password) if password else "",
                    expires_at,
                    max_downloads,
                    int(bool(destroy_after_download)),
                    now,
                ),
            )
        return {
            "id": record_id,
            "file_name": name,
            "mime_type": mime,
            "size_bytes": len(content),
            "expires_at": expires_at,
            "max_downloads": max_downloads,
            "password_required": bool(password),
        }

    def read_file(self, record_id, password=""):
        self.cleanup_expired()
        with self.lock, self.connect() as connection:
            row = connection.execute("SELECT * FROM temporary_files WHERE id = ?", (str(record_id or ""),)).fetchone()
            if not row:
                raise AccountError("文件不存在或已过期", 404, "share_not_found")
            self._check_password(password, row["password_hash"])
            next_count = row["download_count"] + 1
            result = dict(row)
            if row["destroy_after_download"] or next_count >= row["max_downloads"]:
                connection.execute("DELETE FROM temporary_files WHERE id = ?", (row["id"],))
                result["destroyed"] = True
            else:
                connection.execute("UPDATE temporary_files SET download_count = ? WHERE id = ?", (next_count, row["id"]))
                result["destroyed"] = False
            result["download_count"] = next_count
            return result

    def create_clipboard(self, user, content, minutes=10, destroy_after_read=True):
        content = clean_text(content, MAX_TEMP_TEXT_BYTES)
        if not content:
            raise AccountError("剪贴板内容不能为空", 400, "temporary_content_required")
        now = iso_now()
        expires_at = expiry_value(minutes)
        for _ in range(20):
            code = f"{secrets.randbelow(1_000_000):06d}"
            digest = code_digest(code)
            try:
                with self.lock, self.connect() as connection:
                    connection.execute(
                        """
                        INSERT INTO temporary_clipboards (
                            id, code_hash, owner_user_id, content, expires_at,
                            destroy_after_read, created_at
                        ) VALUES (?, ?, ?, ?, ?, ?, ?)
                        """,
                        (
                            str(uuid.uuid4()),
                            digest,
                            user["id"],
                            content,
                            expires_at,
                            int(bool(destroy_after_read)),
                            now,
                        ),
                    )
                return {"code": code, "expires_at": expires_at, "destroy_after_read": bool(destroy_after_read)}
            except sqlite3.IntegrityError:
                continue
        raise AccountError("暂时无法生成连接码，请重试", 503, "clipboard_code_busy")

    def read_clipboard(self, code):
        code = str(code or "").strip()
        if not re.fullmatch(r"\d{6}", code):
            raise AccountError("连接码必须是六位数字", 400, "clipboard_code_invalid")
        self.cleanup_expired()
        with self.lock, self.connect() as connection:
            row = connection.execute("SELECT * FROM temporary_clipboards WHERE code_hash = ?", (code_digest(code),)).fetchone()
            if not row:
                raise AccountError("连接码无效或已过期", 404, "clipboard_not_found")
            next_count = row["read_count"] + 1
            result = {"content": row["content"], "expires_at": row["expires_at"], "read_count": next_count}
            if row["destroy_after_read"]:
                connection.execute("DELETE FROM temporary_clipboards WHERE id = ?", (row["id"],))
                result["destroyed"] = True
            else:
                connection.execute("UPDATE temporary_clipboards SET read_count = ? WHERE id = ?", (next_count, row["id"]))
                result["destroyed"] = False
            return result

    def create_room(self, user, password="", minutes=60, max_messages=50):
        room_id = secrets.token_urlsafe(16)
        expires_at = expiry_value(minutes)
        max_messages = safe_int(max_messages, 1, 200, 50)
        with self.lock, self.connect() as connection:
            connection.execute(
                """
                INSERT INTO temporary_rooms (
                    id, owner_user_id, password_hash, max_messages, expires_at, created_at
                ) VALUES (?, ?, ?, ?, ?, ?)
                """,
                (room_id, user["id"], hash_secret(password) if password else "", max_messages, expires_at, iso_now()),
            )
        return {
            "id": room_id,
            "expires_at": expires_at,
            "max_messages": max_messages,
            "password_required": bool(password),
        }

    def room_messages(self, room_id, password=""):
        self.cleanup_expired()
        with self.connect() as connection:
            room = connection.execute("SELECT * FROM temporary_rooms WHERE id = ?", (str(room_id or ""),)).fetchone()
            if not room:
                raise AccountError("留言房间不存在或已过期", 404, "room_not_found")
            self._check_password(password, room["password_hash"])
            messages = [
                dict(row)
                for row in connection.execute(
                    "SELECT id, author, message, created_at FROM temporary_room_messages WHERE room_id = ? ORDER BY created_at",
                    (room["id"],),
                ).fetchall()
            ]
        return {"id": room["id"], "expires_at": room["expires_at"], "max_messages": room["max_messages"], "messages": messages}

    def post_room_message(self, room_id, author, message, password=""):
        author = clean_text(author, 120).strip()[:30] or "访客"
        message = clean_text(message, MAX_ROOM_MESSAGE_BYTES).strip()
        if not message:
            raise AccountError("留言不能为空", 400, "message_required")
        self.cleanup_expired()
        with self.lock, self.connect() as connection:
            room = connection.execute("SELECT * FROM temporary_rooms WHERE id = ?", (str(room_id or ""),)).fetchone()
            if not room:
                raise AccountError("留言房间不存在或已过期", 404, "room_not_found")
            self._check_password(password, room["password_hash"])
            message_id = str(uuid.uuid4())
            connection.execute(
                "INSERT INTO temporary_room_messages (id, room_id, author, message, created_at) VALUES (?, ?, ?, ?, ?)",
                (message_id, room["id"], author, message, iso_now()),
            )
            connection.execute(
                """
                DELETE FROM temporary_room_messages WHERE id IN (
                    SELECT id FROM temporary_room_messages WHERE room_id = ?
                    ORDER BY created_at DESC LIMIT -1 OFFSET ?
                )
                """,
                (room["id"], room["max_messages"]),
            )
        return message_id

    def clear_room(self, user, room_id):
        with self.lock, self.connect() as connection:
            room = connection.execute("SELECT owner_user_id FROM temporary_rooms WHERE id = ?", (str(room_id or ""),)).fetchone()
            if not room:
                raise AccountError("留言房间不存在", 404, "room_not_found")
            if room["owner_user_id"] != user["id"]:
                raise AccountError("只有创建者可以清空房间", 403, "forbidden")
            connection.execute("DELETE FROM temporary_room_messages WHERE room_id = ?", (str(room_id),))
