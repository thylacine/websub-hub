--
SELECT
	(strftime('%s', 'now') - content_updated) / 86400 AS days_ago,
	count(*) AS content_updates
FROM topic_content_history
WHERE
	days_ago <= :daysAgo
AND
	(:topicId IS NULL OR topic_id = :topicId)
GROUP BY days_ago
ORDER BY days_ago
;
