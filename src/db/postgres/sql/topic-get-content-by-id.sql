-- topic including content
SELECT *,
	extract(epoch FROM lease_seconds_preferred) AS lease_seconds_preferred,
	extract(epoch FROM lease_seconds_min) AS lease_seconds_min,
	extract(epoch FROM lease_seconds_max) AS lease_seconds_max
FROM topic
WHERE id = $(topicId)
