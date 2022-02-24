BEGIN;
	-- Track all content updates over time.
	CREATE TABLE topic_content_history (
		topic_id INTEGER NOT NULL REFERENCES topic(id) ON DELETE CASCADE ON UPDATE CASCADE DEFERRABLE INITIALLY DEFERRED,
		content_updated INTEGER NOT NULL DEFAULT (strftime('%s', 'now')),
		content_size INTEGER NOT NULL,
		content_hash TEXT NOT NULL
	);
	CREATE INDEX topic_content_history_topic_id_idx ON topic_content_history(topic_id);
	CREATE INDEX topic_content_history_content_updated_idx ON topic_content_history(content_updated);

	INSERT INTO _meta_schema_version (major, minor, patch) VALUES (1, 0, 3);
COMMIT;
