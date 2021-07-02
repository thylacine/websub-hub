--
INSERT INTO subscription
	(topic_id, callback, verified, expires, secret, http_remote_addr, http_from)
VALUES
	($(topicId), $(callback), now(), now() + ($(leaseSeconds) * INTERVAL '1 second'), $(secret), $(httpRemoteAddr), $(httpFrom))
ON CONFLICT (topic_id, callback) DO UPDATE
SET
	verified = now(),
	expires = now() + ($(leaseSeconds) * INTERVAL '1 second'),
	secret = $(secret),
	http_remote_addr = $(httpRemoteAddr),
	http_from = $(httpFrom)
RETURNING id
