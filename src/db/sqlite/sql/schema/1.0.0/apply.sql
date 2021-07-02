--
BEGIN;

CREATE TABLE topic (
	id INTEGER PRIMARY KEY AUTOINCREMENT,
	created INTEGER NOT NULL DEFAULT (strftime('%s', 'now')),
	url TEXT NOT NULL UNIQUE,
	lease_seconds_preferred INTEGER, -- default if client doesn't specify
	lease_seconds_min INTEGER, -- limit to client requested
	lease_seconds_max INTEGER, -- limit to client requested
	publisher_validation_url TEXT,
	content_hash_algorithm TEXT CHECK (length(content_hash_algorithm) <= 16) NOT NULL DEFAULT 'sha512',

	is_active BOOLEAN NOT NULL DEFAULT 0 CHECK (is_active IN (0, 1)), -- will be active after first successful fetch
	is_deleted BOOLEAN NOT NULL DEFAULT 0 CHECK (is_deleted IN (0, 1)), -- topic deletion pending on 'denied' notification to active subscriptions

	last_publish INTEGER NOT NULL DEFAULT 0,
	content_fetch_next_attempt INTEGER NOT NULL DEFAULT 0, -- time of next content update attempt
	content_fetch_attempts_since_success INTEGER NOT NULL DEFAULT 0,

	content_updated INTEGER NOT NULL DEFAULT 0,
	content LONGBLOB,
	content_hash TEXT,
	content_type TEXT CHECK (length(content_type) <= 255)
);
CREATE INDEX topic_content_updated_idx ON topic(content_updated);
CREATE INDEX topic_content_fetch_next_attempt_idx ON topic(content_fetch_next_attempt);

CREATE TABLE topic_fetch_in_progress (
	id INTEGER NOT NULL PRIMARY KEY REFERENCES topic(id) ON DELETE CASCADE ON UPDATE CASCADE DEFERRABLE INITIALLY DEFERRED,
	claimant TEXT NOT NULL,
	claimed INTEGER NOT NULL DEFAULT (strftime('%s', 'now')),
	claim_expires INTEGER NOT NULL
);
CREATE INDEX topic_fetch_in_progress_claim_expires_idx ON topic_fetch_in_progress(claim_expires);

CREATE VIEW topic_fetch_in_progress_active AS
	SELECT *
	FROM topic_fetch_in_progress
	WHERE claim_expires >= (strftime('%s', 'now'))
;

CREATE VIEW topic_fetch_needed AS
	SELECT *
	FROM topic
	WHERE
		is_deleted = false
	AND
		content_fetch_next_attempt <= (strftime('%s', 'now'))
	AND
		id NOT IN (SELECT id FROM topic_fetch_in_progress_active)
	ORDER BY last_publish ASC
;

--

CREATE TABLE subscription (
	id INTEGER PRIMARY KEY AUTOINCREMENT,
	created INTEGER NOT NULL DEFAULT (strftime('%s', 'now')),

	topic_id INTEGER NOT NULL REFERENCES topic(id) ON DELETE CASCADE ON UPDATE CASCADE DEFERRABLE INITIALLY DEFERRED,
	callback TEXT NOT NULL,
	-- Not sure why this does not work inline here; punting to unique index.
	-- CONSTRAINT subscription_reference UNIQUE (topic_id, callback),

	verified INTEGER NOT NULL DEFAULT 0,
	expires INTEGER NOT NULL,

	secret TEXT CHECK (length(secret) <= 199),
	signature_algorithm TEXT DEFAULT 'sha512' CHECK (length(signature_algorithm) <= 16),
	http_remote_addr TEXT,
	http_from TEXT,

	content_delivered INTEGER NOT NULL DEFAULT 0,
	delivery_attempts_since_success INTEGER NOT NULL DEFAULT 0,
	delivery_next_attempt INTEGER NOT NULL DEFAULT 0
);
CREATE UNIQUE INDEX subscription_unique_idx ON subscription(topic_id, callback);
CREATE INDEX subscription_content_delivered_idx ON subscription(content_delivered);
CREATE INDEX subscription_expires_idx ON subscription(expires);

CREATE TABLE subscription_delivery_in_progress (
	id INTEGER NOT NULL PRIMARY KEY REFERENCES subscription(id) ON DELETE CASCADE ON UPDATE CASCADE DEFERRABLE INITIALLY DEFERRED,
	claimant TEXT NOT NULL,
	claimed INTEGER NOT NULL DEFAULT (strftime('%s', 'now')),
	claim_expires INTEGER NOT NULL
);
CREATE INDEX subscription_delivery_in_progress_claim_expires_idx ON subscription_delivery_in_progress(claim_expires);

CREATE VIEW subscription_delivery_in_progress_active AS
	SELECT *
	FROM subscription_delivery_in_progress
	WHERE claim_expires >= (strftime('%s', 'now'))
;

CREATE VIEW subscription_delivery_needed AS
	SELECT s.*
	FROM subscription s JOIN topic t ON s.topic_id = t.id
	WHERE
		s.expires > (strftime('%s', 'now'))
	AND
		s.content_delivered < t.content_updated
	AND
		s.delivery_next_attempt < (strftime('%s', 'now'))
	AND
		s.id NOT IN (SELECT id FROM subscription_delivery_in_progress_active)
;

--

CREATE TABLE verification (
	id INTEGER PRIMARY KEY AUTOINCREMENT,
	created INTEGER NOT NULL DEFAULT (strftime('%s', 'now')),

	topic_id INTEGER NOT NULL REFERENCES topic(id) ON DELETE CASCADE ON UPDATE CASCADE DEFERRABLE INITIALLY DEFERRED,
	callback TEXT NOT NULL, -- hub.callback
	-- no unique constraint, multiple verifications can be pending

	secret TEXT CHECK(length(secret) <= 199),
	signature_algorithm TEXT DEFAULT 'sha512' CHECK (length(signature_algorithm) <= 16),
	http_remote_addr TEXT,
	http_from TEXT,

	mode TEXT NOT NULL, -- hub.mode
	reason TEXT, -- denials may have a reason
	lease_seconds INTEGER NOT NULL, -- 68 years shuold be long enough
	is_publisher_validated BOOLEAN NOT NULL DEFAULT 0 CHECK(is_publisher_validated IN (0, 1)),
	request_id TEXT, -- client request which created this verification, null if server-generated (ie topic delete)

	next_attempt INTEGER NOT NULL DEFAULT (strftime('%s', 'now')),
	attempts INTEGER NOT NULL DEFAULT 0
);
CREATE INDEX verification_reference_idx ON verification(topic_id, callback, created);

CREATE TABLE verification_in_progress (
	id INTEGER NOT NULL PRIMARY KEY REFERENCES verification(id) ON DELETE CASCADE ON UPDATE CASCADE DEFERRABLE INITIALLY DEFERRED,

	topic_id INTEGER NOT NULL REFERENCES topic(id),
	callback TEXT NOT NULL,
	-- CONSTRAINT verification_in_progress_reference UNIQUE (topic_id, callback),

	claimant TEXT NOT NULL,
	claimed INTEGER NOT NULL DEFAULT (strftime('%s', 'now')),
	claim_expires INTEGER NOT NULL
);
CREATE UNIQUE INDEX verification_in_progress_unique_idx ON verification_in_progress(topic_id, callback);
CREATE INDEX verification_in_progress_claim_expires_idx ON verification_in_progress(claim_expires);

CREATE VIEW verification_in_progress_active AS
	SELECT *
	FROM verification_in_progress
	WHERE claim_expires >= (strftime('%s', 'now'))
;

CREATE VIEW verification_needed AS
	SELECT *
	FROM verification
	WHERE
		(topic_id, callback, created) IN (SELECT topic_id, callback, max(created) AS created FROM verification GROUP BY topic_id, callback)
	AND
		(topic_id, callback) NOT IN (SELECT topic_id, callback FROM verification_in_progress_active)
	AND
		next_attempt <= (strftime('%s', 'now'))
;

--

CREATE TABLE authentication (
	created INTEGER NOT NULL DEFAULT (strftime('%s', 'now')),
	last_authentication INTEGER,
	identifier TEXT NOT NULL PRIMARY KEY,
	credential TEXT
);

--

INSERT INTO _meta_schema_version (major, minor, patch) VALUES (1, 0, 0);

COMMIT;
