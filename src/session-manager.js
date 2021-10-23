'use strict';

/**
 * Here we process activities which support login sessions.
 */

const { Communication: IndieAuthCommunication } = require('@squeep/indieauth-helper');
const { MysteryBox } = require('@squeep/mystery-box');
const common = require('./common');
const Enum = require('./enum');
const Template = require('./template');

const _fileScope = common.fileScope(__filename);

class SessionManager {
  constructor(logger, authenticator, options) {
    this.logger = logger;
    this.authenticator = authenticator;
    this.options = options;
    this.indieAuthCommunication = new IndieAuthCommunication(logger, options);
    this.mysteryBox = new MysteryBox(logger, options);

    this.secureCookie = options.authenticator.secureAuthOnly ? ' Secure;' : '';
    this.cookieLifespan = 60 * 60 * 24 * 32;
  }


  /**
   * Set or update our session cookie.
   * @param {http.ServerResponse} res
   * @param {Object} session
   * @param {Number} maxAge
   */
  async _sessionCookieSet(res, session, maxAge) {
    const cookieName = 'WSHas';
    const secureSession = session && await this.mysteryBox.pack(session) || '';
    const cookie = [
      `${cookieName}=${secureSession}`,
      'HttpOnly',
      this.secureCookie,
      `Max-Age: ${maxAge}`,
    ].join('; ');
    res.setHeader(Enum.Header.SetCookie, cookie);
  }


  /**
   * GET request for establishing admin session.
   * @param {http.ServerResponse} res
   * @param {Object} ctx
   */
  async getAdminLogin(res, ctx) {
    const _scope = _fileScope('getAdminLogin');
    this.logger.debug(_scope, 'called', { ctx });

    res.end(Template.adminLoginHTML(ctx, this.options));
    this.logger.info(_scope, 'finished', { ctx })
  }


  /**
   * POST request for taking form data to establish admin session.
   * @param {http.ServerResponse} res
   * @param {Object} ctx
   */
  async postAdminLogin(res, ctx) {
    const _scope = _fileScope('postAdminLogin');
    this.logger.debug(_scope, 'called', { ctx });

    ctx.errors = [];

    // Only attempt user login if no IndieAuth profile is set
    if (!ctx.parsedBody['me']) {
      this.logger.debug(_scope, 'no indieauth profile, trying identifier', { ctx });

      const identifier = ctx.parsedBody['identifier'];
      const credential = ctx.parsedBody['credential'];

      const isValidLocalIdentifier = await this.authenticator.isValidIdentifierCredential(identifier, credential, ctx);
      if (!isValidLocalIdentifier) {
        ctx.errors.push('Invalid username or password');
      }

      if (ctx.errors.length) {
        res.end(Template.adminLoginHTML(ctx, this.options));
        return;
      }

      // Valid auth, persist the authenticated session
      ctx.session = {
        authenticatedIdentifier: ctx.authenticationId,
      };
      await this._sessionCookieSet(res, ctx.session, this.cookieLifespan);
      res.statusCode = 302;
      res.setHeader(Enum.Header.Location, './');
      res.end();
      this.logger.info(_scope, 'finished local', { ctx });
      return;
    }

    let me, session, authorizationEndpoint;
    try {
      me = new URL(ctx.parsedBody['me']);
    } catch (e) {
      this.logger.debug(_scope, 'failed to parse supplied profile url', { ctx });
      ctx.errors.push(`Unable to understand '${ctx.parsedBody['me']}' as a profile URL.`);
    }

    if (me) {
      const profile = await this.indieAuthCommunication.fetchProfile(me);
      if (!profile || !profile.authorizationEndpoint) {
        this.logger.debug(_scope, 'failed to find any profile information at url', { ctx });
        ctx.errors.push(`No profile information was found at '${me}'.`);
      } else {
        // fetch and parse me for 'authorization_endpoint' relation links
        try {
          authorizationEndpoint = new URL(profile.authorizationEndpoint);
        } catch (e) {
          ctx.errors.push(`Unable to understand the authorization endpoint ('${profile.authorizationEndpoint}') indicated by that profile ('${me}') as a URL.`);
        }
      }

      if (authorizationEndpoint) {
        const pkce = await IndieAuthCommunication.generatePKCE();
        session = {
          authorizationEndpoint: authorizationEndpoint.href,
          state: ctx.requestId,
          codeVerifier: pkce.codeVerifier,
          me,
        };

        Object.entries({
          'response_type': 'code',
          'client_id': this.options.dingus.selfBaseUrl,
          'redirect_uri': `${this.options.dingus.selfBaseUrl}admin/_ia`,
          'state': session.state,
          'code_challenge': pkce.codeChallenge,
          'code_challenge_method': pkce.codeChallengeMethod,
          'me': me,
        }).forEach(([name, value]) => authorizationEndpoint.searchParams.set(name, value));
      }
    }

    if (ctx.errors.length) {
      res.end(Template.adminLoginHTML(ctx, this.options));
      return;
    }

    await this._sessionCookieSet(res, session, this.cookieLifespan);
    res.setHeader(Enum.Header.Location, authorizationEndpoint.href);
    res.statusCode = 302; // Found
    res.end();

    this.logger.info(_scope, 'finished indieauth', { ctx })
  }


  /**
   * GET request to remove current credentials.
   * @param {http.ServerResponse} res
   * @param {Object} ctx
   */
  async getAdminLogout(res, ctx) {
    const _scope = _fileScope('getAdminLogout');
    this.logger.debug(_scope, 'called', { ctx });

    this._sessionCookieSet(res, '', 0);
    res.statusCode = 302;
    res.setHeader(Enum.Header.Location, './');
    res.end();

    this.logger.info(_scope, 'finished', { ctx });
  }


  /**
   * GET request for returning IndieAuth redirect.
   * @param {http.ServerResponse} res
   * @param {Object} ctx
   */
  async getAdminIA(res, ctx) {
    const _scope = _fileScope('getAdminIA');
    this.logger.debug(_scope, 'called', { ctx });

    ctx.errors = [];
    ctx.session = {};

    // Unpack cookie to restore session data

    const [ cookieName, cookieValue ] = common.splitFirst((ctx.cookie || ''), '=', '');
    if (cookieName !== 'WSHas') {
      this.logger.debug(_scope, 'no cookie', { ctx });
      ctx.errors.push('missing required cookie');
    } else {
      try {
        ctx.session = await this.mysteryBox.unpack(cookieValue);
        this.logger.debug(_scope, 'restored session from cookie', { ctx });
      } catch (e) {
        this.logger.debug(_scope, 'could not unpack cookie');
        ctx.errors.push('invalid cookie');
      }
    }

    // Validate unpacked session values

    // Add any auth errors
    if (ctx.queryParams['error']) {
      ctx.errors.push(ctx.queryParams['error']);
      if (ctx.queryParams['error_description']) {
        ctx.errors.push(ctx.queryParams['error_description']);
      }
    }

    // check stuff
    if (ctx.queryParams['state'] !== ctx.session.state) {
      this.logger.debug(_scope, 'state mismatch', { ctx });
      ctx.errors.push('invalid state');
    }

    const code = ctx.queryParams['code'];
    if (!code) {
      this.logger.debug(_scope, 'missing code', { ctx });
      ctx.errors.push('invalid code');
    }

    let redeemProfileUrl;
    try {
      redeemProfileUrl = new URL(ctx.session.authorizationEndpoint);
    } catch (e) {
      this.logger.debug(_scope, 'failed to parse restored session authorization endpoint as url', { ctx });
      ctx.errors.push('invalid cookie');
    }
    let profile;
    if (redeemProfileUrl) {
      profile = await this.indieAuthCommunication.redeemProfileCode(redeemProfileUrl, code, ctx.session.codeVerifier, this.options.dingus.selfBaseUrl, `${this.options.dingus.selfBaseUrl}admin/_ia`);
      if (!profile) {
        this.logger.debug(_scope, 'no profile from code redemption', { ctx });
        ctx.errors.push('did not get a profile response from authorization endpoint code redemption');
      } else if (!profile.me) {
        this.logger.debug(_scope, 'no profile me identifier from code redemption', { ctx });
        ctx.errors.push('did not get \'me\' value from authorization endpoint code redemption');
      } else if (profile.me !== ctx.session.me) {
        this.logger.debug(_scope, 'mis-matched canonical me from redeemed profile', { ctx, profile });
        const newProfileUrl = new URL(profile.me);
        // Rediscover auth endpoint for the new returned profile.
        const newProfile = await this.indieAuthCommunication.fetchProfile(newProfileUrl);
        if (newProfile.authorizationEndpoint !== ctx.session.authorizationEndpoint) {
          this.logger.debug(_scope, 'mis-matched auth endpoints between provided me and canonical me', { ctx, profile, newProfile });
          ctx.errors.push('canonical profile url provided by authorization endpoint is not handled by that endpoint, cannot continue');
        } else {
          // The endpoints match, all is okay, update our records.
          ctx.session.me = profile.me;
        }
      }
    }

    if (ctx.errors.length) {
      await this._sessionCookieSet(res, '', 0);
      res.end(Template.adminIAHTML(ctx, this.options));
      return;
    }

    // set cookie as auth valid, redirect to admin
    ctx.session = {
      authenticatedProfile: ctx.session.me,
    };

    await this._sessionCookieSet(res, ctx.session, this.cookieLifespan);
    res.statusCode = 302;
    res.setHeader(Enum.Header.Location, './');
    res.end();

    this.logger.info(_scope, 'finished', { ctx })
  }


}

module.exports = SessionManager;