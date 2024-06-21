UPDATE authentication
	SET otp_key = :otpKey
	WHERE identifier = :identifier
