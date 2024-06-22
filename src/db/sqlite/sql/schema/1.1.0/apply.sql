BEGIN;

	ALTER TABLE authentication ADD COLUMN otp_key TEXT CHECK (typeof(otp_key) IN ('text', 'null'));

	INSERT INTO _meta_schema_version (major, minor, patch) VALUES (1, 1, 0);

COMMIT;
