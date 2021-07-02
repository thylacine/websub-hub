--
SELECT COUNT(s.id) AS count
FROM subscription s
JOIN topic t ON s.topic_id = t.id
WHERE t.url = :topicUrl AND s.expires > strftime('%s', 'now')
