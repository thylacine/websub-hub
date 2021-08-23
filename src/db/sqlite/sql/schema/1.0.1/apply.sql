BEGIN;
	DROP VIEW verification_needed;
	CREATE VIEW verification_needed AS
		SELECT v.*
		FROM verification v JOIN topic t ON v.topic_id = t.id
		WHERE
			t.is_active
		AND
			(v.topic_id, v.callback, v.created) IN (SELECT topic_id, callback, max(created) AS created FROM verification GROUP BY topic_id, callback)
		AND
			(v.topic_id, v.callback) NOT IN (SELECT topic_id, callback FROM verification_in_progress_active)
		AND
			v.next_attempt <= (strftime('%s', 'now'))
	;

	INSERT INTO _meta_schema_version (major, minor, patch) VALUES (1, 0, 1);
COMMIT;

