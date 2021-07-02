--
INSERT INTO subscription_delivery_in_progress (id, claimant, claimed, claim_expires)
SELECT id, $(claimant) AS claimant, now() AS claimed, now() + $(claimTimeoutSeconds)::text::interval AS claim_expires
	FROM subscription_delivery_needed
	ORDER BY topic_id -- cluster topics together, so processing nodes can cache topic content
	LIMIT $(wanted)
	FOR UPDATE OF subscription_delivery_needed SKIP LOCKED
ON CONFLICT (id) DO UPDATE
SET
	claimant = $(claimant),
	claimed = now(),
	claim_expires = now() + $(claimTimeoutSeconds)::text::interval
RETURNING id
