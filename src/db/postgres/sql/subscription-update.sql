--
UPDATE subscription
SET
	signature_algorithm = $(signatureAlgorithm)
WHERE
	id = $(subscriptionId)

