-- Resetting verification attempts happens on publisher validation.
UPDATE verification SET
	next_attempt = now(),
	attempts = 0
WHERE id = $(verificationId)

