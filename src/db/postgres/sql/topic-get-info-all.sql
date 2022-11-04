-- meta data with subscriber count
SELECT
	t.id,
	created,
	url,
	extract(epoch FROM lease_seconds_preferred)::integer AS lease_seconds_preferred,
	extract(epoch FROM lease_seconds_min)::integer AS lease_seconds_min,
	extract(epoch FROM lease_seconds_max)::integer AS lease_seconds_max,
	t.publisher_validation_url,
	t.content_hash_algorithm,
	t.is_active,
	t.is_deleted,
	last_publish,
	content_fetch_next_attempt,
	t.content_fetch_attempts_since_success,
	content_updated,
	t.content_hash,
	t.content_type,
	COUNT (s.id) AS subscribers
FROM topic t
LEFT JOIN (SELECT id, topic_id FROM subscription WHERE expires > now()) s ON t.id = s.topic_id
GROUP BY t.id
ORDER BY subscribers DESC, t.created DESC
