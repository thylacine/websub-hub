--
DELETE FROM verification
WHERE
	topic_id = :topicId
AND
	callback = :callback
AND
	created <= (SELECT created FROM verification WHERE id = :verificationId)
