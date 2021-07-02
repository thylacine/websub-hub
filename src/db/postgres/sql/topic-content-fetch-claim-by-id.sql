-- claim a specific topic needing the content fetched
INSERT INTO topic_fetch_in_progress (id, claimant, claimed, claim_expires)
VALUES ($(topicId), $(claimant), now(), now() + $(claimTimeoutSeconds)::text::interval)
ON CONFLICT (id) DO UPDATE
SET
	claimant = $(claimant),
	claimed = now(),
	claim_expires = now() + $(claimTimeoutSeconds)::text::interval
WHERE topic_fetch_in_progress.claim_expires < now()
RETURNING id
