-- topic including content
SELECT *,
	extract(epoch FROM lease_seconds_preferred)::integer AS lease_seconds_preferred,
	extract(epoch FROM lease_seconds_min)::integer AS lease_seconds_min,
	extract(epoch FROM lease_seconds_max)::integer AS lease_seconds_max
FROM topic
WHERE id = $(topicId)
