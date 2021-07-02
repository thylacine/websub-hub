/* eslint-env mocha */
'use strict';

const assert = require('assert');
const sinon = require('sinon');
const Authenticator = require('../../src/authenticator');
const stubLogger = require('../stub-logger');
const stubDb = require('../stub-db');
const Errors = require('../../src/errors');
const Enum = require('../../src/enum');

const noExpectedException = 'did not receive expected exception';

describe('Authenticator', function () {
  let authenticator, credential, ctx, identifier, password, options;
  beforeEach(function () {
    options = {
      authenticator: {
        basicRealm: 'realm',
        secureAuthOnly: true,
      },
    };
    authenticator = new Authenticator(stubLogger, stubDb, options);
    identifier = 'username';
    credential = '$argon2id$v=19$m=4096,t=3,p=1$1a6zRlX4BI4$sZGcQ72BTpDOlxUI/j3DmE1PMcu+Cs5liZ/D6kk79Ew';
    ctx = {};
    password = 'badPassword';
  });
  afterEach(function () {
    sinon.restore();
  });

  describe('isValidBasic', function () {
    it('succeeds', async function () {
      sinon.stub(authenticator.db, 'authenticationGet').resolves({
        identifier,
        credential,
      });
      const authString = `${identifier}:${password}`;
      const result = await authenticator.isValidBasic(authString, ctx);
      assert.strictEqual(result, true);
      assert.strictEqual(ctx.authenticationId, identifier);
    });
    it('fails', async function () {
      sinon.stub(authenticator.db, 'authenticationGet').resolves({
        identifier,
        credential,
      });
      const authString = `${identifier}:wrongPassword}`;
      const result = await authenticator.isValidBasic(authString, ctx);
      assert.strictEqual(result, false);
      assert.strictEqual(ctx.authenticationId, undefined);
    });
    it('covers no entry', async function() {
      sinon.stub(authenticator.db, 'authenticationGet').resolves();
      const authString = `${identifier}:wrongPassword}`;
      const result = await authenticator.isValidBasic(authString, ctx);
      assert.strictEqual(result, false);
      assert.strictEqual(ctx.authenticationId, undefined);
    });
    it('covers unknown password hash', async function () {
      sinon.stub(authenticator.db, 'authenticationGet').resolves({
        identifier,
        credential: '$other$kind_of_credential',
      });
      const authString = `${identifier}:wrongPassword}`;
      const result = await authenticator.isValidBasic(authString, ctx);
      assert.strictEqual(result, false);
      assert.strictEqual(ctx.authenticationId, undefined);
    });
  }); // isValidBasic

  describe('isValidAuthorization', function () {
    it('handles basic', async function () {
      const expected = true;
      const authorizationHeader = 'basic Zm9vOmJhcg==';
      sinon.stub(authenticator, 'isValidBasic').resolves(expected);
      const result = await authenticator.isValidAuthorization(authorizationHeader, ctx);
      assert.strictEqual(result, expected);
    });
    it('handles other', async function () {
      const expected = false;
      const authorizationHeader = 'bearer Zm9vOmJhcg==';
      const result = await authenticator.isValidAuthorization(authorizationHeader, ctx);
      assert.strictEqual(result, expected);
    });
  }); // isValidAuthorization

  describe('requestBasic', function () {
    it('covers', function () {
      try {
        const res = {
          setHeader: () => {},
        };
        authenticator.requestBasic(res);
        assert.fail(noExpectedException);
      } catch (e) {
        assert(e instanceof Errors.ResponseError);
        assert.strictEqual(e.statusCode, Enum.ErrorResponse.Unauthorized.statusCode);
      }
    });
  }); // requestBasic

  describe('required', function () {
    let req, res;
    beforeEach(function () {
      ctx.clientProtocol = 'https';
      req = {
        getHeader: sinon.stub(),
      };
      res = {
        setHeader: sinon.stub(),
      }
    });
    it('succeeds', async function() {
      req.getHeader.returns('auth header');
      sinon.stub(authenticator, 'isValidAuthorization').resolves(true);
      const result = await authenticator.required(req, res, ctx);
      assert.strictEqual(result, true);
    });
    it('rejects insecure connection', async function () {
      ctx.clientProtocol = 'http';
      try {
        await authenticator.required(req, res, ctx);
        assert.fail(noExpectedException);
      } catch (e) {
        assert(e instanceof Errors.ResponseError);
        assert.strictEqual(e.statusCode, Enum.ErrorResponse.Forbidden.statusCode);
      }
    });
    it('rejects invalid auth', async function () {
      try {
        req.getHeader.returns('auth header');
        sinon.stub(authenticator, 'isValidAuthorization').resolves(false);
        await authenticator.required(req, res, ctx);
        assert.fail(noExpectedException);
      } catch (e) {
        assert(e instanceof Errors.ResponseError);
        assert.strictEqual(e.statusCode, Enum.ErrorResponse.Unauthorized.statusCode);
      }
    });
  }); // required
}); // Authenticator
