--
INSERT INTO verification_in_progress
	(id, topic_id, callback, claimant, claim_expires)
SELECT id, topic_id, callback, $(claimant) AS claimant, now() + $(claimTimeoutSeconds)::text::interval AS claim_expires
	FROM verification
	WHERE id = $(verificationId)
	FOR UPDATE OF verification SKIP LOCKED
ON CONFLICT (topic_id, callback) DO UPDATE
SET
	claimant = $(claimant),
	claimed = now(),
	claim_expires = now() + $(claimTimeoutSeconds)::text::interval
RETURNING id
