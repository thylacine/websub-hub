--
INSERT INTO subscription_delivery_in_progress (id, claimant, claimed, claim_expires)
VALUES (:subscriptionId, :claimant, strftime('%s', 'now'), strftime('%s', 'now') + :claimTimeoutSeconds)
ON CONFLICT (id) DO UPDATE
SET
	claimant = :claimant,
	claimed = strftime('%s', 'now'),
	claim_expires = strftime('%s', 'now') + :claimTimeoutSeconds
