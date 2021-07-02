--
INSERT INTO verification
	(topic_id, callback, mode, secret, lease_seconds, http_remote_addr, http_from, is_publisher_validated, request_id)
VALUES
	($(topicId), $(callback), $(mode), $(secret), $(leaseSeconds), $(httpRemoteAddr), $(httpFrom), $(isPublisherValidated), $(requestId))
RETURNING id
