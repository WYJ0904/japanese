CREATE TABLE IF NOT EXISTS login_audit_logs (
    id TEXT PRIMARY KEY,
    user_id TEXT NOT NULL DEFAULT '',
    username TEXT NOT NULL DEFAULT '',
    success INTEGER NOT NULL DEFAULT 0,
    reason TEXT NOT NULL DEFAULT '',
    ip_address TEXT NOT NULL DEFAULT '',
    country TEXT NOT NULL DEFAULT '',
    region TEXT NOT NULL DEFAULT '',
    city TEXT NOT NULL DEFAULT '',
    user_agent TEXT NOT NULL DEFAULT '',
    source TEXT NOT NULL DEFAULT 'direct',
    created_at TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS login_audit_created_idx
    ON login_audit_logs(created_at DESC);
CREATE INDEX IF NOT EXISTS login_audit_user_idx
    ON login_audit_logs(user_id, created_at DESC);
CREATE INDEX IF NOT EXISTS login_audit_success_idx
    ON login_audit_logs(success, created_at DESC);

INSERT OR IGNORE INTO schema_migrations(version, applied_at)
VALUES ('003_login_audit', strftime('%Y-%m-%dT%H:%M:%SZ', 'now'));
