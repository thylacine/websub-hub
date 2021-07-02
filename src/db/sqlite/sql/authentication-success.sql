--
UPDATE authentication
	SET last_authentication = strftime('%s', 'now')
	WHERE identifier = :identifier
