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
const path = require('path');

const _fileScope = common.fileScope(__filename);

class Service extends Dingus {
  constructor(logger, db, options) {
    super(logger, {
      ...options.dingus,
      ignoreTrailingSlash: false,
    });

    this.manager = new Manager(logger, db, options);
    this.authenticator = new Authenticator(logger, db, options);
    this.sessionManager = new SessionManager(logger, this.authenticator, options);
    this.staticPath = path.join(__dirname, '..', 'static');
    this.loginPath = `${options.dingus.proxyPrefix}/admin/login`;

    // Primary API endpoint
    this.on('POST', '/', this.handlerPostRoot.bind(this));

    // Information page about service
    this.on(['GET', 'HEAD'], '/', this.handlerGetRoot.bind(this));

    // Give load-balancers something to check
    this.on(['GET', 'HEAD'], '/healthcheck', this.handlerGetHealthcheck.bind(this));

    // Public information about topics
    this.on('GET', '/info', this.handlerGetInfo.bind(this));
    this.on('GET', '/info/', this.handlerGetInfo.bind(this));

    // These routes are intended for accessing static content during development.
    // In production, a proxy server would likely handle these first.
    this.on(['GET', 'HEAD'], '/static', this.handlerRedirect.bind(this), `${options.dingus.proxyPrefix}/static/`);
    this.on(['GET', 'HEAD'], '/static/', this.handlerGetStaticFile.bind(this), 'index.html');
    this.on(['GET', 'HEAD'], '/static/:file', this.handlerGetStaticFile.bind(this));
    this.on(['GET', 'HEAD'], '/favicon.ico', this.handlerGetStaticFile.bind(this), 'favicon.ico');
    this.on(['GET', 'HEAD'], '/robots.txt', this.handlerGetStaticFile.bind(this), 'robots.txt');

    // Private informational endpoints
    this.on(['GET', 'HEAD'], '/admin', this.handlerRedirect.bind(this), `${options.dingus.proxyPrefix}/admin/`);
    this.on(['GET', 'HEAD'], '/admin/', this.handlerGetAdminOverview.bind(this));
    this.on(['GET', 'HEAD'], '/admin/topic/:topicId', this.handlerGetAdminTopicDetails.bind(this));

    // Private data-editing endpoints
    this.on(['PATCH', 'DELETE'], '/admin/topic/:topicId', this.handlerUpdateTopic.bind(this));
    this.on(['PATCH', 'DELETE'], '/admin/subscription/:subscriptionId', this.handlerUpdateSubscription.bind(this));

    // Private server-action endpoints
    this.on('POST', '/admin/process', this.handlerPostAdminProcess.bind(this));

    // Admin login
    this.on(['GET', 'HEAD'], '/admin/login', this.handlerGetAdminLogin.bind(this));
    this.on(['POST'], '/admin/login', this.handlerPostAdminLogin.bind(this));
    this.on(['GET'], '/admin/logout', this.handlerGetAdminLogout.bind(this));
    this.on(['GET'], '/admin/_ia', this.handlerGetAdminIA.bind(this));

  }


  /**
   * @param {http.ClientRequest} req
   * @param {http.ServerResponse} res
   * @param {Object} ctx
   */
  async handlerPostRoot(req, res, ctx) {
    const _scope = _fileScope('handlerPostRoot');
    this.logger.debug(_scope, 'called', { req: common.requestLogData(req), ctx });

    this.setResponseType(this.responseTypes, req, res, ctx);
    await this.ingestBody(req, res, ctx);

    await this.manager.postRoot(req, res, ctx);
  }


  /**
   * @param {http.ClientRequest} req
   * @param {http.ServerResponse} res
   * @param {Object} ctx
   */
  async handlerGetRoot(req, res, ctx) {
    const _scope = _fileScope('handlerGetRoot');
    const responseTypes = [
      Enum.ContentType.TextHTML,
    ];
    this.logger.debug(_scope, 'called', { req: common.requestLogData(req), ctx });

    Dingus.setHeadHandler(req, res, ctx);

    this.setResponseType(responseTypes, req, res, ctx);

    await this.manager.getRoot(req, res, ctx);
  }


  /**
   * @param {http.ClientRequest} req
   * @param {http.ServerResponse} res
   * @param {Object} ctx
   */
  async handlerGetHealthcheck(req, res, ctx) {
    const _scope = _fileScope('handlerGetHealthcheck');
    this.logger.debug(_scope, 'called', { req: common.requestLogData(req), ctx });
  
    Dingus.setHeadHandler(req, res, ctx);

    this.setResponseType(this.responseTypes, req, res, ctx);

    await this.manager.getHealthcheck(res, ctx);
  }


  /**
   * @param {http.ClientRequest} req
   * @param {http.ServerResponse} res
   * @param {Object} ctx
   */
  async handlerGetInfo(req, res, ctx) {
    const _scope = _fileScope('handlerGetInfo');
    this.logger.debug(_scope, 'called', { req: common.requestLogData(req), ctx });

    const responseTypes = [...this.responseTypes, Enum.ContentType.ImageSVG];

    Dingus.setHeadHandler(req, res, ctx);

    this.setResponseType(responseTypes, req, res, ctx);

    await this.manager.getInfo(res, ctx);
  }


  /**
   * @param {http.ClientRequest} req
   * @param {http.ServerResponse} res
   * @param {Object} ctx
   */
  async handlerGetAdminOverview(req, res, ctx) {
    const _scope = _fileScope('handlerGetAdminOverview');
    this.logger.debug(_scope, 'called', { req: common.requestLogData(req), ctx });

    Dingus.setHeadHandler(req, res, ctx);

    this.setResponseType(this.responseTypes, req, res, ctx);

    await this.authenticator.sessionRequired(req, res, ctx, this.loginPath);

    await this.manager.getAdminOverview(res, ctx);
  }


  /**
   * @param {http.ClientRequest} req
   * @param {http.ServerResponse} res
   * @param {Object} ctx
   */
  async handlerGetAdminTopicDetails(req, res, ctx) {
    const _scope = _fileScope('handlerGetAdminTopicDetails');
    this.logger.debug(_scope, 'called', { req: common.requestLogData(req), ctx });

    Dingus.setHeadHandler(req, res, ctx);

    this.setResponseType(this.responseTypes, req, res, ctx);

    await this.authenticator.sessionRequired(req, res, ctx, this.loginPath);

    await this.manager.getTopicDetails(res, ctx);
  }


  /**
   * Similar to super.ingestBody, but if no body was sent, do not parse (and
   * thus avoid possible unsupported media type error).
   * Also removes raw body from context, to simplify scrubbing sensitive data from logs.
   * @param {http.ClientRequest} req
   * @param {http.ServerResponse} res
   * @param {Object} ctx
   */
  async maybeIngestBody(req, res, ctx) {
    ctx.rawBody = await this.bodyData(req);
    const contentType = Dingus.getRequestContentType(req);
    if (ctx.rawBody) {
      this.parseBody(contentType, ctx);
      delete ctx.rawBody;
    }
  }


  /**
   * @param {http.ClientRequest} req
   * @param {http.ServerResponse} res
   * @param {Object} ctx
   */
  async handlerUpdateTopic(req, res, ctx) {
    const _scope = _fileScope('handlerUpdateTopic');
    this.logger.debug(_scope, 'called', { req: common.requestLogData(req), ctx });

    this.setResponseType(this.responseTypes, req, res, ctx);

    await this.authenticator.apiRequiredLocal(req, res, ctx);

    await this.maybeIngestBody(req, res, ctx);
    ctx.method = req.method;
    await this.manager.updateTopic(res, ctx);
  }


  /**
   * @param {http.ClientRequest} req
   * @param {http.ServerResponse} res
   * @param {Object} ctx
   */
  async handlerUpdateSubscription(req, res, ctx) {
    const _scope = _fileScope('handlerUpdateSubscription');
    this.logger.debug(_scope, 'called', { req: common.requestLogData(req), ctx });

    this.setResponseType(this.responseTypes, req, res, ctx);

    await this.authenticator.apiRequiredLocal(req, res, ctx);

    await this.maybeIngestBody(req, res, ctx);
    ctx.method = req.method;
    await this.manager.updateSubscription(res, ctx);
  }
  

  /**
   * @param {http.ClientRequest} req
   * @param {http.ServerResponse} res
   * @param {Object} ctx
   */
  async handlerPostAdminProcess(req, res, ctx) {
    const _scope = _fileScope('handlerPostAdminProcess');
    this.logger.debug(_scope, 'called', { req: common.requestLogData(req), ctx });

    this.setResponseType(this.responseTypes, req, res, ctx);

    await this.authenticator.apiRequiredLocal(req, res, ctx);

    await this.manager.processTasks(res, ctx);
  }


  /**
   * Delegate login to authentication module.
   * @param {http.ClientRequest} req
   * @param {http.ServerResponse} res
   * @param {Object} ctx
   */
  async handlerGetAdminLogin(req, res, ctx) {
    const _scope = _fileScope('handlerGetAdminLogin');
    this.logger.debug(_scope, 'called', { req: common.requestLogData(req), ctx });

    Dingus.setHeadHandler(req, res, ctx);

    this.setResponseType(this.responseTypes, req, res, ctx);

    await this.sessionManager.getAdminLogin(res, ctx);
  }


  /**
   * Delegate login to authentication module.
   * @param {http.ClientRequest} req
   * @param {http.ServerResponse} res
   * @param {Object} ctx
   */
  async handlerPostAdminLogin(req, res, ctx) {
    const _scope = _fileScope('handlerPostAdminLogin');
    this.logger.debug(_scope, 'called', { req: common.requestLogData(req), ctx });

    this.setResponseType(this.responseTypes, req, res, ctx);

    await this.authenticator.sessionOptionalLocal(req, res, ctx);

    await this.maybeIngestBody(req, res, ctx);

    await this.sessionManager.postAdminLogin(res, ctx);
  }


  /**
   * Delegate login to authentication module.
   * @param {http.ClientRequest} req
   * @param {http.ServerResponse} res
   * @param {Object} ctx
   */
  async handlerGetAdminLogout(req, res, ctx) {
    const _scope = _fileScope('handlerGetAdminLogout');
    this.logger.debug(_scope, 'called', { req: common.requestLogData(req), ctx });

    this.setResponseType(this.responseTypes, req, res, ctx);

    await this.authenticator.sessionOptionalLocal(req, res, ctx);

    await this.sessionManager.getAdminLogout(res, ctx);
  }


  /**
   * Delegate login to authentication module.
   * @param {http.ClientRequest} req
   * @param {http.ServerResponse} res
   * @param {Object} ctx
   */
  async handlerGetAdminIA(req, res, ctx) {
    const _scope = _fileScope('handlerGetAdminIA');
    this.logger.debug(_scope, 'called', { req: common.requestLogData(req), ctx });

    this.setResponseType(this.responseTypes, req, res, ctx);

    // Special case here, to see cookie before session established
    ctx.cookie = req.getHeader(Enum.Header.Cookie);

    await this.sessionManager.getAdminIA(res, ctx);
  }

}

module.exports = Service;
