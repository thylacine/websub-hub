BEGIN;
	-- track when content was delivered as separate from latest content delivered
	-- content_delivered continues to be the time the content was delivered, but becomes only informational
	-- latest_content_delivered is date on topic content delivered
	ALTER TABLE subscription
		ADD COLUMN latest_content_delivered INTEGER NOT NULL DEFAULT 0
	;
	CREATE INDEX subscription_latest_content_delivered_idx ON subscription(latest_content_delivered);
	-- migrate existing values
	UPDATE subscription SET latest_content_delivered = content_delivered;
	-- no need for this index
	DROP INDEX subscription_content_delivered_idx;
	-- update the view to use latest_cotnent_delivered
	DROP VIEW subscription_delivery_needed;
	CREATE VIEW subscription_delivery_needed AS
		SELECT s.*
		FROM subscription s JOIN topic t ON s.topic_id = t.id
		WHERE
			s.expires > strftime('%s', 'now')
		AND
			s.latest_content_delivered < t.content_updated
		AND
			s.delivery_next_attempt < strftime('%s', 'now')
		AND
			s.id NOT IN (SELECT id FROM subscription_delivery_in_progress_active)
	;

	INSERT INTO _meta_schema_version (major, minor, patch) VALUES (1, 0, 2);
COMMIT;
