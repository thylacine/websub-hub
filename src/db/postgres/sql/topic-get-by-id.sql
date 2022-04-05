-- excluding content field
SELECT
	id,
	created,
	url,
	extract(epoch FROM lease_seconds_preferred) AS lease_seconds_preferred,
	extract(epoch FROM lease_seconds_min) AS lease_seconds_min,
	extract(epoch FROM lease_seconds_max) AS lease_seconds_max,
	publisher_validation_url,
	content_hash_algorithm,
	is_active,
	is_deleted,
	last_publish,
	content_fetch_next_attempt,
	content_fetch_attempts_since_success,
	content_updated,
	content_hash,
	content_type,
	http_etag,
	http_last_modified
FROM topic
WHERE id = $(topicId)
