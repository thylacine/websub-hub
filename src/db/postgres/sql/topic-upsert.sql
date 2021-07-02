--
INSERT INTO topic
	(url, lease_seconds_preferred, lease_seconds_min, lease_seconds_max, publisher_validation_url)
VALUES (
	$(url),
	$(leaseSecondsPreferred)::text::interval,
	$(leaseSecondsMin)::text::interval,
	$(leaseSecondsMax)::text::interval,
	$(publisherValidationUrl)
) ON CONFLICT (url) DO UPDATE
SET
	is_deleted = false,
	lease_seconds_preferred = $(leaseSecondsPreferred)::text::interval,
	lease_seconds_min = $(leaseSecondsMin)::text::interval,
	lease_seconds_max = $(leaseSecondsMax)::text::interval,
	publisher_validation_url = $(publisherValidationUrl)
RETURNING id
