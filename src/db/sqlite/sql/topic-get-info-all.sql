-- meta data with subscriber count
SELECT
	t.id,
	t.created,
	url,
	t.lease_seconds_preferred,
	t.lease_seconds_min,
	t.lease_seconds_max,
	t.publisher_validation_url,
	t.content_hash_algorithm,
	t.is_active,
	t.is_deleted,
	t.last_publish,
	t.content_fetch_next_attempt,
	t.content_fetch_attempts_since_success,
	t.content_updated,
	t.content_hash,
	t.content_type,
	COUNT (s.id) AS subscribers
FROM topic t
LEFT JOIN (SELECT id, topic_id FROM subscription WHERE expires > strftime('%s', 'now')) s ON t.id = s.topic_id
GROUP BY t.id
ORDER BY subscribers DESC, t.created DESC
