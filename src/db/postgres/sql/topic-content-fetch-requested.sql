-- update topic that a new publish notification occurred
UPDATE topic
SET
	last_publish = now(),
	content_fetch_next_attempt = now()
WHERE id = $(topicId)

