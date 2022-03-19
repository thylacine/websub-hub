--
SELECT
	EXTRACT(DAY FROM now() - content_updated::date) AS days_ago,
	count(*) AS content_updates
FROM topic_content_history
WHERE
	(now() - content_updated::date) < ($(daysAgo) * INTERVAL '1 day')
AND
	($(topicIds) IS NULL OR topic_id = ANY($(topicIds)::uuid[]))
GROUP BY content_updated::date
ORDER BY content_updated::date
;
