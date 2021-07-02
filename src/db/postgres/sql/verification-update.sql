--
UPDATE verification SET
	mode = $(mode),
	reason = $(reason),
	is_publisher_validated = $(isPublisherValidated)
WHERE id = $(verificationId)
