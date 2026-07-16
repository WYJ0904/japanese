DROP TABLE IF EXISTS login_audit_logs;
DELETE FROM schema_migrations WHERE version = '003_login_audit';
