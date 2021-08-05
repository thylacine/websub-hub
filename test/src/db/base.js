/* eslint-env mocha */
'use strict';

const assert = require('assert');
const sinon = require('sinon'); // eslint-disable-line node/no-unpublished-require

const stubDB = require('../../stub-db');
const stubLogger = require('../../stub-logger');
const DB = require('../../../src/db/base');
const DBErrors = require('../../../src/db/errors');

describe('DatabaseBase', function () {
  let db;
  beforeEach(function () {
    db = new DB(stubLogger);
  });
  afterEach(function () {
    sinon.restore();
  });
  
  it('covers no options', function () {
    db = new DB();
  });

  describe('Interface', function () {
    it('covers abstract methods', async function () {
      await Promise.all(stubDB._implementation.map(async (m) => {
        try {
          // eslint-disable-next-line security/detect-object-injection
          await db[m]();
          assert.fail(`${m}: did not catch NotImplemented exception`);
        } catch (e) {
          assert(e instanceof DBErrors.NotImplemented, `${m}: unexpected exception ${e.name}`);
        }
      }));
    }); // covers abstract methods
    it('covers private abstract methods', async function () {
      [
        '_engineInfo',
      ].map((m) => {
        try {
          // eslint-disable-next-line security/detect-object-injection
          db[m]();
        } catch (e) {
          assert(e instanceof DBErrors.NotImplemented, `${m}: unexpected exception ${e.name}`);
        }
      });
    });
  }); // Interface

  describe('_camelfy', function () {
    it('empty arg', function () {
      const result = DB._camelfy();
      assert.strictEqual(result, undefined);
    });
    it('no change', function () {
      const str = 'camelCase';
      const result = DB._camelfy(str);
      assert.strictEqual(result, str);
    });
    it('does expected', function () {
      const str = 'snake_case_thing';
      const result = DB._camelfy(str);
      assert.strictEqual(result, 'snakeCaseThing');
    });
  }); // _camelfy

  describe('_ensureTypes', function () {
    let object;
    beforeEach(function () {
      object = {
        num: 123,
        bignum: BigInt(456),
        str: 'some words',
        veryNull: null,
        obj: {},
        buf: Buffer.from('foop'),
      };
    });
    it('succeeds', function () {
      db._ensureTypes(object, ['num', 'bignum'], ['number']);
      db._ensureTypes(object, ['str', 'veryNull'], ['string', 'null']);
      db._ensureTypes(object, ['buf'], ['buffer']);
    });
    it('data failure', function () {
      try {
        db._ensureTypes(object, ['missingField'], ['string', 'null']);
        assert.fail('validation should have failed');
      } catch (e) {
        assert(e instanceof DBErrors.DataValidation);
      }
    });
    it('failure covers singular', function () {
      try {
        db._ensureTypes(object, ['missingField'], ['string']);
        assert.fail('validation should have failed');
      } catch (e) {
        assert(e instanceof DBErrors.DataValidation);
      }
    });
    it('parameter failure', function () {
      try {
        db._ensureTypes(object, ['missingField'], undefined);
        assert.fail('validation should have failed');
      } catch (e) {
        assert(e instanceof DBErrors.DataValidation);
      }
    });
  }); // _ensureTypes

  describe('initialize', function () {
    let currentSchema;
    beforeEach(function () {
      currentSchema = {
        major: 1,
        minor: 0,
        patch: 0,
      };
      db.schemaVersionsSupported = {
        min: { ...currentSchema },
        max: { ...currentSchema },
      };
      sinon.stub(db, '_currentSchema').resolves(currentSchema);
    });
    it('covers success', async function () {
      await db.initialize();
    });
    it('covers failure', async function() {
      db.schemaVersionsSupported = {
        min: {
          major: 3,
          minor: 2,
          patch: 1,
        },
        max: {
          major: 5,
          minor: 0,
          patch: 0,
        },
      };
      try {
        await db.initialize();
        assert.fail('did not get expected exception');
      } catch (e) {
        assert(e instanceof DBErrors.MigrationNeeded);
      }
    });
  }); // initialize

  describe('_topicDefaults', function () {
    let topic;
    beforeEach(function () {
      topic = {};
    });
    it('covers', function () {
      db._topicDefaults(topic);
      assert.strictEqual(topic.leaseSecondsPreferred, db.topicLeaseDefaults.leaseSecondsPreferred);
    });
    it('covers empty', function () {
      db._topicDefaults();
    });
  }); // _topicDefaults

  describe('_topicSetDataValidate', function () {
    let data;
    beforeEach(function () {
      data = {
        url: 'https://example.com/',

      };
    });
    it('covers success', function () {
      db._topicSetDataValidate(data);
    });
    it('covers invalid value', function () {
     data.leaseSecondsPreferred = -100;
     try {
       db._topicSetDataValidate(data);
       assert.fail('did not get expected exception');
     } catch (e) {
       assert(e instanceof DBErrors.DataValidation);
     }
    });
    it('covers invalid range', function () {
      data.leaseSecondsPreferred = 10000;
      data.leaseSecondsMax = 1000;
      try {
        db._topicSetDataValidate(data);
        assert.fail('did not get expected exception');
      } catch (e) {
        assert(e instanceof DBErrors.DataValidation);
      }
    });
  }); // _topicSetDataValidation

  describe('_topicSetContentDataValidate', function () {
    it('covers', function () {
      db._topicSetContentDataValidate({
        content: Buffer.from('foo'),
        contentHash: '123',
      });
    });
  }); // _topicSetContentDataValidate

  describe('_topicUpdateDataValidate', function () {
    it('succeeds', function () {
      db._topicUpdateDataValidate({
        leaseSecondsPreferred: 123,
        leaseSecondsMin: 100,
        leaseSecondsMax: 1000,
        publisherValidationUrl: 'https://example.com/pub/',
        contentHashAlgorithm: 'sha256',
      });
    });
    it('covers no url', function () {
      db._topicUpdateDataValidate({
        leaseSecondsPreferred: 123,
        leaseSecondsMin: 100,
        leaseSecondsMax: 1000,
        contentHashAlgorithm: 'sha256',
      });
    });
    it('rejects invalid url', function () {
      try {
        db._topicUpdateDataValidate({
          leaseSecondsPreferred: 123,
          leaseSecondsMin: 100,
          leaseSecondsMax: 1000,
          publisherValidationUrl: 'flarbl',
          contentHashAlgorithm: 'sha256',
        });
        assert.fail('did not get expected exception');
      } catch (e) {
        assert(e instanceof DBErrors.DataValidation);
      }
    });
    it('rejects invalid algorithm', function () {
      try {
        db._topicUpdateDataValidate({
          leaseSecondsPreferred: 123,
          leaseSecondsMin: 100,
          leaseSecondsMax: 1000,
          publisherValidationUrl: 'https://example.com/pub/',
          contentHashAlgorithm: 'md6',
        });
        assert.fail('did not get expected exception');
      } catch (e) {
        assert(e instanceof DBErrors.DataValidation);
      }
    });
  }); // _topicUpdateDataValidate

  describe('_verificationDataValidate', function () {
    it('covers', function () {
      db._verificationDataValidate({
        topicId: 'b9ede5aa-e595-11eb-b30f-0025905f714a',
        callback: 'https://example.com/cb',
        mode: 'subscribe',
        leaseSeconds: 123,
        isPublisherValidated: true,
      });
    });
  }); // _verificationDataValidate

  describe('_subscriptionUpsertDataValidate', function () {
    it('covers', function () {
      db._subscriptionUpsertDataValidate({
        topicId: 'b9ede5aa-e595-11eb-b30f-0025905f714a',
        callback: 'https://example.com/cb',
        leaseSeconds: 123,
      });
    });
  }); // _subscriptionUpsertDataValidate

  describe('_subscriptionUpdateDataValidate', function () {
    it('succeeds', function () {
      db._subscriptionUpdateDataValidate({
        signatureAlgorithm: 'sha256',
      });
    });
    it('rejects invalid', function () {
      try {
        db._subscriptionUpdateDataValidate({
          signatureAlgorithm: 'md5',
        });
        assert.fail('did not get expected exception');
      } catch (e) {
        assert(e instanceof DBErrors.DataValidation);
      }
    });
  }); // _subscriptionUpdateDataValidate

  describe('_verificationUpdateDataValidate', function () {
    it('covers', function () {
      db._verificationUpdateDataValidate({
        verificationId: 'b9ede5aa-e595-11eb-b30f-0025905f714a',
        mode: 'denied',
        isPublisherValidated: true,
      });
    });
  }); // _verificationUpdateDataValidate

}); // DatabaseBase
