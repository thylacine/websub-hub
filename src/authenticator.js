'use strict';

const common = require('./common');
const Enum = require('./enum');
const Errors = require('./errors');
const { MysteryBox } = require('@squeep/mystery-box');

const _fileScope = common.fileScope(__filename);

class Authenticator {
  /**
   * @param {Console} logger
   * @param {*} db
   * @param {Object} options
   * @param {Object} options.authenticator
   * @param {String} options.authenticator.basicRealm
   * @param {Boolean} options.authenticator.secureAuthOnly
   * @param {String[]} options.authenticator.forbiddenPAMIdentifiers
   * @param {String[]} options.authenticator.authnEnabled
   */
  constructor(logger, db, options) {
    this.logger = logger;
    this.db = db;
    this.basicRealm = options.authenticator.basicRealm;
    this.secureAuthOnly = options.authenticator.secureAuthOnly;

    this.authn = {
      DEBUG_ANY: {},
    };
    try {
      this.authn.argon2 = require('argon2');
    } catch (e) { /**/ }
    try {
      this.authn.pam = require('node-linux-pam');
      this.forbiddenPAMIdentifiers = options.authenticator.forbiddenPAMIdentifiers;
    } catch (e) { /**/ }

    this.authnEnabled = Object.keys(this.authn).filter((auth) => options.authenticator.authnEnabled.includes(auth));
    this.logger.debug(_fileScope('constructor'), 'available mechanisms', { authn: this.authnEnabled });

    if (this.authnEnabled.length === 0) {
      throw new Error('no authentication mechanisms available');
    }

    this.mysteryBox = new MysteryBox(logger, options);
  }


  /**
   * Check for valid Basic auth, updates ctx with identifier if valid.
   * @param {String} credentials
   * @param {Object} ctx
   * @returns {Boolean}
   */
  async isValidBasic(credentials, ctx) {
    const _scope = _fileScope('isValidBasic');
    this.logger.debug(_scope, 'called', { ctx });

    const [identifier, credential] = common.splitFirst(credentials, ':', '');

    return this.isValidIdentifierCredential(identifier, credential, ctx);
  }


  /**
   * Check local auth entries.
   * @param {String} identifier
   * @param {String} credential
   * @param {Object} ctx
   */
  async isValidIdentifierCredential(identifier, credential, ctx) {
    const _scope = _fileScope('isValidIdentifierCredential');
    this.logger.debug(_scope, 'called', { identifier, credential: '*'.repeat(credential.length), ctx });

    let isValid = false;

    await this.db.context(async (dbCtx) => {
      const authData = await this.db.authenticationGet(dbCtx, identifier);
      if (!authData) {
        this.logger.debug(_scope, 'failed, invalid identifier', { ctx, identifier });
      } else {
        if (authData.credential.startsWith('$argon2')
        &&  this.authnEnabled.includes('argon2')) {
          isValid = await this.authn.argon2.verify(authData.credential, credential);
        } else if (authData.credential.startsWith('$PAM$')
        &&         this.authnEnabled.includes('pam')) {
          isValid = this._isValidPAMIdentifier(identifier, credential);
        } else {
          this.logger.error(_scope, 'failed, unknown type of stored credential', { identifier, ctx });
        }
      }

      if (this.authnEnabled.includes('DEBUG_ANY')) {
        isValid = true;
      }

      if (isValid) {
        ctx.authenticationId = identifier;
        await this.db.authenticationSuccess(dbCtx, identifier);
      }
    }); // dbCtx

    return isValid;
  }


  /**
   * Check system PAM.
   * @param {String} identifier
   * @param {String} credential
   * @returns {Boolean}
   */
  async _isValidPAMIdentifier(identifier, credential) {
    const _scope = _fileScope('_isValidPAMIdentifier');
    let isValid = false;
    if (this.forbiddenPAMIdentifiers.includes(identifier)) {
      return false;
    }
    try {
      await this.authn.pam.pamAuthenticatePromise({ username: identifier, password: credential });
      isValid = true;
    } catch (e) {
      this.logger.debug(_scope, 'failed', { error: e });
      if (!(e instanceof this.authn.pam.PamError)) {
        throw e;
      }
    }
    return isValid;
  }


  /**
   * Determine which Authorization header is available, and if it is valid.
   * @param {String} authorizationHeader
   * @param {Object} ctx
   */
  async isValidAuthorization(authorizationHeader, ctx) {
    const _scope = _fileScope('isValidAuthorization');
    this.logger.debug(_scope, 'called', { authorizationHeader, ctx });

    const [authMethod, authString] = common.splitFirst(authorizationHeader, ' ', '').map((x) => x.trim());
    // eslint-disable-next-line sonarjs/no-small-switch
    switch (authMethod.toLowerCase()) {
      case 'basic': {
        const credentials = Buffer.from(authString, 'base64').toString('utf-8');
        return this.isValidBasic(credentials, ctx);
      }

      default:
        this.logger.debug(_scope, 'unknown authorization scheme', { ctx });
        return false;
    }
  }


  /**
   * Send a response requesting basic auth.
   * @param {http.ServerResponse} res
   */
  requestBasic(res) {
    res.setHeader(Enum.Header.WWWAuthenticate, `Basic realm="${this.basicRealm}", charset="UTF-8"`);
    throw new Errors.ResponseError(Enum.ErrorResponse.Unauthorized);
  }


  /**
   * Attempt to parse a session cookie, and determine if it
   * contains authenticated user.
   * Restores ctx.session from cookie data.
   * @param {Object} ctx
   * @param {String} cookieHeader
   * @returns {Boolean}
   */
  async isValidCookieAuth(ctx, cookieHeader) {
    const _scope = _fileScope('isValidCookieAuth');
    this.logger.debug(_scope, 'called', { ctx, cookieHeader });

    const [ cookieName, cookieValue ] = common.splitFirst(cookieHeader, '=', '');
    if (cookieName !== 'WSHas') {
      return false;
    }
    try {
      ctx.session = await this.mysteryBox.unpack(cookieValue);
      this.logger.debug(_scope, 'unpacked cookie', { ctx });
      return !!ctx.session.authenticatedProfile || !! ctx.session.authenticatedIdentifier;
    } catch (e) {
      this.logger.debug(_scope, 'could not unpack cookie', { error:e, ctx });
      return false;
    }
  }


  /**
   * Require that a request has valid auth over secure channel, requests if missing.
   * @param {http.ClientRequest} req
   * @param {http.ServerResponse} res
   * @param {Object} ctx
   * @param {String} loginPath
   */
  async required(req, res, ctx, loginPath) {
    const _scope = _fileScope('required');
    this.logger.debug(_scope, 'called', { ctx });

    if (this.secureAuthOnly && ctx.clientProtocol.toLowerCase() !== 'https') {
      this.logger.debug(_scope, 'rejecting insecure auth', ctx);
      throw new Errors.ResponseError(Enum.ErrorResponse.Forbidden, 'authentication required, but connection is insecure; cannot continue');
    }

    const sessionCookie = req.getHeader(Enum.Header.Cookie);
    if (sessionCookie && await this.isValidCookieAuth(ctx, sessionCookie)) {
      return true;
    }

    const authData = req.getHeader(Enum.Header.Authorization);
    if (authData) {
      if (await this.isValidAuthorization(authData, ctx)) {
        return true;
      }
      // If they came in trying header auth, let them try again.
      return this.requestBasic(res);
    }

    // Otherwise redirect to login.
    res.statusCode = 302;
    res.setHeader(Enum.Header.Location, loginPath);
    res.end();

    return false;
  }


  /**
   * Require that a request has valid local auth over secure channel, requests if missing.
   * @param {http.ClientRequest} req
   * @param {http.ServerResponse} res
   * @param {Object} ctx
   * @param {String} loginPath
   */
  async requiredLocal(req, res, ctx, loginPath) {
    const _scope = _fileScope('requiredLocal');
    this.logger.debug(_scope, 'called', { ctx });

    if (this.secureAuthOnly && ctx.clientProtocol.toLowerCase() !== 'https') {
      this.logger.debug(_scope, 'rejecting insecure auth', ctx);
      throw new Errors.ResponseError(Enum.ErrorResponse.Forbidden, 'authentication required, but connection is insecure; cannot continue');
    }

    // Only accept identifier sessions.
    const sessionCookie = req.getHeader(Enum.Header.Cookie);
    if (sessionCookie
    &&  await this.isValidCookieAuth(ctx, sessionCookie)
    &&  ctx.session.authenticatedIdentifier) {
      return true;
    }

    // Allow header auth
    const authData = req.getHeader(Enum.Header.Authorization);
    if (authData) {
      if (await this.isValidAuthorization(authData, ctx)) {
        return true;
      }
      // If they came in trying header auth, let them try again.
      return this.requestBasic(res);
    }

    // Otherwise redirect to login.
    res.statusCode = 302;
    res.setHeader(Enum.Header.Location, loginPath);
    res.end();

    return false;
  }

}

module.exports = Authenticator;