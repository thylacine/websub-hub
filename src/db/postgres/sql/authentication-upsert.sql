--
INSERT INTO authentication
	(identifier, credential, otp_key)
VALUES
	($(identifier), $(credential), $(otpKey))
ON CONFLICT (identifier) DO UPDATE
SET
	identifier = $(identifier),
	credential = $(credential),
	otp_key = $(otpKey)
