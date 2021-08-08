'use strict';

const argon2 = require('argon2');
const common = require('./common');
const Enum = require('./enum');
const Errors = require('./errors');

const _fileScope = common.fileScope(__filename);

class Authenticator {
  constructor(logger, db, options) {
    this.logger = logger;
    this.db = db;
    this.basicRealm = options.authenticator.basicRealm;
    this.secureAuthOnly = options.authenticator.secureAuthOnly;
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

    let valid = false;
    await this.db.context(async (dbCtx) => {
      const authData = await this.db.authenticationGet(dbCtx, identifier);
      if (!authData) {
        this.logger.debug(_scope, 'failed, invalid authentication id', { ctx });
        return false;
      }

      if (authData.credential.startsWith('$argon2')) {
        valid = await argon2.verify(authData.credential, credential);
      } else {
        this.logger.error(_scope, 'failed, unknown type of stored password hash', { ctx });
      }
      if (valid) {
        ctx.authenticationId = identifier;
        await this.db.authenticationSuccess(dbCtx, identifier);
      }
    });

    return valid;
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
        return await this.isValidBasic(credentials, ctx);
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
   * Require that a request has valid auth over secure channel, requests if missing.
   * @param {http.ClientRequest} req
   * @param {http.ServerResponse} res
   * @param {Object} ctx
   */
  async required(req, res, ctx) {
    const _scope = _fileScope('required');
    this.logger.debug(_scope, 'called', { ctx });

    if (this.secureAuthOnly && ctx.clientProtocol.toLowerCase() !== 'https') {
      this.logger.debug(_scope, 'rejecting insecure auth', ctx);
      throw new Errors.ResponseError(Enum.ErrorResponse.Forbidden, 'authentication required, but connection is insecure; cannot continue');
    }

    const authData = req.getHeader(Enum.Header.Authorization);
    if (authData
    &&  await this.isValidAuthorization(authData, ctx)) {
      return true;
    }
    return this.requestBasic(res);
  }

}

module.exports = Authenticator;