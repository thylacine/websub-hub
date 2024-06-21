UPDATE authentication
	SET credential = $(credential)
	WHERE identifier = $(identifier)
