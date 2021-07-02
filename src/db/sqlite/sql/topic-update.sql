--
UPDATE topic
SET
	lease_seconds_preferred = :leaseSecondsPreferred,
	lease_seconds_min = :leaseSecondsMin,
	lease_seconds_max = :leaseSecondsMax,
	publisher_validation_url = :publisherValidationUrl,
	content_hash_algorithm = :contentHashAlgorithm
WHERE
	id = :topicId
