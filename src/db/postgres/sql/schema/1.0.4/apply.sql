BEGIN;

	ALTER TABLE topic
		ADD COLUMN http_etag TEXT,
		ADD COLUMN http_last_modified TEXT
	;

	INSERT INTO _meta_schema_version (major, minor, patch) VALUES (1, 0, 4);

COMMIT;