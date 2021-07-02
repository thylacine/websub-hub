--
INSERT INTO verification_in_progress
	(id, topic_id, callback, claimant, claim_expires)
SELECT id, topic_id, callback, :claimant AS claimant, strftime('%s', 'now') + :claimTimeoutSeconds AS claim_expires
	FROM verification
	WHERE id = :verificationId
ON CONFLICT (id) DO UPDATE
SET
	claimant = :claimant,
	claimed = strftime('%s', 'now'),
	claim_expires = strftime('%s', 'now') + :claimTimeoutSeconds
