SELECT *
FROM subscription
WHERE topic_id = :topicId
AND expires > strftime('%s', 'now')
