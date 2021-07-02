--
INSERT INTO authentication
	(identifier, credential)
VALUES
	($(identifier), $(credential))
ON CONFLICT (identifier) DO UPDATE
SET
	identifier = $(identifier),
	credential = $(credential)
