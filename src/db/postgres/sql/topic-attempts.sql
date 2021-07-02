--
SELECT content_fetch_attempts_since_success
FROM topic
WHERE id = $(topicId)
