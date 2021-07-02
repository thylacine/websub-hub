--
UPDATE topic SET
	content_fetch_attempts_since_success = 0,
	content_fetch_next_attempt = :forever
WHERE
	id = :topicId

