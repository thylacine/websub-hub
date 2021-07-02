--
INSERT INTO verification_in_progress (id, topic_id, callback, claimant, claimed, claim_expires)
SELECT id, topic_id, callback, $(claimant) AS claimant, now() AS claimed, now() + $(claimTimeoutSeconds)::text::interval AS claim_expires
	FROM verification_needed
	LIMIT $(wanted)
	FOR UPDATE OF verification_needed SKIP LOCKED
ON CONFLICT (topic_id, callback) DO UPDATE
SET
	claimant = $(claimant),
	claimed = now(),
	claim_expires = now() + $(claimTimeoutSeconds)::text::interval
RETURNING id
