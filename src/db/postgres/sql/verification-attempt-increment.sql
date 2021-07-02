--
UPDATE verification SET
	next_attempt = (now() + $(nextAttemptDelaySeconds)::text::INTERVAL),
	attempts = attempts + 1
WHERE id = $(verificationId)

