--
INSERT INTO subscription
	(topic_id, callback, verified, expires, secret, http_remote_addr, http_from)
VALUES
	(:topicId, :callback, strftime('%s', 'now'), strftime('%s', 'now') + :leaseSeconds, :secret, :httpRemoteAddr, :httpFrom)
ON CONFLICT (topic_id, callback) DO UPDATE
SET
	verified = strftime('%s', 'now'),
	expires = strftime('%s', 'now') + :leaseSeconds,
	secret = :secret,
	http_remote_addr = :httpRemoteAddr,
	http_from = :httpFrom
