/* eslint-disable sonarjs/no-identical-functions */
/* eslint-env mocha */
/* eslint-disable sonarjs/no-duplicate-string */
'use strict';

/* This provides implementation coverage, stubbing pg-promise. */

const assert = require('assert');
// eslint-disable-next-line node/no-unpublished-require
const sinon = require('sinon');
const DBStub = require('../../stub-db');
const stubLogger = require('../../stub-logger');
const DB = require('../../../src/db/postgres');
const DBErrors = require('../../../src/db/errors');
const common = require('../../../src/common');
const Config = require('../../../config');

const noExpectedException = 'did not receive expected exception';

describe('DatabasePostgres', function () {
  let db, options, pgpStub;
  let dbCtx, claimant, claimTimeoutSeconds, callback, subscriptionId, topicId, verificationId;
  let topicUrl, leaseSeconds, secret, httpRemoteAddr, httpFrom, retryDelays, wanted;
  before(function () {
    pgpStub = () => {
      const stub = {
        result: () => ({ rows: [] }),
        all: common.nop,
        get: common.nop,
        run: common.nop,
        one: common.nop,
        manyOrNone: common.nop,
        oneOrNone: common.nop,
        query: common.nop,
        batch: common.nop,
        multiResult: common.nop,
        connect: common.nop,
      };
      stub.tx = (fn) => fn(stub);
      stub.txIf = (fn) => fn(stub);
      stub.task = (fn) => fn(stub);
      return stub;
    };
    pgpStub.utils = {
      enumSql: () => ({}),
    };
    pgpStub.QueryFile = class {};
    pgpStub.end = common.nop,
    options = new Config('test');
    db = new DB(stubLogger, options, pgpStub);
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

  it('covers listener', function () {
    const listenerOptions = new Config('test');
    listenerOptions.db.cacheEnabled = true;
    const listenerDb = new DB(stubLogger, listenerOptions, pgpStub);
    assert(listenerDb);
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

  describe('pgpInitOptions', function () {
    describe('error', function () {
      it('covers', function () {
        const err = {};
        const event = {};
        db.pgpInitOptions.error(err, event);
        assert(db.logger.error.called);
      });
    }); // error
    describe('query', function () {
      it('covers', function () {
        const event = {};
        db.pgpInitOptions.query(event);
        assert(db.logger.debug.called);
      });
      it('covers NOTIFY', function () {
        const event = { query: 'NOTIFY thing' };
        db.pgpInitOptions.query(event);
        assert(!db.logger.debug.called);
      });
    }); // query
    describe('receive', function () {
      it('covers', function () {
        const data = [
          {
            column_one: 'one', // eslint-disable-line camelcase
            column_two: 2, // eslint-disable-line camelcase
          },
          {
            column_one: 'foo', // eslint-disable-line camelcase
            column_two: 4, // eslint-disable-line camelcase
          },
        ];
        const result = {};
        const event = {};
        const expectedData = [
          {
            columnOne: 'one',
            columnTwo: 2,
          },
          {
            columnOne: 'foo',
            columnTwo: 4,
          },
        ];
        db.pgpInitOptions.receive({ data, result, ctx: event });
        assert(db.logger.debug.called);
        assert.deepStrictEqual(data, expectedData);
      });
      it('covers NOTIFY', function () {
        const data = [
          {
            column_one: 'one', // eslint-disable-line camelcase
            column_two: 2, // eslint-disable-line camelcase
          },
          {
            column_one: 'foo', // eslint-disable-line camelcase
            column_two: 4, // eslint-disable-line camelcase
          },
        ];
        const result = {
          command: 'NOTIFY',
        };
        const event = {};
        const expectedData = [
          {
            columnOne: 'one',
            columnTwo: 2,
          },
          {
            columnOne: 'foo',
            columnTwo: 4,
          },
        ];
        db.pgpInitOptions.receive({ data, result, ctx: event });
        assert(!db.logger.debug.called);
        assert.deepStrictEqual(data, expectedData);
      });
    }); // receive
  }); // pgpInitOptions

  describe('_initTables', function () {
    beforeEach(function () {
      sinon.stub(db.db, 'oneOrNone');
      sinon.stub(db.db, 'multiResult');
      sinon.stub(db, '_currentSchema');
    });

    it('covers apply', async function() {
      db.db.oneOrNone.onCall(0).resolves(null).onCall(1).resolves({});
      db._currentSchema.resolves({ major: 0, minor: 0, patch: 0 });
      await db._initTables();
    });
    it('covers exists', async function() {
      db.db.oneOrNone.resolves({});
      db._currentSchema.resolves(db.schemaVersionsSupported.max);
      await db._initTables();
    });
  }); // _initTables

  describe('initialize', function () {
    after(function () {
      delete db.listener;
    });
    it('passes supported version', async function () {
      const version = { major: 1, minor: 0, patch: 0 };
      sinon.stub(db.db, 'one').resolves(version);
      await db.initialize(false);
    });
    it('fails low version', async function () {
      const version = { major: 0, minor: 0, patch: 0 };
      sinon.stub(db.db, 'one').resolves(version);
      try {
        await db.initialize(false);
        assert.fail(noExpectedException);
      } catch (e) {
        assert(e instanceof DBErrors.MigrationNeeded);
      }
    });
    it('fails high version', async function () {
      const version = { major: 100, minor: 100, patch: 100 };
      sinon.stub(db.db, 'one').resolves(version);
      try {
        await db.initialize(false);
        assert.fail(noExpectedException);
      } catch (e) {
        assert(e instanceof DBErrors.MigrationNeeded);
      }
    });
    it('covers migration', async function() {
      sinon.stub(db.db, 'oneOrNone').resolves({});
      sinon.stub(db.db, 'multiResult').resolves({});
      sinon.stub(db, '_currentSchema').resolves(db.schemaVersionsSupported.min);
      sinon.stub(db.db, 'one').resolves(db.schemaVersionsSupported.max);
      await db.initialize();
    });
    it('covers migration failure', async function() {
      const expected = new Error('oh no');
      sinon.stub(db.db, 'oneOrNone').resolves({});
      sinon.stub(db.db, 'multiResult').rejects(expected);
      sinon.stub(db, '_currentSchema').resolves(db.schemaVersionsSupported.min);
      sinon.stub(db.db, 'one').resolves(db.schemaVersionsSupported.max);
      try {
        await db.initialize();
        assert.fail(noExpectedException);
      } catch (e) {
        assert.deepStrictEqual(e, expected);
      }
    });
    it('covers listener', async function() {
      db.listener = {
        start: sinon.stub(),
      };
      const version = { major: 1, minor: 0, patch: 0 };
      sinon.stub(db.db, 'one').resolves(version);
      await db.initialize(false);
      assert(db.listener.start.called);
    });
  }); // initialize

  describe('healthCheck', function () {
    beforeEach(function () {
      sinon.stub(db.db, 'connect').resolves({
        done: () => {},
        client: {
          serverVersion: '0.0',
        },
      });
    });
    it('covers', async function () {
      const result = await db.healthCheck();
      assert.deepStrictEqual(result, { serverVersion: '0.0' });
    });
  }); // healthCheck

  describe('_queryFileHelper', function () {
    it('covers success', function () {
      const _queryFile = db._queryFileHelper(pgpStub);
      _queryFile();
    });
    it('covers failure', function () {
      const err = new Error();
      pgpStub.QueryFile = class {
        constructor() {
          this.error = err;
        }
      };
      const _queryFile = db._queryFileHelper(pgpStub);
      try {
        _queryFile();
        assert.fail(noExpectedException);
      } catch (e) {
        assert.strictEqual(e, err);
      }
    });
  }); // _queryFileHelper

  describe('_closeConnection', function () {
    after(function () {
      delete db.listener;
    });
    it('success', async function () {
      sinon.stub(db._pgp, 'end');
      await db._closeConnection();
      assert(db._pgp.end.called);
    });
    it('failure', async function () {
      const expected = new Error();
      sinon.stub(db._pgp, 'end').throws(expected);
      try {
        await db._closeConnection();
        assert.fail(noExpectedException);
      } catch (e) {
        assert.deepStrictEqual(e, expected);
      }
    });
    it('covers listener', async function () {
      db.listener = {
        stop: sinon.stub(),
      };
      sinon.stub(db._pgp, 'end');
      await db._closeConnection();
      assert(db._pgp.end.called);
    });
  }); // _closeConnection

  describe('_purgeTables', function () {
    it('covers not really', async function () {
      sinon.stub(db.db, 'tx');
      await db._purgeTables(false);
      assert(!db.db.tx.called);
    });
    it('success', async function () {
      sinon.stub(db.db, 'batch');
      await db._purgeTables(true);
      assert(db.db.batch.called);
    });
    it('failure', async function () {
      const expected = new Error();
      sinon.stub(db.db, 'tx').rejects(expected);
      try {
        await db._purgeTables(true);
        assert.fail(noExpectedException);
      } catch (e) {
        assert.deepStrictEqual(e, expected);
      }
    });
  }); // _purgeTables

  describe('_topicChanged', function () {
    beforeEach(function () {
      db.cache = new Map();
      sinon.stub(db.cache, 'delete');
    });
    after(function () {
      delete db.cache;
    });
    it('covers', function () {
      db._topicChanged('topic-id');
      assert(db.cache.delete.called);
    });
    it('ignores ping', function () {
      db._topicChanged('ping');
      assert(!db.cache.delete.called);
    });
  }); // _topicChanged

  describe('_listenerEstablished', function () {
    it('creates cache', function () {
      delete db.cache;
      db._listenerEstablished();
      assert(db.cache instanceof Map);
    });
  }); // _listenerEstablished

  describe('_listenerLost', function () {
    it('removes cache', function () {
      db.cache = new Map();
      db._listenerLost();
      assert(!db.cache);
    });
  }); // _listenerLost

  describe('_cacheGet', function () {
    let key;
    beforeEach(function () {
      key = 'key';
    });
    it('nothing if no cache', function () {
      delete db.cache;
      const result = db._cacheGet(key);
      assert.strictEqual(result, undefined);
    });
    it('nothing if no entry', function () {
      db.cache = new Map();
      const result = db._cacheGet(key);
      assert.strictEqual(result, undefined);
    });
    it('returns cached entry', function () {
      db.cache = new Map();
      const expected = {
        foo: 'bar',
      };
      db._cacheSet(key, expected);
      const result = db._cacheGet(key);
      assert.deepStrictEqual(result, expected);
    });
  }); // _cacheGet

  describe('_cacheSet', function () {
    let key;
    beforeEach(function () {
      key = 'key';
    });
    it('covers no cache', function () {
      delete db.cache;
      db._cacheSet(key, 'data');
    });
    it('covers cache', function () {
      db.cache = new Map();
      const expected = 'blah';
      db._cacheSet(key, expected);
      const result = db._cacheGet(key);
      assert.deepStrictEqual(result, expected);
    });
  }); // _cacheSet

  describe('context', function () {
    it('covers', async function () {
      await db.context(common.nop);
    });
  }); // context

  describe('transaction', function () {
    it('covers', async function () {
      await db.transaction(db.db, common.nop);
    });
  }); // transaction

  describe('authenticationSuccess', function () {
    let identifier;
    beforeEach(function () {
      identifier = 'username';
    });
    it('success', async function () {
      const dbResult = {
        rowCount: 1,
        rows: undefined,
        duration: 22,
      };
      sinon.stub(db.db, 'result').resolves(dbResult);
      await db.authenticationSuccess(dbCtx, identifier);
    });
    it('failure', async function() {
      const dbResult = {
        rowCount: 0,
        rows: undefined,
        duration: 22,
      };
      sinon.stub(db.db, 'result').resolves(dbResult);
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
    it('success', async function () {
      const dbResult = { identifier, credential };
      sinon.stub(db.db, 'oneOrNone').resolves(dbResult);
      const result = await db.authenticationGet(dbCtx, identifier);
      assert.deepStrictEqual(result, dbResult);
    });
    it('failure', async function() {
      const expected = new Error('blah');
      sinon.stub(db.db, 'oneOrNone').rejects(expected);
      try {
        await db.authenticationGet(dbCtx, identifier, credential);
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
    it('success', async function () {
      const dbResult = {
        rowCount: 1,
        rows: undefined,
        duration: 22,
      };
      sinon.stub(db.db, 'result').resolves(dbResult);
      await db.authenticationUpsert(dbCtx, identifier, credential);
    });
    it('failure', async function() {
      credential = undefined;
      const dbResult = {
        rowCount: 0,
        rows: undefined,
        duration: 22,
      };
      sinon.stub(db.db, 'result').resolves(dbResult);
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
      const expected = [];
      sinon.stub(db.db, 'manyOrNone').resolves(expected);
      const result = await db.subscriptionsByTopicId(dbCtx, topicUrl);
      assert.deepStrictEqual(result, expected);
    });
    it('failure', async function () {
      const expected = new Error();
      sinon.stub(db.db, 'manyOrNone').throws(expected);
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
      sinon.stub(db.db, 'one').resolves(expected);
      const result = await db.subscriptionCountByTopicUrl(dbCtx, topicUrl);
      assert.deepStrictEqual(result, expected);
    });
    it('failure', async function () {
      const expected = new Error();
      sinon.stub(db.db, 'one').throws(expected);
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
        rowCount: 1,
        rows: [ {} ],
        duration: 10,
      };
      const expected = {
        changes: 1,
        lastInsertRowid: undefined,
        duration: 10,
      };
      sinon.stub(db.db, 'result').resolves(dbResult);
      const result = await db.subscriptionDelete(dbCtx, callback, topicId);
      assert.deepStrictEqual(result, expected);
    });
    it('failure', async function () {
      const expected = new Error();
      sinon.stub(db.db, 'result').throws(expected);
      try {
        await db.subscriptionDelete(dbCtx, callback, topicId);
        assert.fail(noExpectedException);
      } catch (e) {
        assert.deepStrictEqual(e, expected);
      }
    });
  }); // subscriptionDelete

  describe('subscriptionDeleteExpired', function () {
    it('success', async function () {
      const dbResult = {
        rowCount: 1,
        rows: [],
        duration: 10,
      };
      const expected = {
        changes: 1,
        lastInsertRowid: undefined,
        duration: 10,
      };
      sinon.stub(db.db, 'result').resolves(dbResult);
      const result = await db.subscriptionDeleteExpired(dbCtx, topicId);
      assert.deepStrictEqual(result, expected);
    });
    it('failure', async function() {
      const expected = new Error();
      sinon.stub(db.db, 'result').rejects(expected);
      try {
        await db.subscriptionDeleteExpired(dbCtx, topicId);
        assert.fail(noExpectedException);
      } catch (e) {
        assert.deepStrictEqual(e, expected);
      }
    });
  });

  describe('subscriptionDeliveryClaim', function () {
    it('success', async function() {
      const dbResult = [
        {
          id: 'c2e254c5-aa6e-4a8f-b1a1-e474b07392bb',
        },
      ];
      const expected = ['c2e254c5-aa6e-4a8f-b1a1-e474b07392bb'];
      sinon.stub(db.db, 'manyOrNone').resolves(dbResult);
      const result = await db.subscriptionDeliveryClaim(dbCtx, wanted, claimTimeoutSeconds, claimant);
      assert.deepStrictEqual(result, expected);
    });
    it('failure', async function () {
      const expected = new Error();
      sinon.stub(db.db, 'manyOrNone').throws(expected);
      try {
        await db.subscriptionDeliveryClaim(dbCtx, wanted, claimTimeoutSeconds, claimant);
        assert.fail(noExpectedException);
      } catch (e) {
        assert.deepStrictEqual(e, expected);
      }
    });
  }); // subscriptionDeliveryClaim

  describe('subscriptionDeliveryClaimById', function () {
    it('success', async function() {
      const dbResult = {
        rowCount: 1,
        rows: [{ id: 'c2e254c5-aa6e-4a8f-b1a1-e474b07392bb' }],
        duration: 11,
      };
      const expected = {
        changes: 1,
        lastInsertRowid: 'c2e254c5-aa6e-4a8f-b1a1-e474b07392bb',
        duration: 11,
      };
      sinon.stub(db.db, 'result').resolves(dbResult);
      const result = await db.subscriptionDeliveryClaimById(dbCtx, subscriptionId, claimTimeoutSeconds, claimant);
      assert.deepStrictEqual(result, expected);
    });
    it('failure', async function () {
      const dbResult = {
        rowCount: 0,
        rows: undefined,
        duration: 11,
      };
      sinon.stub(db.db, 'result').resolves(dbResult);
      try {
        await db.subscriptionDeliveryClaimById(dbCtx, callback, topicId);
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
        rowCount: 1,
      };
      sinon.stub(db.db, 'result').resolves(dbResult);
      await db.subscriptionDeliveryComplete(dbCtx, callback, topicId, topicContentUpdated);
    });
    it('failure', async function () {
      const dbResult = {
        rowCount: 0,
      };
      sinon.stub(db.db, 'result').onCall(0).resolves(dbResult);
      try {
        await db.subscriptionDeliveryComplete(dbCtx, callback, topicId, topicContentUpdated);
        assert.fail(noExpectedException);
      } catch (e) {
        assert(e instanceof DBErrors.UnexpectedResult);
      }
    });
    it('second failure', async function () {
      const dbResult0 = {
        rowCount: 1,
      };
      const dbResult1 = {
        rowCount: 0,
      };
      sinon.stub(db.db, 'result').onCall(0).resolves(dbResult0).onCall(1).resolves(dbResult1);
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
        rowCount: 1,
      };
      sinon.stub(db.db, 'result').resolves(dbResult);
      await db.subscriptionDeliveryGone(dbCtx, callback, topicId);
    });
    it('failure', async function () {
      const dbResult = {
        rowCount: 0,
      };
      sinon.stub(db.db, 'result').resolves(dbResult);
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
      const dbOne = { deliveryAttemptsSinceSuccess: 0 };
      const dbResult = {
        rowCount: 1,
      };
      sinon.stub(db.db, 'one').resolves(dbOne);
      sinon.stub(db.db, 'result').resolves(dbResult);
      await db.subscriptionDeliveryIncomplete(dbCtx, callback, topicId, retryDelays);
    });
    it('success covers default', async function() {
      const dbOne = { deliveryAttemptsSinceSuccess: 0 };
      const dbResult = {
        rowCount: 1,
      };
      sinon.stub(db.db, 'one').resolves(dbOne);
      sinon.stub(db.db, 'result').resolves(dbResult);
      await db.subscriptionDeliveryIncomplete(dbCtx, callback, topicId);
    });
    it('failure', async function () {
      const dbOne = { deliveryAttemptsSinceSuccess: 0 };
      const dbResult = {
        rowCount: 0,
      };
      sinon.stub(db.db, 'one').resolves(dbOne);
      sinon.stub(db.db, 'result').resolves(dbResult);
      try {
        await db.subscriptionDeliveryIncomplete(dbCtx, callback, topicId, retryDelays);
        assert.fail(noExpectedException);
      } catch (e) {
        assert(e instanceof DBErrors.UnexpectedResult);
      }
    });
    it('second failure', async function () {
      const dbOne = { deliveryAttemptsSinceSuccess: 0 };
      const dbResult0 = {
        rowCount: 1,
      };
      const dbResult1 = {
        rowCount: 0,
      };
      sinon.stub(db.db, 'one').resolves(dbOne);
      sinon.stub(db.db, 'result').onCall(0).resolves(dbResult0).onCall(1).resolves(dbResult1);
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
      sinon.stub(db.db, 'oneOrNone').resolves(expected);
      const result = await db.subscriptionGet(dbCtx, callback, topicId);
      assert.deepStrictEqual(result, expected);
    });
    it('failure', async function () {
      const expected = new Error();
      sinon.stub(db.db, 'oneOrNone').throws(expected);
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
      sinon.stub(db.db, 'oneOrNone').resolves(expected);
      const result = await db.subscriptionGetById(dbCtx, subscriptionId);
      assert.deepStrictEqual(result, expected);
    });
    it('failure', async function () {
      const expected = new Error();
      sinon.stub(db.db, 'oneOrNone').throws(expected);
      try {
        await db.subscriptionGetById(dbCtx, subscriptionId);
        assert.fail(noExpectedException);
      } catch (e) {
        assert.deepStrictEqual(e, expected);
      }
    });
  }); // subscriptionGetById

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
        rowCount: 1,
        rows: [{ id: subscriptionId }],
        duration: 10,
      };
      const expected = {
        changes: 1,
        lastInsertRowid: subscriptionId,
        duration: 10,
      };
      sinon.stub(db.db, 'result').resolves(dbResult);
      const result = await db.subscriptionUpsert(dbCtx, data);
      assert.deepStrictEqual(result, expected);
    });
    it('failure', async function () {
      const dbResult = {
        rowCount: 0,
      };
      sinon.stub(db.db, 'result').resolves(dbResult);
      try {
        await db.subscriptionUpsert(dbCtx, data);
        assert.fail(noExpectedException);
      } catch (e) {
        assert(e instanceof DBErrors.UnexpectedResult);
      }
    });
  }); // subscriptionUpsert

  describe('subscriptionUpdate', function () {
    let data;
    beforeEach(function () {
      data = {
        signatureAlgorithm: 'sha256',
      };
    });
    it('success', async function() {
      const dbResult = {
        rowCount: 1,
        rows: [],
        duration: 10,
      };
      sinon.stub(db.db, 'result').resolves(dbResult);
      await db.subscriptionUpdate(dbCtx, data);
    });
    it('failure', async function () {
      const dbResult = {
        rowCount: 0,
      };
      sinon.stub(db.db, 'result').resolves(dbResult);
      try {
        await db.subscriptionUpdate(dbCtx, data);
        assert.fail(noExpectedException);
      } catch (e) {
        assert(e instanceof DBErrors.UnexpectedResult);
      }
    });
  }); // subscriptionUpdate

  describe('topicDeleted', function () {
    it('success', async function() {
      const dbResult = {
        rowCount: 1,
      };
      sinon.stub(db.db, 'result').resolves(dbResult);
      await db.topicDeleted(dbCtx, topicId);
    });
    it('failure', async function() {
      const dbResult = {
        rowCount: 0,
      };
      sinon.stub(db.db, 'result').resolves(dbResult);
      try {
        await db.topicDeleted(dbCtx, topicId);
        assert.fail(noExpectedException);
      } catch (e) {
        assert(e instanceof DBErrors.UnexpectedResult);
      }
    });
  }); // topicDeleted

  describe('topicFetchClaim', function () {
    it('success', async function() {
      const dbResult = [{ id: topicId }];
      const expected = [topicId];
      sinon.stub(db.db, 'manyOrNone').resolves(dbResult);
      const result = await db.topicFetchClaim(dbCtx, wanted, claimTimeoutSeconds, claimant);
      assert.deepStrictEqual(result, expected);
    });
    it('failure', async function () {
      const expected = new Error();
      sinon.stub(db.db, 'manyOrNone').throws(expected);
      try {
        await db.topicFetchClaim(dbCtx, wanted, claimTimeoutSeconds, claimant);
        assert.fail(noExpectedException);
      } catch (e) {
        assert.deepStrictEqual(e, expected);
      }
    });
  }); // topicFetchClaim

  describe('topicFetchClaimById', function () {
    it('success', async function() {
      const dbResult = {
        rowCount: 1,
        rows: [],
        duration: 10,
      };
      const expected = {
        changes: 1,
        lastInsertRowid: undefined,
        duration: 10,
      };
      sinon.stub(db.db, 'result').resolves(dbResult);
      const result = await db.topicFetchClaimById(dbCtx, topicId, claimTimeoutSeconds, claimant);
      assert.deepStrictEqual(result, expected);
    });
    it('failure', async function () {
      const expected = new Error();
      sinon.stub(db.db, 'result').throws(expected);
      try {
        await db.topicFetchClaimById(dbCtx, topicId, claimTimeoutSeconds, claimant);
        assert.fail(noExpectedException);
      } catch (e) {
        assert.deepStrictEqual(e, expected);
      }
    });
  }); // topicFetchClaimById

  describe('topicFetchComplete', function () {
    it('success', async function() {
      const dbResult = {
        rowCount: 1,
        rows: [],
        duration: 10,
      };
      sinon.stub(db.db, 'result').resolves(dbResult);
      await db.topicFetchComplete(dbCtx, topicId);
    });
    it('failure', async function () {
      const dbResult = {
        rowCount: 0,
        rows: [],
        duration: 10,
      };
      sinon.stub(db.db, 'result').resolves(dbResult);
      try {
        await db.topicFetchComplete(dbCtx, topicId);
        assert.fail(noExpectedException);
      } catch (e) {
        assert(e instanceof DBErrors.UnexpectedResult);
      }
    });
    it('second failure', async function () {
      const dbResult0 = {
        rowCount: 1,
        rows: [],
        duration: 10,
      };
      const dbResult1 = {
        rowCount: 0,
        rows: [],
        duration: 10,
      };
      sinon.stub(db.db, 'result').onCall(0).resolves(dbResult0).onCall(1).resolves(dbResult1);
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
      const dbOne = { currentAttempt: 0 };
      const dbResult0 = {
        rowCount: 1,
        rows: [],
        duration: 10,
      };
      const dbResult1 = {
        rowCount: 1,
        rows: [],
        duration: 10,
      };
      const expected = {
        changes: 1,
        lastInsertRowid: undefined,
        duration: 10,
      };
      sinon.stub(db.db, 'one').resolves(dbOne);
      sinon.stub(db.db, 'result').onCall(0).resolves(dbResult0).onCall(1).resolves(dbResult1);
      const result = await db.topicFetchIncomplete(dbCtx, topicId, retryDelays);
      assert.deepStrictEqual(result, expected);
    });
    it('covers defaults', async function() {
      const dbOne = { currentAttempt: 0 };
      const dbResult0 = {
        rowCount: 1,
        rows: [],
        duration: 10,
      };
      const dbResult1 = {
        rowCount: 1,
        rows: [],
        duration: 10,
      };
      const expected = {
        changes: 1,
        lastInsertRowid: undefined,
        duration: 10,
      };
      sinon.stub(db.db, 'one').resolves(dbOne);
      sinon.stub(db.db, 'result').onCall(0).resolves(dbResult0).onCall(1).resolves(dbResult1);
      const result = await db.topicFetchIncomplete(dbCtx, topicId);
      assert.deepStrictEqual(result, expected);
    });
    it('failure', async function () {
      const dbOne = { currentAttempt: 0 };
      const dbResult0 = {
        rowCount: 1,
        rows: [],
        duration: 10,
      };
      const dbResult1 = {
        rowCount: 0,
        rows: [],
        duration: 10,
      };
      sinon.stub(db.db, 'one').resolves(dbOne);
      sinon.stub(db.db, 'result').onCall(0).resolves(dbResult0).onCall(1).resolves(dbResult1);
      try {
        await db.topicFetchIncomplete(dbCtx, topicId, retryDelays);
        assert.fail(noExpectedException);
      } catch (e) {
        assert(e instanceof DBErrors.UnexpectedResult);
      }
    });
    it('second failure', async function () {
      const dbOne = { currentAttempt: 0 };
      const dbResult0 = {
        rowCount: 0,
        rows: [],
        duration: 10,
      };
      const dbResult1 = {
        rowCount: 0,
        rows: [],
        duration: 10,
      };
      sinon.stub(db.db, 'one').resolves(dbOne);
      sinon.stub(db.db, 'result').onCall(0).resolves(dbResult0).onCall(1).resolves(dbResult1);
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
        rowCount: 1,
        rows: [],
        duration: 10,
      };
      const expected = {
        changes: 1,
        lastInsertRowid: undefined,
        duration: 10,
      };
      sinon.stub(db.db, 'result').resolves(dbResult);
      const result = await db.topicFetchRequested(dbCtx, topicId);
      assert.deepStrictEqual(result, expected);
    });
    it('failure', async function () {
      const dbResult = {
        rowCount: 0,
        rows: [],
        duration: 10,
      };
      sinon.stub(db.db, 'result').resolves(dbResult);
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
      sinon.stub(db.db, 'manyOrNone').resolves(expected);
      const result = await db.topicGetAll(dbCtx);
      assert.deepStrictEqual(result, expected);
    });
    it('covers default', async function() {
      const expected = undefined;
      sinon.stub(db.db, 'manyOrNone').resolves(expected);
      const result = await db.topicGetAll(dbCtx);
      assert.deepStrictEqual(result, expected);
    });
    it('failure', async function () {
      const expected = new Error();
      sinon.stub(db.db, 'manyOrNone').throws(expected);
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
      sinon.stub(db.db, 'oneOrNone').resolves(expected);
      const result = await db.topicGetById(dbCtx, topicId);
      assert.deepStrictEqual(result, expected);
    });
    it('covers none', async function() {
      const expected = undefined;
      sinon.stub(db.db, 'oneOrNone').resolves(expected);
      const result = await db.topicGetById(dbCtx, topicId);
      assert.deepStrictEqual(result, expected);
    });
    it('covers no defaults', async function () {
      const expected = { id: topicId };
      sinon.stub(db.db, 'oneOrNone').resolves(expected);
      const result = await db.topicGetById(dbCtx, topicId, false);
      assert.deepStrictEqual(result, expected);
    });
    it('failure', async function () {
      const expected = new Error();
      sinon.stub(db.db, 'oneOrNone').throws(expected);
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
      sinon.stub(db.db, 'oneOrNone').resolves(expected);
      const result = await db.topicGetByUrl(dbCtx, topicUrl);
      assert.deepStrictEqual(result, expected);
    });
    it('failure', async function () {
      const expected = new Error();
      sinon.stub(db.db, 'oneOrNone').throws(expected);
      try {
        await db.topicGetByUrl(dbCtx, topicUrl);
        assert.fail(noExpectedException);
      } catch (e) {
        assert.deepStrictEqual(e, expected);
      }
    });
  }); // topicGetByUrl

  describe('topicGetContentById', function () {
    let topic;
    beforeEach(function () {
      delete db.cache;
      topic = {
        id: topicId,
      };
    });
    it('success', async function() {
      const expected = topic;
      sinon.stub(db.db, 'oneOrNone').resolves(expected);
      const result = await db.topicGetContentById(dbCtx, topicId);
      assert.deepStrictEqual(result, expected);
    });
    it('covers default', async function() {
      const expected = undefined;
      sinon.stub(db.db, 'oneOrNone').resolves(expected);
      const result = await db.topicGetContentById(dbCtx, topicId);
      assert.deepStrictEqual(result, expected);
    });
    it('failure', async function () {
      const expected = new Error();
      sinon.stub(db.db, 'oneOrNone').throws(expected);
      try {
        await db.topicGetContentById(dbCtx, topicId);
        assert.fail(noExpectedException);
      } catch (e) {
        assert.deepStrictEqual(e, expected);
      }
    });
    it('caches success', async function () {
      db.cache = new Map();
      const expected = topic;
      sinon.stub(db.db, 'oneOrNone').resolves(expected);
      const result = await db.topicGetContentById(dbCtx, topicId);
      assert.deepStrictEqual(result, expected);
    });
    it('covers cached entry', async function() {
      let result;
      db.cache = new Map();
      const expected = topic;
      sinon.stub(db.db, 'oneOrNone').resolves(expected);
      result = await db.topicGetContentById(dbCtx, topicId);
      assert.deepStrictEqual(result, expected);
      result = await db.topicGetContentById(dbCtx, topicId);
      assert.deepStrictEqual(result, expected);
    });
  }); // topicGetContentById

  describe('topicPendingDelete', function () {
    beforeEach(function () {
      sinon.stub(db.db, 'one');
      sinon.stub(db.db, 'result');
    });
    it('success', async function () {
      db.db.one.onCall(0).resolves({
        id: topicId,
        isDeleted: true,
      }).onCall(1).resolves({
        count: 0,
      });
      const dbResult = {
        rowCount: 1,
        rows: [],
        duration: 10,
      };
      db.db.result.resolves(dbResult);
      await db.topicPendingDelete(dbCtx, topicId);
      assert(db.db.result.called);
    });
    it('does not delete non-deleted topic', async function () {
      db.db.one.onCall(0).resolves({
        id: topicId,
        isDeleted: false,
      }).onCall(1).resolves({
        count: 0,
      });
      await db.topicPendingDelete(dbCtx, topicId);
      assert(!db.db.result.called);
    });
    it('does not delete topic with active subscriptions', async function () {
      db.db.one.onCall(0).resolves({
        id: topicId,
        isDeleted: true,
      }).onCall(1).resolves({
        count: 10,
      });
      await db.topicPendingDelete(dbCtx, topicId);
      assert(!db.db.result.called);
    });
    it('covers no deletion', async function () {
      db.db.one.onCall(0).resolves({
        id: topicId,
        isDeleted: true,
      }).onCall(1).resolves({
        count: 0,
      });
      const dbResult = {
        rowCount: 0,
        rows: [],
        duration: 10,
      };
      db.db.result.resolves(dbResult);
      try {
        await db.topicPendingDelete(dbCtx, topicId);
        assert.fail(noExpectedException);
      } catch (e) {
        assert(e instanceof DBErrors.UnexpectedResult);
      }
    });
  });

  describe('topicPublishHistory', function () {
    beforeEach(function () {
      sinon.stub(db.db, 'manyOrNone');
    });
    it('success', async function () {
      db.db.manyOrNone.returns([
        { daysAgo: 1, contentUpdates: 1 },
        { daysAgo: 3, contentUpdates: 2 },
      ]);
      const result = await db.topicPublishHistory(dbCtx, topicId, 7);
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
        rowCount: 1,
        rows: [{ id: topicId }],
        duration: 10,
      };
      const expected = {
        changes: 1,
        lastInsertRowid: topicId,
        duration: 10,
      };
      sinon.stub(db.db, 'result').resolves(dbResult);
      const result = await db.topicSet(dbCtx, data);
      assert.deepStrictEqual(result, expected);
    });
    it('failure', async function () {
      const dbResult = {
        rowCount: 0,
        rows: [],
        duration: 10,
      };
      sinon.stub(db.db, 'result').resolves(dbResult);
      try {
        await db.topicSet(dbCtx, data);
        assert.fail(noExpectedException);
      } catch (e) {
        assert(e instanceof DBErrors.UnexpectedResult);
      }
    });
    it('fails invalid value', async function () {
      sinon.stub(db.db, 'result');
      try {
        data.leaseSecondsPreferred = -100;
        await db.topicSet(dbCtx, data);
        assert.fail(noExpectedException);
      } catch (e) {
        assert(e instanceof DBErrors.DataValidation);
      }
      assert(!db.db.result.called);
    });
    it('fails invalid values', async function () {
      sinon.stub(db.db, 'result');
      try {
        data.leaseSecondsPreferred = 10;
        data.leaseSecondsMax = 100;
        data.leaseSecondsMin = 50;
        await db.topicSet(dbCtx, data);
        assert.fail(noExpectedException);
      } catch (e) {
        assert(e instanceof DBErrors.DataValidation);
      }
      assert(!db.db.result.called);
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
      sinon.stub(db.db, 'result');
    });
    it('success', async function() {
      const dbResult = {
        rowCount: 1,
        rows: [],
        duration: 10,
      };
      const expected = {
        changes: 1,
        lastInsertRowid: undefined,
        duration: 10,
      };
      db.db.result.resolves(dbResult);
      const result = await db.topicSetContent(dbCtx, data);
      assert.deepStrictEqual(result, expected);
    });
    it('failure', async function () {
      const dbResult = {
        rowCount: 0,
        rows: [],
        duration: 10,
      };
      db.db.result.resolves(dbResult);
      try {
        await db.topicSetContent(dbCtx, data);
        assert.fail(noExpectedException);
      } catch (e) {
        assert(e instanceof DBErrors.UnexpectedResult);
      }
    });
    it('failure 2', async function () {
      const dbResultSuccess = {
        rowCount: 1,
        rows: [],
        duration: 10,
      };
      const dbResultFail = {
        rowCount: 0,
        rows: [],
        duration: 10,
      };
      db.db.result
        .onCall(0).resolves(dbResultSuccess)
        .onCall(1).resolves(dbResultFail);
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
        leaseSecondsPreferred: 123,
        leaseSecondsMin: 100,
        leaseSecondsMax: 1000,
        publisherValidationUrl: null,
        contentHashAlgorithm: 'sha256',
      };
    });
    it('success', async function() {
      const dbResult = {
        rowCount: 1,
        rows: [],
        duration: 10,
      };
      sinon.stub(db.db, 'result').resolves(dbResult);
      await db.topicUpdate(dbCtx, data);
    });
    it('failure', async function () {
      const dbResult = {
        rowCount: 0,
        rows: [],
        duration: 10,
      };
      sinon.stub(db.db, 'result').resolves(dbResult);
      try {
        await db.topicUpdate(dbCtx, data);
        assert.fail(noExpectedException);
      } catch (e) {
        assert(e instanceof DBErrors.UnexpectedResult);
      }
    });

  }); // topicUpdate

  describe('verificationClaim', function () {
    it('success', async function() {
      const dbManyOrNone = [{ id: verificationId }];
      const expected = [verificationId];
      sinon.stub(db.db, 'manyOrNone').resolves(dbManyOrNone);
      const result = await db.verificationClaim(dbCtx, wanted, claimTimeoutSeconds, claimant);
      assert.deepStrictEqual(result, expected);
    });
    it('failure', async function () {
      const expected = new Error();
      sinon.stub(db.db, 'manyOrNone').throws(expected);
      try {
        await db.verificationClaim(dbCtx, wanted, claimTimeoutSeconds, claimant);
        assert.fail(noExpectedException);
      } catch (e) {
        assert.deepStrictEqual(e, expected);
      }
    });
  }); // verificationClaim

  describe('verificationClaimById', function () {
    it('success', async function() {
      const dbResult = {
        rowCount: 1,
        rows: [ { id: verificationId } ],
        duration: 10,
      };
      const expected = {
        changes: 1,
        lastInsertRowid: verificationId,
        duration: 10,
      };
      sinon.stub(db.db, 'result').resolves(dbResult);
      const result = await db.verificationClaimById(dbCtx, verificationId, claimTimeoutSeconds, claimant);
      assert.deepStrictEqual(result, expected);
    });
    it('failure', async function () {
      const expected = new Error();
      sinon.stub(db.db, 'result').throws(expected);
      try {
        await db.verificationClaimById(dbCtx, verificationId, claimTimeoutSeconds, claimant);
        assert.fail(noExpectedException);
      } catch (e) {
        assert.deepStrictEqual(e, expected);
      }
    });
  }); // verificationClaimById

  describe('verificationComplete', function () {
    it('success', async function() {
      const dbResult = {
        rowCount: 1,
        rows: [],
        duration: 10,
      };
      sinon.stub(db.db, 'result').resolves(dbResult);
      await db.verificationComplete(dbCtx, verificationId, callback, topicId);
    });
    it('failure', async function () {
      const dbResult = {
        rowCount: 0,
        rows: [],
        duration: 10,
      };
      sinon.stub(db.db, 'result').resolves(dbResult);
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
      const dbOneOrNone = { id: verificationId };
      const expected = { id: verificationId };
      sinon.stub(db.db, 'oneOrNone').resolves(dbOneOrNone);
      const result = await db.verificationGetById(dbCtx, verificationId);
      assert.deepStrictEqual(result, expected);
    });
    it('failure', async function () {
      const expected = new Error();
      sinon.stub(db.db, 'oneOrNone').throws(expected);
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
        rowCount: 1,
        rows: [],
        duration: 10,
      };
      const dbResult1 = {
        rowCount: 1,
        rows: [],
        duration: 10,
      };
      sinon.stub(db.db, 'one').resolves(dbOne);
      sinon.stub(db.db, 'result').onCall(0).resolves(dbResult0).onCall(1).resolves(dbResult1);
      await db.verificationIncomplete(dbCtx, verificationId, retryDelays);
    });
    it('covers defaults', async function() {
      const dbOne = { attempts: 0 };
      const dbResult0 = {
        rowCount: 1,
        rows: [],
        duration: 10,
      };
      const dbResult1 = {
        rowCount: 1,
        rows: [],
        duration: 10,
      };
      sinon.stub(db.db, 'one').resolves(dbOne);
      sinon.stub(db.db, 'result').onCall(0).resolves(dbResult0).onCall(1).resolves(dbResult1);
      await db.verificationIncomplete(dbCtx, verificationId);
    });
    it('failure', async function () {
      const dbOne = { attempts: 0 };
      const dbResult0 = {
        rowCount: 0,
        rows: [],
        duration: 10,
      };
      const dbResult1 = {
        rowCount: 1,
        rows: [],
        duration: 10,
      };
      sinon.stub(db.db, 'one').resolves(dbOne);
      sinon.stub(db.db, 'result').onCall(0).resolves(dbResult0).onCall(1).resolves(dbResult1);
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
        rowCount: 1,
        rows: [],
        duration: 10,
      };
      const dbResult1 = {
        rowCount: 0,
        rows: [],
        duration: 10,
      };
      sinon.stub(db.db, 'one').resolves(dbOne);
      sinon.stub(db.db, 'result').onCall(0).resolves(dbResult0).onCall(1).resolves(dbResult1);
      try {
        await db.verificationIncomplete(dbCtx, verificationId, retryDelays);
        assert.fail(noExpectedException);
      } catch (e) {
        assert(e instanceof DBErrors.UnexpectedResult);
      }
    });
  }); // verificationIncomplete

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
        rowCount: 1,
        rows: [{ id: verificationId }],
        duration: 10,
      };
      const expected = verificationId;
      sinon.stub(db.db, 'result').resolves(dbResult);
      const result = await db.verificationInsert(dbCtx, verification);
      assert.deepStrictEqual(result, expected);
    });
    it('failure', async function () {
      const dbResult = {
        rowCount: 0,
        rows: [],
        duration: 10,
      };
      sinon.stub(db.db, 'result').resolves(dbResult);
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
        rowCount: 1,
        rows: [],
        duration: 10,
      };
      sinon.stub(db.db, 'result').resolves(dbResult);
      await db.verificationRelease(dbCtx, verificationId);
    });
    it('failure', async function () {
      const dbResult = {
        rowCount: 0,
        rows: [],
        duration: 10,
      };
      sinon.stub(db.db, 'result').resolves(dbResult);
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
        rowCount: 1,
        rows: [],
        duration: 10,
      };
      sinon.stub(db.db, 'result').resolves(dbResult);
      await db.verificationUpdate(dbCtx, verificationId, data);
    });
    it('failure', async function () {
      const dbResult = {
        rowCount: 0,
        rows: [],
        duration: 10,
      };
      sinon.stub(db.db, 'result').resolves(dbResult);
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
        await db.verificationUpdate(dbCtx, verificationId, data);
        assert.fail(noExpectedException);
      } catch (e) {
        assert(e instanceof DBErrors.DataValidation);
      }
    });
  }); // verificationUpdate

  describe('verificationValidated', function () {
    it('success', async function() {
      const dbResult = {
        rowCount: 1,
        rows: [],
        duration: 10,
      };
      sinon.stub(db.db, 'result').resolves(dbResult);
      await db.verificationValidated(dbCtx, verificationId);
    });
    it('failure', async function () {
      const dbResult = {
        rowCount: 0,
        rows: [],
        duration: 10,
      };
      sinon.stub(db.db, 'result').resolves(dbResult);
      try {
        await db.verificationValidated(dbCtx, verificationId);
        assert.fail(noExpectedException);
      } catch (e) {
        assert(e instanceof DBErrors.UnexpectedResult);
      }
    });
  }); // verificationValidated

}); // DatabasePostgres
