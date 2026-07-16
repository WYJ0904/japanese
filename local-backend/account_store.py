import base64
import hashlib
import json
import os
import re
import secrets
import sqlite3
import threading
import uuid
from contextlib import closing, contextmanager
from datetime import datetime, timedelta, timezone
from pathlib import Path

from membership import (
    ALL_ACCESS_ENTITLEMENTS,
    ENTITLEMENT_LABELS,
    LEGACY_PLAN_MAP,
    MEMBERSHIP_PLANS,
    PURCHASABLE_PLAN_CODES,
    default_plan_expiry,
    public_plan_payload,
)


ADMIN_USERNAME = "wyj"
ADMIN_SECRET = os.environ.get("VOCAB_ADMIN_SECRET", "").strip() or secrets.token_urlsafe(12)
MEMBERSHIPS = {"free", "trial_single_language", "monthly", "lifetime"}
LANGUAGES = {"english", "japanese"}
RECHARGE_PLANS = {"trial_single_language", "monthly", "lifetime"}
SESSION_TTL_SECONDS = 7 * 24 * 60 * 60
MAX_SESSIONS_PER_USER = 12
MIN_SECRET_LENGTH = 6
PASSWORD_HASH_PREFIX = "pbkdf2_sha256"
PASSWORD_HASH_ITERATIONS = 310_000
SESSION_TOKEN_PREFIX = "sha256"
WECHAT_CONTACT = "W2009Y94J"
OPEN_PAYMENT_STATUSES = {"pending_payment", "user_paid"}
LOGIN_AUDIT_RETENTION_DAYS = 90
LOGIN_AUDIT_MAX_RECORDS = 5000


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


def hash_secret(value):
    raw = str(value or "").encode("utf-8")
    salt = secrets.token_bytes(16)
    digest = hashlib.pbkdf2_hmac("sha256", raw, salt, PASSWORD_HASH_ITERATIONS)
    return "$".join(
        (
            PASSWORD_HASH_PREFIX,
            str(PASSWORD_HASH_ITERATIONS),
            base64.urlsafe_b64encode(salt).decode("ascii").rstrip("="),
            base64.urlsafe_b64encode(digest).decode("ascii").rstrip("="),
        )
    )


def secret_is_hashed(value):
    return str(value or "").startswith(f"{PASSWORD_HASH_PREFIX}$")


def verify_secret(value, encoded):
    stored = str(encoded or "")
    candidate = str(value or "")
    if not secret_is_hashed(stored):
        return secrets.compare_digest(candidate, stored)
    try:
        _, iterations, salt_text, digest_text = stored.split("$", 3)
        salt = base64.urlsafe_b64decode(salt_text + "=" * (-len(salt_text) % 4))
        expected = base64.urlsafe_b64decode(digest_text + "=" * (-len(digest_text) % 4))
        actual = hashlib.pbkdf2_hmac("sha256", candidate.encode("utf-8"), salt, int(iterations))
        return secrets.compare_digest(actual, expected)
    except (ValueError, TypeError):
        return False


def session_storage_key(value):
    raw = str(value or "").encode("utf-8")
    return f"{SESSION_TOKEN_PREFIX}${hashlib.sha256(raw).hexdigest()}"


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
        self._backup_before_membership_migration()
        self._backup_before_single_language_migration()
        self.initialize()

    def _backup_before_membership_migration(self):
        if not self.database_path.exists() or self.database_path.stat().st_size == 0:
            return
        backup_path = self.database_path.with_name(
            f"{self.database_path.stem}.pre-entitlements-001.sqlite3"
        )
        if backup_path.exists():
            return
        try:
            with closing(sqlite3.connect(str(self.database_path), timeout=15)) as source:
                tables = {
                    row[0]
                    for row in source.execute(
                        "SELECT name FROM sqlite_master WHERE type = 'table'"
                    ).fetchall()
                }
                if "users" not in tables:
                    return
                if "schema_migrations" in tables:
                    applied = source.execute(
                        "SELECT 1 FROM schema_migrations WHERE version = ?",
                        ("001_entitlements",),
                    ).fetchone()
                    if applied:
                        return
                with closing(sqlite3.connect(str(backup_path), timeout=15)) as destination:
                    source.backup(destination)
        except sqlite3.Error:
            try:
                backup_path.unlink(missing_ok=True)
            except OSError:
                pass
            raise

    def _backup_before_single_language_migration(self):
        if not self.database_path.exists() or self.database_path.stat().st_size == 0:
            return
        backup_path = self.database_path.with_name(
            f"{self.database_path.stem}.pre-single-language-002.sqlite3"
        )
        if backup_path.exists():
            return
        try:
            with closing(sqlite3.connect(str(self.database_path), timeout=15)) as source:
                tables = {
                    row[0]
                    for row in source.execute(
                        "SELECT name FROM sqlite_master WHERE type = 'table'"
                    ).fetchall()
                }
                if "payment_requests" not in tables or "schema_migrations" not in tables:
                    return
                applied = source.execute(
                    "SELECT 1 FROM schema_migrations WHERE version = ?",
                    ("002_single_language_orders",),
                ).fetchone()
                if applied:
                    return
                with closing(sqlite3.connect(str(backup_path), timeout=15)) as destination:
                    source.backup(destination)
        except sqlite3.Error:
            try:
                backup_path.unlink(missing_ok=True)
            except OSError:
                pass
            raise

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
                    (admin_id, ADMIN_USERNAME, ADMIN_USERNAME, hash_secret(ADMIN_SECRET), now, now, now),
                )
            migration_path = Path(__file__).with_name("migrations") / "001_entitlements_up.sql"
            connection.executescript(migration_path.read_text(encoding="utf-8"))
            self._apply_migration(
                connection,
                "002_single_language_orders",
                "002_single_language_orders_up.sql",
            )
            self._apply_migration(
                connection,
                "003_login_audit",
                "003_login_audit_up.sql",
            )
            self._seed_membership_plans(connection, now)
            self._migrate_legacy_memberships(connection, now)
            self._migrate_legacy_recharge_requests(connection, now)
            self._hash_plaintext_secrets(connection)
            self._hash_plaintext_session_tokens(connection)
            self._validate_membership_migration(connection)
        self.sync_text()

    @staticmethod
    def _apply_migration(connection, version, filename):
        applied = connection.execute(
            "SELECT 1 FROM schema_migrations WHERE version = ?", (version,)
        ).fetchone()
        if applied:
            return
        if version == "002_single_language_orders":
            columns = {
                row[1] for row in connection.execute("PRAGMA table_info(payment_requests)").fetchall()
            }
            if "trial_language" in columns:
                connection.execute(
                    """
                    UPDATE payment_requests
                    SET trial_language = COALESCE(
                        (SELECT legacy.trial_language FROM recharge_requests AS legacy
                         WHERE legacy.id = payment_requests.id), trial_language, ''
                    )
                    WHERE plan_code = 'trial_single_language' AND trial_language = ''
                    """
                )
                connection.execute(
                    "INSERT INTO schema_migrations(version, applied_at) VALUES (?, ?)",
                    (version, iso_now()),
                )
                return
        migration_path = Path(__file__).with_name("migrations") / filename
        connection.executescript(migration_path.read_text(encoding="utf-8"))

    @staticmethod
    def _seed_membership_plans(connection, now):
        for code, plan in MEMBERSHIP_PLANS.items():
            connection.execute(
                """
                INSERT INTO membership_plans (
                    code, name, price_cents, currency, lifetime, duration_months,
                    purchasable, priority, description, updated_at
                ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
                ON CONFLICT(code) DO UPDATE SET
                    name = excluded.name,
                    price_cents = excluded.price_cents,
                    currency = excluded.currency,
                    lifetime = excluded.lifetime,
                    duration_months = excluded.duration_months,
                    purchasable = excluded.purchasable,
                    priority = excluded.priority,
                    description = excluded.description,
                    updated_at = excluded.updated_at
                """,
                (
                    code,
                    plan["name"],
                    plan["price_cents"],
                    plan["currency"],
                    int(plan["lifetime"]),
                    plan["duration_months"],
                    int(plan["purchasable"]),
                    plan["priority"],
                    plan["description"],
                    now,
                ),
            )
            connection.execute("DELETE FROM membership_entitlements WHERE plan_code = ?", (code,))
            connection.executemany(
                "INSERT INTO membership_entitlements (plan_code, entitlement_code) VALUES (?, ?)",
                [(code, entitlement) for entitlement in plan["entitlements"]],
            )

    @staticmethod
    def _migrate_legacy_memberships(connection, now):
        rows = connection.execute(
            "SELECT * FROM users WHERE deleted = 0 AND role != 'super_admin' AND membership != 'free'"
        ).fetchall()
        for row in rows:
            plan_code = LEGACY_PLAN_MAP.get(row["membership"])
            if not plan_code:
                continue
            metadata = {}
            if row["membership"] == "trial_single_language":
                metadata["language"] = row["trial_language"]
            plan = MEMBERSHIP_PLANS[plan_code]
            starts_at = row["membership_start"] or row["registered_at"] or now
            expires_at = "" if plan["lifetime"] else row["membership_expires"]
            status = "active"
            parsed_expiry = parse_time(expires_at)
            if not plan["lifetime"] and (not parsed_expiry or parsed_expiry <= utc_now()):
                status = "expired"
            connection.execute(
                """
                INSERT OR IGNORE INTO user_memberships (
                    id, user_id, plan_code, starts_at, expires_at, is_lifetime, status,
                    source, source_ref, created_by, metadata_json, created_at, updated_at
                ) VALUES (?, ?, ?, ?, ?, ?, ?, 'legacy_migration', 'users.membership',
                          'system', ?, ?, ?)
                """,
                (
                    str(uuid.uuid4()),
                    row["id"],
                    plan_code,
                    starts_at,
                    expires_at,
                    int(plan["lifetime"]),
                    status,
                    json.dumps(metadata, ensure_ascii=False, separators=(",", ":")),
                    now,
                    now,
                ),
            )

    @staticmethod
    def _migrate_legacy_recharge_requests(connection, now):
        mappings = {
            "trial_single_language": "trial_single_language",
            "monthly": "legacy_all_monthly",
            "lifetime": "legacy_all_lifetime",
        }
        legacy_prices = {
            "trial_single_language": 500,
            "monthly": 1000,
            "lifetime": 7000,
        }
        for row in connection.execute("SELECT * FROM recharge_requests").fetchall():
            plan_code = mappings.get(row["plan"])
            if not plan_code:
                continue
            plan = MEMBERSHIP_PLANS[plan_code]
            status = {
                "pending": "user_paid",
                "activated": "approved",
                "rejected": "rejected",
            }.get(row["status"], "rejected")
            order_number = f"LEGACY-{row['id'][:12].upper()}"
            trial_language = row["trial_language"] if plan_code == "trial_single_language" else ""
            language_label = {"english": "英语", "japanese": "日语"}.get(trial_language, "")
            plan_label = f"{plan['name']}（{language_label}）" if language_label else plan["name"]
            payment_note = f"{row['username']} {order_number} {plan_label}"
            connection.execute(
                """
                INSERT OR IGNORE INTO payment_requests (
                    id, order_number, user_id, username, plan_code, amount_cents, currency,
                    contact, payment_note, status, requested_at, user_confirmed_at,
                    handled_at, handled_by, updated_at, trial_language
                ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
                """,
                (
                    row["id"],
                    order_number,
                    row["user_id"],
                    row["username"],
                    plan_code,
                    legacy_prices[row["plan"]],
                    plan["currency"],
                    WECHAT_CONTACT,
                    payment_note,
                    status,
                    row["requested_at"],
                    row["requested_at"] if row["status"] != "pending" else "",
                    row["handled_at"],
                    row["handled_by"],
                    row["updated_at"] or now,
                    trial_language,
                ),
            )

    @staticmethod
    def _hash_plaintext_secrets(connection):
        rows = connection.execute("SELECT id, secret FROM users WHERE secret != ''").fetchall()
        for row in rows:
            if not secret_is_hashed(row["secret"]):
                connection.execute("UPDATE users SET secret = ? WHERE id = ?", (hash_secret(row["secret"]), row["id"]))

    @staticmethod
    def _hash_plaintext_session_tokens(connection):
        rows = connection.execute("SELECT token FROM sessions").fetchall()
        for row in rows:
            token = str(row["token"] or "")
            if token and not token.startswith(f"{SESSION_TOKEN_PREFIX}$"):
                connection.execute(
                    "UPDATE sessions SET token = ? WHERE token = ?",
                    (session_storage_key(token), token),
                )

    @staticmethod
    def _validate_membership_migration(connection):
        missing = connection.execute(
            """
            SELECT COUNT(*) FROM users u
            WHERE u.deleted = 0 AND u.role != 'super_admin' AND u.membership != 'free'
              AND NOT EXISTS (
                  SELECT 1 FROM user_memberships m
                  WHERE m.user_id = u.id AND m.source_ref = 'users.membership'
              )
            """
        ).fetchone()[0]
        if missing:
            raise RuntimeError(f"membership migration validation failed for {missing} user(s)")

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
        if len(value) < MIN_SECRET_LENGTH:
            raise AccountError(f"登录密钥不能少于 {MIN_SECRET_LENGTH} 个字符", 400, "secret_too_short")
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
                        "secret=protected",
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

    def user_payload(self, row):
        row = self._expire_if_needed(row)
        membership = self._effective_membership(row)
        memberships = self.memberships_for(row)
        entitlements = sorted(self.entitlements_for(row))
        summary = self.membership_summary(row)
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
            "memberships": memberships,
            "entitlements": entitlements,
            "membership_summary": summary,
            "tools_access": "tools_access" in entitlements,
        }
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
                        (user_id, username, normalized, hash_secret(secret), now, now, now),
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
            valid = username_text == ADMIN_USERNAME and verify_secret(secret_text, row["secret"]) and row["role"] == "super_admin"
        else:
            valid = verify_secret(secret_text, row["secret"])
        if not valid:
            raise AccountError("用户名或登录密钥错误", 403, "invalid_credentials")
        now = iso_now()
        token = secrets.token_urlsafe(32)
        stored_token = session_storage_key(token)
        with self.lock, self.connect() as connection:
            cutoff = (utc_now() - timedelta(seconds=SESSION_TTL_SECONDS)).isoformat().replace("+00:00", "Z")
            connection.execute("DELETE FROM sessions WHERE last_seen_at < ?", (cutoff,))
            connection.execute("UPDATE users SET last_login_at = ?, updated_at = ? WHERE id = ?", (now, now, row["id"]))
            current = connection.execute("SELECT session_version FROM users WHERE id = ?", (row["id"],)).fetchone()
            connection.execute(
                "INSERT INTO sessions (token, user_id, session_version, created_at, last_seen_at) VALUES (?, ?, ?, ?, ?)",
                (stored_token, row["id"], current["session_version"], now, now),
            )
            connection.execute(
                """
                DELETE FROM sessions WHERE token IN (
                    SELECT token FROM sessions WHERE user_id = ?
                    ORDER BY rowid DESC LIMIT -1 OFFSET ?
                )
                """,
                (row["id"], MAX_SESSIONS_PER_USER),
            )
        self._sync_after_write()
        return token, self.get_user(row["id"])

    def resolve_session(self, token, touch=True):
        raw_token = str(token or "")
        if not raw_token:
            return None
        stored_token = session_storage_key(raw_token)
        with self.lock, self.connect() as connection:
            record = connection.execute(
                """
                SELECT s.token, s.session_version AS session_generation, s.last_seen_at, u.*
                FROM sessions s JOIN users u ON u.id = s.user_id WHERE s.token = ?
                """,
                (stored_token,),
            ).fetchone()
            if not record and not raw_token.startswith(f"{SESSION_TOKEN_PREFIX}$"):
                record = connection.execute(
                    """
                    SELECT s.token, s.session_version AS session_generation, s.last_seen_at, u.*
                    FROM sessions s JOIN users u ON u.id = s.user_id WHERE s.token = ?
                    """,
                    (raw_token,),
                ).fetchone()
                if record:
                    connection.execute("UPDATE sessions SET token = ? WHERE token = ?", (stored_token, raw_token))
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
                connection.execute("DELETE FROM sessions WHERE token = ?", (stored_token,))
                return None
            if touch:
                connection.execute("UPDATE sessions SET last_seen_at = ? WHERE token = ?", (iso_now(), stored_token))
        return self.get_user(record["id"])

    def logout(self, token):
        raw_token = str(token or "")
        stored_token = session_storage_key(raw_token)
        with self.lock, self.connect() as connection:
            connection.execute("DELETE FROM sessions WHERE token = ?", (stored_token,))
            if raw_token and not raw_token.startswith(f"{SESSION_TOKEN_PREFIX}$"):
                connection.execute("DELETE FROM sessions WHERE token = ?", (raw_token,))

    def revoke_user_sessions(self, user_id):
        with self.lock, self.connect() as connection:
            connection.execute("DELETE FROM sessions WHERE user_id = ?", (user_id,))

    @staticmethod
    def is_super_admin(row):
        return bool(row and row["username_normalized"] == ADMIN_USERNAME and row["role"] == "super_admin")

    @staticmethod
    def membership_plans(include_hidden=False):
        return public_plan_payload(include_hidden=include_hidden)

    def _expire_user_memberships(self, user_id):
        now = utc_now()
        with self.lock, self.connect() as connection:
            rows = connection.execute(
                "SELECT id, expires_at, is_lifetime FROM user_memberships WHERE user_id = ? AND status = 'active'",
                (user_id,),
            ).fetchall()
            expired_ids = [
                row["id"]
                for row in rows
                if not row["is_lifetime"]
                and (not parse_time(row["expires_at"]) or parse_time(row["expires_at"]) <= now)
            ]
            if expired_ids:
                connection.executemany(
                    "UPDATE user_memberships SET status = 'expired', updated_at = ? WHERE id = ?",
                    [(iso_now(), membership_id) for membership_id in expired_ids],
                )

    def memberships_for(self, row, include_inactive=False):
        if not row:
            return []
        self._expire_user_memberships(row["id"])
        query = "SELECT * FROM user_memberships WHERE user_id = ?"
        parameters = [row["id"]]
        if not include_inactive:
            query += " AND status = 'active'"
        query += " ORDER BY created_at DESC"
        with self.connect() as connection:
            rows = connection.execute(query, parameters).fetchall()
        result = []
        for item in rows:
            payload = dict(item)
            try:
                payload["metadata"] = json.loads(payload.pop("metadata_json") or "{}")
            except (json.JSONDecodeError, TypeError):
                payload["metadata"] = {}
                payload.pop("metadata_json", None)
            plan = MEMBERSHIP_PLANS.get(payload["plan_code"], {})
            payload["plan_name"] = plan.get("name", payload["plan_code"])
            payload["priority"] = plan.get("priority", 0)
            payload["entitlements"] = list(plan.get("entitlements", ()))
            result.append(payload)
        return result

    def entitlements_for(self, row):
        if not row:
            return set()
        if self.is_super_admin(row):
            return set(ALL_ACCESS_ENTITLEMENTS) | {"language_english_access"}
        entitlements = set()
        for membership in self.memberships_for(row):
            entitlements.update(membership["entitlements"])
            if membership["plan_code"] == "trial_single_language":
                language = membership.get("metadata", {}).get("language")
                if language == "japanese":
                    entitlements.add("language_japanese_access")
                elif language == "english":
                    entitlements.add("language_english_access")
        with self.connect() as connection:
            overrides = connection.execute(
                "SELECT entitlement_code, allowed FROM user_entitlement_overrides WHERE user_id = ?",
                (row["id"],),
            ).fetchall()
        for override in overrides:
            if override["allowed"]:
                entitlements.add(override["entitlement_code"])
            else:
                entitlements.discard(override["entitlement_code"])
        return entitlements

    def has_entitlement(self, row, entitlement):
        return str(entitlement or "") in self.entitlements_for(row)

    def membership_summary(self, row):
        if self.is_super_admin(row):
            return {
                "code": "super_admin",
                "name": "超级管理员",
                "permanent": True,
                "expires_at": "",
                "tools_access": True,
            }
        memberships = self.memberships_for(row)
        top = max(memberships, key=lambda item: item.get("priority", 0), default=None)
        entitlements = self.entitlements_for(row)
        if not top:
            return {
                "code": "free",
                "name": "普通注册用户",
                "permanent": False,
                "expires_at": "",
                "tools_access": False,
            }
        return {
            "code": top["plan_code"],
            "name": top["plan_name"],
            "permanent": bool(top["is_lifetime"]),
            "starts_at": top["starts_at"],
            "expires_at": top["expires_at"],
            "tools_access": "tools_access" in entitlements,
        }

    def _sync_legacy_membership_snapshot(self, user_id):
        row = self.get_user(user_id)
        if not row or self.is_super_admin(row):
            return
        memberships = self.memberships_for(row)
        by_plan = {item["plan_code"]: item for item in memberships}
        membership = "free"
        start = expires = language = ""
        selected = None
        if "all_access_lifetime" in by_plan:
            membership, selected = "lifetime", by_plan["all_access_lifetime"]
        elif "legacy_all_lifetime" in by_plan:
            membership, selected = "lifetime", by_plan["legacy_all_lifetime"]
        elif "all_access_monthly" in by_plan:
            membership, selected = "monthly", by_plan["all_access_monthly"]
        elif "dual_language_monthly" in by_plan:
            membership, selected = "monthly", by_plan["dual_language_monthly"]
        elif "legacy_all_monthly" in by_plan:
            membership, selected = "monthly", by_plan["legacy_all_monthly"]
        elif "japanese_lifetime" in by_plan:
            membership, selected = "trial_single_language", by_plan["japanese_lifetime"]
            language = "japanese"
            expires = "9999-12-31T23:59:59Z"
        elif "trial_single_language" in by_plan:
            membership, selected = "trial_single_language", by_plan["trial_single_language"]
            language = selected.get("metadata", {}).get("language", "")
        if selected:
            start = selected["starts_at"]
            if membership not in {"lifetime"} and not expires:
                expires = selected["expires_at"]
        with self.lock, self.connect() as connection:
            connection.execute(
                """
                UPDATE users SET membership = ?, membership_start = ?, membership_expires = ?,
                    trial_language = ?, updated_at = ? WHERE id = ?
                """,
                (membership, start, expires, language, iso_now(), user_id),
            )

    def quiz_limit(self, row, language):
        if self.is_super_admin(row):
            return None
        entitlements = self.entitlements_for(row)
        if "language_all_access" in entitlements:
            return None
        if language == "japanese" and "language_japanese_access" in entitlements:
            return None
        if language == "english" and "language_english_access" in entitlements:
            return None
        return 15

    def change_own_secret(self, user_id, current_secret, new_secret):
        row = self.get_user(user_id)
        if not row:
            raise AccountError("账户不存在", 404, "user_not_found")
        if self.is_super_admin(row):
            raise AccountError("固定管理员密钥不能在此修改", 403, "admin_protected")
        if not verify_secret(current_secret, row["secret"]):
            raise AccountError("当前登录密钥错误", 403, "invalid_secret")
        new_secret = self.validate_secret(new_secret)
        with self.lock, self.connect() as connection:
            connection.execute(
                "UPDATE users SET secret = ?, session_version = session_version + 1, updated_at = ? WHERE id = ?",
                (hash_secret(new_secret), iso_now(), user_id),
            )
            connection.execute("DELETE FROM sessions WHERE user_id = ?", (user_id,))
        self._sync_after_write()

    def delete_own_account(self, user_id, secret):
        row = self.get_user(user_id)
        if not row:
            raise AccountError("账户不存在", 404, "user_not_found")
        if self.is_super_admin(row):
            raise AccountError("固定管理员账户不能注销", 403, "admin_protected")
        if not verify_secret(secret, row["secret"]):
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
            item = self.user_payload(row)
            item["recharge_status"] = pending.get(row["id"], "")
            result.append(item)
        return result

    @staticmethod
    def _public_snapshot(payload):
        if not payload:
            return {}
        return {
            "id": payload.get("id", ""),
            "username": payload.get("username", ""),
            "role": payload.get("role", ""),
            "banned": bool(payload.get("banned")),
            "memberships": payload.get("memberships", []),
            "entitlements": payload.get("entitlements", []),
            "membership_summary": payload.get("membership_summary", {}),
        }

    def _audit(self, connection, actor, action, target=None, before=None, after=None, note=""):
        connection.execute(
            """
            INSERT INTO admin_audit_logs (
                id, actor_user_id, actor_username, target_user_id, target_username,
                action, before_json, after_json, note, created_at
            ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
            """,
            (
                str(uuid.uuid4()),
                actor["id"],
                actor["username"],
                target["id"] if target else "",
                target["username"] if target else "",
                action,
                json.dumps(before or {}, ensure_ascii=False, separators=(",", ":")),
                json.dumps(after or {}, ensure_ascii=False, separators=(",", ":")),
                str(note or "")[:500],
                iso_now(),
            ),
        )

    def list_audit_logs(self, actor, limit=200):
        if not self.is_super_admin(actor):
            raise AccountError("无管理员权限", 403, "forbidden")
        safe_limit = max(1, min(int(limit or 200), 500))
        with self.connect() as connection:
            rows = connection.execute(
                "SELECT * FROM admin_audit_logs ORDER BY created_at DESC, rowid DESC LIMIT ?", (safe_limit,)
            ).fetchall()
        result = []
        for row in rows:
            item = dict(row)
            for field in ("before_json", "after_json"):
                output_field = field[:-5] if field.endswith("_json") else field
                try:
                    item[output_field] = json.loads(item.pop(field) or "{}")
                except (json.JSONDecodeError, TypeError):
                    item[output_field] = {}
                    item.pop(field, None)
            result.append(item)
        return result

    def record_login_event(self, attempted_username, success, reason, context=None, user=None):
        details = context if isinstance(context, dict) else {}
        target = user
        if target is None and attempted_username:
            target = self.get_user_by_name(attempted_username, include_deleted=True)
        username = target["username"] if target else str(attempted_username or "").strip()[:40]
        now = iso_now()
        cutoff = (utc_now() - timedelta(days=LOGIN_AUDIT_RETENTION_DAYS)).replace(
            microsecond=0
        ).isoformat().replace("+00:00", "Z")
        values = (
            str(uuid.uuid4()),
            target["id"] if target else "",
            username,
            int(bool(success)),
            str(reason or ("success" if success else "failed"))[:80],
            str(details.get("ip_address") or "")[:80],
            str(details.get("country") or "")[:80],
            str(details.get("region") or "")[:120],
            str(details.get("city") or "")[:120],
            str(details.get("user_agent") or "")[:400],
            str(details.get("source") or "direct")[:40],
            now,
        )
        with self.lock, self.connect() as connection:
            connection.execute(
                """
                INSERT INTO login_audit_logs (
                    id, user_id, username, success, reason, ip_address,
                    country, region, city, user_agent, source, created_at
                ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
                """,
                values,
            )
            connection.execute("DELETE FROM login_audit_logs WHERE created_at < ?", (cutoff,))
            connection.execute(
                """
                DELETE FROM login_audit_logs WHERE id IN (
                    SELECT id FROM login_audit_logs
                    ORDER BY created_at DESC, rowid DESC LIMIT -1 OFFSET ?
                )
                """,
                (LOGIN_AUDIT_MAX_RECORDS,),
            )

    def list_login_audit_logs(self, actor, limit=300):
        if not self.is_super_admin(actor):
            raise AccountError("无管理员权限", 403, "forbidden")
        safe_limit = max(1, min(int(limit or 300), 500))
        with self.connect() as connection:
            rows = connection.execute(
                """
                SELECT id, user_id, username, success, reason, ip_address,
                       country, region, city, user_agent, source, created_at
                FROM login_audit_logs
                ORDER BY created_at DESC, rowid DESC LIMIT ?
                """,
                (safe_limit,),
            ).fetchall()
        return [dict(row) for row in rows]

    def admin_manage_membership(
        self,
        actor,
        user_id,
        action,
        plan_code="",
        start="",
        expires="",
        note="",
        preserve_japanese=False,
        trial_language="",
    ):
        if not self.is_super_admin(actor):
            raise AccountError("无管理员权限", 403, "forbidden")
        target = self.get_user(user_id)
        if not target:
            raise AccountError("用户不存在", 404, "user_not_found")
        if self.is_super_admin(target):
            raise AccountError("不能修改固定管理员的等级", 403, "admin_protected")
        action = str(action or "").strip().lower()
        plan_code = str(plan_code or "").strip()
        language_value = str(trial_language or "").strip().lower()
        if action in {"grant", "extend", "cancel"} and plan_code not in MEMBERSHIP_PLANS:
            raise AccountError("会员方案无效", 400, "plan_invalid")
        before = self._public_snapshot(self.user_payload(target))
        now = iso_now()
        with self.lock, self.connect() as connection:
            if action in {"grant", "extend"}:
                plan = MEMBERSHIP_PLANS[plan_code]
                raw_start = str(start or "").strip()
                raw_expires = str(expires or "").strip()
                start_value = membership_time_value(raw_start) if raw_start else now
                if raw_start and not start_value:
                    raise AccountError("会员开始日期格式无效，请使用年/月/日", 400, "membership_start_invalid")
                existing = connection.execute(
                    """
                    SELECT * FROM user_memberships
                    WHERE user_id = ? AND plan_code = ?
                    ORDER BY expires_at DESC, created_at DESC LIMIT 1
                    """,
                    (user_id, plan_code),
                ).fetchone()
                if plan_code == "trial_single_language":
                    if not language_value and existing:
                        try:
                            language_value = json.loads(existing["metadata_json"] or "{}").get("language", "")
                        except (json.JSONDecodeError, TypeError):
                            language_value = ""
                    if language_value not in LANGUAGES:
                        raise AccountError("单语言包月体验必须选择英语或日语", 400, "trial_language_invalid")
                    metadata_json = json.dumps(
                        {"language": language_value}, ensure_ascii=False, separators=(",", ":")
                    )
                else:
                    metadata_json = "{}"
                if action == "extend" and not plan["lifetime"]:
                    current_expiry = parse_time(existing["expires_at"]) if existing and existing["status"] == "active" else None
                    base = current_expiry if current_expiry and current_expiry > utc_now() else utc_now()
                    expires_value = membership_time_value(raw_expires, end_of_day=True) if raw_expires else default_plan_expiry(plan_code, base)
                    start_value = existing["starts_at"] if existing else start_value
                elif plan["lifetime"]:
                    expires_value = ""
                else:
                    expires_value = membership_time_value(raw_expires, end_of_day=True) if raw_expires else default_plan_expiry(plan_code, parse_time(start_value) or utc_now())
                if raw_expires and not expires_value:
                    raise AccountError("会员截止日期格式无效，请使用年/月/日", 400, "membership_expires_invalid")
                if existing:
                    connection.execute(
                        """
                        UPDATE user_memberships SET starts_at = ?, expires_at = ?, is_lifetime = ?,
                            status = 'active', source = 'admin', created_by = ?, metadata_json = ?, updated_at = ?
                        WHERE id = ?
                        """,
                        (
                            start_value,
                            expires_value,
                            int(plan["lifetime"]),
                            actor["username"],
                            metadata_json,
                            now,
                            existing["id"],
                        ),
                    )
                else:
                    connection.execute(
                        """
                        INSERT INTO user_memberships (
                            id, user_id, plan_code, starts_at, expires_at, is_lifetime,
                            status, source, source_ref, created_by, metadata_json, created_at, updated_at
                        ) VALUES (?, ?, ?, ?, ?, ?, 'active', 'admin', ?, ?, ?, ?, ?)
                        """,
                        (
                            str(uuid.uuid4()),
                            user_id,
                            plan_code,
                            start_value,
                            expires_value,
                            int(plan["lifetime"]),
                            f"admin:{plan_code}",
                            actor["username"],
                            metadata_json,
                            now,
                            now,
                        ),
                    )
            elif action == "cancel":
                connection.execute(
                    "UPDATE user_memberships SET status = 'cancelled', updated_at = ? WHERE user_id = ? AND plan_code = ? AND status = 'active'",
                    (now, user_id, plan_code),
                )
            elif action == "cancel_all":
                if preserve_japanese:
                    connection.execute(
                        """
                        UPDATE user_memberships SET status = 'cancelled', updated_at = ?
                        WHERE user_id = ? AND status = 'active' AND plan_code != 'japanese_lifetime'
                        """,
                        (now, user_id),
                    )
                else:
                    connection.execute(
                        "UPDATE user_memberships SET status = 'cancelled', updated_at = ? WHERE user_id = ? AND status = 'active'",
                        (now, user_id),
                    )
            else:
                raise AccountError("会员操作无效", 400, "membership_action_invalid")
        self._sync_legacy_membership_snapshot(user_id)
        current = self.get_user(user_id)
        after_payload = self.user_payload(current)
        with self.lock, self.connect() as connection:
            self._audit(
                connection,
                actor,
                f"membership_{action}",
                target=current,
                before=before,
                after=self._public_snapshot(after_payload),
                note=note,
            )
        self._sync_after_write()
        return after_payload

    def admin_set_entitlement_override(self, actor, user_id, entitlement, allowed, note=""):
        if not self.is_super_admin(actor):
            raise AccountError("无管理员权限", 403, "forbidden")
        target = self.get_user(user_id)
        if not target:
            raise AccountError("用户不存在", 404, "user_not_found")
        if self.is_super_admin(target):
            raise AccountError("不能修改固定管理员的权限", 403, "admin_protected")
        entitlement = str(entitlement or "").strip()
        if entitlement not in ENTITLEMENT_LABELS:
            raise AccountError("权益代码无效", 400, "entitlement_invalid")
        before = self._public_snapshot(self.user_payload(target))
        with self.lock, self.connect() as connection:
            if allowed is None:
                connection.execute(
                    "DELETE FROM user_entitlement_overrides WHERE user_id = ? AND entitlement_code = ?",
                    (user_id, entitlement),
                )
            else:
                connection.execute(
                    """
                    INSERT INTO user_entitlement_overrides (
                        user_id, entitlement_code, allowed, note, updated_by, updated_at
                    ) VALUES (?, ?, ?, ?, ?, ?)
                    ON CONFLICT(user_id, entitlement_code) DO UPDATE SET
                        allowed = excluded.allowed, note = excluded.note,
                        updated_by = excluded.updated_by, updated_at = excluded.updated_at
                    """,
                    (user_id, entitlement, int(bool(allowed)), str(note or "")[:500], actor["username"], iso_now()),
                )
        after_payload = self.user_payload(self.get_user(user_id))
        with self.lock, self.connect() as connection:
            self._audit(
                connection,
                actor,
                "entitlement_override_clear" if allowed is None else "entitlement_override",
                target=target,
                before=before,
                after=self._public_snapshot(after_payload),
                note=note,
            )
        return after_payload

    def admin_set_membership(self, actor, user_id, membership, start="", expires="", trial_language=""):
        if not self.is_super_admin(actor):
            raise AccountError("无管理员权限", 403, "forbidden")
        target = self.get_user(user_id)
        if not target:
            raise AccountError("用户不存在", 404, "user_not_found")
        if self.is_super_admin(target):
            raise AccountError("不能修改固定管理员的等级", 403, "admin_protected")
        before = self._public_snapshot(self.user_payload(target))
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
            connection.execute(
                """
                UPDATE user_memberships SET status = 'cancelled', updated_at = ?
                WHERE user_id = ? AND status = 'active'
                  AND plan_code IN ('trial_single_language', 'legacy_all_monthly', 'legacy_all_lifetime')
                """,
                (iso_now(), user_id),
            )
            plan_code = LEGACY_PLAN_MAP.get(membership)
            if plan_code:
                plan = MEMBERSHIP_PLANS[plan_code]
                metadata = {"language": language_value} if membership == "trial_single_language" else {}
                existing = connection.execute(
                    "SELECT id FROM user_memberships WHERE user_id = ? AND source = 'legacy_admin' AND source_ref = 'users.membership'",
                    (user_id,),
                ).fetchone()
                values = (
                    plan_code,
                    start_value,
                    expires_value,
                    int(plan["lifetime"]),
                    json.dumps(metadata, ensure_ascii=False, separators=(",", ":")),
                    actor["username"],
                    iso_now(),
                )
                if existing:
                    connection.execute(
                        """
                        UPDATE user_memberships SET plan_code = ?, starts_at = ?, expires_at = ?,
                            is_lifetime = ?, status = 'active', metadata_json = ?, created_by = ?, updated_at = ?
                        WHERE id = ?
                        """,
                        values + (existing["id"],),
                    )
                else:
                    connection.execute(
                        """
                        INSERT INTO user_memberships (
                            id, user_id, plan_code, starts_at, expires_at, is_lifetime, status,
                            source, source_ref, created_by, metadata_json, created_at, updated_at
                        ) VALUES (?, ?, ?, ?, ?, ?, 'active', 'legacy_admin', 'users.membership', ?, ?, ?, ?)
                        """,
                        (
                            str(uuid.uuid4()),
                            user_id,
                            plan_code,
                            start_value,
                            expires_value,
                            int(plan["lifetime"]),
                            actor["username"],
                            json.dumps(metadata, ensure_ascii=False, separators=(",", ":")),
                            iso_now(),
                            iso_now(),
                        ),
                    )
        self._sync_after_write()
        after = self.user_payload(self.get_user(user_id))
        with self.lock, self.connect() as connection:
            self._audit(
                connection,
                actor,
                "legacy_membership_set",
                target=target,
                before=before,
                after=self._public_snapshot(after),
            )
        return after

    def admin_change_secret(self, actor, user_id, secret):
        if not self.is_super_admin(actor):
            raise AccountError("无管理员权限", 403, "forbidden")
        target = self.get_user(user_id)
        if not target:
            raise AccountError("用户不存在", 404, "user_not_found")
        if self.is_super_admin(target):
            raise AccountError("固定管理员密钥不能修改", 403, "admin_protected")
        secret = self.validate_secret(secret)
        before = self._public_snapshot(self.user_payload(target))
        with self.lock, self.connect() as connection:
            connection.execute(
                "UPDATE users SET secret = ?, session_version = session_version + 1, updated_at = ? WHERE id = ?",
                (hash_secret(secret), iso_now(), user_id),
            )
            connection.execute("DELETE FROM sessions WHERE user_id = ?", (user_id,))
            self._audit(
                connection,
                actor,
                "secret_reset",
                target=target,
                before=before,
                after=before,
                note="管理员重置登录密钥并注销全部会话",
            )
        self._sync_after_write()

    def admin_set_ban(self, actor, user_id, banned):
        if not self.is_super_admin(actor):
            raise AccountError("无管理员权限", 403, "forbidden")
        target = self.get_user(user_id)
        if not target:
            raise AccountError("用户不存在", 404, "user_not_found")
        if self.is_super_admin(target):
            raise AccountError("不能封禁固定管理员", 403, "admin_protected")
        before = self._public_snapshot(self.user_payload(target))
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
        after = self._public_snapshot(self.user_payload(self.get_user(user_id)))
        with self.lock, self.connect() as connection:
            self._audit(
                connection,
                actor,
                "ban" if value else "unban",
                target=target,
                before=before,
                after=after,
            )
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
        with self.lock, self.connect() as connection:
            snapshot = self._public_snapshot(self.user_payload(target))
            self._audit(
                connection,
                actor,
                "force_logout",
                target=target,
                before=snapshot,
                after=snapshot,
            )

    def admin_delete_user(self, actor, user_id):
        if not self.is_super_admin(actor):
            raise AccountError("无管理员权限", 403, "forbidden")
        target = self.get_user(user_id)
        if not target:
            raise AccountError("用户不存在", 404, "user_not_found")
        if self.is_super_admin(target):
            raise AccountError("不能删除固定管理员", 403, "admin_protected")
        before = self._public_snapshot(self.user_payload(target))
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
            self._audit(
                connection,
                actor,
                "delete_user",
                target=target,
                before=before,
                after={},
            )
        self._sync_after_write()

    def create_recharge_request(self, user, plan, trial_language=""):
        if not user or user["deleted"] or user["banned"]:
            raise AccountError("账户不可用", 403, "account_unavailable")
        plan_code = str(plan or "").strip()
        if plan_code not in PURCHASABLE_PLAN_CODES:
            raise AccountError("充值套餐无效", 400, "plan_invalid")
        plan_data = MEMBERSHIP_PLANS[plan_code]
        language_value = str(trial_language or "").strip().lower()
        if plan_code == "trial_single_language":
            if language_value not in LANGUAGES:
                raise AccountError("单语言包月体验必须选择英语或日语", 400, "trial_language_invalid")
        else:
            language_value = ""
        now = iso_now()
        request_id = str(uuid.uuid4())
        order_number = f"WYJ-{datetime.now().strftime('%Y%m%d')}-{secrets.token_hex(4).upper()}"
        language_label = {"english": "英语", "japanese": "日语"}.get(language_value, "")
        plan_label = f"{plan_data['name']}（{language_label}）" if language_label else plan_data["name"]
        payment_note = f"{user['username']} {order_number} {plan_label}"
        with self.lock, self.connect() as connection:
            existing = connection.execute(
                """
                SELECT * FROM payment_requests WHERE user_id = ?
                AND status IN ('pending_payment', 'user_paid') ORDER BY requested_at DESC LIMIT 1
                """,
                (user["id"],),
            ).fetchone()
            if existing:
                return dict(existing), False
            connection.execute(
                """
                INSERT INTO payment_requests (
                    id, order_number, user_id, username, plan_code, amount_cents, currency,
                    contact, payment_note, status, requested_at, updated_at, trial_language
                ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, 'pending_payment', ?, ?, ?)
                """,
                (
                    request_id,
                    order_number,
                    user["id"],
                    user["username"],
                    plan_code,
                    plan_data["price_cents"],
                    plan_data["currency"],
                    WECHAT_CONTACT,
                    payment_note,
                    now,
                    now,
                    language_value,
                ),
            )
            record = connection.execute("SELECT * FROM payment_requests WHERE id = ?", (request_id,)).fetchone()
        return dict(record), True

    def confirm_recharge_payment(self, user, request_id):
        with self.lock, self.connect() as connection:
            request = connection.execute(
                "SELECT * FROM payment_requests WHERE id = ? AND user_id = ?",
                (str(request_id or ""), user["id"]),
            ).fetchone()
            if not request:
                raise AccountError("充值订单不存在", 404, "payment_not_found")
            if request["status"] == "user_paid":
                return dict(request)
            if request["status"] != "pending_payment":
                raise AccountError("该订单不能再确认付款", 409, "payment_status_invalid")
            now = iso_now()
            connection.execute(
                """
                UPDATE payment_requests SET status = 'user_paid', user_confirmed_at = ?,
                    updated_at = ? WHERE id = ?
                """,
                (now, now, request["id"]),
            )
            return dict(connection.execute("SELECT * FROM payment_requests WHERE id = ?", (request["id"],)).fetchone())

    def list_user_payment_requests(self, user):
        with self.connect() as connection:
            return [
                dict(row)
                for row in connection.execute(
                    "SELECT * FROM payment_requests WHERE user_id = ? ORDER BY requested_at DESC LIMIT 50",
                    (user["id"],),
                ).fetchall()
            ]

    def list_recharge_requests(self, actor):
        if not self.is_super_admin(actor):
            raise AccountError("无管理员权限", 403, "forbidden")
        with self.connect() as connection:
            return [dict(row) for row in connection.execute(
                "SELECT * FROM payment_requests ORDER BY requested_at DESC"
            ).fetchall()]

    def process_recharge_request(self, actor, request_id, action):
        if not self.is_super_admin(actor):
            raise AccountError("无管理员权限", 403, "forbidden")
        action = str(action or "").strip().lower()
        if action not in {"approve", "reject"}:
            raise AccountError("处理操作无效", 400, "action_invalid")
        with self.lock:
            with self.connect() as connection:
                request = connection.execute(
                    "SELECT * FROM payment_requests WHERE id = ?", (request_id,)
                ).fetchone()
            if not request:
                raise AccountError("充值申请不存在", 404, "request_not_found")
            if request["status"] not in OPEN_PAYMENT_STATUSES:
                raise AccountError("充值申请已处理", 409, "request_already_processed")
            if action == "approve":
                self.admin_manage_membership(
                    actor,
                    request["user_id"],
                    "grant",
                    request["plan_code"],
                    note=f"确认订单 {request['order_number']}",
                    trial_language=request["trial_language"],
                )
            status = "approved" if action == "approve" else "rejected"
            now = iso_now()
            target = self.get_user(request["user_id"])
            with self.connect() as connection:
                changed = connection.execute(
                    """
                    UPDATE payment_requests SET status = ?, updated_at = ?, handled_at = ?, handled_by = ?
                    WHERE id = ? AND status IN ('pending_payment', 'user_paid')
                    """,
                    (status, now, now, actor["username"], request_id),
                ).rowcount
                if changed != 1:
                    raise AccountError("充值申请已处理", 409, "request_already_processed")
                self._audit(
                    connection,
                    actor,
                    "payment_approve" if action == "approve" else "payment_reject",
                    target=target,
                    before={"order_number": request["order_number"], "status": request["status"]},
                    after={"order_number": request["order_number"], "status": status},
                )
            return status

    @staticmethod
    def _validate_tool_id(tool_id):
        value = str(tool_id or "").strip()
        if not re.fullmatch(r"[a-z0-9][a-z0-9_-]{0,79}", value):
            raise AccountError("工具标识无效", 400, "tool_id_invalid")
        return value

    def list_tool_preferences(self, user):
        with self.connect() as connection:
            favorites = [
                dict(row)
                for row in connection.execute(
                    "SELECT tool_id, pinned, created_at, updated_at FROM tool_favorites WHERE user_id = ? ORDER BY pinned DESC, updated_at DESC",
                    (user["id"],),
                ).fetchall()
            ]
            recent = [
                dict(row)
                for row in connection.execute(
                    "SELECT tool_id, MAX(used_at) AS used_at FROM tool_recent_usage WHERE user_id = ? GROUP BY tool_id ORDER BY used_at DESC LIMIT 30",
                    (user["id"],),
                ).fetchall()
            ]
            configs = [
                dict(row)
                for row in connection.execute(
                    "SELECT id, tool_id, name, config_json, created_at, updated_at FROM saved_tool_configs WHERE user_id = ? ORDER BY updated_at DESC LIMIT 100",
                    (user["id"],),
                ).fetchall()
            ]
        for config in configs:
            try:
                config["config"] = json.loads(config.pop("config_json") or "{}")
            except (json.JSONDecodeError, TypeError):
                config["config"] = {}
                config.pop("config_json", None)
        return {"favorites": favorites, "recent": recent, "configs": configs}

    def set_tool_favorite(self, user, tool_id, favorite=True, pinned=False):
        tool_id = self._validate_tool_id(tool_id)
        now = iso_now()
        with self.lock, self.connect() as connection:
            if favorite:
                connection.execute(
                    """
                    INSERT INTO tool_favorites (user_id, tool_id, pinned, created_at, updated_at)
                    VALUES (?, ?, ?, ?, ?)
                    ON CONFLICT(user_id, tool_id) DO UPDATE SET
                        pinned = excluded.pinned, updated_at = excluded.updated_at
                    """,
                    (user["id"], tool_id, int(bool(pinned)), now, now),
                )
            else:
                connection.execute(
                    "DELETE FROM tool_favorites WHERE user_id = ? AND tool_id = ?",
                    (user["id"], tool_id),
                )

    def record_tool_usage(self, user, tool_id):
        tool_id = self._validate_tool_id(tool_id)
        with self.lock, self.connect() as connection:
            connection.execute(
                "INSERT INTO tool_recent_usage (id, user_id, tool_id, used_at) VALUES (?, ?, ?, ?)",
                (str(uuid.uuid4()), user["id"], tool_id, iso_now()),
            )
            connection.execute(
                """
                DELETE FROM tool_recent_usage WHERE id IN (
                    SELECT id FROM tool_recent_usage WHERE user_id = ?
                    ORDER BY used_at DESC LIMIT -1 OFFSET 200
                )
                """,
                (user["id"],),
            )

    def clear_tool_history(self, user):
        with self.lock, self.connect() as connection:
            connection.execute("DELETE FROM tool_recent_usage WHERE user_id = ?", (user["id"],))

    def save_tool_config(self, user, tool_id, name, config, config_id=""):
        tool_id = self._validate_tool_id(tool_id)
        name = str(name or "").strip()[:80]
        if not name:
            raise AccountError("配置名称不能为空", 400, "config_name_required")
        encoded = json.dumps(config if isinstance(config, (dict, list)) else {}, ensure_ascii=False, separators=(",", ":"))
        if len(encoded.encode("utf-8")) > 50 * 1024:
            raise AccountError("工具配置不能超过 50 KB", 413, "config_too_large")
        now = iso_now()
        config_id = str(config_id or "").strip()
        with self.lock, self.connect() as connection:
            if config_id:
                changed = connection.execute(
                    """
                    UPDATE saved_tool_configs SET tool_id = ?, name = ?, config_json = ?, updated_at = ?
                    WHERE id = ? AND user_id = ?
                    """,
                    (tool_id, name, encoded, now, config_id, user["id"]),
                ).rowcount
                if not changed:
                    raise AccountError("工具配置不存在", 404, "config_not_found")
            else:
                config_id = str(uuid.uuid4())
                connection.execute(
                    """
                    INSERT INTO saved_tool_configs (
                        id, user_id, tool_id, name, config_json, created_at, updated_at
                    ) VALUES (?, ?, ?, ?, ?, ?, ?)
                    """,
                    (config_id, user["id"], tool_id, name, encoded, now, now),
                )
        return config_id

    def delete_tool_config(self, user, config_id):
        with self.lock, self.connect() as connection:
            connection.execute(
                "DELETE FROM saved_tool_configs WHERE id = ? AND user_id = ?",
                (str(config_id or ""), user["id"]),
            )

    def admin_tool_usage_stats(self, actor):
        if not self.is_super_admin(actor):
            raise AccountError("无管理员权限", 403, "forbidden")
        with self.connect() as connection:
            rows = connection.execute(
                """
                SELECT tool_id, COUNT(*) AS uses, COUNT(DISTINCT user_id) AS users,
                    MAX(used_at) AS last_used_at
                FROM tool_recent_usage GROUP BY tool_id ORDER BY uses DESC LIMIT 200
                """
            ).fetchall()
        return [dict(row) for row in rows]
