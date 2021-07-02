-- claim some topics needing their contents fetched
SELECT id
	FROM topic_fetch_needed
	LIMIT :wanted
