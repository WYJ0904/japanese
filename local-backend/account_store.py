import os
import re
import secrets
import sqlite3
import threading
import uuid
from contextlib import contextmanager
from datetime import datetime, timedelta, timezone
from pathlib import Path


ADMIN_USERNAME = "wyj"
ADMIN_SECRET = os.environ.get("VOCAB_ADMIN_SECRET", "").strip() or secrets.token_urlsafe(12)
MEMBERSHIPS = {"free", "trial_single_language", "monthly", "lifetime"}
LANGUAGES = {"english", "japanese"}
RECHARGE_PLANS = {"trial_single_language", "monthly", "lifetime"}
SESSION_TTL_SECONDS = 7 * 24 * 60 * 60


def utc_now():
    return datetime.now(timezone.utc).replace(microsecond=0)


def iso_now():
    return utc_now().isoformat().replace("+00:00", "Z")


def parse_time(value):
    text = str(value or "").strip()
    if not text:
        return None
    try:
        return datetime.fromisoformat(text.replace("Z", "+00:00")).astimezone(timezone.utc)
    except ValueError:
        return None


def membership_time_value(value, end_of_day=False, now=None):
    text = str(value or "").strip()
    if not text:
        return ""
    local_now = (now or datetime.now().astimezone()).astimezone()
    normalized = re.sub(r"[\u5e74\u6708\u65e5./\u3002\-]+", " ", text)
    date_parts = normalized.split()
    if len(date_parts) == 3 and all(part.isdigit() for part in date_parts):
        try:
            year, month, day = (int(part) for part in date_parts)
            if end_of_day:
                local_value = datetime(year, month, day, 23, 59, 59, tzinfo=local_now.tzinfo)
            else:
                local_value = datetime(
                    year,
                    month,
                    day,
                    local_now.hour,
                    local_now.minute,
                    local_now.second,
                    tzinfo=local_now.tzinfo,
                )
            return local_value.astimezone(timezone.utc).replace(microsecond=0).isoformat().replace("+00:00", "Z")
        except ValueError:
            return ""
    parsed = parse_time(text)
    if not parsed:
        return ""
    return parsed.replace(microsecond=0).isoformat().replace("+00:00", "Z")


def default_membership_expiry(now=None):
    local_now = (now or datetime.now().astimezone()).astimezone()
    expiry_date = (local_now + timedelta(days=30)).date()
    local_expiry = datetime(
        expiry_date.year,
        expiry_date.month,
        expiry_date.day,
        23,
        59,
        59,
        tzinfo=local_now.tzinfo,
    )
    return local_expiry.astimezone(timezone.utc).isoformat().replace("+00:00", "Z")


class AccountError(Exception):
    def __init__(self, message, status=400, code="account_error", committed=False):
        super().__init__(message)
        self.status = status
        self.code = code
        self.committed = committed


class AccountStore:
    def __init__(self, database_path, text_path):
        self.database_path = Path(database_path)
        self.text_path = Path(text_path)
        self.lock = threading.RLock()
        self.database_path.parent.mkdir(parents=True, exist_ok=True)
        self.text_path.parent.mkdir(parents=True, exist_ok=True)
        self.initialize()

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

    def initialize(self):
        with self.lock, self.connect() as connection:
            connection.executescript(
                """
                PRAGMA journal_mode = WAL;
                CREATE TABLE IF NOT EXISTS users (
                    id TEXT PRIMARY KEY,
                    username TEXT NOT NULL,
                    username_normalized TEXT NOT NULL UNIQUE,
                    secret TEXT NOT NULL,
                    role TEXT NOT NULL DEFAULT 'user',
                    membership TEXT NOT NULL DEFAULT 'free',
                    membership_start TEXT NOT NULL DEFAULT '',
                    membership_expires TEXT NOT NULL DEFAULT '',
                    trial_language TEXT NOT NULL DEFAULT '',
                    registered_at TEXT NOT NULL,
                    last_login_at TEXT NOT NULL DEFAULT '',
                    banned INTEGER NOT NULL DEFAULT 0,
                    permanent_ban INTEGER NOT NULL DEFAULT 0,
                    ban_reason TEXT NOT NULL DEFAULT '',
                    deleted INTEGER NOT NULL DEFAULT 0,
                    session_version INTEGER NOT NULL DEFAULT 1,
                    created_at TEXT NOT NULL,
                    updated_at TEXT NOT NULL
                );
                CREATE TABLE IF NOT EXISTS sessions (
                    token TEXT PRIMARY KEY,
                    user_id TEXT NOT NULL,
                    session_version INTEGER NOT NULL,
                    created_at TEXT NOT NULL,
                    last_seen_at TEXT NOT NULL,
                    FOREIGN KEY(user_id) REFERENCES users(id) ON DELETE CASCADE
                );
                CREATE INDEX IF NOT EXISTS sessions_user_id_idx ON sessions(user_id);
                CREATE TABLE IF NOT EXISTS recharge_requests (
                    id TEXT PRIMARY KEY,
                    user_id TEXT NOT NULL,
                    username TEXT NOT NULL,
                    plan TEXT NOT NULL,
                    trial_language TEXT NOT NULL DEFAULT '',
                    status TEXT NOT NULL DEFAULT 'pending',
                    requested_at TEXT NOT NULL,
                    updated_at TEXT NOT NULL,
                    handled_at TEXT NOT NULL DEFAULT '',
                    handled_by TEXT NOT NULL DEFAULT '',
                    FOREIGN KEY(user_id) REFERENCES users(id) ON DELETE CASCADE
                );
                CREATE INDEX IF NOT EXISTS recharge_user_idx ON recharge_requests(user_id);
                CREATE UNIQUE INDEX IF NOT EXISTS recharge_one_pending_per_user
                    ON recharge_requests(user_id) WHERE status = 'pending';
                """
            )
            now = iso_now()
            admin = connection.execute(
                "SELECT id FROM users WHERE username_normalized = ?", (ADMIN_USERNAME,)
            ).fetchone()
            if admin:
                connection.execute(
                    """
                    UPDATE users SET username = ?, role = 'super_admin',
                        membership = 'lifetime', membership_start = '', membership_expires = '',
                        trial_language = '', banned = 0, permanent_ban = 0, deleted = 0,
                        ban_reason = '', updated_at = ? WHERE id = ?
                    """,
                    (ADMIN_USERNAME, now, admin["id"]),
                )
            else:
                admin_id = str(uuid.uuid4())
                connection.execute(
                    """
                    INSERT INTO users (
                        id, username, username_normalized, secret, role, membership,
                        registered_at, created_at, updated_at
                    ) VALUES (?, ?, ?, ?, 'super_admin', 'lifetime', ?, ?, ?)
                    """,
                    (admin_id, ADMIN_USERNAME, ADMIN_USERNAME, ADMIN_SECRET, now, now, now),
                )
        self.sync_text()

    @staticmethod
    def normalize_username(username):
        return str(username or "").strip().casefold()

    @staticmethod
    def validate_username(username):
        value = str(username or "").strip()
        if not value:
            raise AccountError("用户名不能为空", 400, "username_required")
        if len(value) > 40:
            raise AccountError("用户名不能超过 40 个字符", 400, "username_too_long")
        if any(char in value for char in "\r\n\t=\\/"):
            raise AccountError("用户名包含不允许的字符", 400, "username_invalid")
        return value

    @staticmethod
    def validate_secret(secret):
        value = str(secret or "")
        if not value:
            raise AccountError("登录密钥不能为空", 400, "secret_required")
        if len(value) > 128:
            raise AccountError("登录密钥不能超过 128 个字符", 400, "secret_too_long")
        if "\n" in value or "\r" in value:
            raise AccountError("登录密钥不能包含换行", 400, "secret_invalid")
        return value

    def sync_text(self):
        with self.lock, self.connect() as connection:
            rows = connection.execute(
                "SELECT * FROM users WHERE deleted = 0 OR permanent_ban = 1 ORDER BY registered_at, username_normalized"
            ).fetchall()
        blocks = []
        for row in rows:
            blocks.append(
                "\n".join(
                    [
                        f"user_id={row['id']}",
                        f"username={row['username']}",
                        f"secret={row['secret']}",
                        f"role={row['role']}",
                        f"membership={row['membership']}",
                        f"membership_start={row['membership_start']}",
                        f"membership_expires={row['membership_expires']}",
                        f"trial_language={row['trial_language']}",
                        f"banned={str(bool(row['banned'])).lower()}",
                        f"permanent_ban={str(bool(row['permanent_ban'])).lower()}",
                        f"registered_at={row['registered_at']}",
                        f"last_login_at={row['last_login_at']}",
                        f"created_at={row['created_at']}",
                        f"updated_at={row['updated_at']}",
                    ]
                )
            )
        content = "\n\n".join(blocks) + ("\n" if blocks else "")
        temporary = self.text_path.with_name(
            f"{self.text_path.name}.tmp.{os.getpid()}.{secrets.token_hex(4)}"
        )
        try:
            temporary.write_text(content, encoding="utf-8")
            os.replace(str(temporary), str(self.text_path))
        except OSError as exc:
            try:
                temporary.unlink(missing_ok=True)
            except (OSError, TypeError):
                if temporary.exists():
                    try:
                        temporary.unlink()
                    except OSError:
                        pass
            raise AccountError(
                f"数据库已保存，但 users.txt 同步失败: {exc}",
                500,
                "users_txt_sync_failed",
                committed=True,
            ) from exc

    def _sync_after_write(self):
        self.sync_text()

    @staticmethod
    def _effective_membership(row):
        if row["role"] == "super_admin":
            return "lifetime"
        membership = row["membership"] if row["membership"] in MEMBERSHIPS else "free"
        if membership in {"trial_single_language", "monthly"}:
            expires = parse_time(row["membership_expires"])
            if not expires or expires <= utc_now():
                return "free"
        return membership

    def _expire_if_needed(self, row):
        if not row or row["role"] == "super_admin":
            return row
        effective = self._effective_membership(row)
        if effective != "free" or row["membership"] == "free":
            return row
        with self.lock, self.connect() as connection:
            now = iso_now()
            connection.execute(
                """
                UPDATE users SET membership = 'free', membership_start = '', membership_expires = '',
                    trial_language = '', updated_at = ? WHERE id = ?
                """,
                (now, row["id"]),
            )
            row = connection.execute("SELECT * FROM users WHERE id = ?", (row["id"],)).fetchone()
        self._sync_after_write()
        return row

    def user_payload(self, row, include_secret=False):
        row = self._expire_if_needed(row)
        membership = self._effective_membership(row)
        payload = {
            "id": row["id"],
            "username": row["username"],
            "role": row["role"],
            "membership": membership,
            "membership_start": row["membership_start"] if membership != "free" else "",
            "membership_expires": row["membership_expires"] if membership not in {"free", "lifetime"} else "",
            "trial_language": row["trial_language"] if membership == "trial_single_language" else "",
            "registered_at": row["registered_at"],
            "last_login_at": row["last_login_at"],
            "banned": bool(row["banned"]),
            "permanent_ban": bool(row["permanent_ban"]),
            "deleted": bool(row["deleted"]),
            "created_at": row["created_at"],
            "updated_at": row["updated_at"],
            "is_super_admin": row["username_normalized"] == ADMIN_USERNAME and row["role"] == "super_admin",
        }
        if include_secret:
            payload["secret"] = row["secret"]
        return payload

    def register(self, username, secret):
        username = self.validate_username(username)
        secret = self.validate_secret(secret)
        normalized = self.normalize_username(username)
        if normalized == ADMIN_USERNAME:
            raise AccountError("该用户名禁止注册", 409, "reserved_username")
        now = iso_now()
        user_id = str(uuid.uuid4())
        with self.lock:
            try:
                with self.connect() as connection:
                    existing = connection.execute(
                        "SELECT id FROM users WHERE username_normalized = ?", (normalized,)
                    ).fetchone()
                    if existing:
                        raise AccountError("用户名已存在", 409, "username_exists")
                    connection.execute(
                        """
                        INSERT INTO users (
                            id, username, username_normalized, secret, role, membership,
                            registered_at, created_at, updated_at
                        ) VALUES (?, ?, ?, ?, 'user', 'free', ?, ?, ?)
                        """,
                        (user_id, username, normalized, secret, now, now, now),
                    )
            except sqlite3.IntegrityError as exc:
                raise AccountError("用户名已存在", 409, "username_exists") from exc
        self._sync_after_write()
        return self.get_user(user_id)

    def get_user(self, user_id, include_deleted=False):
        with self.connect() as connection:
            row = connection.execute("SELECT * FROM users WHERE id = ?", (user_id,)).fetchone()
        if not row or (row["deleted"] and not include_deleted):
            return None
        return self._expire_if_needed(row)

    def get_user_by_name(self, username, include_deleted=False):
        normalized = self.normalize_username(username)
        with self.connect() as connection:
            row = connection.execute(
                "SELECT * FROM users WHERE username_normalized = ?", (normalized,)
            ).fetchone()
        if not row or (row["deleted"] and not include_deleted):
            return None
        return self._expire_if_needed(row)

    def login(self, username, secret):
        username_text = str(username or "").strip()
        secret_text = str(secret or "")
        row = self.get_user_by_name(username_text, include_deleted=True)
        if not row or row["deleted"]:
            raise AccountError("用户名或登录密钥错误", 403, "invalid_credentials")
        if row["banned"]:
            raise AccountError("账户已被封禁", 403, "account_banned")
        if row["username_normalized"] == ADMIN_USERNAME:
            valid = username_text == ADMIN_USERNAME and secrets.compare_digest(secret_text, row["secret"]) and row["role"] == "super_admin"
        else:
            valid = secrets.compare_digest(secret_text, row["secret"])
        if not valid:
            raise AccountError("用户名或登录密钥错误", 403, "invalid_credentials")
        now = iso_now()
        token = secrets.token_urlsafe(32)
        with self.lock, self.connect() as connection:
            connection.execute("UPDATE users SET last_login_at = ?, updated_at = ? WHERE id = ?", (now, now, row["id"]))
            current = connection.execute("SELECT session_version FROM users WHERE id = ?", (row["id"],)).fetchone()
            connection.execute(
                "INSERT INTO sessions (token, user_id, session_version, created_at, last_seen_at) VALUES (?, ?, ?, ?, ?)",
                (token, row["id"], current["session_version"], now, now),
            )
        self._sync_after_write()
        return token, self.get_user(row["id"])

    def resolve_session(self, token, touch=True):
        token = str(token or "")
        if not token:
            return None
        with self.lock, self.connect() as connection:
            record = connection.execute(
                """
                SELECT s.token, s.session_version AS session_generation, s.last_seen_at, u.*
                FROM sessions s JOIN users u ON u.id = s.user_id WHERE s.token = ?
                """,
                (token,),
            ).fetchone()
            if not record:
                return None
            last_seen = parse_time(record["last_seen_at"])
            invalid = (
                not last_seen
                or (utc_now() - last_seen).total_seconds() > SESSION_TTL_SECONDS
                or record["deleted"]
                or record["banned"]
                or record["session_generation"] != record["session_version"]
            )
            if invalid:
                connection.execute("DELETE FROM sessions WHERE token = ?", (token,))
                return None
            if touch:
                connection.execute("UPDATE sessions SET last_seen_at = ? WHERE token = ?", (iso_now(), token))
        return self.get_user(record["id"])

    def logout(self, token):
        with self.lock, self.connect() as connection:
            connection.execute("DELETE FROM sessions WHERE token = ?", (str(token or ""),))

    def revoke_user_sessions(self, user_id):
        with self.lock, self.connect() as connection:
            connection.execute("DELETE FROM sessions WHERE user_id = ?", (user_id,))

    @staticmethod
    def is_super_admin(row):
        return bool(row and row["username_normalized"] == ADMIN_USERNAME and row["role"] == "super_admin")

    def quiz_limit(self, row, language):
        if self.is_super_admin(row):
            return None
        membership = self._effective_membership(row)
        if membership in {"monthly", "lifetime"}:
            return None
        if membership == "trial_single_language" and row["trial_language"] == language:
            return None
        return 15

    def change_own_secret(self, user_id, current_secret, new_secret):
        row = self.get_user(user_id)
        if not row:
            raise AccountError("账户不存在", 404, "user_not_found")
        if self.is_super_admin(row):
            raise AccountError("固定管理员密钥不能在此修改", 403, "admin_protected")
        if not secrets.compare_digest(str(current_secret or ""), row["secret"]):
            raise AccountError("当前登录密钥错误", 403, "invalid_secret")
        new_secret = self.validate_secret(new_secret)
        with self.lock, self.connect() as connection:
            connection.execute(
                "UPDATE users SET secret = ?, session_version = session_version + 1, updated_at = ? WHERE id = ?",
                (new_secret, iso_now(), user_id),
            )
            connection.execute("DELETE FROM sessions WHERE user_id = ?", (user_id,))
        self._sync_after_write()

    def delete_own_account(self, user_id, secret):
        row = self.get_user(user_id)
        if not row:
            raise AccountError("账户不存在", 404, "user_not_found")
        if self.is_super_admin(row):
            raise AccountError("固定管理员账户不能注销", 403, "admin_protected")
        if not secrets.compare_digest(str(secret or ""), row["secret"]):
            raise AccountError("当前登录密钥错误", 403, "invalid_secret")
        with self.lock, self.connect() as connection:
            connection.execute("DELETE FROM recharge_requests WHERE user_id = ?", (user_id,))
            connection.execute("DELETE FROM sessions WHERE user_id = ?", (user_id,))
            connection.execute("DELETE FROM users WHERE id = ?", (user_id,))
        self._sync_after_write()

    def list_users(self):
        with self.connect() as connection:
            rows = connection.execute(
                "SELECT * FROM users WHERE deleted = 0 ORDER BY registered_at DESC, username_normalized"
            ).fetchall()
            pending = {}
            for item in connection.execute(
                "SELECT user_id, status FROM recharge_requests ORDER BY requested_at DESC"
            ).fetchall():
                pending.setdefault(item["user_id"], item["status"])
        result = []
        for row in rows:
            item = self.user_payload(row, include_secret=True)
            item["recharge_status"] = pending.get(row["id"], "")
            result.append(item)
        return result

    def admin_set_membership(self, actor, user_id, membership, start="", expires="", trial_language=""):
        if not self.is_super_admin(actor):
            raise AccountError("无管理员权限", 403, "forbidden")
        target = self.get_user(user_id)
        if not target:
            raise AccountError("用户不存在", 404, "user_not_found")
        if self.is_super_admin(target):
            raise AccountError("不能修改固定管理员的等级", 403, "admin_protected")
        membership = str(membership or "free")
        if membership not in MEMBERSHIPS:
            raise AccountError("会员等级无效", 400, "membership_invalid")
        raw_start = str(start or "").strip()
        raw_expires = str(expires or "").strip()
        start_value = membership_time_value(raw_start) if raw_start else ""
        expires_value = membership_time_value(raw_expires, end_of_day=True) if raw_expires else ""
        language_value = str(trial_language or "").strip().lower()
        if membership == "free":
            start_value = expires_value = language_value = ""
        elif membership == "lifetime":
            if raw_start and not start_value:
                raise AccountError("会员开始日期格式无效，请使用年/月/日", 400, "membership_start_invalid")
            start_value = start_value or iso_now()
            expires_value = ""
            language_value = ""
        else:
            if raw_start and not start_value:
                raise AccountError("会员开始日期格式无效，请使用年/月/日", 400, "membership_start_invalid")
            if raw_expires and not expires_value:
                raise AccountError("会员截止日期格式无效，请使用年/月/日", 400, "membership_expires_invalid")
            start_value = start_value or iso_now()
            expires_value = expires_value or default_membership_expiry()
            if membership == "trial_single_language":
                if language_value not in LANGUAGES:
                    raise AccountError("体验版必须选择英语或日语", 400, "trial_language_invalid")
            else:
                language_value = ""
        with self.lock, self.connect() as connection:
            connection.execute(
                """
                UPDATE users SET membership = ?, membership_start = ?, membership_expires = ?,
                    trial_language = ?, updated_at = ? WHERE id = ?
                """,
                (membership, start_value, expires_value, language_value, iso_now(), user_id),
            )
        self._sync_after_write()
        return self.user_payload(self.get_user(user_id), include_secret=True)

    def admin_change_secret(self, actor, user_id, secret):
        if not self.is_super_admin(actor):
            raise AccountError("无管理员权限", 403, "forbidden")
        target = self.get_user(user_id)
        if not target:
            raise AccountError("用户不存在", 404, "user_not_found")
        if self.is_super_admin(target):
            raise AccountError("固定管理员密钥不能修改", 403, "admin_protected")
        secret = self.validate_secret(secret)
        with self.lock, self.connect() as connection:
            connection.execute(
                "UPDATE users SET secret = ?, session_version = session_version + 1, updated_at = ? WHERE id = ?",
                (secret, iso_now(), user_id),
            )
            connection.execute("DELETE FROM sessions WHERE user_id = ?", (user_id,))
        self._sync_after_write()

    def admin_set_ban(self, actor, user_id, banned):
        if not self.is_super_admin(actor):
            raise AccountError("无管理员权限", 403, "forbidden")
        target = self.get_user(user_id)
        if not target:
            raise AccountError("用户不存在", 404, "user_not_found")
        if self.is_super_admin(target):
            raise AccountError("不能封禁固定管理员", 403, "admin_protected")
        value = 1 if banned else 0
        with self.lock, self.connect() as connection:
            connection.execute(
                """
                UPDATE users SET banned = ?, permanent_ban = ?, session_version = session_version + 1,
                    updated_at = ? WHERE id = ?
                """,
                (value, value, iso_now(), user_id),
            )
            if value:
                connection.execute("DELETE FROM sessions WHERE user_id = ?", (user_id,))
        self._sync_after_write()

    def admin_force_logout(self, actor, user_id):
        if not self.is_super_admin(actor):
            raise AccountError("无管理员权限", 403, "forbidden")
        target = self.get_user(user_id)
        if not target:
            raise AccountError("用户不存在", 404, "user_not_found")
        if self.is_super_admin(target):
            raise AccountError("不能强制退出固定管理员", 403, "admin_protected")
        self.revoke_user_sessions(user_id)

    def admin_delete_user(self, actor, user_id):
        if not self.is_super_admin(actor):
            raise AccountError("无管理员权限", 403, "forbidden")
        target = self.get_user(user_id)
        if not target:
            raise AccountError("用户不存在", 404, "user_not_found")
        if self.is_super_admin(target):
            raise AccountError("不能删除固定管理员", 403, "admin_protected")
        with self.lock, self.connect() as connection:
            connection.execute("DELETE FROM recharge_requests WHERE user_id = ?", (user_id,))
            connection.execute("DELETE FROM sessions WHERE user_id = ?", (user_id,))
            if target["permanent_ban"]:
                connection.execute(
                    """
                    UPDATE users SET secret = '', membership = 'free', membership_start = '',
                        membership_expires = '', trial_language = '', deleted = 1, updated_at = ? WHERE id = ?
                    """,
                    (iso_now(), user_id),
                )
            else:
                connection.execute("DELETE FROM users WHERE id = ?", (user_id,))
        self._sync_after_write()

    def create_recharge_request(self, user, plan, trial_language=""):
        if not user or user["deleted"] or user["banned"]:
            raise AccountError("账户不可用", 403, "account_unavailable")
        plan = str(plan or "").strip()
        language = str(trial_language or "").strip().lower()
        if plan not in RECHARGE_PLANS:
            raise AccountError("充值套餐无效", 400, "plan_invalid")
        if plan == "trial_single_language" and language not in LANGUAGES:
            raise AccountError("请选择体验语言", 400, "trial_language_invalid")
        if plan != "trial_single_language":
            language = ""
        now = iso_now()
        request_id = str(uuid.uuid4())
        with self.lock, self.connect() as connection:
            existing = connection.execute(
                "SELECT * FROM recharge_requests WHERE user_id = ? AND status = 'pending'",
                (user["id"],),
            ).fetchone()
            if existing:
                return dict(existing), False
            connection.execute(
                """
                INSERT INTO recharge_requests (
                    id, user_id, username, plan, trial_language, status, requested_at, updated_at
                ) VALUES (?, ?, ?, ?, ?, 'pending', ?, ?)
                """,
                (request_id, user["id"], user["username"], plan, language, now, now),
            )
            record = connection.execute("SELECT * FROM recharge_requests WHERE id = ?", (request_id,)).fetchone()
        return dict(record), True

    def list_recharge_requests(self, actor):
        if not self.is_super_admin(actor):
            raise AccountError("无管理员权限", 403, "forbidden")
        with self.connect() as connection:
            return [dict(row) for row in connection.execute(
                "SELECT * FROM recharge_requests ORDER BY requested_at DESC"
            ).fetchall()]

    def process_recharge_request(self, actor, request_id, action):
        if not self.is_super_admin(actor):
            raise AccountError("无管理员权限", 403, "forbidden")
        action = str(action or "").strip().lower()
        if action not in {"approve", "reject"}:
            raise AccountError("处理操作无效", 400, "action_invalid")
        with self.connect() as connection:
            request = connection.execute(
                "SELECT * FROM recharge_requests WHERE id = ?", (request_id,)
            ).fetchone()
        if not request:
            raise AccountError("充值申请不存在", 404, "request_not_found")
        if request["status"] != "pending":
            raise AccountError("充值申请已处理", 409, "request_already_processed")
        if action == "approve":
            self.admin_set_membership(
                actor,
                request["user_id"],
                request["plan"],
                trial_language=request["trial_language"],
            )
        status = "activated" if action == "approve" else "rejected"
        now = iso_now()
        with self.lock, self.connect() as connection:
            connection.execute(
                """
                UPDATE recharge_requests SET status = ?, updated_at = ?, handled_at = ?, handled_by = ?
                WHERE id = ?
                """,
                (status, now, now, actor["username"], request_id),
            )
        return status
