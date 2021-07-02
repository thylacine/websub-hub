BEGIN;
	DROP TABLE topic CASCADE;
	DROP TABLE topic_fetch_in_progress CASCADE;
	DROP TABLE subscription CASCADE;
	DROP TABLE subscription_delivery_in_progress CASCADE;
	DROP TABLE verification CASCADE;
	DROP TABLE verification_in_progress CASCADE;
	DROP TABLE authentication CASCADE;

	DELETE FROM _meta_schema_version WHERE major = 1 AND minor = 0 AND patch = 0;
COMMIT;
