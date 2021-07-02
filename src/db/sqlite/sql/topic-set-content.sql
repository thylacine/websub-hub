-- 
UPDATE topic
SET
	is_active = true,
	content_updated = strftime('%s', 'now'),
	content = :content,
	content_hash = :contentHash,
	content_type = :contentType
WHERE id = :topicId
