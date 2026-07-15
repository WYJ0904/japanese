ALTER TABLE payment_requests
    ADD COLUMN trial_language TEXT NOT NULL DEFAULT '';

UPDATE payment_requests
SET trial_language = COALESCE(
    (SELECT legacy.trial_language
     FROM recharge_requests AS legacy
     WHERE legacy.id = payment_requests.id),
    ''
)
WHERE plan_code = 'trial_single_language';

INSERT INTO schema_migrations(version, applied_at)
VALUES ('002_single_language_orders', strftime('%Y-%m-%dT%H:%M:%SZ', 'now'));
