ALTER TABLE payment_requests
    ADD COLUMN plan_name_snapshot TEXT NOT NULL DEFAULT '';
ALTER TABLE payment_requests
    ADD COLUMN payment_method TEXT NOT NULL DEFAULT '';
ALTER TABLE payment_requests
    ADD COLUMN qr_resource_id TEXT NOT NULL DEFAULT '';
ALTER TABLE payment_requests
    ADD COLUMN expires_at TEXT NOT NULL DEFAULT '';
ALTER TABLE payment_requests
    ADD COLUMN processing_at TEXT NOT NULL DEFAULT '';
ALTER TABLE payment_requests
    ADD COLUMN cancelled_at TEXT NOT NULL DEFAULT '';

UPDATE payment_requests
SET plan_name_snapshot = COALESCE(
    (SELECT name FROM membership_plans WHERE code = payment_requests.plan_code),
    plan_code
)
WHERE plan_name_snapshot = '';

DROP INDEX IF EXISTS payment_one_open_per_user;
CREATE UNIQUE INDEX payment_one_open_per_user
    ON payment_requests(user_id)
    WHERE status IN ('pending_payment', 'user_paid', 'processing');
CREATE INDEX payment_requests_status_idx
    ON payment_requests(status, requested_at DESC);

CREATE TABLE IF NOT EXISTS payment_request_events (
    id TEXT PRIMARY KEY,
    payment_request_id TEXT NOT NULL,
    from_status TEXT NOT NULL DEFAULT '',
    to_status TEXT NOT NULL,
    actor_user_id TEXT NOT NULL DEFAULT '',
    actor_username TEXT NOT NULL DEFAULT '',
    note TEXT NOT NULL DEFAULT '',
    created_at TEXT NOT NULL,
    FOREIGN KEY(payment_request_id) REFERENCES payment_requests(id) ON DELETE CASCADE
);
CREATE INDEX IF NOT EXISTS payment_request_events_request_idx
    ON payment_request_events(payment_request_id, created_at, id);

CREATE TABLE IF NOT EXISTS payment_fulfillments (
    id TEXT PRIMARY KEY,
    payment_request_id TEXT NOT NULL UNIQUE,
    user_id TEXT NOT NULL,
    plan_code TEXT NOT NULL,
    user_membership_id TEXT NOT NULL,
    source TEXT NOT NULL,
    source_ref TEXT NOT NULL UNIQUE,
    fulfilled_at TEXT NOT NULL,
    FOREIGN KEY(payment_request_id) REFERENCES payment_requests(id) ON DELETE CASCADE,
    FOREIGN KEY(user_id) REFERENCES users(id) ON DELETE CASCADE,
    FOREIGN KEY(user_membership_id) REFERENCES user_memberships(id) ON DELETE CASCADE
);
CREATE INDEX IF NOT EXISTS payment_fulfillments_user_idx
    ON payment_fulfillments(user_id, fulfilled_at DESC);

INSERT INTO schema_migrations(version, applied_at)
VALUES ('004_payment_flow', strftime('%Y-%m-%dT%H:%M:%SZ', 'now'));
