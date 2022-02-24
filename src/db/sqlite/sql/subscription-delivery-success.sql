--
UPDATE subscription SET
	content_delivered = strftime('%s', 'now'),
	latest_content_delivered = :topicContentUpdated,
	delivery_attempts_since_success = 0,
	delivery_next_attempt = 0
WHERE
	topic_id = :topicId AND callback = :callback
