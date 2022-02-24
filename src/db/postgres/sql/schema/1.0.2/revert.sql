BEGIN;
	DROP INDEX subscription_latest_content_delivered_idx;
	CREATE INDEX subscription_content_delivered_idx ON subscription(content_delivered);
	DROP VIEW subscription_delivery_needed;
	ALTER TABLE subscription
		DROP COLUMN latest_content_delivered
	;
	CREATE OR REPLACE VIEW subscription_delivery_needed AS
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
	DELETE FROM _meta_schema_version WHERE major = 1 AND minor = 0 AND patch = 2;
COMMIT;
