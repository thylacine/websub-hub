-- update topic that a new publish notification occurred
UPDATE topic
SET
	last_publish = strftime('%s', 'now'),
	content_fetch_next_attempt = strftime('%s', 'now')
WHERE id = :topicId
