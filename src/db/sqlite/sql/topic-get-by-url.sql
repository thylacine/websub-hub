-- excluding content field
SELECT
	id,
	created,
	url,
	lease_seconds_preferred,
	lease_seconds_min,
	lease_seconds_max,
	publisher_validation_url,
	content_hash_algorithm,
	is_active,
	is_deleted,
	last_publish,
	content_fetch_next_attempt,
	content_fetch_attempts_since_success,
	content_updated,
	content_hash,
	content_type
FROM topic
WHERE url = :topicUrl
