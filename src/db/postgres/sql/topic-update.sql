--
UPDATE topic
SET
	lease_seconds_preferred = $(leaseSecondsPreferred)::text::interval,
	lease_seconds_min = $(leaseSecondsMin)::text::interval,
	lease_seconds_max = $(leaseSecondsMax)::text::interval,
	publisher_validation_url = $(publisherValidationUrl),
	content_hash_algorithm = $(contentHashAlgorithm)
WHERE
	id = $(topicId)
