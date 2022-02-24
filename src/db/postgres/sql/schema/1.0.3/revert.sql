BEGIN;
	DROP INDEX topic_content_history_topic_id_idx;
	DROP INDEX topic_content_history_content_updated_idx;
	DROP TABLE topic_content_history;

	DELETE FROM _meta_schema_version WHERE major = 1 AND minor = 0 AND patch = 3;
COMMIT;
