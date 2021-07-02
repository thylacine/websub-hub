--
UPDATE topic SET
	content_updated = now(),
	is_deleted = true
WHERE id = $(topicId)

