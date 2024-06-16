'use strict';

/**
 * These are LIVE FIRE tests to exercise actual database operations.
 * They should be configured to use local test databases, as they
 * perform DESTRUCTIVE ACTIONS on all tables, beginning with a COMPLETE
 * DATA WIPE.
 * 
 * They will only run if all the appropriate environmental settings exist:
 * - INTEGRATION_TESTS must be set
 * - <ENGINE>_TEST_PATH must point to the endpoint/db
 * 
 * These tests are sequential, relying on the state created along the way.
 * 
 */

const assert = require('node:assert');
const { step } = require('mocha-steps');
const stubLogger = require('../../stub-logger');
const DBErrors = require('../../../src/db/errors');
const testData = require('../../test-data/db-integration');

describe('Database Integration', function () {
  const noExpectedException = 'did not receive expected exception';
  const implementations = [];

  if (!process.env.INTEGRATION_TESTS) {
    it.skip('integration tests not requested');
    return;
  }

  if (process.env.POSTGRES_TEST_PATH) {
    implementations.push({
      name: 'PostgreSQL',
      module: '../../../src/db/postgres',
      config: {
        db: {
          connectionString: `postgresql://${process.env.POSTGRES_TEST_PATH}`,
          queryLogLevel: 'debug',
          noWarnings: true,
        },
      },
    });
  }

  if (process.env.SQLITE_TEST_PATH) {
    implementations.push({
      name: 'SQLite',
      module: '../../../src/db/sqlite',
      config: {
        db: {
          connectionString: `sqlite://${process.env.SQLITE_TEST_PATH}`,
          queryLogLevel: 'debug',
        },
      },
    });
  }

  implementations.forEach(function (i) {
    describe(i.name, function () {
      let DB, db;
      let topicId, subscriptionId, verificationId;
      const claimant = '96bff010-d9e6-11eb-b95d-0025905f714a';

      before(async function () {
        this.timeout(10 * 1000); // Allow some time for creating tables et cetera.
        // eslint-disable-next-line security/detect-non-literal-require
        DB = require(i.module);
        db = new DB(stubLogger, i.config);
        await db.initialize();
        await db._purgeTables(true);
      });
      after(async function () {
        await db._closeConnection();
      });
      it('instantiated', function () {
        assert(db);
      });

      it('is healthy', async function () {
        const result = await db.healthCheck();
        assert(result);
      });

      describe('Authentication', function () {
        let identifier, credential;
        beforeEach(function () {
          identifier = 'username';
          credential = 'myEncryptedPassword';
        });
        step('create auth entry', async function() {
          await db.context(async (dbCtx) => {
            await db.authenticationUpsert(dbCtx, identifier, credential);
          });
        });
        step('get auth entry', async function() {
          await db.context(async (dbCtx) => {
            const authInfo = await db.authenticationGet(dbCtx, identifier);
            assert.strictEqual(authInfo.credential, credential);
          });
        });
        step('valid auth event', async function() {
          await db.context(async (dbCtx) => {
            await db.authenticationSuccess(dbCtx, identifier);
            const authInfo = await db.authenticationGet(dbCtx, identifier);
            assert.notStrictEqual(authInfo.lastAuthentication, undefined);
          });
        });
        step('update auth entry', async function() {
          await db.context(async (dbCtx) => {
            credential = 'myNewPassword';
            await db.authenticationUpsert(dbCtx, identifier, credential);
            const authInfo = await db.authenticationGet(dbCtx, identifier);
            assert.strictEqual(authInfo.credential, credential);
          });
        });
      }); // Authentication

      describe('Topic', function () {
        let anotherTopicId;
        step('requires data', async function () {
          try {
            await db.context(async (dbCtx) => {
              await db.topicSet(dbCtx);
            });
            assert.fail(noExpectedException);
          } catch (e) {
            assert(e instanceof DBErrors.DataValidation);
          }
        });
        step('creates topic', async function () {
          await db.context(async (dbCtx) => {
            const result = await db.topicSet(dbCtx, testData.topicSet);
            topicId = result.lastInsertRowid;
            assert.strictEqual(result.changes, 1);
          });
        });
        step('gets topic by url', async function () {
          await db.context(async (dbCtx) => {
            const topic = await db.topicGetByUrl(dbCtx, testData.topicSet.url);
            assert.strictEqual(topic.url, testData.topicSet.url);
          });
        });
        step('updates topic', async function () {
          await db.context(async(dbCtx) => {
            const result = await db.topicSet(dbCtx, testData.topicUpdate);
            assert.strictEqual(result.changes, 1);
          });
        });
        step('also updates topic', async function () {
          const data = {
            topicId,
            leaseSecondsMin: 60,
          };
          await db.context(async(dbCtx) => {
            const expected = await db.topicGetByUrl(dbCtx, testData.topicSet.url, true);
            expected.leaseSecondsMin = data.leaseSecondsMin;
            let topic = await db.topicGetByUrl(dbCtx, testData.topicSet.url, false);
            await db.topicUpdate(dbCtx, { ...topic, ...data });
            topic = await db.topicGetByUrl(dbCtx, testData.topicSet.url);
            assert.strictEqual(Number(topic.leaseSecondsMin), data.leaseSecondsMin);
            assert.deepEqual(topic, expected);
          });
        });
        step('gets topic by id', async function () {
          await db.context(async (dbCtx) => {
            const topic = await db.topicGetById(dbCtx, topicId);
            assert.strictEqual(topic.url, testData.topicSet.url);
            assert.strictEqual(Number(topic.leaseSecondsPreferred), testData.topicUpdate.leaseSecondsPreferred);
          });
        });
        step('sets topic content', async function () {
          const data = {
            ...testData.topicSetContent,
            topicId,
          };
          await db.context(async (dbCtx) => {
            const result = await db.topicSetContent(dbCtx, data);
            assert.strictEqual(result.changes, 1);
          });
        });
        step('gets topic content', async function () {
          await db.context(async (dbCtx) => {
            const topic = await db.topicGetContentById(dbCtx, topicId);
            assert.strictEqual(topic.contentHash, testData.topicSetContent.contentHash);
          });
        });
        step('sets publish request', async function() {
          await db.context(async (dbCtx) => {
            const result = await db.topicFetchRequested(dbCtx, topicId);
            assert.strictEqual(result.changes, 1);
            
            const topic = await db.topicGetById(dbCtx, topicId);
            assert(topic.lastPublish);
          });
        });
        step('claims topic fetch', async function () {
          const claimTimeoutSeconds = 10;
          const wanted = 5;
          let topicIds;
          await db.context(async (dbCtx) => {
            topicIds = await db.topicFetchClaim(dbCtx, wanted, claimTimeoutSeconds, claimant);
          });
          assert(topicIds.includes(topicId));
        });
        step('incompletes topic fetch', async function () {
          await db.context(async (dbCtx) => {
            const result = await db.topicFetchIncomplete(dbCtx, topicId);
            assert.strictEqual(result.changes, 1);
            const topic = await db.topicGetById(dbCtx, topicId);
            assert.strictEqual(Number(topic.contentFetchAttemptsSinceSuccess), 1);
          });
        });
        step('claims topic fetch by id', async function () {
          const claimTimeoutSeconds = 10;
          await db.context(async (dbCtx) => {
            const result = await db.topicFetchClaimById(dbCtx, topicId, claimTimeoutSeconds, claimant);
            assert.strictEqual(result.changes, 1);
          });
        });
        step('completes topic fetch', async function () {
          await db.context(async (dbCtx) => {
            const result = await db.topicFetchComplete(dbCtx, topicId);
            assert.strictEqual(result.changes, 1);
            const topic = await db.topicGetById(dbCtx, topicId);
            assert.strictEqual(Number(topic.contentFetchAttemptsSinceSuccess), 0);
          });
        });
        step('gets publish history', async function () {
          await db.context(async (dbCtx) => {
            const result = (await db.topicPublishHistory(dbCtx, topicId, 7))
              .map((x) => Number(x));
            const expected = [1, 0, 0, 0, 0, 0, 0];
            assert.deepStrictEqual(result, expected);
          });  
        });
        step('deletes a topic', async function () {
          await db.context(async (dbCtx) => {
            const result = await db.topicSet(dbCtx, testData.anotherTopicSet);
            anotherTopicId = result.lastInsertRowid;
            await db.topicDeleted(dbCtx, anotherTopicId);
            const topic = await db.topicGetById(dbCtx, anotherTopicId);
            assert.strictEqual(topic.isDeleted, true);
          });
        });
        step('update un-deletes a topic', async function () {
          await db.context(async (dbCtx) => {
            const result = await db.topicSet(dbCtx, testData.anotherTopicSet);
            assert.strictEqual(result.lastInsertRowid, anotherTopicId);
            const topic = await db.topicGetById(dbCtx, anotherTopicId);
            assert.strictEqual(topic.isDeleted, false);
          });
        });
        step('gets all topics', async function() {
          await db.context(async (dbCtx) => {
            const topics = await db.topicGetAll(dbCtx);
            assert(topics.length);
          });
        });
        // pending delete of deleted topic with no subscriptions
        step('really deletes unsubscribed deleted topic', async function() {
          await db.context(async (dbCtx) => {
            await db.topicDeleted(dbCtx, anotherTopicId);
            await db.topicPendingDelete(dbCtx, anotherTopicId);
            const topic = await db.topicGetById(dbCtx, anotherTopicId);
            assert(!topic);
          });
        });
      }); // Topic

      describe('Subscription', function () {
        step('requires data', async function () {
          try {
            await db.context(async (dbCtx) => {
              await db.subscriptionUpsert(dbCtx);
            });
            assert.fail(noExpectedException);
          } catch (e) {
            assert(e instanceof DBErrors.DataValidation);
          }
        });
        step('creates subscription', async function () {
          const data = {
            ...testData.subscriptionUpsert,
            topicId,
          };
          await db.context(async (dbCtx) => {
            const result = await db.subscriptionUpsert(dbCtx, data);
            assert(result.lastInsertRowid);
            subscriptionId = result.lastInsertRowid;
            assert.strictEqual(result.changes, 1);
          });
        });
        step('gets subscription', async function () {
          await db.context(async (dbCtx) => {
            const subscription = await db.subscriptionGet(dbCtx, testData.subscriptionUpsert.callback, topicId);
            assert.strictEqual(subscription.secret, testData.subscriptionUpsert.secret);
          });
        });
        step('gets subscription by id', async function () {
          await db.context(async (dbCtx) => {
            const subscription = await db.subscriptionGetById(dbCtx, subscriptionId);
            assert.strictEqual(subscription.secret, testData.subscriptionUpsert.secret);
          });
        });
        step('gets subscriptions by topic', async function() {
          await db.context(async (dbCtx) => {
            const subscriptions = await db.subscriptionsByTopicId(dbCtx, topicId);
            assert(subscriptions.length);
          });
        });
        step('count subscriptions', async function () {
          await db.context(async (dbCtx) => {
            const count = await db.subscriptionCountByTopicUrl(dbCtx, testData.topicSet.url);
            assert.strictEqual(Number(count.count), 1);
          });
        });
        step('claim subscription', async function () {
          const claimTimeoutSeconds = 10;
          const wanted = 5;
          let subscriptionIds;
          await db.context(async (dbCtx) => {
            subscriptionIds = await db.subscriptionDeliveryClaim(dbCtx, wanted, claimTimeoutSeconds, claimant);
          });
          assert(subscriptionIds.includes(subscriptionId));
        });
        step('incompletes subscription', async function () {
          const { callback } = testData.subscriptionUpsert;
          await db.context(async (dbCtx) => {
            await db.subscriptionDeliveryIncomplete(dbCtx, callback, topicId);
            const topic = await db.subscriptionGetById(dbCtx, subscriptionId);
            assert.strictEqual(Number(topic.deliveryAttemptsSinceSuccess), 1);
          });
        });
        step('claim subscription by id', async function () {
          const claimTimeoutSeconds = 10;
          await db.context(async (dbCtx) => {
            const result = await db.subscriptionDeliveryClaimById(dbCtx, subscriptionId, claimTimeoutSeconds, claimant);
            assert.strictEqual(result.changes, 1);
          });
        });
        step('complete subscription', async function () {
          const { callback } = testData.subscriptionUpsert;
          await db.context(async (dbCtx) => {
            const topic = await db.topicGetById(dbCtx, topicId);
            await db.subscriptionDeliveryComplete(dbCtx, callback, topicId, topic.contentUpdated);
            const subscription = await db.subscriptionGetById(dbCtx, subscriptionId);
            assert.strictEqual(Number(subscription.deliveryAttemptsSinceSuccess), 0);
          });
        });
        step('subscription delete', async function () {
          const { callback } = testData.subscriptionUpsert;
          await db.context(async (dbCtx) => {
            const result = await db.subscriptionDelete(dbCtx, callback, topicId);
            assert.strictEqual(result.changes, 1);
            const subscription = await db.subscriptionGetById(dbCtx, subscriptionId);
            assert(!subscription);
          });
        });
        step('create subscription', async function () {
          const data = {
            ...testData.subscriptionUpsert,
            secret: 'newSecret',
            topicId,
          };
          await db.context(async (dbCtx) => {
            const result = await db.subscriptionUpsert(dbCtx, data);
            assert(result.lastInsertRowid);
            assert.notStrictEqual(result.lastInsertRowid, subscriptionId);
            subscriptionId = result.lastInsertRowid;
            assert.strictEqual(result.changes, 1);
          });
        });
        step('update subscription', async function () {
          const data = {
            subscriptionId,
            signatureAlgorithm: 'sha256',
          };
          await db.context(async (dbCtx) => {
            await db.subscriptionUpdate(dbCtx, data);
          });
        });
        step('claim subscription', async function () {
          const claimTimeoutSeconds = 10;
          const wanted = 5;
          let subscriptionIds;
          await db.context(async (dbCtx) => {
            subscriptionIds = await db.subscriptionDeliveryClaim(dbCtx, wanted, claimTimeoutSeconds, claimant);
          });
          assert(subscriptionIds.includes(subscriptionId));
        });
        step('subscription gone', async function () {
          const { callback } = testData.subscriptionUpsert;
          await db.context(async (dbCtx) => {
            await db.subscriptionDeliveryGone(dbCtx, callback, topicId);
            const subscription = await db.subscriptionGetById(dbCtx, subscriptionId);
            assert(!subscription);
          });
        });
        step('create expired subscription', async function () {
          const data = {
            ...testData.subscriptionUpsert,
            secret: 'newSecret',
            topicId,
            leaseSeconds: -1,
          };
          await db.context(async (dbCtx) => {
            const result = await db.subscriptionUpsert(dbCtx, data);
            assert(result.lastInsertRowid);
            assert.notStrictEqual(result.lastInsertRowid, subscriptionId);
            subscriptionId = result.lastInsertRowid;
            assert.strictEqual(result.changes, 1);
          });
        });
        step('delete expired subscriptions', async function() {
          await db.context(async (dbCtx) => {
            await db.subscriptionDeleteExpired(dbCtx, topicId);
            const subscription = await db.subscriptionGet(dbCtx, testData.subscriptionUpsert.callback, topicId);
            assert(!subscription);
          });
        });
      }); // Subscription

      describe('Verification', function () {
        step('requires data', async function() {
          try {
            await db.context(async (dbCtx) => {
              await db.verificationInsert(dbCtx);
            });
            assert.fail(noExpectedException);
          } catch (e) {
            assert(e instanceof DBErrors.DataValidation);
          }
        });
        step('creates verification', async function() {
          const verificationData = {
            ...testData.verificationInsert,
            topicId,
          };
          await db.context(async (dbCtx) => {
            verificationId = await db.verificationInsert(dbCtx, verificationData);
            assert(verificationId);
          });
        });
        step('gets verification', async function() {
          await db.context(async (dbCtx) => {
            const verification = await db.verificationGetById(dbCtx, verificationId);
            assert.strictEqual(verification.mode, testData.verificationInsert.mode);
          });
        });
        step('validates verification', async function() {
          await db.context(async (dbCtx) => {
            await db.verificationValidated(dbCtx, verificationId);
            const verification = await db.verificationGetById(dbCtx, verificationId);
            assert.strictEqual(verification.isPublisherValidated, true);
          });
        });
        step('claims verification', async function() {
          const claimTimeoutSeconds = 10;
          const wanted = 5;
          let verificationIds;
          await db.context(async (dbCtx) => {
            verificationIds = await db.verificationClaim(dbCtx, wanted, claimTimeoutSeconds, claimant);
          });
          assert(verificationIds.includes(verificationId));
        });
        step('releases verification', async function() {
          await db.context(async (dbCtx) => {
            await db.verificationRelease(dbCtx, verificationId);
          });
        });
        step('updates verification', async function() {
          const verificationData = {
            ...testData.verificationUpdate,
          };
          await db.context(async (dbCtx) => {
            db.verificationUpdate(dbCtx, verificationId, verificationData);
            const verification = await db.verificationGetById(dbCtx, verificationId);
            assert.strictEqual(verification.isPublisherValidated, testData.verificationUpdate.isPublisherValidated);
          });
        });
        step('claims verification by id', async function() {
          const claimTimeoutSeconds = 10;
          await db.context(async (dbCtx) => {
            const result = await db.verificationClaimById(dbCtx, verificationId, claimTimeoutSeconds, claimant);
            assert.strictEqual(result.changes, 1);
          });
        });
        step('incompletes verification', async function() {
          await db.context(async (dbCtx) => {
            await db.verificationIncomplete(dbCtx, verificationId);
          });
        });
        step('claims verification by id', async function() {
          const claimTimeoutSeconds = 10;
          await db.context(async (dbCtx) => {
            const result = await db.verificationClaimById(dbCtx, verificationId, claimTimeoutSeconds, claimant);
            assert.strictEqual(result.changes, 1);
          });
        });
        step('completes verification', async function() {
          await db.context(async (dbCtx) => {
            const verification = await db.verificationGetById(dbCtx, verificationId);
            await db.subscriptionUpsert(dbCtx, verification);
            await db.verificationComplete(dbCtx, verificationId, testData.verificationInsert.callback, topicId);
            const count = await db.subscriptionCountByTopicUrl(dbCtx, testData.topicSet.url);
            assert.strictEqual(Number(count.count), 1);
          });
        });

      }); // Verification

    }); // specific implementation
  }); // foreach

}); // Database Integration
