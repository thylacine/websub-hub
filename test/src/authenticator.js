/* eslint-env mocha */
'use strict';

const assert = require('assert');
const sinon = require('sinon'); // eslint-disable-line node/no-unpublished-require
const Authenticator = require('../../src/authenticator');
const stubLogger = require('../stub-logger');
const stubDb = require('../stub-db');
const Errors = require('../../src/errors');
const Enum = require('../../src/enum');
const Config = require('../../config');

const noExpectedException = 'did not receive expected exception';

describe('Authenticator', function () {
  let authenticator, credential, ctx, identifier, password, options;
  function _authMechanismRequired(a, m) {
    if (!a.authn[m]) { // eslint-disable-line security/detect-object-injection
      this.skip();
    }
  };

  beforeEach(function () {
    options = Config('test');
    authenticator = new Authenticator(stubLogger, stubDb, options);
    identifier = 'username';
    credential = '$argon2id$v=19$m=4096,t=3,p=1$1a6zRlX4BI4$sZGcQ72BTpDOlxUI/j3DmE1PMcu+Cs5liZ/D6kk79Ew';
    ctx = {};
    password = 'badPassword';
    stubDb._reset();
  });
  afterEach(function () {
    sinon.restore();
  });

  it('covers no auth mechanisms', function () {
    options.authenticator.authnEnabled = [];
    try {
      authenticator = new Authenticator(stubLogger, stubDb, options);
      assert.fail(noExpectedException);
    } catch (e) {
      assert.strictEqual(e.message, 'no authentication mechanisms available');
    }
  });

  describe('isValidBasic', function () {
    it('succeeds', async function () {
      _authMechanismRequired(authenticator, 'argon2');
      authenticator.db.authenticationGet.resolves({
        identifier,
        credential,
      });
      const authString = `${identifier}:${password}`;
      const result = await authenticator.isValidBasic(authString, ctx);
      assert.strictEqual(result, true);
      assert.strictEqual(ctx.authenticationId, identifier);
    });
    it('fails', async function () {
      _authMechanismRequired(authenticator, 'argon2');
      authenticator.db.authenticationGet.resolves({
        identifier,
        credential,
      });
      const authString = `${identifier}:wrongPassword}`;
      const result = await authenticator.isValidBasic(authString, ctx);
      assert.strictEqual(result, false);
      assert.strictEqual(ctx.authenticationId, undefined);
    });
    it('covers no entry', async function() {
      authenticator.db.authenticationGet.resolves();
      const authString = `${identifier}:wrongPassword}`;
      const result = await authenticator.isValidBasic(authString, ctx);
      assert.strictEqual(result, false);
      assert.strictEqual(ctx.authenticationId, undefined);
    });
    it('covers unknown password hash', async function () {
      authenticator.db.authenticationGet.resolves({
        identifier,
        credential: '$other$kind_of_credential',
      });
      const authString = `${identifier}:wrongPassword}`;
      const result = await authenticator.isValidBasic(authString, ctx);
      assert.strictEqual(result, false);
      assert.strictEqual(ctx.authenticationId, undefined);
    });
  }); // isValidBasic

  describe('isValidIdentifierCredential', function () {
    it('succeeds', async function () {
      _authMechanismRequired(authenticator, 'argon2');
      authenticator.db.authenticationGet.resolves({
        identifier,
        credential,
      });
      const result = await authenticator.isValidIdentifierCredential(identifier, password, ctx);
      assert.strictEqual(result, true);
      assert.strictEqual(ctx.authenticationId, identifier);
    });
    it('fails', async function () {
      _authMechanismRequired(authenticator, 'argon2');
      authenticator.db.authenticationGet.resolves({
        identifier,
        credential,
      });
      const result = await authenticator.isValidIdentifierCredential(identifier, 'wrongPassword', ctx);
      assert.strictEqual(result, false);
      assert.strictEqual(ctx.authenticationId, undefined);
    });
    it('covers no entry', async function() {
      authenticator.db.authenticationGet.resolves();
      const result = await authenticator.isValidIdentifierCredential(identifier, 'wrongPassword', ctx);
      assert.strictEqual(result, false);
      assert.strictEqual(ctx.authenticationId, undefined);
    });
    it('covers unknown password hash', async function () {
      authenticator.db.authenticationGet.resolves({
        identifier,
        credential: '$other$kind_of_credential',
      });
      const result = await authenticator.isValidIdentifierCredential(identifier, 'wrongPassword', ctx);
      assert.strictEqual(result, false);
      assert.strictEqual(ctx.authenticationId, undefined);
    });
    it('covers PAM', async function () {
      _authMechanismRequired(authenticator, 'pam');
      sinon.stub(authenticator, '_isValidPAMIdentifier').resolves(true);
      authenticator.db.authenticationGet.resolves({
        identifier,
        credential: '$PAM$',
      });
      const result = await authenticator.isValidIdentifierCredential(identifier, password, ctx);
      assert.strictEqual(result, true);
      assert.strictEqual(ctx.authenticationId, identifier);
    });
    it('covers debug', async function () {
      authenticator.authnEnabled = ['DEBUG_ANY'];
      const result = await authenticator.isValidIdentifierCredential(identifier, password, ctx);
      assert.strictEqual(result, true);
      assert.strictEqual(ctx.authenticationId, identifier);
    });
  }); // isValidIdentifierCredential

  describe('_isValidPAMIdentifier', function () {
    beforeEach(function () {
      _authMechanismRequired(authenticator, 'pam');
      sinon.stub(authenticator.authn.pam, 'pamAuthenticatePromise');
    });
    it('covers success', async function () {
      authenticator.authn.pam.pamAuthenticatePromise.resolves(true);
      const result = await authenticator._isValidPAMIdentifier(identifier, credential);
      assert.strictEqual(result, true);
    });
    it('covers failure', async function () {
      _authMechanismRequired(authenticator, 'pam');
      authenticator.authn.pam.pamAuthenticatePromise.rejects(new authenticator.authn.pam.PamError());
      const result = await authenticator._isValidPAMIdentifier(identifier, credential);
      assert.strictEqual(result, false);
    });
    it('covers error', async function () {
      _authMechanismRequired(authenticator, 'pam');
      const expected = new Error('blah');
      authenticator.authn.pam.pamAuthenticatePromise.rejects(expected);
      try {
        await authenticator._isValidPAMIdentifier(identifier, credential);
        assert.fail(noExpectedException);
      } catch (e) {
        assert.deepStrictEqual(e, expected);
      }
    });
    it('covers forbidden', async function () {
      identifier = 'root';
      const result = await authenticator._isValidPAMIdentifier(identifier, credential);
      assert.strictEqual(result, false);
    });
  }); // _isValidPAMIdentifier

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

  describe('isValidCookieAuth', function () {
    beforeEach(function () {
      sinon.stub(authenticator.mysteryBox, 'unpack');
    });
    it('covers identifier success', async function () {
      authenticator.mysteryBox.unpack.resolves({
        authenticatedIdentifier: 'identifier',
      });
      const result = await authenticator.isValidCookieAuth(ctx, 'WSHas=dummy');
      assert.strictEqual(result, true);
    });
    it('covers profile success', async function () {
      authenticator.mysteryBox.unpack.resolves({
        authenticatedProfile: 'profile',
      });
      const result = await authenticator.isValidCookieAuth(ctx, 'WSHas=dummy');
      assert.strictEqual(result, true);
    });
    it('covers missing cookie', async function () {
      const result = await authenticator.isValidCookieAuth(ctx, 'wrongCookie');
      assert.strictEqual(result, false);
    });
    it('covers bad cookie', async function () {
      authenticator.mysteryBox.unpack.rejects();
      const result = await authenticator.isValidCookieAuth(ctx, 'WSHas=dummy');
      assert.strictEqual(result, false);
    });
  }); // isValidCookieAuth

  describe('required', function () {
    let req, res;
    beforeEach(function () {
      ctx.clientProtocol = 'https';
      req = {
        getHeader: sinon.stub(),
      };
      res = {
        end: sinon.stub(),
        setHeader: sinon.stub(),
      }
    });
    it('succeeds', async function() {
      req.getHeader.returns('auth header');
      sinon.stub(authenticator, 'isValidAuthorization').resolves(true);
      const result = await authenticator.required(req, res, ctx);
      assert.strictEqual(result, true);
    });
    it('covers valid cookie session', async function () {
      req.getHeader.returns('WSHas=sessionCookie');
      sinon.stub(authenticator, 'isValidCookieAuth').resolves(true);
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
    it('redirects without any auth', async function () {
      await authenticator.required(req, res, ctx);
      assert(res.end.called);
      assert(res.setHeader.called);
    });
  }); // required

  describe('requiredLocal', function () {
    let req, res;
    beforeEach(function () {
      ctx.clientProtocol = 'https';
      req = {
        getHeader: sinon.stub(),
      };
      res = {
        end: sinon.stub(),
        setHeader: sinon.stub(),
      }
    });
    it('succeeds', async function() {
      req.getHeader.returns('auth header');
      sinon.stub(authenticator, 'isValidAuthorization').resolves(true);
      const result = await authenticator.requiredLocal(req, res, ctx);
      assert.strictEqual(result, true);
    });
    it('covers valid cookie session', async function () {
      req.getHeader.returns('WSHas=sessionCookie');
      sinon.stub(authenticator, 'isValidCookieAuth').resolves(true);
      ctx.session = {
        authenticatedIdentifier: identifier,
      };
      const result = await authenticator.requiredLocal(req, res, ctx);
      assert.strictEqual(result, true);
    });
    it('rejects insecure connection', async function () {
      ctx.clientProtocol = 'http';
      try {
        await authenticator.requiredLocal(req, res, ctx);
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
        await authenticator.requiredLocal(req, res, ctx);
        assert.fail(noExpectedException);
      } catch (e) {
        assert(e instanceof Errors.ResponseError);
        assert.strictEqual(e.statusCode, Enum.ErrorResponse.Unauthorized.statusCode);
      }
    });
    it('redirects without any auth', async function () {
      await authenticator.requiredLocal(req, res, ctx);
      assert(res.end.called);
      assert(res.setHeader.called);
    });
  }); // requiredLocal

}); // Authenticator
