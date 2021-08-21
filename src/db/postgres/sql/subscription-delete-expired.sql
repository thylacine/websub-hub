--
DELETE FROM subscription
WHERE topic_id = $(topicId) AND expires < now()

