--
UPDATE subscription SET
	delivery_attempts_since_success = delivery_attempts_since_success + 1,
	delivery_next_attempt = now() + ($(nextAttemptDelaySeconds) * INTERVAL '1 second')
WHERE
	topic_id = $(topicId) AND callback = $(callback)
