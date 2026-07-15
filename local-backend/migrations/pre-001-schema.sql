-- Schema snapshot before migration 001. Existing data tables are intentionally preserved.
CREATE TABLE users (
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
CREATE TABLE sessions (
    token TEXT PRIMARY KEY,
    user_id TEXT NOT NULL,
    session_version INTEGER NOT NULL,
    created_at TEXT NOT NULL,
    last_seen_at TEXT NOT NULL,
    FOREIGN KEY(user_id) REFERENCES users(id) ON DELETE CASCADE
);
CREATE TABLE recharge_requests (
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
