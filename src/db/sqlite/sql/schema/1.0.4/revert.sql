BEGIN;

	ALTER TABLE topic DROP COLUMN http_etag;
	ALTER TABLE topic DROP COLUMN http_last_modified;

	DELETE FROM _meta_schema_version WHERE major = 1 AND minor = 0 AND PATCH = 4;

COMMIT;
