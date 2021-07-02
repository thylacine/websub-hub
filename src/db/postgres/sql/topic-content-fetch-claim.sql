-- claim some topics needing their contents fetched
INSERT INTO topic_fetch_in_progress (id, claimant, claimed, claim_expires)
SELECT id, $(claimant) AS claimant, now() AS claimed, now() + $(claimTimeoutSeconds)::text::interval AS claim_expires
	FROM topic_fetch_needed
	LIMIT $(wanted)
	FOR UPDATE OF topic_fetch_needed SKIP LOCKED
ON CONFLICT (id) DO UPDATE
SET
	claimant = $(claimant),
	claimed = now(),
	claim_expires = now() + $(claimTimeoutSeconds)::text::interval
RETURNING id
