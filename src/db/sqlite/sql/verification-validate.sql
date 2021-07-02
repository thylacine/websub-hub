--
UPDATE verification SET
	is_publisher_validated = true,
	attempts = 0,
	next_attempt = strftime('%s', 'now')
WHERE id = :verificationId
