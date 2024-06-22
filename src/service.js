'use strict';

/**
 * Here we extend the base API server to define our routes and any route-specific
 * behavior (middlewares) before handing off to the manager.
 */

const { Dingus } = require('@squeep/api-dingus');
const common = require('./common');
const Enum = require('./enum');
const Manager = require('./manager');
const { Authenticator, SessionManager } = require('@squeep/authentication-module');
const { initContext, navLinks } = require('./template/template-helper');
const path = require('path');

const _fileScope = common.fileScope(__filename);

class Service extends Dingus {
  constructor(logger, db, options, asyncLocalStorage) {
    super(logger, {
      ...options.dingus,
      ignoreTrailingSlash: false,
    });
    this.asyncLocalStorage = asyncLocalStorage;
    this.manager = new Manager(logger, db, options);
    this.authenticator = new Authenticator(logger, db, options);
    this.sessionManager = new SessionManager(logger, this.authenticator, options);
    this.staticPath = path.join(__dirname, '..', 'static');
    this.loginPath = `${options.dingus.proxyPrefix}/admin/login`;

    // Primary API endpoint
    this.on('POST', '/', this.handlerPostRoot.bind(this));

    // Information page about service
    this.on(['GET'], '/', this.handlerGetRoot.bind(this));

    // Give load-balancers something to check
    this.on(['GET'], '/healthcheck', this.handlerGetHealthcheck.bind(this));

    // Public information about topics
    this.on('GET', '/info', this.handlerGetInfo.bind(this));
    this.on('GET', '/info/', this.handlerGetInfo.bind(this));

    // These routes are intended for accessing static content during development.
    // In production, a proxy server would likely handle these first.
    this.on(['GET'], '/static', this.handlerRedirect.bind(this), `${options.dingus.proxyPrefix}/static/`);
    this.on(['GET'], '/static/', this.handlerGetStaticFile.bind(this), 'index.html');
    this.on(['GET'], '/static/:file', this.handlerGetStaticFile.bind(this));
    this.on(['GET'], '/favicon.ico', this.handlerGetStaticFile.bind(this), 'favicon.ico');
    this.on(['GET'], '/robots.txt', this.handlerGetStaticFile.bind(this), 'robots.txt');

    // Private informational endpoints
    this.on(['GET'], '/admin', this.handlerRedirect.bind(this), `${options.dingus.proxyPrefix}/admin/`);
    this.on(['GET'], '/admin/', this.handlerGetAdminOverview.bind(this));
    this.on(['GET'], '/admin/topic/:topicId', this.handlerGetAdminTopicDetails.bind(this));
    this.on(['GET'], '/admin/topic/:topicId/history.svg', this.handlerGetHistorySVG.bind(this));

    // Private data-editing endpoints
    this.on(['PATCH', 'DELETE'], '/admin/topic/:topicId', this.handlerUpdateTopic.bind(this));
    this.on(['PATCH', 'DELETE'], '/admin/subscription/:subscriptionId', this.handlerUpdateSubscription.bind(this));

    // Private server-action endpoints
    this.on('POST', '/admin/process', this.handlerPostAdminProcess.bind(this));

    // Admin login
    this.on(['GET'], '/admin/login', this.handlerGetAdminLogin.bind(this));
    this.on(['POST'], '/admin/login', this.handlerPostAdminLogin.bind(this));
    this.on(['GET'], '/admin/logout', this.handlerGetAdminLogout.bind(this));
    this.on(['GET'], '/admin/_ia', this.handlerGetAdminIA.bind(this));
    this.on(['GET'], '/admin/settings', this.handlerGetAdminSettings.bind(this));
    this.on(['POST'], '/admin/settings', this.handlerPostAdminSettings.bind(this));

  }

  /**
   * @typedef {import('node:http')} http
   */

  /**
   * Rearrange logging data.
   * @param {http.ClientRequest} req request
   * @param {http.ServerResponse} res response
   * @param {object} ctx context
   */
  async preHandler(req, res, ctx) {
    await super.preHandler(req, res, ctx);
    ctx.url = req.url; // Persisted for logout redirect

    const logObject = this.asyncLocalStorage.getStore();
    // FIXME: for some reason, returning from the super.preHandler sometimes loses async context?
    // Workaround until cause and solution are found.
    if (logObject) {
      logObject.requestId = ctx.requestId;
      delete ctx.requestId;
    } else {
      this.logger.debug(_fileScope('preHandler'), 'lost async context', { req, ctx });
    }
  }


  /**
   * @param {http.ClientRequest} req request
   * @param {http.ServerResponse} res response
   * @param {object} ctx context
   */
  async handlerPostRoot(req, res, ctx) {
    const _scope = _fileScope('handlerPostRoot');
    this.logger.debug(_scope, 'called', { req, ctx });

    initContext(ctx);

    this.setResponseType(this.responseTypes, req, res, ctx);
    await this.ingestBody(req, res, ctx);

    await this.manager.postRoot(req, res, ctx);
  }


  /**
   * @param {http.ClientRequest} req request
   * @param {http.ServerResponse} res response
   * @param {object} ctx context
   */
  async handlerGetRoot(req, res, ctx) {
    const _scope = _fileScope('handlerGetRoot');
    const responseTypes = [
      Enum.ContentType.TextHTML,
    ];
    this.logger.debug(_scope, 'called', { req, ctx });

    initContext(ctx);

    this.setResponseType(responseTypes, req, res, ctx);

    await this.authenticator.sessionOptional(req, res, ctx, this.loginPath);

    await this.manager.getRoot(req, res, ctx);
  }


  /**
   * @param {http.ClientRequest} req request
   * @param {http.ServerResponse} res response
   * @param {object} ctx context
   */
  async handlerGetHealthcheck(req, res, ctx) {
    const _scope = _fileScope('handlerGetHealthcheck');
    this.logger.debug(_scope, 'called', { req, ctx });

    this.setResponseType(this.responseTypes, req, res, ctx);

    await this.manager.getHealthcheck(res, ctx);
  }


  /**
   * @param {http.ClientRequest} req request
   * @param {http.ServerResponse} res response
   * @param {object} ctx context
   */
  async handlerGetInfo(req, res, ctx) {
    const _scope = _fileScope('handlerGetInfo');
    this.logger.debug(_scope, 'called', { req, ctx });

    const responseTypes = [...this.responseTypes, Enum.ContentType.ImageSVG];

    this.setResponseType(responseTypes, req, res, ctx);

    await this.manager.getInfo(res, ctx);
  }


  async handlerGetHistorySVG(req, res, ctx) {
    const _scope = _fileScope('handlerGetHist');
    this.logger.debug(_scope, 'called', { req, ctx });

    const responseTypes = [Enum.ContentType.ImageSVG];

    this.setResponseType(responseTypes, req, res, ctx);

    await this.manager.getHistorySVG(res, ctx);
  }


  /**
   * @param {http.ClientRequest} req request
   * @param {http.ServerResponse} res response
   * @param {object} ctx context
   */
  async handlerGetAdminOverview(req, res, ctx) {
    const _scope = _fileScope('handlerGetAdminOverview');
    this.logger.debug(_scope, 'called', { req, ctx });

    initContext(ctx);

    this.setResponseType(this.responseTypes, req, res, ctx);

    if (await this.authenticator.sessionRequired(req, res, ctx, this.loginPath)) {
      await this.manager.getAdminOverview(res, ctx);
    }
  }


  /**
   * @param {http.ClientRequest} req request
   * @param {http.ServerResponse} res response
   * @param {object} ctx context
   */
  async handlerGetAdminTopicDetails(req, res, ctx) {
    const _scope = _fileScope('handlerGetAdminTopicDetails');
    this.logger.debug(_scope, 'called', { req, ctx });

    initContext(ctx);

    this.setResponseType(this.responseTypes, req, res, ctx);

    if (await this.authenticator.sessionRequired(req, res, ctx, this.loginPath)) {
      await this.manager.getTopicDetails(res, ctx);
    }
  }


  /**
   * If no body was sent, do not parse (and thus avoid possible unsupported media type error).
   * @param {http.ClientRequest} req request
   * @param {http.ServerResponse} res response
   * @param {object} ctx context
   * @returns {Promise<object>} parsed body
   */
  async maybeIngestBody(req, res, ctx) {
    return super.ingestBody(req, res, ctx, {
      parseEmptyBody: false,
    });
  }


  /**
   * @param {http.ClientRequest} req request
   * @param {http.ServerResponse} res response
   * @param {object} ctx context
   */
  async handlerUpdateTopic(req, res, ctx) {
    const _scope = _fileScope('handlerUpdateTopic');
    this.logger.debug(_scope, 'called', { req, ctx });

    this.setResponseType(this.responseTypes, req, res, ctx);

    await this.authenticator.apiRequiredLocal(req, res, ctx);

    await this.maybeIngestBody(req, res, ctx);
    ctx.method = req.method;
    await this.manager.updateTopic(res, ctx);
  }


  /**
   * @param {http.ClientRequest} req request
   * @param {http.ServerResponse} res response
   * @param {object} ctx context
   */
  async handlerUpdateSubscription(req, res, ctx) {
    const _scope = _fileScope('handlerUpdateSubscription');
    this.logger.debug(_scope, 'called', { req, ctx });

    this.setResponseType(this.responseTypes, req, res, ctx);

    await this.authenticator.apiRequiredLocal(req, res, ctx);

    await this.maybeIngestBody(req, res, ctx);
    ctx.method = req.method;
    await this.manager.updateSubscription(res, ctx);
  }


  /**
   * @param {http.ClientRequest} req request
   * @param {http.ServerResponse} res response
   * @param {object} ctx context
   */
  async handlerPostAdminProcess(req, res, ctx) {
    const _scope = _fileScope('handlerPostAdminProcess');
    this.logger.debug(_scope, 'called', { req, ctx });

    this.setResponseType(this.responseTypes, req, res, ctx);

    await this.authenticator.apiRequiredLocal(req, res, ctx);

    await this.manager.processTasks(res, ctx);
  }


  /**
   * Delegate login to authentication module.
   * @param {http.ClientRequest} req request
   * @param {http.ServerResponse} res response
   * @param {object} ctx context
   */
  async handlerGetAdminLogin(req, res, ctx) {
    const _scope = _fileScope('handlerGetAdminLogin');
    this.logger.debug(_scope, 'called', { req, ctx });

    initContext(ctx);

    this.setResponseType(this.responseTypes, req, res, ctx);

    await this.sessionManager.getAdminLogin(res, ctx);
  }


  /**
   * Delegate login to authentication module.
   * @param {http.ClientRequest} req request
   * @param {http.ServerResponse} res response
   * @param {object} ctx context
   */
  async handlerPostAdminLogin(req, res, ctx) {
    const _scope = _fileScope('handlerPostAdminLogin');
    this.logger.debug(_scope, 'called', { req, ctx });

    initContext(ctx);

    this.setResponseType(this.responseTypes, req, res, ctx);

    await this.authenticator.sessionOptionalLocal(req, res, ctx);

    await this.maybeIngestBody(req, res, ctx);

    await this.sessionManager.postAdminLogin(res, ctx);
  }


  /**
   * Delegate account settings to authentication module.
   * @param {http.ClientRequest} req request
   * @param {http.ServerResponse} res response
   * @param {object} ctx context
   */
  async handlerGetAdminSettings(req, res, ctx) {
    const _scope = _fileScope('handlerGetAdminSettings');
    this.logger.debug(_scope, 'called', { req, ctx });

    initContext(ctx);

    this.setResponseType(this.responseTypes, req, res, ctx);

    if (await this.authenticator.sessionRequiredLocal(req, res, ctx)) {
      await this.sessionManager.getAdminSettings(res, ctx, navLinks);
    }
  }


  /**
   * Delegate account settings to authentication module.
   * @param {http.ClientRequest} req request
   * @param {http.ServerResponse} res response
   * @param {object} ctx context
   */
  async handlerPostAdminSettings(req, res, ctx) {
    const _scope = _fileScope('handlerPostAdminSettings');
    this.logger.debug(_scope, 'called', { req, ctx });

    initContext(ctx);

    this.setResponseType(this.responseTypes, req, res, ctx);

    if (await this.authenticator.sessionRequiredLocal(req, res, ctx)) {
      await this.maybeIngestBody(req, res, ctx);
      await this.sessionManager.postAdminSettings(res, ctx, navLinks);
    }
  }


  /**
   * Delegate login to authentication module.
   * @param {http.ClientRequest} req request
   * @param {http.ServerResponse} res response
   * @param {object} ctx context
   */
  async handlerGetAdminLogout(req, res, ctx) {
    const _scope = _fileScope('handlerGetAdminLogout');
    this.logger.debug(_scope, 'called', { req, ctx });

    initContext(ctx);

    this.setResponseType(this.responseTypes, req, res, ctx);

    await this.authenticator.sessionOptionalLocal(req, res, ctx);

    await this.sessionManager.getAdminLogout(res, ctx);
  }


  /**
   * Delegate login to authentication module.
   * @param {http.ClientRequest} req request
   * @param {http.ServerResponse} res response
   * @param {object} ctx context
   */
  async handlerGetAdminIA(req, res, ctx) {
    const _scope = _fileScope('handlerGetAdminIA');
    this.logger.debug(_scope, 'called', { req, ctx });

    initContext(ctx);

    this.setResponseType(this.responseTypes, req, res, ctx);

    await this.sessionManager.getAdminIA(res, ctx);
  }

}

module.exports = Service;
