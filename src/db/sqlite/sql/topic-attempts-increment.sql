--
UPDATE topic SET
	content_fetch_attempts_since_success = content_fetch_attempts_since_success + 1,
	content_fetch_next_attempt = strftime('%s', 'now') + :nextAttemptDelaySeconds
WHERE
	id = :topicId
