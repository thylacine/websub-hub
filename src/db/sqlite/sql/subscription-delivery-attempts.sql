--
SELECT delivery_attempts_since_success
FROM subscription
WHERE topic_id = :topicId AND callback = :callback

