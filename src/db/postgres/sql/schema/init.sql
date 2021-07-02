--
CREATE EXTENSION IF NOT EXISTS pg_stat_statements;
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";

--
BEGIN;
CREATE TABLE IF NOT EXISTS _meta_schema_version (
	major BIGINT NOT NULL,
	minor BIGINT NOT NULL,
	patch BIGINT NOT NULL,
	applied TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
	PRIMARY KEY (major, minor, patch)
);
INSERT INTO _meta_schema_version (major, minor, patch) VALUES (0, 0, 0);
COMMIT;
