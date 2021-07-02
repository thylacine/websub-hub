--
DELETE FROM verification
WHERE id IN
	(SELECT id FROM verification WHERE topic_id = $(topicId) AND callback = $(callback) AND created <= (SELECT created FROM verification WHERE id = $(verificationId)))
