BEGIN;
	CREATE TABLE topic (
		id UUID PRIMARY KEY DEFAULT uuid_generate_v1(), -- v1 timebased is best for indexes
		created TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
		url TEXT NOT NULL UNIQUE,
		lease_seconds_preferred INTERVAL,
		lease_seconds_min INTERVAL,
		lease_seconds_max INTERVAL,
		publisher_validation_url TEXT,
		content_hash_algorithm VARCHAR(16) NOT NULL DEFAULT 'sha512',
		-- end of topic config/behavior values

		is_active BOOLEAN DEFAULT false, -- will be active after first successful fetch
		is_deleted BOOLEAN DEFAULT false, -- topic deletion pending on 'denied' notification to active subscriptions

		last_publish TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT '-infinity'::timestamptz, -- time of latest publish notification
		content_fetch_next_attempt TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT '-infinity'::timestamptz, -- time of next content update attempt
		content_fetch_attempts_since_success INTEGER NOT NULL DEFAULT 0,

		content_updated TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT '-infinity'::timestamptz, -- time of latest content update
		content BYTEA,
		content_hash TEXT,
		content_type VARCHAR(255)
	);
	CREATE INDEX topic_content_updated_idx ON topic(content_updated);
	CREATE INDEX topic_content_fetch_next_attempt_idx ON topic(content_fetch_next_attempt); -- sort out which need updates

	CREATE TABLE topic_fetch_in_progress (
		id UUID PRIMARY KEY NOT NULL REFERENCES topic(id) ON DELETE CASCADE ON UPDATE CASCADE DEFERRABLE INITIALLY DEFERRED,
		claimant UUID NOT NULL,
		claimed TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
		claim_expires TIMESTAMP WITH TIME ZONE NOT NULL
	);
	CREATE INDEX topic_fetch_in_progress_claim_expires_idx ON topic_fetch_in_progress(claim_expires);

	CREATE VIEW topic_fetch_in_progress_active AS
		SELECT *
		FROM topic_fetch_in_progress
		WHERE claim_expires >= now()
	;

	CREATE VIEW topic_fetch_needed AS
		SELECT *
		FROM topic
		WHERE
			is_deleted = false
		AND
			content_fetch_next_attempt <= now()
		AND
			id NOT IN (SELECT id FROM topic_fetch_in_progress_active)
		ORDER BY last_publish ASC
	;

	-- send notices when topic is updated, for any nodes caching content

	CREATE OR REPLACE FUNCTION topic_changed()
		RETURNS TRIGGER
		LANGUAGE plpgsql
	AS $$
		DECLARE
			payload varchar;
		BEGIN
			payload = CAST(NEW.id AS text);
			PERFORM pg_notify('topic_changed', payload);
			RETURN NEW;
		END;
	$$
	;

	CREATE TRIGGER topic_changed
	AFTER UPDATE ON topic
	FOR EACH ROW
		EXECUTE PROCEDURE topic_changed()
	;

	--

	CREATE TABLE subscription (
		id UUID PRIMARY KEY DEFAULT uuid_generate_v1(),
		created TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
		
		topic_id UUID NOT NULL REFERENCES topic(id) ON DELETE CASCADE ON UPDATE CASCADE DEFERRABLE INITIALLY DEFERRED,
		callback TEXT NOT NULL,
		CONSTRAINT subscription_reference UNIQUE (topic_id, callback),

		verified TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT '-infinity'::timestamptz,
		expires TIMESTAMP WITH TIME ZONE NOT NULL,

		secret VARCHAR(199),
		signature_algorithm VARCHAR(16) DEFAULT 'sha512',
		http_remote_addr TEXT,
		http_from TEXT,

		content_delivered TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT '-infinity'::timestamptz,
		delivery_attempts_since_success INTEGER NOT NULL DEFAULT 0,
		delivery_next_attempt TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT '-infinity'::timestamptz
	);
	CREATE INDEX subscription_content_delivered_idx ON subscription(content_delivered);
	CREATE INDEX subscription_expires_idx ON subscription(expires);

	CREATE TABLE subscription_delivery_in_progress (
		id UUID PRIMARY KEY NOT NULL REFERENCES subscription(id) ON DELETE CASCADE ON UPDATE CASCADE DEFERRABLE INITIALLY DEFERRED,
		claimant UUID NOT NULL,
		claimed TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
		claim_expires TIMESTAMP WITH TIME ZONE NOT NULL
	);
	CREATE INDEX subscription_delivery_in_progress_claim_expires_idx ON subscription_delivery_in_progress(claim_expires);

	CREATE VIEW subscription_delivery_in_progress_active AS
		SELECT *
		FROM subscription_delivery_in_progress
		WHERE claim_expires >= now()
	;

	CREATE VIEW subscription_delivery_needed AS
		SELECT s.*
		FROM subscription s JOIN topic t ON s.topic_id = t.id
		WHERE
			s.expires > now()
		AND
			s.content_delivered < t.content_updated
		AND
			s.delivery_next_attempt < now()
		AND
			s.id NOT IN (SELECT id FROM subscription_delivery_in_progress_active)
	;

	--

	CREATE TABLE verification (
		id UUID PRIMARY KEY DEFAULT uuid_generate_v1(),
		created TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),

		topic_id UUID NOT NULL REFERENCES topic(id) ON DELETE CASCADE ON UPDATE CASCADE DEFERRABLE INITIALLY DEFERRED,
		callback TEXT NOT NULL, -- hub.callback
		-- no unique constraint, multiple verifications can be pending

		secret VARCHAR(199),
		signature_algorithm VARCHAR(16) DEFAULT 'sha512',
		http_remote_addr TEXT,
		http_from TEXT,

		mode TEXT NOT NULL, -- hub.mode
		reason TEXT, -- denials may have a reason
		lease_seconds INTEGER NOT NULL, -- 68 years should be long enough
		is_publisher_validated BOOLEAN NOT NULL DEFAULT false,
		request_id TEXT, -- client request which created this verification, null if server-generated (ie topic delete)

		next_attempt TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
		attempts INTEGER NOT NULL DEFAULT 0
	);
	CREATE INDEX verification_reference_idx ON verification(topic_id, callback, created);

	CREATE TABLE verification_in_progress (
		id UUID PRIMARY KEY NOT NULL REFERENCES verification(id) ON DELETE CASCADE ON UPDATE CASCADE DEFERRABLE INITIALLY DEFERRED,

		topic_id UUID NOT NULL REFERENCES topic(id),
		callback TEXT NOT NULL,
		CONSTRAINT verification_in_progress_reference UNIQUE (topic_id, callback),

		claimant UUID NOT NULL,
		claimed TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
		claim_expires TIMESTAMP WITH TIME ZONE NOT NULL
	);
	CREATE INDEX verification_in_progress_claim_expires_idx ON verification_in_progress(claim_expires);

	CREATE VIEW verification_in_progress_active AS
		SELECT *
		FROM verification_in_progress
		WHERE claim_expires >= now()
	;

	CREATE VIEW verification_needed AS
		SELECT *
		FROM verification
		WHERE
			(topic_id, callback, created) IN (SELECT topic_id, callback, max(created) AS created FROM verification GROUP BY topic_id, callback)
		AND
			(topic_id, callback) NOT IN (SELECT topic_id, callback FROM verification_in_progress_active)
		AND
			next_attempt <= now()
	;

	--

	CREATE TABLE authentication (
		created TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
		last_authentication TIMESTAMP WITH TIME ZONE,
		identifier TEXT NOT NULL PRIMARY KEY,
		credential TEXT
	);

	-- Update schema version
	INSERT INTO _meta_schema_version (major, minor, patch) VALUES (1, 0, 0);

COMMIT;
