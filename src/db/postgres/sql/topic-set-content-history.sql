--
INSERT INTO topic_content_history
	(topic_id, content_size, content_hash)
VALUES
	($(topicId), $(contentSize), $(contentHash))
