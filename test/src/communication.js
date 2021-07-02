/* eslint-env mocha */
/* eslint-disable capitalized-comments, sonarjs/no-duplicate-string */

'use strict';

const assert = require('assert');
const sinon = require('sinon'); // eslint-disable-line node/no-unpublished-require

const Communication = require('../../src/communication');
const Config = require('../../config');
const Errors = require('../../src/errors');

const stubDb = require('../stub-db');
const stubLogger = require('../stub-logger');

const noExpectedException = 'did not get expected exception';

describe('Communication', function () {
  let communication, options;

  beforeEach(function () {
    options = new Config('test');
    communication = new Communication(stubLogger, stubDb, options);
    stubDb._reset();
    stubLogger._reset();
  });
  afterEach(function () {
    sinon.restore();
  });

  it('instantiates', function () {
    assert(communication);
  });

  it('covers config value', function () {
    options.dingus.selfBaseUrl = undefined;
    communication = new Communication(stubLogger, stubDb, options);
  });

  describe('Axios timing coverage', function () {
    const request = {};
    const response = {
      config: request,
    };
    it('tags request', function () {
      communication.axios.interceptors.request.handlers[0].fulfilled(request);
      assert(request.startTimestampMs);
    });
    it('tags response', function () {
      communication.axios.interceptors.response.handlers[0].fulfilled(response);
      assert(response.elapsedTimeMs);
    });
  }); // Axios timing coverage

  describe('userAgentString', function () {
    it('has default behavior', function () {
      const result = Communication.userAgentString();
      assert(result);
      assert(result.length > 30);
    });
    it('is settable', function () {
      const result = Communication.userAgentString({
        product: 'myhub',
        version: '9.9.9',
        implementation: 'custom',
      });
      assert(result);
      assert.strictEqual(result, 'myhub/9.9.9 (custom)');
    });
    it('covers branches', function () {
      const result = Communication.userAgentString({
        product: 'myhub',
        version: '9.9.9',
        implementation: '',
      });
      assert(result);
      assert.strictEqual(result, 'myhub/9.9.9');
    });
  });

  describe('generateChallenge', function () {
    it('generates a thing', async function () {
      const result = await Communication.generateChallenge();
      assert(result);
      assert(result.length);
    });
  });

  describe('signature', function () {
    let message, secret, algorithm, expected;
    beforeEach(function () {
      message = 'Jackdaws love my big sphinx of quartz.';
      secret = 'secretsecret';
      algorithm = 'sha256';
      expected = 'sha256=ee92148d9cd043cdfb8da7cf5ee1897abaafdb5ab840e85010abd4bf235fa31e';
    });
    it('signs a thing', function () {
      const result = Communication.signature(message, secret, algorithm);
      assert.strictEqual(result, expected);
    });
  });

  describe('contentHash', function () {
    let content, algorithm, expected;
    beforeEach(function () {
      content = 'Jived fox nymph grabs quick waltz.';
      algorithm = 'sha256';
      expected = '6e5e1a93bde78910b0d7c5fd8aba393294d4eca5d3fbf2bfd49100df3d5cc85d';
    });
    it('hashes', function () {
      const result = Communication.contentHash(content, algorithm);
      assert.strictEqual(result, expected);
    })
  });

  describe('Axios Configurations', function () {
    let requestUrl, expectedUrl, topicUrl;
    beforeEach(function () {
      requestUrl = 'https://example.com/callback/?id=123';
      expectedUrl = 'https://example.com/callback/';
      topicUrl = 'http://example.com/blog/';
    });
    it('_axiosConfig', function () {
      const method = 'GET';
      const contentType = 'text/plain';
      const body = undefined;
      const params = {
        'extra_parameter': 'foobar',
      };
      const expectedUrlObj = new URL('https://example.com/callback/?id=123&extra_parameter=foobar');
      const expected = {
        method,
        url: 'https://example.com/callback/',
        headers: {
          'Content-Type': 'text/plain',
        },
        params: expectedUrlObj.searchParams,
        responseType: 'text',
      };
      const result = Communication._axiosConfig(method, requestUrl, body, params, {
        'Content-Type': contentType,
      });
      delete result.transformResponse;
      assert.deepStrictEqual(result, expected);
    });
    it('_axiosConfig covers defaults', function () {
      const method = 'OPTIONS';
      const expectedUrlObj = new URL(requestUrl);
      const expected = {
        method,
        url: expectedUrl,
        headers: {},
        params: expectedUrlObj.searchParams,
        responseType: 'text',
      };
      const result = Communication._axiosConfig(method, requestUrl);
      delete result.transformResponse;
      assert.deepStrictEqual(result, expected);
    });
    it('covers null response transform', function () {
      const result = Communication._axiosConfig('GET', 'https://example.com/', undefined, {}, {});
      result.transformResponse[0]();
    });
    it('_intentVerifyAxiosConfig', function () {
      const mode = 'subscribe';
      const leaseSeconds = 864000;
      const challenge = 'abcxyz';
      const expectedUrlObj = new URL(`${requestUrl}&hub.mode=${mode}&hub.topic=${encodeURIComponent(topicUrl)}&hub.challenge=${challenge}&hub.lease_seconds=${leaseSeconds}`);
      const expected = {
        method: 'GET',
        url: expectedUrl,
        headers: {},
        params: expectedUrlObj.searchParams,
        responseType: 'text',
      };
      const result = Communication._intentVerifyAxiosConfig(requestUrl, topicUrl, mode, leaseSeconds, challenge);
      delete result.transformResponse;
      assert.deepStrictEqual(result, expected);
    });
    it('_intentDenyAxiosConfig', function () {
      const reason = 'something';
      const expectedUrlObj = new URL(`${requestUrl}&hub.mode=denied&hub.topic=${encodeURIComponent(topicUrl)}&hub.reason=${reason}`);
      const expected = {
        method: 'GET',
        url: expectedUrl,
        headers: {},
        params: expectedUrlObj.searchParams,
        responseType: 'text',
      };
      const result = Communication._intentDenyAxiosConfig(requestUrl, topicUrl, reason);
      delete result.transformResponse;
      assert.deepStrictEqual(result, expected);
    });
    it('_publisherValidationAxiosConfig', function () {
      const topic = {
        url: topicUrl,
        publisherValidationUrl: 'https://example.com/publisher/',
      };
      const verification = {
        callback: requestUrl,
        topic: topicUrl,
      };
      const expectedUrlObj = new URL(topic.publisherValidationUrl);
      const expected = {
        method: 'POST',
        url: topic.publisherValidationUrl,
        data: {
          callback: requestUrl,
          topic: topicUrl,
        },
        headers: {
          'Content-Type': 'application/json',
        },
        params: expectedUrlObj.searchParams,
        responseType: 'text',
      };
      const result = Communication._publisherValidationAxiosConfig(topic, verification);
      delete result.transformResponse;
      assert.deepStrictEqual(result, expected);
    });
    it('_topicFetchAxiosConfig', function () {
      const topic = {
        url: topicUrl,
        contentType: 'text/plain',
      };
      const expectedUrlObj = new URL(topicUrl);
      const expected = {
        method: 'GET',
        url: topicUrl,
        params: expectedUrlObj.searchParams,
        headers: {
          Accept: 'text/plain, */*;q=0.9',
        },
        responseType: 'text',
      };
      const result = Communication._topicFetchAxiosConfig(topic);
      delete result.transformResponse;
      assert.deepStrictEqual(result, expected);
    });
  }); // Axios Configurations

  describe('verificationProcess', function () {
    const challenge = 'a_challenge';
    let dbCtx, callback, requestId, topicId;
    let topic, verification;
    beforeEach(function () {
      dbCtx = {};
      callback = 'https://example.com/callback/?id=123';
      requestId = '7d37ea20-4ef7-417e-a08d-c0ba71269ab1';
      topicId = '234ec6fb-f1cd-4ac3-8ea9-29ed42ae0e21';
      topic = {
        id: topicId,
        url: 'https://example.com/blog/',
        isActive: true,
        isDeleted: false,
      };
      verification = {
        callback,
        mode: 'subscribe',
        isPublisherValidated: true,
        leaseSeconds: 864000,
      };

      sinon.stub(Communication, 'generateChallenge').resolves(challenge);
      sinon.stub(communication, 'publisherValidate').resolves(true);
      sinon.stub(communication, 'axios').resolves({
        status: 200,
        statusText: 'OK',
        headers: {
          'content-type': 'text/plain',
        },
        data: challenge,
      });

      communication.db.verificationGetById.resolves(verification);
      communication.db.topicGetById.resolves(topic);
      communication.db.verificationRelease.resolves({});
      communication.db.verificationUpdate.resolves({});
      communication.db.verificationIncomplete.resolves({});
      communication.db.verificationComplete.resolves({});
    });

    it('errors on non-existent verification', async function () {
      communication.db.verificationGetById.restore();
      sinon.stub(communication.db, 'verificationGetById').resolves();

      try {
        await communication.verificationProcess(dbCtx, callback, topicId, requestId);
        assert.fail(noExpectedException);
      } catch (e) {
        assert(e instanceof Errors.InternalInconsistencyError);
      }
    });

    it('errors on non-existent topic', async function () {
      communication.db.topicGetById.restore();
      sinon.stub(communication.db, 'topicGetById').resolves();

      try {
        await communication.verificationProcess(dbCtx, callback, topicId, requestId);
        assert.fail(noExpectedException);
      } catch (e) {
        assert(e instanceof Errors.InternalInconsistencyError);
      }
    });

    it('skips inactive topic', async function () {
      communication.db.topicGetById.restore();
      topic.isActive = false;
      sinon.stub(communication.db, 'topicGetById').resolves(topic);

      await communication.verificationProcess(dbCtx, callback, topicId, requestId);

      assert(communication.db.verificationRelease.called);
      assert(!communication.axios.called);
    });

    it('denies subscription to deleted topic', async function () {
      communication.db.topicGetById.restore();
      topic.isDeleted = true;
      sinon.stub(communication.db, 'topicGetById').resolves(topic);

      await communication.verificationProcess(dbCtx, callback, topicId, requestId);

      assert(communication.db.verificationUpdate.called);
      assert.strictEqual(verification.mode, 'denied');
    });

    it('checks publisher validation if needed', async function() {
      communication.db.verificationGetById.restore();
      verification.isPublisherValidated = false;
      sinon.stub(communication.db, 'verificationGetById').resolves(verification);
      communication.db.topicGetById.restore();
      topic.publisherValidationUrl = 'https://example.com/publisher/';
      sinon.stub(communication.db, 'topicGetById').resolves(topic);

      await communication.verificationProcess(dbCtx, callback, topicId, requestId);

      assert(communication.publisherValidate.called);
      assert(communication.db.verificationComplete.called);
    });

    it('handles publisher validation failure', async function() {
      communication.db.verificationGetById.restore();
      verification.isPublisherValidated = false;
      sinon.stub(communication.db, 'verificationGetById').resolves(verification);
      communication.db.topicGetById.restore();
      topic.publisherValidationUrl = 'https://example.com/publisher/';
      sinon.stub(communication.db, 'topicGetById').resolves(topic);
      communication.publisherValidate.restore();
      sinon.stub(communication, 'publisherValidate').resolves(false);

      await communication.verificationProcess(dbCtx, callback, topicId, requestId);

      assert(communication.publisherValidate.called);
      assert(communication.db.verificationIncomplete.called);
    });

    it('handles request error', async function () {
      communication.axios.restore();
      sinon.stub(communication, 'axios').throws(new Error());

      await communication.verificationProcess(dbCtx, callback, topicId, requestId);

      assert(communication.db.verificationIncomplete.called);
    });

    it('handles 500 response', async function () {
      communication.axios.restore();
      sinon.stub(communication, 'axios').resolves({
        status: 500,
      });

      await communication.verificationProcess(dbCtx, callback, topicId, requestId);

      assert(communication.db.verificationIncomplete.called);
    });

    it('handles non-200 response', async function () {
      communication.axios.restore();
      sinon.stub(communication, 'axios').resolves({
        status: 400,
      });

      await communication.verificationProcess(dbCtx, callback, topicId, requestId);

      assert(communication.db.verificationComplete.called);
    });

    it('subscription succeeds', async function () {
      await communication.verificationProcess(dbCtx, callback, topicId, requestId);

      assert(communication.db.subscriptionUpsert.called);
      assert(communication.db.verificationComplete.called);
    });

    it('unsubscription succeeds', async function () {
      communication.db.verificationGetById.restore();
      verification.mode = 'unsubscribe';
      sinon.stub(communication.db, 'verificationGetById').resolves(verification);

      await communication.verificationProcess(dbCtx, callback, topicId, requestId);

      assert(communication.db.subscriptionDelete.called);
      assert(communication.db.verificationComplete.called);
    });

    it('unsubscription denial succeeds', async function () {
      communication.db.verificationGetById.restore();
      verification.mode = 'unsubscribe';
      sinon.stub(communication.db, 'verificationGetById').resolves(verification);
      communication.axios.restore();
      sinon.stub(communication, 'axios').resolves({
        status: 200,
        statusText: 'OK',
        headers: {
          'content-type': 'text/plain',
        },
        data: 'not the challenge',
      });

      await communication.verificationProcess(dbCtx, callback, topicId, requestId);

      assert(!communication.db.subscriptionDelete.called);
      assert(communication.db.verificationComplete.called);
    });

    it('does not handle strange mode', async function() {
      communication.db.verificationGetById.restore();
      verification.mode = 'flarp';
      sinon.stub(communication.db, 'verificationGetById').resolves(verification);

      try {
        await communication.verificationProcess(dbCtx, callback, topicId, requestId);
        assert.fail(noExpectedException);
      } catch (e) {
        assert(e instanceof Errors.InternalInconsistencyError);
      }
    });
  }); // verificationProcess

  describe('publisherValidate', function () {
    let dbCtx, topic, verification;
    beforeEach(function () {
      dbCtx = {};
      topic = {
        url: 'https://example.com/topic/',
        publisherValidationUrl: 'https://example.com/pub_valid/',
      };
      verification = {
        callback: 'https://exmaple.com/callback/?id=123',
        httpFrom: 'user@example.com',
        httpRemoteAddr: '127.0.0.0',
      };

      sinon.stub(communication, 'axios').resolves({
        status: 200,
        statusText: 'OK',
        headers: {
          'content-type': 'application/json',
        },
      });

      communication.db.verificationIncomplete.resolves();
      communication.db.verificationUpdate.resolves();
      communication.db.verificationValidated.resolves();
    });

    it('succeeds', async function () {
      const result = await communication.publisherValidate(dbCtx, topic, verification);

      assert(communication.db.verificationValidated.called);
      assert.strictEqual(result, true);
    });

    it('succeeds with rejection', async function () {
      communication.axios.restore();
      sinon.stub(communication, 'axios').resolves({
        status: 400,
        statusText: 'Bad Request',
        headers: {
          'content-type': 'application/json',
        },
      });

      const result = await communication.publisherValidate(dbCtx, topic, verification);

      assert(communication.db.verificationValidated.called);
      assert(communication.db.verificationUpdate.called);
      assert.strictEqual(result, true);
    });

    it('defers on request server error', async function () {
      communication.axios.restore();
      sinon.stub(communication, 'axios').resolves({
        status: 502,
        statusText: 'Bad Gateway',
        headers: {
          'content-type': 'text/plain',
        },
      });

      const result = await communication.publisherValidate(dbCtx, topic, verification);

      assert.strictEqual(result, false);
    });

    it('handles request error', async function () {
      communication.axios.restore();
      sinon.stub(communication, 'axios').throws(new Error());

      const result = await communication.publisherValidate(dbCtx, topic, verification);

      assert.strictEqual(result, false);
    });

  }); // publisherValidate

  describe('topicFetchProcess', function () {
    let dbCtx, topic, requestId, topicId;

    beforeEach(function () {
      dbCtx = {};
      topic = {
        url: 'https://example.com/topic/',
        isDeleted: false,
        contentHashAlgorithm: 'sha512',
      };
      requestId = '7d37ea20-4ef7-417e-a08d-c0ba71269ab1';
      topicId = '234ec6fb-f1cd-4ac3-8ea9-29ed42ae0e21';

      sinon.stub(communication, 'axios').resolves({
        status: 200,
        statusText: 'OK',
        headers: {
          'content-type': 'text/plain',
          link: '<https://example.com/hub/>; rel="hub"',
        },
        data: 'Jackdaws love my big sphinx of quartz.',
      });

      communication.db.topicGetById.resolves(topic);
    });

    it('requires topic exists', async function () {
      communication.db.topicGetById.restore();
      sinon.stub(communication.db, 'topicGetById').resolves();

      try {
        await communication.topicFetchProcess(dbCtx, topicId, requestId);
        assert.fail(noExpectedException);
      } catch (e) {
        assert(e instanceof Errors.InternalInconsistencyError);
      }
    });

    it ('skips deleted topic', async function () {
      communication.db.topicGetById.restore();
      topic.isDeleted = true;
      sinon.stub(communication.db, 'topicGetById').resolves(topic);

      await communication.topicFetchProcess(dbCtx, topicId, requestId);

      assert(!communication.axios.called);
    });

    it('handles request error', async function () {
      communication.axios.restore();
      sinon.stub(communication, 'axios').throws(new Error());

      await communication.topicFetchProcess(dbCtx, topicId, requestId);

      assert(communication.db.topicFetchIncomplete.called);
    });

    it('handles 500 response', async function () {
      communication.axios.restore();
      sinon.stub(communication, 'axios').resolves({
        status: 500,
        statusText: 'Internal Server Error',
        headers: {
          'content-type': 'text/plain',
        },
      });

      await communication.topicFetchProcess(dbCtx, topicId, requestId);

      assert(communication.db.topicFetchIncomplete.called);
    });

    it('handles bad response', async function () {
      communication.axios.restore();
      sinon.stub(communication, 'axios').resolves({
        status: 404,
        statusText: 'Not Found',
        headers: {
          'content-type': 'text/plain',
        },
      });

      await communication.topicFetchProcess(dbCtx, topicId, requestId);

      assert(communication.db.topicFetchIncomplete.called);
    });

    it('recognizes unchanged content', async function () {
      communication.db.topicGetById.restore();
      topic.contentHash = 'a630999c61738f3e066d79a1b299a295c5d0598c173e0904d04a707d43988e3e81660bfc1b1779377f4ec26f837d1bb31fa2b860c9ad2d37495d83de32647fea';
      sinon.stub(communication.db, 'topicGetById').resolves(topic);

      await communication.topicFetchProcess(dbCtx, topicId, requestId);

      assert(communication.db.topicFetchComplete.called);
      assert(!communication.db.topicSetContent.called);
    });

    it('updates content', async function () {
      await communication.topicFetchProcess(dbCtx, topicId, requestId);

      assert(communication.db.topicFetchComplete.called);
      assert(communication.db.topicSetContent.called);
    });

    it('updates content with lax link enforcement', async function () {
      communication.axios.restore();
      sinon.stub(communication, 'axios').resolves({
        status: 200,
        statusText: 'OK',
        headers: {
          'content-type': 'text/plain',
          link: '<https://example.com/other/hub/>; rel="hub"',
        },
        data: 'Jackdaws love my big sphinx of quartz.',
      });

      communication.options.communication.strictTopicHubLink = false;

      await communication.topicFetchProcess(dbCtx, topicId, requestId);

      assert(communication.db.topicFetchComplete.called);
      assert(communication.db.topicSetContent.called);
    });

    it('deletes topic when hub relation unsatisfied', async function () {
      communication.axios.restore();
      sinon.stub(communication, 'axios').resolves({
        status: 200,
        statusText: 'OK',
        headers: {
          'content-type': 'text/plain',
          link: '<https://example.com/other/hub/>; rel="hub"',
        },
        data: 'Jackdaws love my big sphinx of quartz.',
      });

      await communication.topicFetchProcess(dbCtx, topicId, requestId);

      assert(communication.db.topicFetchComplete.called);
      assert(communication.db.topicDeleted.called);
    });
  }); // topicFetchProcess

  describe('subscriptionDeliveryProcess', function () {
    let dbCtx, requestId, topic, topicId, subscription, subscriptionId;

    beforeEach(function () {
      dbCtx = {};
      topic = {
        url: 'https://example.com/topic/',
        isDeleted: false,
        contentHashAlgorithm: 'sha512',
        content: 'Jackdaws love my big sphinx of quartz.',
      };
      requestId = '7d37ea20-4ef7-417e-a08d-c0ba71269ab1';
      topicId = '234ec6fb-f1cd-4ac3-8ea9-29ed42ae0e21';
      subscriptionId = 'c5e6a3ac-dab8-11eb-b758-0025905f714a';
      subscription = {
        topicId,
        callback: 'https://example.com/callback/123',
        secret: 'superdupersecret',
        signatureAlgorithm: 'sha512',
      };

      sinon.stub(communication, 'axios').resolves({
        status: 200,
        statusText: 'OK',
        headers: {
          'content-type': 'text/plain',
        },
        data: 'Jackdaws love my big sphinx of quartz.',
      });

      communication.db.topicGetContentById.resolves(topic);
      communication.db.subscriptionGetById.resolves(subscription);
    });

    it('requires subscription to exist', async function () {
      communication.db.subscriptionGetById.restore();
      sinon.stub(communication.db, 'subscriptionGetById').resolves();
      try {
        await communication.subscriptionDeliveryProcess(dbCtx, subscriptionId, requestId);
        assert.fail(noExpectedException);
      } catch (e) {
        assert(e instanceof Errors.InternalInconsistencyError);
      }
    });

    it('requires topic to exist', async function () {
      communication.db.topicGetContentById.restore();
      sinon.stub(communication.db, 'topicGetContentById').resolves();
      try {
        await communication.subscriptionDeliveryProcess(dbCtx, subscriptionId, requestId);
        assert.fail(noExpectedException);
      } catch (e) {
        assert(e instanceof Errors.InternalInconsistencyError);
      }
    });

    it('succeeds', async function () {
      await communication.subscriptionDeliveryProcess(dbCtx, subscriptionId, requestId);

      assert(communication.db.subscriptionDeliveryComplete.called);
    });

    it('handles request error', async function () {
      communication.axios.restore();
      sinon.stub(communication, 'axios').throws();

      await communication.subscriptionDeliveryProcess(dbCtx, subscriptionId, requestId);

      assert(communication.db.subscriptionDeliveryIncomplete.called);
    });

    it('handles 5xx response', async function () {
      communication.axios.restore();
      sinon.stub(communication, 'axios').resolves({
        status: 500,
        statusText: 'Internal Server Error',
        headers: {
          'content-type': 'text/plain',
        },
      });

      await communication.subscriptionDeliveryProcess(dbCtx, subscriptionId, requestId);

      assert(communication.db.subscriptionDeliveryIncomplete.called);
    });

    it('handles 4xx response', async function () {
      communication.axios.restore();
      sinon.stub(communication, 'axios').resolves({
        status: 404,
        statusText: 'Not Found',
        headers: {
          'content-type': 'text/plain',
        },
      });

      await communication.subscriptionDeliveryProcess(dbCtx, subscriptionId, requestId);

      assert(communication.db.subscriptionDeliveryIncomplete.called);
    });

    it('handles 410 response', async function () {
      communication.axios.restore();
      sinon.stub(communication, 'axios').resolves({
        status: 410,
        statusText: 'Gone',
        headers: {
          'content-type': 'text/plain',
        },
      });

      await communication.subscriptionDeliveryProcess(dbCtx, subscriptionId, requestId);

      assert(communication.db.subscriptionDeliveryGone.called);
    });

    it('unsubscribes when topic is deleted', async function () {
      topic.isDeleted = true;
      communication.db.topicGetContentById.restore();
      sinon.stub(communication.db, 'topicGetContentById').resolves(topic);

      await communication.subscriptionDeliveryProcess(dbCtx, subscriptionId, requestId);

      assert(communication.db.verificationInsert.called);
      assert(communication.db.subscriptionDeliveryComplete.called);
    });
  }); // subscriptionDeliveryProcess

  describe('topicFetchClaimAndProcessById', function () {
    let dbCtx, topicId, requestId;
    beforeEach(function () {
      dbCtx = {};
      requestId = '7d37ea20-4ef7-417e-a08d-c0ba71269ab1';
      topicId = '234ec6fb-f1cd-4ac3-8ea9-29ed42ae0e21';
      sinon.stub(communication, 'topicFetchProcess');
    });
    it('covers claim', async function () {
      communication.db.topicFetchClaimById.resolves({
        changes: 1,
      })
      await communication.topicFetchClaimAndProcessById(dbCtx, topicId, requestId);
      assert(communication.topicFetchProcess.called);
    });
    it('covers no claim', async function () {
      communication.db.topicFetchClaimById.resolves({
        changes: 0,
      })
      await communication.topicFetchClaimAndProcessById(dbCtx, topicId, requestId);
      assert(!communication.topicFetchProcess.called);
    });
  }); // topicFetchClaimAndProcessById

  describe('verificationClaimAndProcessById', function () {
    let dbCtx, verificationId, requestId;
    beforeEach(function () {
      dbCtx = {};
      verificationId = '28488311-6652-42ea-9839-7bbc42b246cb';
      requestId = '7d37ea20-4ef7-417e-a08d-c0ba71269ab1';
      sinon.stub(communication, 'verificationProcess');
    });
    it('covers claim', async function () {
      communication.db.verificationClaimById.resolves({
        changes: 1,
      })
      await communication.verificationClaimAndProcessById(dbCtx, verificationId, requestId);
      assert(communication.verificationProcess.called);
    });
    it('covers no claim', async function () {
      communication.db.verificationClaimById.resolves({
        changes: 0,
      })
      await communication.verificationClaimAndProcessById(dbCtx, verificationId, requestId);
      assert(!communication.verificationProcess.called);
    });
  }); // verificationClaimAndProcessById

  describe('workFeed', function () {
    let wanted;
    beforeEach(function () {
      sinon.stub(communication, 'topicFetchProcess');
      sinon.stub(communication, 'verificationProcess');
      sinon.stub(communication, 'subscriptionDeliveryProcess');
    });
    it('succeeds', async function () {
      const topicIds = [ { id: '' }, { id: '' } ];
      communication.db.topicFetchClaim.resolves(topicIds);
      const verificationIds = [ { id: '' }, { id: '' } ];
      communication.db.verificationClaim.resolves(verificationIds);
      const subscriptionIds = [ { id: '' }, { id: '' } ];
      communication.db.subscriptionDeliveryClaim.resolves(subscriptionIds);
      const expectedLength = [topicIds, verificationIds, subscriptionIds].map((x) => x.length).reduce((a, b) => a + b, 0);
      wanted = 10;

      const result = await communication.workFeed(wanted);

      assert.strictEqual(result.length, expectedLength);
    });
    it('covers no wanted work', async function () {
      const result = await communication.workFeed(0);
      assert.strictEqual(result.length, 0);
      assert(!communication.db.topicFetchClaim.called);
      assert(!communication.db.verificationClaim.called);
      assert(!communication.db.subscriptionDeliveryClaim.called);
    });
    it('deals with failure', async function () {
      const topicIds = [ { id: '' }, { id: '' } ];
      communication.db.topicFetchClaim.resolves(topicIds);
      communication.db.verificationClaim.throws();
      const expectedLength = topicIds.length;
      wanted = 10;

      const result = await communication.workFeed(wanted);

      assert.strictEqual(result.length, expectedLength);
    });
  }); // workFeed

}); // Communication