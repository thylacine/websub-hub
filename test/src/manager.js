'use strict';

const assert = require('node:assert');
const sinon = require('sinon');

const Manager = require('../../src/manager');
const Config = require('../../config');
const common = require('../../src/common');
const Errors = require('../../src/errors');
const DBErrors = require('../../src/db/errors');

const stubDb = require('../stub-db');
const stubLogger = require('../stub-logger');
const testData = require('../test-data/manager');

const noExpectedException = 'did not get expected exception';

describe('Manager', function () {
  let manager, options;
  let req, res, ctx;

  beforeEach(function () {
    options = new Config('test');
    req = {
      getHeader : sinon.stub(),
    };
    res = {
      end: sinon.stub(),
      setHeader: sinon.stub(),
    };
    ctx = {
      params: {},
      queryParams: {},
    };
    manager = new Manager(stubLogger, stubDb, options);
    sinon.stub(manager.communication, 'verificationProcess');
    sinon.stub(manager.communication, 'topicFetchProcess');
    sinon.stub(manager.communication, 'topicFetchClaimAndProcessById');
    stubDb._reset();
    stubLogger._reset();
  });
  afterEach(function () {
    sinon.restore();
  });

  it('instantiates', function () {
    assert(manager);
  });

  describe('getRoot', function () {
    beforeEach(function () {
      sinon.stub(common, 'isClientCached');
      req = {};
    });
    it('normal response', async function () {
      common.isClientCached.returns(false);
      await manager.getRoot(req, res, ctx);
      assert(res.end.called);
    });
  }); // getRoot

  describe('getHealthcheck', function () {
    it('normal response', async function () {
      await manager.getHealthcheck(res, ctx);
      assert(res.end.called);
    });
  }); // getById

  describe('getInfo', function () {
    it('requires query param', async function() {
      ctx.queryParams = {};
      try {
        await manager.getInfo(res, ctx);
        assert.fail(noExpectedException);
      } catch (e) {
        assert.strictEqual(e.statusCode, 400);
      }
    });
    it('requires parsable query param', async function() {
      ctx.queryParams = { topic: 'not a url' };
      try {
        await manager.getInfo(res, ctx);
        assert.fail(noExpectedException);
      } catch (e) {
        assert.strictEqual(e.statusCode, 400);
      }
    });
    it('does not find unhandled topic', async function() {
      ctx.queryParams = { topic: 'https://example.com/blog/' };
      try {
        await manager.getInfo(res, ctx);
        assert.fail(noExpectedException);
      } catch (e) {
        assert.strictEqual(e.statusCode, 404);
      }
    });
    it('returns a count', async function() {
      manager.db.subscriptionCountByTopicUrl.resolves({ count: 4 });
      ctx.queryParams = {
        topic: 'https://example.com/blog/',
      };
      await manager.getInfo(res, ctx);
      assert(res.end.called);
    });
    it('returns a count as json', async function() {
      manager.db.subscriptionCountByTopicUrl.resolves({ count: 4 });
      ctx.responseType = 'application/json';
      ctx.queryParams = {
        topic: 'https://example.com/blog/',
      };
      await manager.getInfo(res, ctx);
      assert(res.end.called);
    });
    it('returns a count as json as override format', async function() {
      manager.db.subscriptionCountByTopicUrl.resolves({ count: 4 });
      ctx.responseType = 'text/html';
      ctx.queryParams = {
        topic: 'https://example.com/blog/',
        format: 'json',
      };
      await manager.getInfo(res, ctx);
      assert(res.end.called);
      assert(res.setHeader.called);
    });
    it('returns an svg badge as override format', async function() {
      manager.db.subscriptionCountByTopicUrl.resolves({ count: 4 });
      ctx.responseType = 'text/html';
      ctx.queryParams = {
        topic: 'https://example.com/blog/',
        format: 'svg',
      };
      await manager.getInfo(res, ctx);
      assert(res.end.called);
      assert(res.setHeader.called);
    });
  }); // getInfo

  describe('_historyBarCaption', function () {
    it('covers today, none', function () {
      const result = Manager._historyBarCaption(0, 0);
      assert.strictEqual(result, 'today, no updates');
    });
    it('covers yesterday, singular', function () {
      const result = Manager._historyBarCaption(1, 1);
      assert.strictEqual(result, 'yesterday, 1 update');
    });
    it('covers older, plural', function () {
      const result = Manager._historyBarCaption(7, 3);
      assert.strictEqual(result, '7 days ago, 3 updates');
    });
  }); // _historyBarCaption

  describe('getHistorySVG', function () {
    beforeEach(function () {
      manager.db.topicPublishHistory.resolves([0, 1, 2, 1, 0, 1, 2, 0, 1]);
    });
    it('covers', async function () {
      await manager.getHistorySVG(res, ctx);
      assert(res.end.called);
    });
  }); // getHistorySVG

  describe('getAdminOverview', function () {
    beforeEach(function () {
      manager.db.topicGetAll.resolves([
        {
          id: '56c557ce-e667-11eb-bd80-0025905f714a',
          created: new Date(),
          url: 'https://example.com/',
          leaseSecondsPreferred: 123,
          leaseSecondsMin: 12,
          leaseSecondsMax: 123456789,
          publisherValidationUrl: null,
          contentHashAlgorithm: 'hashy',
          isActive: true,
          isDeleted: false,
          lastPublish: new Date(-Infinity),
          contentFetchNextAttempt: undefined,
          contentFetchAttemptsSinceSuccess: 3,
          contentUpdated: new Date(0),
          contentHash: 'abc',
          contentType: 'foo',
          subscribers: 12,
        },
      ]);
    });
    it('covers', async function () {
      await manager.getAdminOverview(res, ctx);
      assert(res.end.called);
    });
    it('covers non-matching profile', async function () {
      ctx.session = {
        authenticatedProfile: 'https://different.example.com/profile',
      };
      await manager.getAdminOverview(res, ctx);
      assert.deepStrictEqual(ctx.topics, []);
      assert(res.end.called);
    });
  }); // getAdminOverview

  describe('getTopicDetails', function () {
    beforeEach(function () {
      ctx.params.topicId = '56c557ce-e667-11eb-bd80-0025905f714a';
      manager.db.topicGetById.resolves({
        id: '56c557ce-e667-11eb-bd80-0025905f714a',
        created: new Date(),
        url: 'https://example.com/topic',
        leaseSecondsPreferred: 123,
        leaseSecondsMin: 12,
        leaseSecondsMax: 123456789,
        publisherValidationUrl: null,
        contentHashAlgorithm: 'hashy',
        isActive: true,
        isDeleted: false,
        lastPublish: new Date(-Infinity),
        contentFetchNextAttempt: undefined,
        contentFetchAttemptsSinceSuccess: 3,
        contentUpdated: new Date(0),
        contentHash: 'abc',
        contentType: 'foo',
        subscribers: 12,
      });
      manager.db.subscriptionsByTopicId.resolves([{
        id: '',
        created: new Date(),
        topicId: '56c557ce-e667-11eb-bd80-0025905f714a',
        callback: '',
        verified: new Date(),
        expires: new Date(),
        secret: '',
        signatureAlgorithm: 'hmacy',
        httpRemoteAddr: '',
        httpFrom: '',
        contentDelivered: new Date(),
        deliveryAttemptsSinceSuccess: 0,
        deliveryNextAttempt: new Date(-Infinity),
      }]);
      manager.db.topicPublishHistory.resolves([0, 1, 0, 1, 0]);
    });
    it('covers', async function() {
      await manager.getTopicDetails(res, ctx);
      assert(res.end.called);
    });
    it('covers non-matching profile', async function () {
      ctx.session = {
        authenticatedProfile: 'https://different.example.com/profile',
      };
      await manager.getTopicDetails(res, ctx);
      assert.strictEqual(ctx.topic, null);
      assert(res.end.called);
    });
    it('covers matching profile', async function () {
      ctx.session = {
        authenticatedProfile: 'https://example.com/',
      };
      await manager.getTopicDetails(res, ctx);
      assert(ctx.topic);
      assert(res.end.called);
    });
  }); // getTopicDetails

  describe('postRoot', function () {
    let origProcessImmediately;
    beforeEach(function () {
      origProcessImmediately = manager.options.manager.processImmediately;
      ctx.parsedBody = {};
    });
    this.afterEach(function () {
      manager.options.manager.processImmediately = origProcessImmediately;
    });
    it('requires parameters', async function () {
      try {
        await manager.postRoot(req, res, ctx);
        assert.fail(noExpectedException);
      } catch (e) {
        assert.strictEqual(e.message, 'Bad Request');
      }
    });
    it('accepts valid subscription', async function () {
      ctx = Object.assign({}, testData.validSubscribeCtx);
      manager.db.topicGetByUrl.resolves({
        id: 111,
      });
      manager.db.verificationInsert.resolves({
        changes: 1,
        lastInsertRowid: undefined,
        duration: 12,
      });
      await manager.postRoot(req, res, ctx);
      assert(manager.db.verificationInsert.called);
      assert(res.end.called);
    });
    it('accepts valid subscription without claiming work', async function () {
      manager.options.manager.processImmediately = false;
      ctx = Object.assign({}, testData.validSubscribeCtx);
      manager.db.topicGetByUrl.resolves({
        id: 111,
      });
      manager.db.verificationInsert.resolves({
        changes: 1,
        lastInsertRowid: undefined,
        duration: 12,
      });
      await manager.postRoot(req, res, ctx);
      assert(manager.db.verificationInsert.called);
      assert(!manager.communication.verificationProcess.called);
      assert(res.end.called);
    });
    it('accepts valid subscription, covers processVerification failure', async function () {
      ctx = Object.assign({}, testData.validSubscribeCtx);
      manager.communication.verificationProcess.rejects('failed');
      manager.db.topicGetByUrl.resolves({
        id: 111,
      });
      manager.db.verificationInsert.resolves({
        changes: 1,
        lastInsertRowid: undefined,
        duration: 12,
      });
      await manager.postRoot(req, res, ctx);
      assert(manager.db.verificationInsert.called);
      assert(res.end.called);
      assert(manager.logger.error.called);
    });
    it('covers db.verificationInsert failure', async function () {
      const expectedException = new Error('failure');
      ctx = Object.assign({}, testData.validSubscribeCtx);
      manager.db.topicGetByUrl.resolves({
        id: 111,
      });
      manager.db.verificationInsert.rejects(expectedException);
      assert.rejects(async () => {
        await manager.postRoot(req, res, ctx);
      }, expectedException);
    });
    it('accepts valid unsubscription', async function () {
      ctx = Object.assign({}, testData.validUnsubscribeCtx);
      manager.db.topicGetByUrl.resolves({
        id: 111,
      });
      manager.db.subscriptionGet.resolves({
        id: 22,
      });
      manager.db.verificationInsert.resolves({
        changes: 1,
        lastInsertRowid: undefined,
        duration: 12,
      });
      await manager.postRoot(req, res, ctx);
      assert(res.end.called);
    });
    it('accepts valid publish', async function () {
      ctx = Object.assign({}, testData.validPublishCtx);
      manager.db.topicGetByUrl.resolves({
        id: 111,
      });
      manager.db.topicFetchRequested.resolves({
        changes: 1,
        lastInsertRowid: undefined,
        duration: 12,
      });
      await manager.postRoot(req, res, ctx);
      assert(res.end.called);
    });
  }); // postRoot

  describe('_profileControlsTopic', function () {
    let profileUrlObj, topicUrlObj;
    it('allows exact match', function () {
      profileUrlObj = new URL('https://profile.example.com/');
      topicUrlObj = new URL('https://profile.example.com/');
      const result = Manager._profileControlsTopic(profileUrlObj, topicUrlObj);
      assert.strictEqual(result, true);
    });
    it('allows descendent-path match', function () {
      profileUrlObj = new URL('https://profile.example.com/');
      topicUrlObj = new URL('https://profile.example.com/feed/atom');
      const result = Manager._profileControlsTopic(profileUrlObj, topicUrlObj);
      assert.strictEqual(result, true);
    });
    it('disallows non-descendent-path', function () {
      profileUrlObj = new URL('https://profile.example.com/itsame');
      topicUrlObj = new URL('https://profile.example.com/');
      const result = Manager._profileControlsTopic(profileUrlObj, topicUrlObj);
      assert.strictEqual(result, false);
    });
    it('disallows non-matched host', function () {
      profileUrlObj = new URL('https://profile.example.com/itsame');
      topicUrlObj = new URL('https://elsewhere.example.com/itsame/feed');
      const result = Manager._profileControlsTopic(profileUrlObj, topicUrlObj);
      assert.strictEqual(result, false);
    });
  }); // _profileControlsTopic

  describe('_getRootData', function () {
    it('extracts expected values', function () {
      req.getHeader.returns('user@example.com');
      ctx = Object.assign({}, testData.validSubscribeCtx);
      const result = Manager._getRootData(req, ctx);
      assert.deepStrictEqual(result, testData.validRootData);
    });
  }); // _getRootData

  describe('_validateRootData', function () {
    // This only wraps the other _check functions, not bothering with coverage.
  }); // _validateRootData

  describe('_checkTopic', function () {
    let dbCtx, data, warn, err;
    const topic = {
      id: 111,
      leaseSecondsPreferred: 86400 * 10,
      leaseSecondsMax: 86400 * 20,
      leaseSecondsMin: 86400,
    };
    beforeEach(function () {
      dbCtx = {};
      data = {};
      warn = [];
      err = [];
    });
    it('succeeds', async function () {
      data = {
        topic: 'http://example.com/blog',
      };
      manager.db.topicGetByUrl.resolves(topic);
      await manager._checkTopic(dbCtx, data, warn, err);
      assert.strictEqual(warn.length, 0, warn);
      assert.strictEqual(err.length, 0, err);
      assert.strictEqual(data.topicId, 111);
      assert.strictEqual(data.leaseSeconds, 864000);
    });
    it('errors on unknown topic', async function () {
      manager.db.topicGetByUrl.resolves();
      await manager._checkTopic(dbCtx, data, warn, err);
      assert.strictEqual(warn.length, 0, warn);
      assert.strictEqual(err.length, 1, err);
    });
    it('warns on lease under min range', async function () {
      data = {
        topic: 'http://example.com/blog',
        leaseSeconds: 97,
      };
      manager.db.topicGetByUrl.resolves(topic);
      await manager._checkTopic(dbCtx, data, warn, err);
      assert.strictEqual(warn.length, 1, warn);
      assert.strictEqual(err.length, 0, err);
      assert.strictEqual(data.topicId, 111);
      assert.strictEqual(data.leaseSeconds, 86400);
    });
    it('warns on lease over max range', async function () {
      data = {
        topic: 'http://example.com/blog',
        leaseSeconds: 86400 * 100,
      };
      manager.db.topicGetByUrl.resolves(topic);
      await manager._checkTopic(dbCtx, data, warn, err);
      assert.strictEqual(warn.length, 1, warn);
      assert.strictEqual(err.length, 0, err);
      assert.strictEqual(data.topicId, 111);
      assert.strictEqual(data.leaseSeconds, 86400 * 20);
    });
    it('sets publisher validation state when available', async function () {
      data = {
        topic: 'http://example.com/blog',
      };
      manager.db.topicGetByUrl.resolves(Object.assign({}, topic, {
        publisherValidationUrl: 'http://example.com/validate',
      }));
      await manager._checkTopic(dbCtx, data, warn, err);
      assert.strictEqual(warn.length, 0, warn);
      assert.strictEqual(err.length, 0, err);
      assert.strictEqual(data.topicId, 111);
      assert.strictEqual(data.leaseSeconds, 864000);
      assert.strictEqual(data.isPublisherValidated, false);
    });
    it('accepts new public subscribe topic', async function () {
      manager.db.topicGetByUrl.onCall(0).resolves().onCall(1).resolves(topic);
      data = {
        topic: 'http://example.com/blog',
      };
      await manager._checkTopic(dbCtx, data, warn, err);
      assert.strictEqual(warn.length, 0, 'unexpected warnings length');
      assert.strictEqual(err.length, 0, 'unexpected errors length');
      assert.strictEqual(data.topicId, 111, 'unexpected topic id');
    });
    it('does not accept new public subscribe for invalid topic', async function () {
      manager.db.topicGetByUrl.onCall(0).resolves().onCall(1).resolves(topic);
      data = {
        topic: 'not a topic',
      };
      await manager._checkTopic(dbCtx, data, warn, err);
      assert.strictEqual(warn.length, 0, 'unexpected warnings length');
      assert.strictEqual(err.length, 1, 'unexpected errors length');
    });
  }); // _checkTopic

  describe('_checkCallbackAndSecrets', function () {
    let data, warn, err;
    let origStrictSecrets;
    before(function () {
      origStrictSecrets = manager.options.manager.strictSecrets;
    });
    beforeEach(function () {
      data = {};
      warn = [];
      err = [];
    });
    afterEach(function () {
      manager.options.manager.strictSecrets = origStrictSecrets;
    });
    it('succeeds', function () {
      data = {
        callback: 'https://example.com/callback',
        secret: 'so safe',
        isSecure: true,
      };
      manager._checkCallbackAndSecrets(data, warn, err);
      assert.strictEqual(warn.length, 0, warn);
      assert.strictEqual(err.length, 0, err);
    });
    it('errors with invalid callback', function () {
      data = {
        callback: 'not a url',
        secret: 'so safe',
        isSecure: true,
      };
      manager._checkCallbackAndSecrets(data, warn, err);
      assert.strictEqual(warn.length, 0, warn);
      assert.strictEqual(err.length, 1, err);
    });
    it('errors when secret too large', function () {
      data = {
        callback: 'https://example.com/callback',
        secret: 'x'.repeat(256),
        isSecure: true,
      };
      manager._checkCallbackAndSecrets(data, warn, err);
      assert.strictEqual(warn.length, 0, warn);
      assert.strictEqual(err.length, 1, err);
    });
    it('warns when callback is insecure', function () {
      data = {
        callback: 'http://example.com/callback',
        isSecure: true,
      };
      manager._checkCallbackAndSecrets(data, warn, err);
      assert.strictEqual(warn.length, 1, warn);
      assert.strictEqual(err.length, 0, err);
    });
    it('warns when hub is insecure with secret', function () {
      data = {
        callback: 'https://example.com/callback',
        secret: 'so safe',
        isSecure: false,
      };
      manager._checkCallbackAndSecrets(data, warn, err);
      assert.strictEqual(warn.length, 1, warn);
      assert.strictEqual(err.length, 0, err);
    });
    it('errors when callback is insecure with secret and strict', function () {
      manager.options.manager.strictSecrets = true;
      data = {
        callback: 'http://example.com/callback',
        secret: 'so safe',
        isSecure: true,
      };
      manager._checkCallbackAndSecrets(data, warn, err);
      assert.strictEqual(warn.length, 1, warn);
      assert.strictEqual(err.length, 1, err);
    });
  }); // _checkCallbackAndSecrets

  describe('_checkMode', function () {
    let dbCtx, data, warn, err;
    beforeEach(function () {
      dbCtx = {};
      data = {};
      warn = [];
      err = [];
    });
    it('subscribe succeeds', async function () {
      data = {
        mode: 'subscribe',
      };
      await manager._checkMode(dbCtx, data, warn, err);
      assert.strictEqual(warn.length, 0);
      assert.strictEqual(err.length, 0);
    });
    it('unsubscribe succeeds', async function () {
      data = {
        mode: 'unsubscribe',
        callback: 'http://example.com',
        topicId: 123,
      };
      manager.db.subscriptionGet.resolves({
        expires: (Date.now() / 1000) + 60,
      });
      await manager._checkMode(dbCtx, data, warn, err);
      assert.strictEqual(warn.length, 0, warn);
      assert.strictEqual(err.length, 0, err);
    });
    it('unsubscribe requires valid data', async function () {
      data = {
        mode: 'unsubscribe',
        callback: 'http://example.com',
        topicId: undefined,
      };
      manager.db.subscriptionGet.resolves({
        expires: (Date.now() / 1000) - 60,
      });
      await manager._checkMode(dbCtx, data, warn, err);
      assert.strictEqual(warn.length, 0, warn);
      assert.strictEqual(err.length, 1, err);
    });
    it('unsubscribe ignores expired subscription', async function () {
      data = {
        mode: 'unsubscribe',
        callback: 'http://example.com',
        topicId: 123,
      };
      manager.db.subscriptionGet.resolves({
        expires: (Date.now() / 1000) - 60,
      });
      await manager._checkMode(dbCtx, data, warn, err);
      assert.strictEqual(warn.length, 0, warn);
      assert.strictEqual(err.length, 1, err);
    });
  }); // _checkMode

  describe('_publishTopics', function () {
    let dbCtx, data, requestId;
    beforeEach(function () {
      dbCtx = {};
      data = {};
      requestId = 'blah';
    });
    it('succeeds', async function () {
      manager.db.topicGetByUrl.resolves({
        id: 222,
      });
      Object.assign(data, testData.validPublishRootData);
      const topicResults = await manager._publishTopics(dbCtx, data, requestId);
      assert.strictEqual(topicResults.length, 1);
      assert.strictEqual(topicResults[0].warn.length, 0, 'unexpected warnings length');
      assert.strictEqual(topicResults[0].err.length, 0, 'unexpected errors length');
      assert.strictEqual(topicResults[0].topicId, 222, 'unexpected topic id');
    });
    it('fails bad url', async function () {
      Object.assign(data, testData.validPublishRootData, { topic: 'not_a_url' });
      const topicResults = await manager._publishTopics(dbCtx, data, requestId);
      assert.strictEqual(topicResults.length, 1);
      assert.strictEqual(topicResults[0].err.length, 1, 'unexpected errors length');
      assert.strictEqual(topicResults[0].warn.length, 0);
    });
    it('accepts new public publish topic', async function () {
      manager.db.topicGetByUrl.onCall(0).resolves().onCall(1).resolves({
        id: 222,
      });
      Object.assign(data, testData.validPublishRootData);
      const topicResults = await manager._publishTopics(dbCtx, data, requestId);
      assert.strictEqual(topicResults.length, 1);
      assert.strictEqual(topicResults[0].warn.length, 0, 'unexpected warnings length');
      assert.strictEqual(topicResults[0].err.length, 0, 'unexpected errors length');
      assert.strictEqual(topicResults[0].topicId, 222, 'unexpected topic id');
    });
    it('does not publish deleted topic', async function () {
      manager.db.topicGetByUrl.resolves({
        id: 222,
        isDeleted: true,
      });
      Object.assign(data, testData.validPublishRootData);
      const topicResults = await manager._publishTopics(dbCtx, data, requestId);
      assert.strictEqual(topicResults.length, 1);
      assert.strictEqual(topicResults[0].warn.length, 0, 'unexpected warnings length');
      assert.strictEqual(topicResults[0].err.length, 1, 'unexpected errors length');
      assert.strictEqual(topicResults[0].topicId, undefined, 'unexpected topic id');
    });
    it('no topics', async function() {
      Object.assign(data, testData.validPublishRootData);
      delete data.topic;
      const topicResults = await manager._publishTopics(dbCtx, data, requestId);
      assert.strictEqual(topicResults.length, 0);
    });
    it('multiple valid topics', async function () {
      manager.db.topicGetByUrl.resolves({
        id: 222,
      });
      Object.assign(data, testData.validPublishRootData);
      data.url = ['https://example.com/first', 'https://example.com/second'];
      data.topic = ['https://example.com/third'];
      const topicResults = await manager._publishTopics(dbCtx, data, requestId);
      assert.strictEqual(topicResults.length, 3);
      assert.strictEqual(topicResults[0].warn.length, 0, 'unexpected warnings length');
      assert.strictEqual(topicResults[0].err.length, 0, 'unexpected errors length');
      assert.strictEqual(topicResults[0].topicId, 222, 'unexpected topic id');
      assert.strictEqual(topicResults[1].warn.length, 0, 'unexpected warnings length');
      assert.strictEqual(topicResults[1].err.length, 0, 'unexpected errors length');
      assert.strictEqual(topicResults[1].topicId, 222, 'unexpected topic id');
      assert.strictEqual(topicResults[2].warn.length, 0, 'unexpected warnings length');
      assert.strictEqual(topicResults[2].err.length, 0, 'unexpected errors length');
      assert.strictEqual(topicResults[2].topicId, 222, 'unexpected topic id');
    });
    it('mix of valid and invalid topics', async function () {
      manager.db.topicGetByUrl.onCall(1).resolves().resolves({
        id: 222,
      });
      Object.assign(data, testData.validPublishRootData);
      data.url = ['https://example.com/first', 'not a url'];
      data.topic = ['https://example.com/third'];
      const topicResults = await manager._publishTopics(dbCtx, data, requestId);
      assert.strictEqual(topicResults.length, 3);
      assert.strictEqual(topicResults[0].warn.length, 0, 'unexpected warnings length');
      assert.strictEqual(topicResults[0].err.length, 0, 'unexpected errors length');
      assert.strictEqual(topicResults[0].topicId, 222, 'unexpected topic id');
      assert.strictEqual(topicResults[1].warn.length, 0, 'unexpected warnings length');
      assert.strictEqual(topicResults[1].err.length, 1, 'unexpected errors length');
      assert.strictEqual(topicResults[1].topicId, undefined, 'unexpected topic id');
      assert.strictEqual(topicResults[2].warn.length, 0, 'unexpected warnings length');
      assert.strictEqual(topicResults[2].err.length, 0, 'unexpected errors length');
      assert.strictEqual(topicResults[2].topicId, 222, 'unexpected topic id');
    });
  }); // _publishTopics

  describe('_publishRequest', function () {
    let dbCtx, data, res, ctx;
    beforeEach(function () {
      dbCtx = {};
      data = {};
      res = {
        end: sinon.stub(),
      };
      ctx = {};
    });
    it('requires a topic', async function () {
      try {
        await manager._publishRequest(dbCtx, data, res, ctx);
        assert.fail(noExpectedException);
      } catch (e) {
        assert(e instanceof Errors.ResponseError);
      }
    });
    it('processes one topic', async function() {
      manager.db.topicGetByUrl.resolves({
        id: 222,
      });
      Object.assign(data, testData.validPublishRootData);
      manager.db.topicFetchRequested.resolves();
      await manager._publishRequest(dbCtx, data, res, ctx);
      assert(manager.db.topicFetchRequested.called);
      assert.strictEqual(res.statusCode, 202);
      assert(res.end.called);
    });
    it('processes mix of valid and invalid topics', async function () {
      ctx.responseType = 'application/json';
      manager.db.topicGetByUrl.onCall(1).resolves().resolves({
        id: 222,
      });
      Object.assign(data, testData.validPublishRootData);
      data.url = ['https://example.com/first', 'not a url'];
      data.topic = ['https://example.com/third'];
      await manager._publishRequest(dbCtx, data, res, ctx);
      assert.strictEqual(res.statusCode, 207);
      assert(res.end.called);
    });
    it('covers topicFetchRequest failure', async function () {
      manager.db.topicGetByUrl.resolves({
        id: 222,
      });
      Object.assign(data, testData.validPublishRootData);
      const expected = new Error('boo');
      manager.db.topicFetchRequested.rejects(expected);
      try {
        await manager._publishRequest(dbCtx, data, res, ctx);
        assert.fail(noExpectedException);
      } catch (e) {
        assert.deepStrictEqual(e, expected);
      }
    });
    it('covers immediate processing error', async function() {
      manager.options.manager.processImmediately = true;
      manager.db.topicGetByUrl.onCall(0).resolves().onCall(1).resolves({
        id: 222,
      });
      manager.communication.topicFetchClaimAndProcessById.rejects();
      Object.assign(data, testData.validPublishRootData);
      await manager._publishRequest(dbCtx, data, res, ctx);
      assert(manager.db.topicFetchRequested.called);
      assert.strictEqual(res.statusCode, 202);
      assert(res.end.called);
      assert(manager.communication.topicFetchClaimAndProcessById.called);
    });
    it('covers no immediate processing', async function() {
      manager.options.manager.processImmediately = false;
      manager.db.topicGetByUrl.onCall(0).resolves().onCall(1).resolves({
        id: 222,
      });
      Object.assign(data, testData.validPublishRootData);
      await manager._publishRequest(dbCtx, data, res, ctx);
      assert(manager.db.topicFetchRequested.called);
      assert.strictEqual(res.statusCode, 202);
      assert(res.end.called);
      assert(!manager.communication.topicFetchClaimAndProcessById.called);
    });
  }); // _publishRequest

  describe('multiPublishContent', function () {
    let publishTopics;
    beforeEach(function () {
      publishTopics = [{
        url: 'https://example.com/first',
        warn: [],
        err: [],
        topicId: 222,
        status: 202,
        statusMessage: 'Accepted',
      },
      {
        url: 'not a url',
        warn: [],
        err: [ 'invalid topic url (failed to parse url)' ],
        topicId: undefined,
        status: 400,
        statusMessage: 'Bad Request',
      }];
    });
    it('covers json response', function () {
      ctx.responseType = 'application/json';
      const expected = '[{"href":"https://example.com/first","status":202,"statusMessage":"Accepted","errors":[],"warnings":[]},{"href":"not a url","status":400,"statusMessage":"Bad Request","errors":["invalid topic url (failed to parse url)"],"warnings":[]}]';
      const result = Manager.multiPublishContent(ctx, publishTopics);
      assert.deepStrictEqual(result, expected);
    });
    it('covers text response', function () {
      ctx.responseType = 'text/plain';
      const expected = `https://example.com/first [202 Accepted]
----
not a url [400 Bad Request]
\terror: invalid topic url (failed to parse url)`;
      const result = Manager.multiPublishContent(ctx, publishTopics);
      assert.deepStrictEqual(result, expected);
    });
  }); // multiPublishContent

  describe('processTasks', function () {
    it('covers', async function () {
      sinon.stub(manager.communication.worker, 'process').resolves();
      await manager.processTasks(res, ctx);
      assert(manager.communication.worker.process.called);
      assert(res.end.called);
    });
    it('covers error', async function () {
      sinon.stub(manager.communication.worker, 'process').rejects();
      await manager.processTasks(res, ctx);
      assert(manager.communication.worker.process.called);
      assert(res.end.called);
    });
  }); // processTasks

  describe('updateTopic', function () {
    it('fails if no topic exists', async function () {
      try {
        await manager.updateTopic(res, ctx);
        assert.fail(noExpectedException);
      } catch (e) {
        assert(e instanceof Errors.ResponseError);
      }
    });
    it('deletes', async function () {
      ctx.method = 'DELETE';
      manager.db.topicGetById.resolves({});
      await manager.updateTopic(res, ctx);
      assert(manager.db.topicDeleted.called);
    });
    it('does not patch without data', async function () {
      manager.db.topicGetById.resolves({});
      await manager.updateTopic(res, ctx);
      assert(!manager.db.topicUpdate.called);
      assert.strictEqual(res.statusCode, 204);
    });
    it('does not patch with same data', async function () {
      manager.db.topicGetById.resolves({
        leaseSecondsPreferred: '86400',
      });
      ctx.parsedBody = {
        leaseSecondsPreferred: '86400',
      };
      await manager.updateTopic(res, ctx);
      assert(!manager.db.topicUpdate.called);
      assert.strictEqual(res.statusCode, 204);
    });
    it('patches', async function () {
      ctx.queryParams = {
        leaseSecondsPreferred: '86400',
      };
      manager.db.topicGetById.resolves({});
      await manager.updateTopic(res, ctx);
      assert(manager.db.topicUpdate.called);
    });
    it('handles validation error', async function () {
      ctx.queryParams = {
        leaseSecondsPreferred: 'blorp',
      };
      manager.db.topicGetById.resolves({});
      manager.db.topicUpdate.rejects(new DBErrors.DataValidation('something'));
      try {
        await manager.updateTopic(res, ctx);
        assert.fail(noExpectedException);
      } catch (e) {
        assert(e instanceof Errors.ResponseError);
        assert.strictEqual(e.statusCode, 400);
      }
    });
    it('handles generic error', async function () {
      const expected = new Error('blah');
      ctx.queryParams = {
        leaseSecondsPreferred: '123',
      };
      manager.db.topicGetById.resolves({});
      manager.db.topicUpdate.rejects(expected);
      try {
        await manager.updateTopic(res, ctx);
        assert.fail(noExpectedException);
      } catch (e) {
        assert.deepStrictEqual(e, expected);
      }
    });
  }); // updateTopic

  describe('updateSubscription', function () {
    it('fails if no subscription exists', async function () {
      try {
        await manager.updateSubscription(res, ctx);
        assert.fail(noExpectedException);
      } catch (e) {
        assert(e instanceof Errors.ResponseError);
      }
    });
    it('deletes', async function () {
      ctx.method = 'DELETE';
      manager.db.subscriptionGetById.resolves({});
      await manager.updateSubscription(res, ctx);
      assert(manager.db.verificationInsert.called);
    });
    it('does not patch without data', async function () {
      manager.db.subscriptionGetById.resolves({});
      await manager.updateSubscription(res, ctx);
      assert(!manager.db.subscriptionUpdate.called);
      assert.strictEqual(res.statusCode, 204);
    });
    it('does not patch with same data', async function () {
      manager.db.subscriptionGetById.resolves({
        signatureAlgorithm: 'sha256',
      });
      ctx.parsedBody = {
        signatureAlgorithm: 'sha256',
      };
      await manager.updateSubscription(res, ctx);
      assert(!manager.db.subscriptionUpdate.called);
      assert.strictEqual(res.statusCode, 204);
    });
    it('patches', async function () {
      ctx.queryParams = {
        signatureAlgorithm: 'sha256',
      };
      manager.db.subscriptionGetById.resolves({});
      await manager.updateSubscription(res, ctx);
      assert(manager.db.subscriptionUpdate.called);
    });
    it('handles validation error', async function () {
      ctx.queryParams = {
        signatureAlgorithm: 123,
      };
      manager.db.subscriptionGetById.resolves({});
      manager.db.subscriptionUpdate.rejects(new DBErrors.DataValidation('something'));
      try {
        await manager.updateSubscription(res, ctx);
        assert.fail(noExpectedException);
      } catch (e) {
        assert(e instanceof Errors.ResponseError);
        assert.strictEqual(e.statusCode, 400);
      }
    });
    it('handles generic error', async function () {
      const expected = new Error('blah');
      ctx.queryParams = {
        signatureAlgorithm: 'blorp',
      };
      manager.db.subscriptionGetById.resolves({});
      manager.db.subscriptionUpdate.rejects(expected);
      try {
        await manager.updateSubscription(res, ctx);
        assert.fail(noExpectedException);
      } catch (e) {
        assert.deepStrictEqual(e, expected);
      }
    });
  }); // updateSubscription

}); // Manager