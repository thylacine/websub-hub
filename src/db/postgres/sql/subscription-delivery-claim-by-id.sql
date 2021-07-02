--
INSERT INTO subscription_delivery_in_progress (id, claimant, claimed, claim_expires)
VALUES ($(subscriptionId), $(claimant), now(), now() + $(claimTimeoutSeconds)::text::interval)
ON CONFLICT (id) DO UPDATE
SET
	claimant = $(claimant),
	claimed = now(),
	claim_expires = now() + $(claimTimeoutSeconds)::text::interval
RETURNING id
