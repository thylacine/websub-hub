--
UPDATE topic SET
	content_updated = strftime('%s', 'now'),
	is_deleted = true
WHERE id = :topicId

