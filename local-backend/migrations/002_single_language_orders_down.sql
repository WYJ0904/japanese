PRAGMA foreign_keys = OFF;
BEGIN IMMEDIATE;

DROP INDEX IF EXISTS payment_one_open_per_user;
DROP INDEX IF EXISTS payment_requests_user_idx;

CREATE TABLE payment_requests_rollback_002 (
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

INSERT INTO payment_requests_rollback_002 (
    id, order_number, user_id, username, plan_code, amount_cents, currency,
    contact, payment_note, status, requested_at, user_confirmed_at,
    handled_at, handled_by, admin_note, updated_at
)
SELECT
    id, order_number, user_id, username, plan_code, amount_cents, currency,
    contact, payment_note, status, requested_at, user_confirmed_at,
    handled_at, handled_by, admin_note, updated_at
FROM payment_requests;

DROP TABLE payment_requests;
ALTER TABLE payment_requests_rollback_002 RENAME TO payment_requests;
CREATE INDEX payment_requests_user_idx ON payment_requests(user_id, requested_at DESC);
CREATE UNIQUE INDEX payment_one_open_per_user
    ON payment_requests(user_id) WHERE status IN ('pending_payment', 'user_paid');
DELETE FROM schema_migrations WHERE version = '002_single_language_orders';

COMMIT;
PRAGMA foreign_keys = ON;
