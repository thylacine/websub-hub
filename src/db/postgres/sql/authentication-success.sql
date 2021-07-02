--
UPDATE authentication
	SET last_authentication = now()
	WHERE identifier = $(identifier)
