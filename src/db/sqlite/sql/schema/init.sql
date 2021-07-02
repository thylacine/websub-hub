--
BEGIN;
CREATE TABLE _meta_schema_version (
	major INTEGER NOT NULL,
	minor INTEGER NOT NULL,
	patch INTEGER NOT NULL,
	applied INTEGER NOT NULL DEFAULT (strftime('%s', 'now')),
	PRIMARY KEY (major, minor, patch)
) WITHOUT ROWID;
INSERT INTO _meta_schema_version (major, minor, patch) VALUES (0, 0, 0);
COMMIT;
