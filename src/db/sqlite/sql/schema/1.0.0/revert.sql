BEGIN;
	DROP TABLE topic;
	DROP VIEW topic_fetch_needed;
	DROP TABLE topic_fetch_in_progress;
	DROP VIEW topic_fetch_in_progress_active;
	DROP TABLE subscription;
	DROP VIEW subscription_delivery_needed;
	DROP TABLE subscription_delivery_in_progress;
	DROP VIEW subscription_delivery_in_progress_active;
	DROP TABLE verification;
	DROP VIEW verification_needed;
	DROP TABLE verification_in_progress;
	DROP VIEW verification_in_progress_active;
	DROP TABLE authentication;

	DELETE FROM _meta_schema_version WHERE major = 1 AND minor = 0 AND patch = 0;
COMMIT;
