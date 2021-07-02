--
DELETE FROM subscription_delivery_in_progress
WHERE id = (
	SELECT id FROM subscription
	WHERE topic_id = $(topicId) AND callback = $(callback)
)
