--
INSERT INTO topic
	(url, lease_seconds_preferred, lease_seconds_min, lease_seconds_max, publisher_validation_url)
VALUES (
	:url,
	:leaseSecondsPreferred,
	:leaseSecondsMin,
	:leaseSecondsMax,
	:publisherValidationUrl
) ON CONFLICT (url) DO UPDATE
SET
	is_deleted = 0,
	lease_seconds_preferred = :leaseSecondsPreferred,
	lease_seconds_min = :leaseSecondsMin,
	lease_seconds_max = :leaseSecondsMax,
	publisher_validation_url = :publisherValidationUrl
RETURNING id