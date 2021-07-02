--
UPDATE verification SET
	next_attempt = strftime('%s', 'now') + :nextAttemptDelaySeconds,
	attempts = attempts + 1
WHERE id = :verificationId

