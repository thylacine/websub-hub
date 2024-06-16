'use strict';

/* This provides implementation coverage, stubbing parts of better-sqlite3. */

const assert = require('node:assert');
const sinon = require('sinon');
const DBStub = require('../../stub-db');
const stubLogger = require('../../stub-logger');
const DB = require('../../../src/db/sqlite');
const DBErrors = require('../../../src/db/errors');
const common = require('../../../src/common');
const Config = require('../../../config');

const noExpectedException = 'did not receive expected exception';

describe('DatabaseSQLite', function () {
  let db, options;
  let dbCtx, claimant, claimTimeoutSeconds, callback, subscriptionId, topicId, verificationId;
  let topicUrl, leaseSeconds, secret, httpRemoteAddr, httpFrom, retryDelays, wanted;
  before(function () {
    options = new Config('test');
    options.db.connectionString = 'sqlite://:memory:';
    db = new DB(stubLogger, options);
  });
  beforeEach(function () {
    stubLogger._reset();
    dbCtx = db.db;
    claimant = '19af19b8-6be3-4a6f-8946-65f5f1ccc5d7';
    claimTimeoutSeconds = 300;
    subscriptionId = 'fbaf8f19-ed9c-4a21-89ae-98b7005e3bf6';
    topicUrl = 'https://example.com/blog';
    callback = 'https://example.com/callback?id=123';
    topicId = 'c59d4bda-10ad-41d9-99df-4ce8bc331424';
    verificationId = '55cd7748-d2d5-11eb-b355-0025905f714a';
    retryDelays = [60];
    leaseSeconds = 86400;
    secret = 'secret';
    httpRemoteAddr = '127.0.0.1';
    httpFrom = 'user@example.com';
    wanted = 5;
  });
  afterEach(function () {
    sinon.restore();
  });

  // Ensure all interface methods are implemented
  describe('Implementation', function () {
    it('implements interface', async function () {
      const results = await Promise.allSettled(DBStub._implementation.map(async (fn) => {
        try {
          // eslint-disable-next-line security/detect-object-injection
          await db[fn](db.db);
        } catch (e) {
          assert(!(e instanceof DBErrors.NotImplemented), `${fn} not implemented`);
        }
      }));
      const failures = results.filter((x) => x.status === 'rejected');
      assert(!failures.length, failures.map((x) => {
        x = x.reason.toString();
        return x.slice(x.indexOf(': '));
      }));
    });
  }); // Implementation

  describe('_initTables', function () {
    let preparedGet;
    beforeEach(function () {
      preparedGet = sinon.stub();
      sinon.stub(db.db, 'prepare').returns({
        pluck: () => ({
          bind: () => ({
            get: preparedGet,
          }),
        }),
      });
      sinon.stub(db, '_currentSchema').returns(db.schemaVersionsSupported.min);
      sinon.stub(db.db, 'exec');
    });
    it('covers migration', async function() {
      preparedGet.returns({});
      await db._initTables();
      assert(db.db.exec.called);
    });
    it('covers migration failure', async function() {
      const expected = new Error('oh no');
      preparedGet.returns({});
      db.db.exec.throws(expected);
      try {
        await db._initTables();
        assert.fail(noExpectedException);
      } catch (e) {
        assert.deepStrictEqual(e, expected);
      }
    });
  }); // _initTables

  describe('_currentSchema', function () {
    it('covers', async function () {
      const version = { major: 1, minor: 0, patch: 0 };
      sinon.stub(db.db, 'prepare').returns({
        get: () => version,
      });
      const result = await db._currentSchema();
      assert.deepStrictEqual(result, version);
    });
  }); // _currentSchema

  describe('_closeConnection', function () {
    it('success', async function () {
      sinon.stub(db.db, 'close');
      await db._closeConnection();
      assert(db.db.close.called);
    });
    it('failure', async function () {
      const expected = new Error();
      sinon.stub(db.db, 'close').throws(expected);
      try {
        await db._closeConnection();
        assert.fail(noExpectedException);
      } catch (e) {
        assert.deepStrictEqual(e, expected);
      }
    });
  }); // _closeConnection

  describe('_purgeTables', function () {
    beforeEach(function () {
      sinon.stub(db.db, 'prepare').returns({
        run: sinon.stub(),
      });
    });
    it('covers not really', async function () {
      await db._purgeTables(false);
      assert(!db.db.prepare.called);
    });
    it('success', async function () {
      await db._purgeTables(true);
      assert(db.db.prepare.called);
    });
    it('failure', async function () {
      const expected = new Error();
      db.db.prepare.restore();
      sinon.stub(db.db, 'prepare').throws(expected);
      try {
        await db._purgeTables(true);
        assert.fail(noExpectedException);
      } catch (e) {
        assert.deepStrictEqual(e, expected);
      }
    });
  }); // _purgeTables

  describe('_optimize', function () {
    let origOAC;
    beforeEach(function () {
      origOAC = db.optimizeAfterChanges;
      sinon.stub(db.statement._optimize, 'all');
      sinon.stub(db.db, 'pragma');
    });
    this.afterEach(function () {
      db.optimizeAfterChanges = origOAC;
    });
    it('covers', async function () {
      db.optimizeAfterChanges = 10;
      db.changesSinceLastOptimize = BigInt(20);
      await db._optimize();
      assert(db.db.pragma.called);
    });
    it('covers none', async function () {
      db.optimizeAfterChanges = 0;
      await db._optimize();
      assert(!db.db.pragma.called);
    });
    it('covers not enough changes', async function () {
      db.optimizeAfterChanges = 10;
      db.changesSinceLastOptimize = BigInt(5);
      await db._optimize();
      assert(!db.db.pragma.called);
    });
  }); // _optimize

  describe('_deOphidiate', function () {
    it('covers non-array', function () {
      const obj = {
        'snake_case': 1,
      };
      const expected = {
        snakeCase: 1,
      };
      const result = DB._deOphidiate(obj);
      assert.deepStrictEqual(result, expected);
    });
    it('covers array', function () {
      const rows = [
        {
          'snek_field': 'foo',
        },
        {
          'snek_field': 'bar',
        },
      ];
      const expected = [
        {
          snekField: 'foo',
        },
        {
          snekField: 'bar',
        },
      ];
      const result = DB._deOphidiate(rows);
      assert.deepStrictEqual(result, expected);
    });
  }); // _deOphidiate

  describe('_topicDataToNative', function () {
    it('covers', function () {
      const now = new Date();
      const nowEpoch = now.getTime() / 1000;
      const topic = {
        isActive: 1,
        isDeleted: 0,
        created: nowEpoch,
        lastPublish: nowEpoch,
        contentFetchNextAttempt: nowEpoch,
        contentUpdated: nowEpoch,
        url: 'https://example.com/',
      };
      const expected = {
        isActive: true,
        isDeleted: false,
        created: now,
        lastPublish: now,
        contentFetchNextAttempt: now,
        contentUpdated: now,
        url: topic.url,
      };
      const result = DB._topicDataToNative(topic);
      assert.deepStrictEqual(result, expected);
    });
    it('covers empty', function () {
      const topic = undefined;
      const result = DB._topicDataToNative(topic);
      assert.deepStrictEqual(result, topic);
    });
  }); // _topicDataToNative

  describe('healthCheck', function () {
    let origDb;
    beforeEach(function () {
      origDb = db.db;
    });
    afterEach(function () {
      db.db = origDb;
    });
    it('covers', function () {
      db.healthCheck();
    });
    it('covers failure', function () {
      db.db = { open: false };
      try {
        db.healthCheck();
        assert.fail(noExpectedException);
      } catch (e) {
        assert(e instanceof DBErrors.UnexpectedResult);
      }
    });
  }); // healthCheck

  describe('context', function () {
    it('covers', async function () {
      await db.context(common.nop);
    });
  }); // context

  describe('transaction', function () {
    it('covers', async function () {
      await db.transaction(db.db, common.nop);
    });
    it('covers no context', async function () {
      await db.transaction(undefined, common.nop);
    });
  }); // transaction

  describe('authenticationSuccess', function () {
    let identifier;
    beforeEach(function () {
      identifier = 'username';
    });
    it('success', async function() {
      const dbResult = {
        changes: 1,
        lastInsertRowid: undefined,
      };
      sinon.stub(db.statement.authenticationSuccess, 'run').returns(dbResult);
      await db.authenticationSuccess(dbCtx, identifier);
    });
    it('failure', async function () {
      const dbResult = {
        changes: 0,
        lastInsertRowid: undefined,
      };
      sinon.stub(db.statement.authenticationSuccess, 'run').returns(dbResult);
      try {
        await db.authenticationSuccess(dbCtx, identifier);
        assert.fail(noExpectedException);
      } catch (e) {
        assert(e instanceof DBErrors.UnexpectedResult);
      }
    });
  }); // authenticationSuccess

  describe('authenticationGet', function () {
    let identifier, credential;
    beforeEach(function () {
      identifier = 'username';
      credential = '$z$foo';
    });
    it('success', async function() {
      const expected = {
        identifier,
        credential,
      };
      sinon.stub(db.statement.authenticationGet, 'get').returns(expected);
      const result = await db.authenticationGet(dbCtx, identifier);
      assert.deepStrictEqual(result, expected);
    });
    it('failure', async function () {
      const expected = new Error();
      sinon.stub(db.statement.authenticationGet, 'get').throws(expected);
      try {
        await db.authenticationGet(dbCtx, identifier);
        assert.fail(noExpectedException);
      } catch (e) {
        assert.deepStrictEqual(e, expected);
      }
    });
  }); // authenticationGet

  describe('authenticationUpsert', function () {
    let identifier, credential;
    beforeEach(function () {
      identifier = 'username';
      credential = '$z$foo';
    });
    it('success', async function() {
      const dbResult = {
        changes: 1,
        lastInsertRowid: undefined,
      };
      sinon.stub(db.statement.authenticationUpsert, 'run').returns(dbResult);
      await db.authenticationUpsert(dbCtx, identifier, credential);
    });
    it('failure', async function () {
      const dbResult = {
        changes: 0,
        lastInsertRowid: undefined,
      };
      sinon.stub(db.statement.authenticationUpsert, 'run').returns(dbResult);
      try {
        await db.authenticationUpsert(dbCtx, identifier, credential);
        assert.fail(noExpectedException);
      } catch (e) {
        assert(e instanceof DBErrors.UnexpectedResult);
      }
    });
  }); // authenticationUpsert

  describe('subscriptionsByTopicId', function () {
    it('success', async function () {
      const expected = [{ id: 3 }];
      sinon.stub(db.statement.subscriptionsByTopicId, 'all').returns(expected);
      const result = await db.subscriptionsByTopicId(dbCtx, topicUrl);
      assert.deepStrictEqual(result, expected);
    });
    it('failure', async function () {
      const expected = new Error();
      sinon.stub(db.statement.subscriptionsByTopicId, 'all').throws(expected);
      try {
        await db.subscriptionsByTopicId(dbCtx, topicUrl);
        assert.fail(noExpectedException);
      } catch (e) {
        assert.deepStrictEqual(e, expected);
      }
    });
  }); // subscriptionsByTopicId

  describe('subscriptionCountByTopicUrl', function () {
    it('success', async function () {
      const expected = { count: 3 };
      sinon.stub(db.statement.subscriptionCountByTopicUrl, 'get').returns(expected);
      const result = await db.subscriptionCountByTopicUrl(dbCtx, topicUrl);
      assert.deepStrictEqual(result, expected);
    });
    it('failure', async function () {
      const expected = new Error();
      sinon.stub(db.statement.subscriptionCountByTopicUrl, 'get').throws(expected);
      try {
        await db.subscriptionCountByTopicUrl(dbCtx, topicUrl);
        assert.fail(noExpectedException);
      } catch (e) {
        assert.deepStrictEqual(e, expected);
      }
    });
  }); // subscriptionCountByTopicUrl

  describe('subscriptionDelete', function () {
    it('success', async function() {
      const dbResult = {
        changes: 1,
        lastInsertRowid: undefined,
      };
      const expected = {
        changes: 1,
        lastInsertRowid: undefined,
      };
      sinon.stub(db.statement.subscriptionDelete, 'run').returns(dbResult);
      const result = await db.subscriptionDelete(dbCtx, callback, topicId);
      assert.deepStrictEqual(result, expected);
    });
    it('failure', async function () {
      const dbResult = {
        changes: 0,
        lastInsertRowid: undefined,
      };
      sinon.stub(db.statement.subscriptionDelete, 'run').returns(dbResult);
      try {
        await db.subscriptionDelete(dbCtx, callback, topicId);
        assert.fail(noExpectedException);
      } catch (e) {
        assert(e instanceof DBErrors.UnexpectedResult);
      }
    });
  }); // subscriptionDelete

  describe('subscriptionDeleteExpired', function () {
    it('success', async function () {
      const dbResult = {
        changes: 1,
        lastInsertRowid: undefined,
      };
      const expected = {
        changes: 1,
        lastInsertRowid: undefined,
      };
      sinon.stub(db.statement.subscriptionDeleteExpired, 'run').returns(dbResult);
      const result = await db.subscriptionDeleteExpired(dbCtx, topicId);
      assert.deepStrictEqual(result, expected);
    });
    it('failure', async function () {
      const expected = new Error();
      sinon.stub(db.statement.subscriptionDeleteExpired, 'run').throws(expected);
      try {
        await db.subscriptionDeleteExpired(dbCtx, topicId);
        assert.fail(noExpectedException);
      } catch (e) {
        assert.deepStrictEqual(e, expected);
      }
    });
  }); // subscriptionDeleteExpired

  describe('subscriptionDeliveryClaim', function () {
    it('success', async function () {
      const dbAllResult = [
        {
          id: 'c2e254c5-aa6e-4a8f-b1a1-e474b07392bb',
        },
      ];
      const dbRunResult = {
        changes: 1,
        lastInsertRowid: undefined,
      };
      const expected = ['c2e254c5-aa6e-4a8f-b1a1-e474b07392bb'];
      sinon.stub(db.statement.subscriptionDeliveryNeeded, 'all').returns(dbAllResult);
      sinon.stub(db.statement.subscriptionDeliveryClaimById, 'run').returns(dbRunResult);
      const result = await db.subscriptionDeliveryClaim(dbCtx, wanted, claimTimeoutSeconds, claimant);
      assert.deepStrictEqual(result, expected);
    });
    it('failure', async function () {
      const dbAllResult = [
        {
          id: 'c2e254c5-aa6e-4a8f-b1a1-e474b07392bb',
        },
      ];
      const dbRunResult = {
        changes: 0,
        lastInsertRowid: undefined,
      };
      sinon.stub(db.statement.subscriptionDeliveryNeeded, 'all').returns(dbAllResult);
      sinon.stub(db.statement.subscriptionDeliveryClaimById, 'run').returns(dbRunResult);
      try {
        await db.subscriptionDeliveryClaim(dbCtx, wanted, claimTimeoutSeconds, claimant );
        assert.fail(noExpectedException);
      } catch (e) {
        assert(e instanceof DBErrors.UnexpectedResult);
      }
    });
  }); // subscriptionDeliveryClaim

  describe('subscriptionDeliveryClaimById', function () {
    it('success', async function() {
      const dbResult = {
        changes: 1,
        lastInsertRowid: undefined,
      };
      sinon.stub(db.statement.subscriptionDeliveryClaimById, 'run').returns(dbResult);
      const result = await db.subscriptionDeliveryClaimById(dbCtx, subscriptionId, claimTimeoutSeconds, claimant);
      assert.deepStrictEqual(result, dbResult);
    });
    it('failure', async function () {
      const dbResult = {
        changes: 0,
        lastInsertRowid: undefined,
      };
      sinon.stub(db.statement.subscriptionDeliveryClaimById, 'run').returns(dbResult);
      try {
        await db.subscriptionDeliveryClaimById(dbCtx, subscriptionId, claimTimeoutSeconds, claimant);
        assert.fail(noExpectedException);
      } catch (e) {
        assert(e instanceof DBErrors.UnexpectedResult);
      }
    });
  }); // subscriptionDeliveryClaimById

  describe('subscriptionDeliveryComplete', function () {
    let topicContentUpdated;
    before(function () {
      topicContentUpdated = new Date();
    });
    it('success', async function() {
      const dbResult = {
        changes: 1,
      };
      sinon.stub(db.statement.subscriptionDeliverySuccess, 'run').returns(dbResult);
      sinon.stub(db.statement.subscriptionDeliveryDone, 'run').returns(dbResult);
      await db.subscriptionDeliveryComplete(dbCtx, callback, topicId, topicContentUpdated);
    });
    it('failure', async function () {
      const dbResult = {
        changes: 0,
      };
      sinon.stub(db.statement.subscriptionDeliverySuccess, 'run').returns(dbResult);
      sinon.stub(db.statement.subscriptionDeliveryDone, 'run').returns(dbResult);
      try {
        await db.subscriptionDeliveryComplete(dbCtx, callback, topicId, topicContentUpdated);
        assert.fail(noExpectedException);
      } catch (e) {
        assert(e instanceof DBErrors.UnexpectedResult);
      }
    });
    it('second failure', async function () {
      const dbResult0 = {
        changes: 1,
      };
      const dbResult1 = {
        changes: 0,
      };
      sinon.stub(db.statement.subscriptionDeliverySuccess, 'run').returns(dbResult0);
      sinon.stub(db.statement.subscriptionDeliveryDone, 'run').returns(dbResult1);
      try {
        await db.subscriptionDeliveryComplete(dbCtx, callback, topicId, topicContentUpdated);
        assert.fail(noExpectedException);
      } catch (e) {
        assert(e instanceof DBErrors.UnexpectedResult);
      }
    });
  }); // subscriptionDeliveryComplete

  describe('subscriptionDeliveryGone', function () {
    it('success', async function() {
      const dbResult = {
        changes: 1,
      };
      sinon.stub(db.statement.subscriptionDelete, 'run').returns(dbResult);
      await db.subscriptionDeliveryGone(dbCtx, callback, topicId);
    });
    it('failure', async function () {
      const dbResult = {
        changes: 0,
      };
      sinon.stub(db.statement.subscriptionDelete, 'run').returns(dbResult);
      try {
        await db.subscriptionDeliveryGone(dbCtx, callback, topicId);
        assert.fail(noExpectedException);
      } catch (e) {
        assert(e instanceof DBErrors.UnexpectedResult);
      }
    });
  }); // subscriptionDeliveryGone

  describe('subscriptionDeliveryIncomplete', function () {
    it('success', async function() {
      const dbGet = { deliveryAttemptsSinceSuccess: 0 };
      const dbResult = {
        changes: 1,
      };
      sinon.stub(db.statement.subscriptionDeliveryAttempts, 'get').returns(dbGet);
      sinon.stub(db.statement.subscriptionDeliveryFailure, 'run').returns(dbResult);
      sinon.stub(db.statement.subscriptionDeliveryDone, 'run').returns(dbResult);
      await db.subscriptionDeliveryIncomplete(dbCtx, callback, topicId, retryDelays);
    });
    it('success covers default', async function() {
      const dbGet = { deliveryAttemptsSinceSuccess: 0 };
      const dbResult = {
        changes: 1,
      };
      sinon.stub(db.statement.subscriptionDeliveryAttempts, 'get').returns(dbGet);
      sinon.stub(db.statement.subscriptionDeliveryFailure, 'run').returns(dbResult);
      sinon.stub(db.statement.subscriptionDeliveryDone, 'run').returns(dbResult);
      await db.subscriptionDeliveryIncomplete(dbCtx, callback, topicId);
    });
    it('failure', async function () {
      const dbGet = { deliveryAttemptsSinceSuccess: 0 };
      const dbResult = {
        changes: 0,
      };
      sinon.stub(db.statement.subscriptionDeliveryAttempts, 'get').returns(dbGet);
      sinon.stub(db.statement.subscriptionDeliveryFailure, 'run').returns(dbResult);
      sinon.stub(db.statement.subscriptionDeliveryDone, 'run').returns(dbResult);
      try {
        await db.subscriptionDeliveryIncomplete(dbCtx, callback, topicId, retryDelays);
        assert.fail(noExpectedException);
      } catch (e) {
        assert(e instanceof DBErrors.UnexpectedResult);
      }
    });
    it('second failure', async function () {
      const dbGet = { deliveryAttemptsSinceSuccess: 0 };
      const dbResult0 = {
        changes: 1,
      };
      const dbResult1 = {
        changes: 0,
      };
      sinon.stub(db.statement.subscriptionDeliveryAttempts, 'get').returns(dbGet);
      sinon.stub(db.statement.subscriptionDeliveryFailure, 'run').returns(dbResult0);
      sinon.stub(db.statement.subscriptionDeliveryDone, 'run').returns(dbResult1);
      try {
        await db.subscriptionDeliveryIncomplete(dbCtx, callback, topicId, retryDelays);
        assert.fail(noExpectedException);
      } catch (e) {
        assert(e instanceof DBErrors.UnexpectedResult);
      }
    });
  }); // subscriptionDeliveryIncomplete

  describe('subscriptionGet', function () {
    it('success', async function() {
      const expected = {
        id: subscriptionId,
      };
      sinon.stub(db.statement.subscriptionGet, 'get').returns(expected);
      const result = await db.subscriptionGet(dbCtx, callback, topicId);
      assert.deepStrictEqual(result, expected);
    });
    it('failure', async function () {
      const expected = new Error();
      sinon.stub(db.statement.subscriptionGet, 'get').throws(expected);
      try {
        await db.subscriptionGet(dbCtx, callback, topicId);
        assert.fail(noExpectedException);
      } catch (e) {
        assert.deepStrictEqual(e, expected);
      }
    });
  }); // subscriptionGet

  describe('subscriptionGetById', function () {
    it('success', async function() {
      const expected = {
        id: subscriptionId,
      };
      sinon.stub(db.statement.subscriptionGetById, 'get').returns(expected);
      const result = await db.subscriptionGetById(dbCtx, subscriptionId);
      assert.deepStrictEqual(result, expected);
    });
    it('failure', async function () {
      const expected = new Error();
      sinon.stub(db.statement.subscriptionGetById, 'get').throws(expected);
      try {
        await db.subscriptionGetById(dbCtx, subscriptionId);
        assert.fail(noExpectedException);
      } catch (e) {
        assert.deepStrictEqual(e, expected);
      }
    });
  }); // subscriptionGetById

  describe('subscriptionUpdate', function () {
    let data;
    beforeEach(function () {
      data = {
        subscriptionId,
        signatureAlgorithm: 'sha256',
      };
    });
    it('success', async function() {
      const dbResult = {
        changes: 1,
        lastInsertRowid: subscriptionId,
      };
      sinon.stub(db.statement.subscriptionUpdate, 'run').returns(dbResult);
      await db.subscriptionUpdate(dbCtx, data);
    });
    it('failure', async function () {
      const dbResult = {
        changes: 0,
      };
      sinon.stub(db.statement.subscriptionUpdate, 'run').returns(dbResult);
      try {
        await db.subscriptionUpdate(dbCtx, data);
        assert.fail(noExpectedException);
      } catch (e) {
        assert(e instanceof DBErrors.UnexpectedResult, e);
      }
    });
  }); // subscriptionUpdate

  describe('subscriptionUpsert', function () {
    let data;
    beforeEach(function () {
      data = {
        callback,
        topicId,
        leaseSeconds,
        secret,
        httpRemoteAddr,
        httpFrom,
      };
    });
    it('success', async function() {
      const dbResult = {
        changes: 1,
        lastInsertRowid: subscriptionId,
      };
      const expected = {
        changes: 1,
        lastInsertRowid: subscriptionId,
      };
      sinon.stub(db.statement.subscriptionUpsert, 'run').returns(dbResult);
      const result = await db.subscriptionUpsert(dbCtx, data);
      assert.deepStrictEqual(result, expected);
    });
    it('failure', async function () {
      const dbResult = {
        changes: 0,
      };
      sinon.stub(db.statement.subscriptionUpsert, 'run').returns(dbResult);
      try {
        await db.subscriptionUpsert(dbCtx, data);
        assert.fail(noExpectedException);
      } catch (e) {
        assert(e instanceof DBErrors.UnexpectedResult);
      }
    });
  }); // subscriptionUpsert

  describe('topicDeleted', function () {
    it('success', async function () {
      sinon.stub(db.statement.topicDeleted, 'run').returns({ changes: 1 });
      await db.topicDeleted(dbCtx, { topicId });
    });
    it('failure', async function () {
      sinon.stub(db.statement.topicDeleted, 'run').returns({ changes: 0 });
      try {
        await db.topicDeleted(dbCtx, { topicId });
        assert.fail(noExpectedException);
      } catch (e) {
        assert(e instanceof DBErrors.UnexpectedResult);
      }
    });
  }); // topicDeleted

  describe('topicFetchClaim', function () {
    it('success', async function() {
      const dbAll = [{ id: topicId }];
      const dbResult = {
        changes: 1,
      };
      const expected = [topicId];
      sinon.stub(db.statement.topicContentFetchNeeded, 'all').returns(dbAll);
      sinon.stub(db.statement.topicContentFetchClaimById, 'run').returns(dbResult);
      const result = await db.topicFetchClaim(dbCtx, wanted, claimTimeoutSeconds, claimant);
      assert.deepStrictEqual(result, expected);
    });
    it('failure', async function () {
      const dbAll = [{ id: topicId }];
      const dbResult = {
        changes: 0,
      };
      sinon.stub(db.statement.topicContentFetchNeeded, 'all').returns(dbAll);
      sinon.stub(db.statement.topicContentFetchClaimById, 'run').returns(dbResult);
      try {
        await db.topicFetchClaim(dbCtx, wanted, claimTimeoutSeconds, claimant);
        assert.fail(noExpectedException);
      } catch (e) {
        assert(e instanceof DBErrors.UnexpectedResult);
      }
    });
  }); // topicFetchClaim

  describe('topicFetchClaimById', function () {
    it('success', async function() {
      const expected = {
        changes: 1,
        lastInsertRowid: undefined,
      };
      sinon.stub(db.statement.topicContentFetchClaimById, 'run').returns(expected);
      const result = await db.topicFetchClaimById(dbCtx, topicId, claimTimeoutSeconds, claimant);
      assert.deepStrictEqual(result, expected);
    });
    it('failure', async function () {
      const expected = {
        changes: 0,
        lastInsertRowid: undefined,
      };
      sinon.stub(db.statement.topicContentFetchClaimById, 'run').returns(expected);
      try {
        await db.topicFetchClaimById(dbCtx, topicId, claimTimeoutSeconds, claimant);
        assert.fail(noExpectedException);
      } catch (e) {
        assert(e instanceof DBErrors.UnexpectedResult);
      }
    });
  }); // topicFetchClaimById

  describe('topicFetchComplete', function () {
    it('success', async function() {
      const dbResult = {
        changes: 1,
        lastInsertRowid: undefined,
      };
      sinon.stub(db.statement.topicAttemptsReset, 'run').returns(dbResult);
      sinon.stub(db.statement.topicContentFetchDone, 'run').returns(dbResult);
      await db.topicFetchComplete(dbCtx, topicId);
    });
    it('failure', async function () {
      const dbResult = {
        changes: 0,
        lastInsertRowid: undefined,
      };
      sinon.stub(db.statement.topicAttemptsReset, 'run').returns(dbResult);
      sinon.stub(db.statement.topicContentFetchDone, 'run').returns(dbResult);
      try {
        await db.topicFetchComplete(dbCtx, topicId);
        assert.fail(noExpectedException);
      } catch (e) {
        assert(e instanceof DBErrors.UnexpectedResult);
      }
    });
    it('second failure', async function () {
      const dbResult0 = {
        changes: 1,
        lastInsertRowid: undefined,
      };
      const dbResult1 = {
        changes: 0,
        lastInsertRowid: undefined,
      };
      sinon.stub(db.statement.topicAttemptsReset, 'run').returns(dbResult0);
      sinon.stub(db.statement.topicContentFetchDone, 'run').returns(dbResult1);
      try {
        await db.topicFetchComplete(dbCtx, topicId);
        assert.fail(noExpectedException);
      } catch (e) {
        assert(e instanceof DBErrors.UnexpectedResult);
      }
    });
  }); // topicFetchComplete

  describe('topicFetchIncomplete', function () {
    it('success', async function() {
      const dbGet = { currentAttempt: 0 };
      const dbResult0 = {
        changes: 1,
        lastInsertRowid: undefined,
      };
      const dbResult1 = {
        changes: 1,
        lastInsertRowid: undefined,
      };
      const expected = {
        changes: 1,
        lastInsertRowid: undefined,
      };
      sinon.stub(db.statement.topicAttempts, 'get').returns(dbGet);
      sinon.stub(db.statement.topicAttemptsIncrement, 'run').returns(dbResult0);
      sinon.stub(db.statement.topicContentFetchDone, 'run').returns(dbResult1);
      const result = await db.topicFetchIncomplete(dbCtx, topicId, retryDelays);
      assert.deepStrictEqual(result, expected);
    });
    it('covers defaults', async function() {
      const dbGet = { currentAttempt: 0 };
      const dbResult0 = {
        changes: 1,
        lastInsertRowid: undefined,
      };
      const dbResult1 = {
        changes: 1,
        lastInsertRowid: undefined,
      };
      const expected = {
        changes: 1,
        lastInsertRowid: undefined,
      };
      sinon.stub(db.statement.topicAttempts, 'get').returns(dbGet);
      sinon.stub(db.statement.topicAttemptsIncrement, 'run').returns(dbResult0);
      sinon.stub(db.statement.topicContentFetchDone, 'run').returns(dbResult1);
      const result = await db.topicFetchIncomplete(dbCtx, topicId);
      assert.deepStrictEqual(result, expected);
    });
    it('failure', async function () {
      const dbGet = { currentAttempt: 0 };
      const dbResult0 = {
        changes: 1,
        lastInsertRowid: undefined,
      };
      const dbResult1 = {
        changes: 0,
        lastInsertRowid: undefined,
      };
      sinon.stub(db.statement.topicAttempts, 'get').returns(dbGet);
      sinon.stub(db.statement.topicAttemptsIncrement, 'run').returns(dbResult0);
      sinon.stub(db.statement.topicContentFetchDone, 'run').returns(dbResult1);
      try {
        await db.topicFetchIncomplete(dbCtx, topicId, retryDelays);
        assert.fail(noExpectedException);
      } catch (e) {
        assert(e instanceof DBErrors.UnexpectedResult);
      }
    });
    it('second failure', async function () {
      const dbGet = { currentAttempt: 0 };
      const dbResult0 = {
        changes: 0,
        lastInsertRowid: undefined,
      };
      const dbResult1 = {
        changes: 0,
        lastInsertRowid: undefined,
      };
      sinon.stub(db.statement.topicAttempts, 'get').returns(dbGet);
      sinon.stub(db.statement.topicAttemptsIncrement, 'run').returns(dbResult0);
      sinon.stub(db.statement.topicContentFetchDone, 'run').returns(dbResult1);
      try {
        await db.topicFetchIncomplete(dbCtx, topicId, retryDelays);
        assert.fail(noExpectedException);
      } catch (e) {
        assert(e instanceof DBErrors.UnexpectedResult);
      }
    });
  }); // topicFetchIncomplete

  describe('topicFetchRequested', function () {
    it('success', async function() {
      const dbResult = {
        changes: 1,
        lastInsertRowid: undefined,
      };
      const expected = {
        changes: 1,
        lastInsertRowid: undefined,
      };
      sinon.stub(db.statement.topicContentFetchRequested, 'run').returns(dbResult);
      const result = await db.topicFetchRequested(dbCtx, topicId);
      assert.deepStrictEqual(result, expected);
    });
    it('failure', async function () {
      const dbResult = {
        changes: 0,
        lastInsertRowid: undefined,
      };
      sinon.stub(db.statement.topicContentFetchRequested, 'run').returns(dbResult);
      try {
        await db.topicFetchRequested(dbCtx, topicId);
        assert.fail(noExpectedException);
      } catch (e) {
        assert(e instanceof DBErrors.UnexpectedResult);
      }
    });
  }); // topicFetchRequested

  describe('topicGetAll', function () {
    it('success', async function() {
      const expected = [{ id: topicId }];
      sinon.stub(db.statement.topicGetInfoAll, 'all').returns(expected);
      const result = await db.topicGetAll(dbCtx);
      assert.deepStrictEqual(result, expected);
    });
    it('covers none', async function() {
      const expected = undefined;
      sinon.stub(db.statement.topicGetInfoAll, 'all').returns(expected);
      const result = await db.topicGetAll(dbCtx);
      assert.deepStrictEqual(result, expected);
    });
    it('failure', async function () {
      const expected = new Error();
      sinon.stub(db.statement.topicGetInfoAll, 'all').throws(expected);
      try {
        await db.topicGetAll(dbCtx);
        assert.fail(noExpectedException);
      } catch (e) {
        assert.deepStrictEqual(e, expected);
      }
    });
  }); // topicGetById

  describe('topicGetById', function () {
    it('success', async function() {
      const expected = { id: topicId };
      sinon.stub(db.statement.topicGetById, 'get').returns(expected);
      const result = await db.topicGetById(dbCtx, topicId);
      assert.deepStrictEqual(result, expected);
    });
    it('covers no defaults', async function () {
      const expected = { id: topicId };
      sinon.stub(db.statement.topicGetById, 'get').returns(expected);
      const result = await db.topicGetById(dbCtx, topicId, false);
      assert.deepStrictEqual(result, expected);
    });
    it('covers default', async function() {
      const expected = undefined;
      sinon.stub(db.statement.topicGetById, 'get').returns(expected);
      const result = await db.topicGetById(dbCtx, topicId);
      assert.deepStrictEqual(result, expected);
    });
    it('failure', async function () {
      const expected = new Error();
      sinon.stub(db.statement.topicGetById, 'get').throws(expected);
      try {
        await db.topicGetById(dbCtx, topicId);
        assert.fail(noExpectedException);
      } catch (e) {
        assert.deepStrictEqual(e, expected);
      }
    });
  }); // topicGetById

  describe('topicGetByUrl', function () {
    it('success', async function() {
      const expected = [];
      sinon.stub(db.statement.topicGetByUrl, 'get').returns(expected);
      const result = await db.topicGetByUrl(dbCtx, topicUrl);
      assert.deepStrictEqual(result, expected);
    });
    it('failure', async function () {
      const expected = new Error();
      sinon.stub(db.statement.topicGetByUrl, 'get').throws(expected);
      try {
        await db.topicGetByUrl(dbCtx, topicUrl);
        assert.fail(noExpectedException);
      } catch (e) {
        assert.deepStrictEqual(e, expected);
      }
    });
  }); // topicGetByUrl

  describe('topicGetContentById', function () {
    it('success', async function() {
      const expected = { id: topicId };
      sinon.stub(db.statement.topicGetContentById, 'get').returns(expected);
      const result = await db.topicGetContentById(dbCtx, topicId);
      assert.deepStrictEqual(result, expected);
    });
    it('covers default', async function() {
      const expected = undefined;
      sinon.stub(db.statement.topicGetContentById, 'get').returns(expected);
      const result = await db.topicGetContentById(dbCtx, topicId);
      assert.deepStrictEqual(result, expected);
    });
    it('failure', async function () {
      const expected = new Error();
      sinon.stub(db.statement.topicGetContentById, 'get').throws(expected);
      try {
        await db.topicGetContentById(dbCtx, topicId);
        assert.fail(noExpectedException);
      } catch (e) {
        assert.deepStrictEqual(e, expected);
      }
    });
  }); // topicGetContentById

  describe('topicPendingDelete', function () {
    beforeEach(function () {
      sinon.stub(db.statement.topicGetById, 'get');
      sinon.stub(db.statement.subscriptionCountByTopicUrl, 'get');
      sinon.stub(db.statement.topicDeleteById, 'run');
    });
    it('success', async function () {
      db.statement.topicGetById.get.returns({
        id: topicId,
        isDeleted: true,
      });
      db.statement.subscriptionCountByTopicUrl.get.returns({
        count: 0,
      });
      db.statement.topicDeleteById.run.returns({
        changes: 1,
      });
      db.topicPendingDelete(dbCtx, topicId);
      assert(db.statement.topicDeleteById.run.called);
    });
    it('does not delete non-deleted topic', async function () {
      db.statement.topicGetById.get.returns({
        id: topicId,
        isDeleted: false,
      });
      db.statement.subscriptionCountByTopicUrl.get.returns({
        count: 0,
      });
      db.statement.topicDeleteById.run.returns({
        changes: 1,
      });
      db.topicPendingDelete(dbCtx, topicId);
      assert(!db.statement.topicDeleteById.run.called);
    });
    it('does not delete topic with active subscriptions', async function () {
      db.statement.topicGetById.get.returns({
        id: topicId,
        isDeleted: true,
      });
      db.statement.subscriptionCountByTopicUrl.get.returns({
        count: 10,
      });
      db.statement.topicDeleteById.run.returns({
        changes: 1,
      });
      db.topicPendingDelete(dbCtx, topicId);
      assert(!db.statement.topicDeleteById.run.called);
    });
    it('covers no deletion', async function () {
      db.statement.topicGetById.get.returns({
        id: topicId,
        isDeleted: true,
      });
      db.statement.subscriptionCountByTopicUrl.get.returns({
        count: 0,
      });
      db.statement.topicDeleteById.run.returns({
        changes: 0,
      });
      try {
        db.topicPendingDelete(dbCtx, topicId);
        assert.fail(noExpectedException);

      } catch (e) {
        assert(e instanceof DBErrors.UnexpectedResult);
      }
      assert(db.statement.topicDeleteById.run.called);
    });
  }); // topicPendingDelete

  describe('topicPublishHistory', function () {
    beforeEach(function () {
      sinon.stub(db.statement.topicPublishHistory, 'all');
    });
    it('success', function () {
      db.statement.topicPublishHistory.all.returns([
        { daysAgo: 1, contentUpdates: 1 },
        { daysAgo: 3, contentUpdates: 2 },
      ]);
      const result = db.topicPublishHistory(dbCtx, topicId, 7);
      const expected = [0, 1, 0, 2, 0, 0, 0];
      assert.deepStrictEqual(result, expected);
    });
  }); // topicPublishHistory

  describe('topicSet', function () {
    let data;
    beforeEach(function () {
      data = {
        url: topicUrl,
      };
    });
    it('success', async function() {
      const dbResult = {
        changes: 1,
        lastInsertRowid: topicId,
      };
      const expected = {
        changes: 1,
        lastInsertRowid: topicId,
      };
      sinon.stub(db.statement.topicUpsert, 'run').returns(dbResult);
      const result = await db.topicSet(dbCtx, data);
      assert.deepStrictEqual(result, expected);
    });
    it('failure', async function () {
      const dbResult = {
        changes: 0,
        lastInsertRowid: undefined,
      };
      sinon.stub(db.statement.topicUpsert, 'run').returns(dbResult);
      try {
        await db.topicSet(dbCtx, data);
        assert.fail(noExpectedException);
      } catch (e) {
        assert(e instanceof DBErrors.UnexpectedResult);
      }
    });
    it('fails invalid value', async function () {
      sinon.stub(db.statement.topicUpsert, 'run');
      try {
        data.leaseSecondsPreferred = -100;
        await db.topicSet(dbCtx, data);
        assert.fail(noExpectedException);
      } catch (e) {
        assert(e instanceof DBErrors.DataValidation);
      }
      assert(!db.statement.topicUpsert.run.called);
    });
    it('fails invalid values', async function () {
      sinon.stub(db.statement.topicUpsert, 'run');
      try {
        data.leaseSecondsPreferred = 10;
        data.leaseSecondsMax = 100;
        data.leaseSecondsMin = 50;
        await db.topicSet(dbCtx, data);
        assert.fail(noExpectedException);
      } catch (e) {
        assert(e instanceof DBErrors.DataValidation);
      }
      assert(!db.statement.topicUpsert.run.called);
    });
  }); // topicSet

  describe('topicSetContent', function () {
    let data;
    beforeEach(function () {
      data = {
        content: 'content',
        contentType: 'text/plain',
        contentHash: 'abc123',
      };
      sinon.stub(db.statement.topicSetContent, 'run');
      sinon.stub(db.statement.topicSetContentHistory, 'run');
    });
    it('success', async function() {
      const dbResult = {
        changes: 1,
        lastInsertRowid: undefined,
      };
      const expected = {
        changes: 1,
        lastInsertRowid: undefined,
      };
      db.statement.topicSetContent.run.returns(dbResult);
      db.statement.topicSetContentHistory.run.returns(dbResult);
      const result = await db.topicSetContent(dbCtx, data);
      assert.deepStrictEqual(result, expected);
    });
    it('failure', async function () {
      const dbResult = {
        changes: 0,
        lastInsertRowid: undefined,
      };
      db.statement.topicSetContent.run.returns(dbResult);
      try {
        await db.topicSetContent(dbCtx, data);
        assert.fail(noExpectedException);
      } catch (e) {
        assert(e instanceof DBErrors.UnexpectedResult);
      }
    });
    it('failure 2', async function () {
      const dbResultSuccess = {
        changes: 1,
        lastInsertRowid: undefined,
      };
      const dbResultFail = {
        changes: 0,
        lastInsertRowid: undefined,
      };
      db.statement.topicSetContent.run.returns(dbResultSuccess);
      db.statement.topicSetContentHistory.run.returns(dbResultFail);
      try {
        await db.topicSetContent(dbCtx, data);
        assert.fail(noExpectedException);
      } catch (e) {
        assert(e instanceof DBErrors.UnexpectedResult);
      }
    });
  }); // topicSetContent

  describe('topicUpdate', function () {
    let data;
    beforeEach(function () {
      data = {
        topicId,
        leaseSecondsPreferred: 9999,
        leaseSecondsMax: 99999,
        leaseSecondsMin: 999,
        publisherValidationUrl: null,
        contentHashAlgorithm: 'sha256',
      };
    });
    it('success', async function() {
      const dbResult = {
        changes: 1,
        lastInsertRowid: topicId,
      };
      sinon.stub(db.statement.topicUpdate, 'run').returns(dbResult);
      await db.topicUpdate(dbCtx, data);
    });
    it('failure', async function () {
      const dbResult = {
        changes: 0,
        lastInsertRowid: undefined,
      };
      sinon.stub(db.statement.topicUpdate, 'run').returns(dbResult);
      try {
        await db.topicUpdate(dbCtx, data);
        assert.fail(noExpectedException);
      } catch (e) {
        assert(e instanceof DBErrors.UnexpectedResult, e);
      }
    });
    it('fails invalid value', async function () {
      sinon.stub(db.statement.topicUpdate, 'run');
      try {
        data.leaseSecondsPreferred = -100;
        await db.topicUpdate(dbCtx, data);
        assert.fail(noExpectedException);
      } catch (e) {
        assert(e instanceof DBErrors.DataValidation, e);
      }
      assert(!db.statement.topicUpdate.run.called);
    });
    it('fails invalid values', async function () {
      sinon.stub(db.statement.topicUpdate, 'run');
      try {
        data.leaseSecondsPreferred = 10;
        data.leaseSecondsMax = 100;
        data.leaseSecondsMin = 50;
        await db.topicUpdate(dbCtx, data);
        assert.fail(noExpectedException);
      } catch (e) {
        assert(e instanceof DBErrors.DataValidation, e);
      }
      assert(!db.statement.topicUpdate.run.called);
    });
  }); // topicUpdate

  describe('verificationClaim', function () {
    it('success', async function() {
      const dbAll = [{ id: verificationId }];
      const dbRun = {
        changes: 1,
        lastInsertRowid: undefined,
      };
      const expected = [verificationId];
      sinon.stub(db.statement.verificationNeeded, 'all').returns(dbAll);
      sinon.stub(db.statement.verificationClaimById, 'run').returns(dbRun);
      const result = await db.verificationClaim(dbCtx, wanted, claimTimeoutSeconds, claimant);
      assert.deepStrictEqual(result, expected);
    });
    it('failure', async function () {
      const dbAll = [{ id: verificationId }];
      const dbRun = {
        changes: 0,
        lastInsertRowid: undefined,
      };
      sinon.stub(db.statement.verificationNeeded, 'all').returns(dbAll);
      sinon.stub(db.statement.verificationClaimById, 'run').returns(dbRun);
      try {
        await db.verificationClaim(dbCtx, wanted, claimTimeoutSeconds, claimant);
        assert.fail(noExpectedException);
      } catch (e) {
        assert(e instanceof DBErrors.UnexpectedResult);
      }
    });
  }); // verificationClaim

  describe('verificationClaimById', function () {
    it('success', async function() {
      const dbRun = {
        changes: 1,
        lastInsertRowid: undefined,
      };
      sinon.stub(db.statement.verificationClaimById, 'run').returns(dbRun);
      const result = await db.verificationClaimById(dbCtx, verificationId, claimTimeoutSeconds, claimant);
      assert.deepStrictEqual(result, dbRun);
    });
    it('failure', async function () {
      const dbRun = {
        changes: 0,
        lastInsertRowid: undefined,
      };
      sinon.stub(db.statement.verificationClaimById, 'run').returns(dbRun);
      try {
        await db.verificationClaimById(dbCtx, verificationId, claimTimeoutSeconds, claimant);
        assert.fail(noExpectedException);
      } catch (e) {
        assert(e instanceof DBErrors.UnexpectedResult);
      }
    });
  }); // verificationClaimById

  describe('verificationComplete', function () {
    it('success', async function() {
      const dbResult = {
        changes: 1,
        lastInsertRowid: undefined,
      };
      sinon.stub(db.statement.verificationScrub, 'run').returns(dbResult);
      await db.verificationComplete(dbCtx, verificationId, callback, topicId);
    });
    it('failure', async function () {
      const dbResult = {
        changes: 0,
        lastInsertRowid: undefined,
      };
      sinon.stub(db.statement.verificationScrub, 'run').returns(dbResult);
      try {
        await db.verificationComplete(dbCtx, verificationId, callback, topicId);
        assert.fail(noExpectedException);
      } catch (e) {
        assert(e instanceof DBErrors.UnexpectedResult);
      }
    });
  }); // verificationComplete

  describe('verificationGetById', function () {
    it('success', async function() {
      const dbOneOrNone = { id: verificationId, isPublisherValidated: 1 };
      const expected = { id: verificationId, isPublisherValidated: true };
      sinon.stub(db.statement.verificationGetById, 'get').returns(dbOneOrNone);
      const result = await db.verificationGetById(dbCtx, verificationId);
      assert.deepStrictEqual(result, expected);
    });
    it('failure', async function () {
      const expected = new Error();
      sinon.stub(db.statement.verificationGetById, 'get').throws(expected);
      try {
        await db.verificationGetById(dbCtx, verificationId);
        assert.fail(noExpectedException);
      } catch (e) {
        assert.deepStrictEqual(e, expected);
      }
    });
  }); // verificationGetById

  describe('verificationIncomplete', function () {
    it('success', async function() {
      const dbOne = { attempts: 0 };
      const dbResult0 = {
        changes: 1,
        lastInsertRowid: undefined,
      };
      const dbResult1 = {
        changes: 1,
        lastInsertRowid: undefined,
      };
      sinon.stub(db.statement.verificationAttempts, 'get').returns(dbOne);
      sinon.stub(db.statement.verificationAttemptsIncrement, 'run').returns(dbResult0);
      sinon.stub(db.statement.verificationDone, 'run').returns(dbResult1);
      await db.verificationIncomplete(dbCtx, verificationId, retryDelays);
    });
    it('covers defaults', async function() {
      const dbOne = { attempts: 0 };
      const dbResult0 = {
        changes: 1,
        lastInsertRowid: undefined,
      };
      const dbResult1 = {
        changes: 1,
        lastInsertRowid: undefined,
      };
      sinon.stub(db.statement.verificationAttempts, 'get').returns(dbOne);
      sinon.stub(db.statement.verificationAttemptsIncrement, 'run').returns(dbResult0);
      sinon.stub(db.statement.verificationDone, 'run').returns(dbResult1);
      await db.verificationIncomplete(dbCtx, verificationId);
    });
    it('failure', async function () {
      const dbOne = { attempts: 0 };
      const dbResult0 = {
        changes: 0,
        lastInsertRowid: undefined,
      };
      const dbResult1 = {
        changes: 1,
        lastInsertRowid: undefined,
      };
      sinon.stub(db.statement.verificationAttempts, 'get').returns(dbOne);
      sinon.stub(db.statement.verificationAttemptsIncrement, 'run').returns(dbResult0);
      sinon.stub(db.statement.verificationDone, 'run').returns(dbResult1);
      try {
        await db.verificationIncomplete(dbCtx, verificationId, retryDelays);
        assert.fail(noExpectedException);
      } catch (e) {
        assert(e instanceof DBErrors.UnexpectedResult);
      }
    });
    it('second failure', async function () {
      const dbOne = { attempts: 0 };
      const dbResult0 = {
        changes: 1,
        lastInsertRowid: undefined,
      };
      const dbResult1 = {
        changes: 0,
        lastInsertRowid: undefined,
      };
      sinon.stub(db.statement.verificationAttempts, 'get').returns(dbOne);
      sinon.stub(db.statement.verificationAttemptsIncrement, 'run').returns(dbResult0);
      sinon.stub(db.statement.verificationDone, 'run').returns(dbResult1);
      try {
        await db.verificationIncomplete(dbCtx, verificationId, retryDelays);
        assert.fail(noExpectedException);
      } catch (e) {
        assert(e instanceof DBErrors.UnexpectedResult);
      }
    });
  }); // verificationIncomplete

  describe('_verificationDataToEngine', function () {
    it('covers no data', function () {
      DB._verificationDataToEngine();
    });
    it('covers true', function () {
      const data = {
        isPublisherValidated: true,
      };
      DB._verificationDataToEngine(data);
      assert.strictEqual(data.isPublisherValidated, 1);
    });
    it('covers false', function () {
      const data = {
        isPublisherValidated: false,
      };
      DB._verificationDataToEngine(data);
      assert.strictEqual(data.isPublisherValidated, 0);
    });
  }); // _verificationDataToEngine

  describe('verificationInsert', function () {
    let verification;
    beforeEach(function () {
      verification = {
        topicId,
        callback,
        mode: 'subscribe',
        isPublisherValidated: true,
        leaseSeconds: 86400,
      };
    });
    it('success', async function() {
      const dbResult = {
        changes: 1,
        lastInsertRowid: verificationId,
      };
      const expected = verificationId;
      sinon.stub(db.statement.verificationInsert, 'run').returns(dbResult);
      const result = await db.verificationInsert(dbCtx, verification);
      assert.deepStrictEqual(result, expected);
    });
    it('failure', async function () {
      const dbResult = {
        changes: 0,
        lastInsertRowid: undefined,
      };
      sinon.stub(db.statement.verificationInsert, 'run').returns(dbResult);
      try {
        await db.verificationInsert(dbCtx, verification);
        assert.fail(noExpectedException);
      } catch (e) {
        assert(e instanceof DBErrors.UnexpectedResult);
      }
    });
    it('fails validation', async function () {
      delete verification.leaseSeconds;
      try {
        await db.verificationInsert(dbCtx, verification);
        assert.fail(noExpectedException);
      } catch (e) {
        assert(e instanceof DBErrors.DataValidation);
      }
    });
  }); // verificationInsert

  describe('verificationRelease', function () {
    it('success', async function() {
      const dbResult = {
        changes: 1,
        lastInsertRowid: undefined,
      };
      sinon.stub(db.statement.verificationDone, 'run').returns(dbResult);
      await db.verificationRelease(dbCtx, verificationId);
    });
    it('failure', async function () {
      const dbResult = {
        changes: 0,
        lastInsertRowid: undefined,
      };
      sinon.stub(db.statement.verificationDone, 'run').returns(dbResult);
      try {
        await db.verificationRelease(dbCtx, verificationId);
        assert.fail(noExpectedException);
      } catch (e) {
        assert(e instanceof DBErrors.UnexpectedResult);
      }
    });
  }); // verificationRelease

  describe('verificationUpdate', function () {
    let data;
    beforeEach(function () {
      data = {
        mode: 'subscribe',
        isPublisherValidated: true,
      };
    });
    it('success', async function() {
      const dbResult = {
        changes: 1,
        lastInsertRowid: undefined,
      };
      sinon.stub(db.statement.verificationUpdate, 'run').returns(dbResult);
      await db.verificationUpdate(dbCtx, verificationId, data);
    });
    it('failure', async function () {
      const dbResult = {
        changes: 0,
        lastInsertRowid: undefined,
      };
      sinon.stub(db.statement.verificationUpdate, 'run').returns(dbResult);
      try {
        await db.verificationUpdate(dbCtx, verificationId, data);
        assert.fail(noExpectedException);
      } catch (e) {
        assert(e instanceof DBErrors.UnexpectedResult, e.name);
      }
    });
    it('fails validation', async function () {
      delete data.mode;
      try {
        await db.verificationUpdate(dbCtx, data);
        assert.fail(noExpectedException);
      } catch (e) {
        assert(e instanceof DBErrors.DataValidation);
      }
    });
  }); // verificationUpdate

  describe('verificationValidated', function () {
    it('success', async function() {
      const dbResult = {
        changes: 1,
        lastInsertRowid: undefined,
      };
      sinon.stub(db.statement.verificationValidate, 'run').returns(dbResult);
      await db.verificationValidated(dbCtx, verificationId);
    });
    it('failure', async function () {
      const dbResult = {
        changes: 0,
        lastInsertRowid: undefined,
      };
      sinon.stub(db.statement.verificationValidate, 'run').returns(dbResult);
      try {
        await db.verificationValidated(dbCtx, verificationId);
        assert.fail(noExpectedException);
      } catch (e) {
        assert(e instanceof DBErrors.UnexpectedResult);
      }
    });
  }); // verificationValidated

}); // DatabaseSQLite
