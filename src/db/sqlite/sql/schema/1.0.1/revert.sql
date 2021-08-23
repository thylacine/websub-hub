BEGIN;
	DROP VIEW verification_needed;
	CREATE VIEW verification_needed AS
		SELECT *
		FROM verification
		WHERE
			(topic_id, callback, created) IN (SELECT topic_id, callback, max(created) AS created FROM verification GROUP BY topic_id, callback)
		AND
			(topic_id, callback) NOT IN (SELECT topic_id, callback FROM verification_in_progress_active)
		AND
			next_attempt <= (strftime('%s', 'now'))
	;

	DELETE FROM _meta_schema_version WHERE major = 1 AND minor = 0 AND patch = 1;
COMMIT;

