/* eslint-env mocha */
/* eslint-disable capitalized-comments, sonarjs/no-duplicate-string, sonarjs/no-identical-functions */

'use strict';

const assert = require('assert');
const sinon = require('sinon'); // eslint-disable-line node/no-unpublished-require

const SessionManager = require('../../src/session-manager');
const Config = require('../../config');
const stubLogger = require('../stub-logger');

describe('SessionManager', function () {
  let manager, options, stubAuthenticator;
  let res, ctx;

  beforeEach(function () {
    options = new Config('test');
    res = {
      end: sinon.stub(),
      setHeader: sinon.stub(),
    };
    ctx = {
      cookie: '',
      params: {},
      queryParams: {},
      parsedBody: {},
    };
    stubAuthenticator = {
      isValidIdentifierCredential: sinon.stub(),
    };
    manager = new SessionManager(stubLogger, stubAuthenticator, options);
    sinon.stub(manager.indieAuthCommunication);
    stubLogger._reset();
  });
  afterEach(function () {
    sinon.restore();
  });

  describe('_sessionCookieSet', function () {
    let session, maxAge;
    beforeEach(function () {
      session = {};
      maxAge = 86400;
    });
    it('covers', async function () {
      await manager._sessionCookieSet(res, session, maxAge);
      assert(res.setHeader.called);
    });
    it('covers reset', async function () {
      session = undefined;
      maxAge = 0;
      await manager._sessionCookieSet(res, session, maxAge);
      assert(res.setHeader.called);
    });
  }); // _sessionCookieSet

  describe('getAdminLogin', function () {
    it('covers', async function () {
      await manager.getAdminLogin(res, ctx);
    });
  }); // getAdminLogin

  describe('postAdminLogin', function () {
    it('covers valid local', async function () {
      ctx.parsedBody.identifier = 'user';
      ctx.parsedBody.credential = 'password';
      manager.authenticator.isValidIdentifierCredential.resolves(true);
      await manager.postAdminLogin(res, ctx);
      assert.strictEqual(res.statusCode, 302);
    });
    it('covers invalid local', async function () {
      ctx.parsedBody.identifier = 'user';
      ctx.parsedBody.credential = 'password';
      manager.authenticator.isValidIdentifierCredential.resolves(false);
      await manager.postAdminLogin(res, ctx);
      assert(!res.setHeader.called);
    });
    it('covers valid profile', async function () {
      ctx.parsedBody.me = 'https://example.com/profile';
      manager.indieAuthCommunication.fetchProfile.resolves({
        authorizationEndpoint: 'https://example.com/auth',
      });
      await manager.postAdminLogin(res, ctx);
      assert.strictEqual(res.statusCode, 302);
    });
    it('covers invalid profile', async function () {
      ctx.parsedBody.me = 'not a profile';
      manager.indieAuthCommunication.fetchProfile.resolves();
      await manager.postAdminLogin(res, ctx);
      assert(!res.setHeader.called);
    });
    it('covers invalid profile response', async function () {
      ctx.parsedBody.me = 'https://example.com/profile';
      manager.indieAuthCommunication.fetchProfile.resolves();
      await manager.postAdminLogin(res, ctx);
      assert(!res.setHeader.called);
    });
    it('covers invalid profile response endpoint', async function () {
      ctx.parsedBody.me = 'https://example.com/profile';
      manager.indieAuthCommunication.fetchProfile.resolves({
        authorizationEndpoint: 'not an auth endpoint',
      });
      await manager.postAdminLogin(res, ctx);
      assert(!res.setHeader.called);
    });
  }); // postAdminLogin

  describe('getAdminLogout', function () {
    it('covers', async function () {
      await manager.getAdminLogout(res, ctx);
    });
  }); // getAdminLogout

  describe('getAdminIA', function () {
    let state, me, authorizationEndpoint;
    beforeEach(function () {
      state = '4ea7e936-3427-11ec-9f4b-0025905f714a';
      me = 'https://example.com/profile';
      authorizationEndpoint = 'https://example.com/auth'
      ctx.cookie = 'WSHas=sessionCookie';
      manager.indieAuthCommunication.redeemProfileCode.resolves({
        me,
      });
      manager.indieAuthCommunication.fetchProfile.resolves({
        authorizationEndpoint,
      });
      sinon.stub(manager.mysteryBox, 'unpack').resolves({
        authorizationEndpoint,
        state,
        me,
      });
    });
    it('covers valid', async function () {
      ctx.queryParams['state'] = state;
      ctx.queryParams['code'] = 'codeCodeCode';

      await manager.getAdminIA(res, ctx);

      assert.strictEqual(res.statusCode, 302);
    });
    it('covers missing cookie', async function () {
      delete ctx.cookie;

      await manager.getAdminIA(res, ctx);

      assert(ctx.errors.length);
    });
    it('covers invalid cookie', async function () {
      manager.mysteryBox.unpack.restore();
      sinon.stub(manager.mysteryBox, 'unpack').rejects();

      await manager.getAdminIA(res, ctx);

      assert(ctx.errors.length);
    });
    it('covers mis-matched state', async function () {
      ctx.queryParams['state'] = 'incorrect-state';
      ctx.queryParams['code'] = 'codeCodeCode';

      await manager.getAdminIA(res, ctx);

      assert(ctx.errors.length);
    });
    it('relays auth endpoint errors', async function () {
      ctx.queryParams['state'] = state;
      ctx.queryParams['code'] = 'codeCodeCode';
      ctx.queryParams['error'] = 'error_code';
      ctx.queryParams['error_description'] = 'something went wrong';

      await manager.getAdminIA(res, ctx);

      assert(ctx.errors.length);
    });
    it('covers invalid restored session', async function () {
      manager.mysteryBox.unpack.restore();
      sinon.stub(manager.mysteryBox, 'unpack').resolves({
        authorizationEndpoint: 'not a url',
        state,
        me,
      });
      ctx.queryParams['state'] = state;
      ctx.queryParams['code'] = 'codeCodeCode';

      await manager.getAdminIA(res, ctx);

      assert(ctx.errors.length);
    });
    it('covers empty profile redemption response', async function () {
      ctx.queryParams['state'] = state;
      ctx.queryParams['code'] = 'codeCodeCode';
      manager.indieAuthCommunication.redeemProfileCode.restore();
      sinon.stub(manager.indieAuthCommunication, 'redeemProfileCode').resolves();

      await manager.getAdminIA(res, ctx);

      assert(ctx.errors.length);
    });
    it('covers missing profile in redemption response', async function () {
      ctx.queryParams['state'] = state;
      ctx.queryParams['code'] = 'codeCodeCode';
      manager.indieAuthCommunication.redeemProfileCode.restore();
      sinon.stub(manager.indieAuthCommunication, 'redeemProfileCode').resolves({
      });

      await manager.getAdminIA(res, ctx);

      assert(ctx.errors.length);
    });
    it('covers different canonical profile response', async function () {
      ctx.queryParams['state'] = state;
      ctx.queryParams['code'] = 'codeCodeCode';
      manager.indieAuthCommunication.redeemProfileCode.restore();
      sinon.stub(manager.indieAuthCommunication, 'redeemProfileCode').resolves({
        me: 'https://different.example.com/profile',
      });

      await manager.getAdminIA(res, ctx);

      assert.strictEqual(res.statusCode, 302);
    });
    it('covers different canonical profile response mis-matched endpoint', async function () {
      ctx.queryParams['state'] = state;
      ctx.queryParams['code'] = 'codeCodeCode';
      manager.indieAuthCommunication.redeemProfileCode.restore();
      sinon.stub(manager.indieAuthCommunication, 'redeemProfileCode').resolves({
        me: 'https://different.example.com/profile',
      });
      manager.indieAuthCommunication.fetchProfile.restore();
      sinon.stub(manager.indieAuthCommunication, 'fetchProfile').resolves({
        authorizationEndpoint: 'https://elsewhere.example.com/auth',
      });

      await manager.getAdminIA(res, ctx);

      assert(ctx.errors.length);
    });
  }); // getAdminIA

}); // SessionManager