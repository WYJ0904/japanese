CREATE TABLE IF NOT EXISTS schema_migrations (
    version TEXT PRIMARY KEY,
    applied_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS membership_plans (
    code TEXT PRIMARY KEY,
    name TEXT NOT NULL,
    price_cents INTEGER NOT NULL,
    currency TEXT NOT NULL,
    lifetime INTEGER NOT NULL DEFAULT 0,
    duration_months INTEGER NOT NULL DEFAULT 0,
    purchasable INTEGER NOT NULL DEFAULT 0,
    priority INTEGER NOT NULL DEFAULT 0,
    description TEXT NOT NULL DEFAULT '',
    updated_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS membership_entitlements (
    plan_code TEXT NOT NULL,
    entitlement_code TEXT NOT NULL,
    PRIMARY KEY(plan_code, entitlement_code),
    FOREIGN KEY(plan_code) REFERENCES membership_plans(code) ON DELETE CASCADE
);

CREATE TABLE IF NOT EXISTS user_memberships (
    id TEXT PRIMARY KEY,
    user_id TEXT NOT NULL,
    plan_code TEXT NOT NULL,
    starts_at TEXT NOT NULL,
    expires_at TEXT NOT NULL DEFAULT '',
    is_lifetime INTEGER NOT NULL DEFAULT 0,
    status TEXT NOT NULL DEFAULT 'active',
    source TEXT NOT NULL DEFAULT 'admin',
    source_ref TEXT NOT NULL DEFAULT '',
    created_by TEXT NOT NULL DEFAULT '',
    metadata_json TEXT NOT NULL DEFAULT '{}',
    created_at TEXT NOT NULL,
    updated_at TEXT NOT NULL,
    FOREIGN KEY(user_id) REFERENCES users(id) ON DELETE CASCADE,
    FOREIGN KEY(plan_code) REFERENCES membership_plans(code)
);
CREATE INDEX IF NOT EXISTS user_memberships_user_idx ON user_memberships(user_id, status);
CREATE UNIQUE INDEX IF NOT EXISTS user_memberships_source_idx
    ON user_memberships(user_id, source, source_ref) WHERE source_ref != '';

CREATE TABLE IF NOT EXISTS user_entitlement_overrides (
    user_id TEXT NOT NULL,
    entitlement_code TEXT NOT NULL,
    allowed INTEGER NOT NULL,
    note TEXT NOT NULL DEFAULT '',
    updated_by TEXT NOT NULL DEFAULT '',
    updated_at TEXT NOT NULL,
    PRIMARY KEY(user_id, entitlement_code),
    FOREIGN KEY(user_id) REFERENCES users(id) ON DELETE CASCADE
);

CREATE TABLE IF NOT EXISTS payment_requests (
    id TEXT PRIMARY KEY,
    order_number TEXT NOT NULL UNIQUE,
    user_id TEXT NOT NULL,
    username TEXT NOT NULL,
    plan_code TEXT NOT NULL,
    amount_cents INTEGER NOT NULL,
    currency TEXT NOT NULL,
    contact TEXT NOT NULL,
    payment_note TEXT NOT NULL,
    status TEXT NOT NULL DEFAULT 'pending_payment',
    requested_at TEXT NOT NULL,
    user_confirmed_at TEXT NOT NULL DEFAULT '',
    handled_at TEXT NOT NULL DEFAULT '',
    handled_by TEXT NOT NULL DEFAULT '',
    admin_note TEXT NOT NULL DEFAULT '',
    updated_at TEXT NOT NULL,
    FOREIGN KEY(user_id) REFERENCES users(id) ON DELETE CASCADE,
    FOREIGN KEY(plan_code) REFERENCES membership_plans(code)
);
CREATE INDEX IF NOT EXISTS payment_requests_user_idx ON payment_requests(user_id, requested_at DESC);
CREATE UNIQUE INDEX IF NOT EXISTS payment_one_open_per_user
    ON payment_requests(user_id) WHERE status IN ('pending_payment', 'user_paid');

CREATE TABLE IF NOT EXISTS admin_audit_logs (
    id TEXT PRIMARY KEY,
    actor_user_id TEXT NOT NULL,
    actor_username TEXT NOT NULL,
    target_user_id TEXT NOT NULL DEFAULT '',
    target_username TEXT NOT NULL DEFAULT '',
    action TEXT NOT NULL,
    before_json TEXT NOT NULL DEFAULT '{}',
    after_json TEXT NOT NULL DEFAULT '{}',
    note TEXT NOT NULL DEFAULT '',
    created_at TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS admin_audit_created_idx ON admin_audit_logs(created_at DESC);
CREATE INDEX IF NOT EXISTS admin_audit_target_idx ON admin_audit_logs(target_user_id, created_at DESC);

CREATE TABLE IF NOT EXISTS tool_favorites (
    user_id TEXT NOT NULL,
    tool_id TEXT NOT NULL,
    pinned INTEGER NOT NULL DEFAULT 0,
    created_at TEXT NOT NULL,
    updated_at TEXT NOT NULL,
    PRIMARY KEY(user_id, tool_id),
    FOREIGN KEY(user_id) REFERENCES users(id) ON DELETE CASCADE
);

CREATE TABLE IF NOT EXISTS tool_recent_usage (
    id TEXT PRIMARY KEY,
    user_id TEXT NOT NULL,
    tool_id TEXT NOT NULL,
    used_at TEXT NOT NULL,
    FOREIGN KEY(user_id) REFERENCES users(id) ON DELETE CASCADE
);
CREATE INDEX IF NOT EXISTS tool_recent_user_idx ON tool_recent_usage(user_id, used_at DESC);

CREATE TABLE IF NOT EXISTS saved_tool_configs (
    id TEXT PRIMARY KEY,
    user_id TEXT NOT NULL,
    tool_id TEXT NOT NULL,
    name TEXT NOT NULL,
    config_json TEXT NOT NULL,
    created_at TEXT NOT NULL,
    updated_at TEXT NOT NULL,
    FOREIGN KEY(user_id) REFERENCES users(id) ON DELETE CASCADE
);
CREATE INDEX IF NOT EXISTS saved_tool_configs_user_idx ON saved_tool_configs(user_id, tool_id);

CREATE TABLE IF NOT EXISTS temporary_texts (
    id TEXT PRIMARY KEY,
    owner_user_id TEXT NOT NULL,
    kind TEXT NOT NULL DEFAULT 'text',
    content TEXT NOT NULL,
    password_hash TEXT NOT NULL DEFAULT '',
    expires_at TEXT NOT NULL,
    max_views INTEGER NOT NULL DEFAULT 1,
    view_count INTEGER NOT NULL DEFAULT 0,
    destroy_after_read INTEGER NOT NULL DEFAULT 0,
    created_at TEXT NOT NULL,
    FOREIGN KEY(owner_user_id) REFERENCES users(id) ON DELETE CASCADE
);
CREATE INDEX IF NOT EXISTS temporary_texts_expiry_idx ON temporary_texts(expires_at);

CREATE TABLE IF NOT EXISTS temporary_files (
    id TEXT PRIMARY KEY,
    owner_user_id TEXT NOT NULL,
    file_name TEXT NOT NULL,
    mime_type TEXT NOT NULL,
    size_bytes INTEGER NOT NULL,
    content BLOB NOT NULL,
    password_hash TEXT NOT NULL DEFAULT '',
    expires_at TEXT NOT NULL,
    max_downloads INTEGER NOT NULL DEFAULT 1,
    download_count INTEGER NOT NULL DEFAULT 0,
    destroy_after_download INTEGER NOT NULL DEFAULT 0,
    created_at TEXT NOT NULL,
    FOREIGN KEY(owner_user_id) REFERENCES users(id) ON DELETE CASCADE
);
CREATE INDEX IF NOT EXISTS temporary_files_expiry_idx ON temporary_files(expires_at);

CREATE TABLE IF NOT EXISTS temporary_clipboards (
    id TEXT PRIMARY KEY,
    code_hash TEXT NOT NULL UNIQUE,
    owner_user_id TEXT NOT NULL,
    content TEXT NOT NULL,
    expires_at TEXT NOT NULL,
    destroy_after_read INTEGER NOT NULL DEFAULT 1,
    read_count INTEGER NOT NULL DEFAULT 0,
    created_at TEXT NOT NULL,
    FOREIGN KEY(owner_user_id) REFERENCES users(id) ON DELETE CASCADE
);
CREATE INDEX IF NOT EXISTS temporary_clipboards_expiry_idx ON temporary_clipboards(expires_at);

CREATE TABLE IF NOT EXISTS temporary_rooms (
    id TEXT PRIMARY KEY,
    owner_user_id TEXT NOT NULL,
    password_hash TEXT NOT NULL DEFAULT '',
    max_messages INTEGER NOT NULL DEFAULT 50,
    expires_at TEXT NOT NULL,
    created_at TEXT NOT NULL,
    FOREIGN KEY(owner_user_id) REFERENCES users(id) ON DELETE CASCADE
);
CREATE INDEX IF NOT EXISTS temporary_rooms_expiry_idx ON temporary_rooms(expires_at);

CREATE TABLE IF NOT EXISTS temporary_room_messages (
    id TEXT PRIMARY KEY,
    room_id TEXT NOT NULL,
    author TEXT NOT NULL,
    message TEXT NOT NULL,
    created_at TEXT NOT NULL,
    FOREIGN KEY(room_id) REFERENCES temporary_rooms(id) ON DELETE CASCADE
);
CREATE INDEX IF NOT EXISTS temporary_room_messages_idx ON temporary_room_messages(room_id, created_at);

INSERT OR IGNORE INTO schema_migrations(version, applied_at)
VALUES ('001_entitlements', strftime('%Y-%m-%dT%H:%M:%SZ', 'now'));
