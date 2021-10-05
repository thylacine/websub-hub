'use strict';

/**
 * Here we process all the incoming requests.
 * Payload validation occurs here, before committing the pending work to the
 * database and (usually) calling a processor to act upon it.
 *
 * As this is the mediator between server framework and actions, this would
 * be where most of a rewrite for a new server framework would happen.
 */

const common = require('./common');
const Communication = require('./communication');
const Enum = require('./enum');
const Errors = require('./errors');
const DBErrors = require('./db/errors');
const { ResponseError } = require('./errors');
const Template = require('./template');

const _fileScope = common.fileScope(__filename);

class Manager {
  constructor(logger, db, options) {
    this.logger = logger;
    this.db = db;
    this.options = options;
    this.communication = new Communication(logger, db, options);

    // Precalculate the invariant root GET metadata.
    this.getRootContent = Template.rootHTML(undefined, options);
    const now = new Date();
    this.startTimeString = now.toGMTString();
    this.startTimeMs = now.getTime();
    this.getRootETag = common.generateETag(undefined, undefined, this.getRootContent);
  }


  /**
   * GET request for healthcheck.
   * @param {http.ServerResponse} res
   * @param {object} ctx
   */
  async getHealthcheck(res, ctx) {
    const _scope = _fileScope('getHealthcheck');
    const health = 'happy';

    // What else could we check...
    const dbHealth = await this.db.healthCheck();
    this.logger.debug(_scope, 'called', { health, dbHealth, ctx });
    res.end(health);
  }


  /**
   * GET request for root.
   * @param {http.ClientRequest} req
   * @param {http.ServerResponse} res
   * @param {object} ctx
   */
  async getRoot(req, res, ctx) {
    const _scope = _fileScope('getRoot');
    this.logger.debug(_scope, 'called', { ctx });

    res.setHeader(Enum.Header.LastModified, this.startTimeString);
    res.setHeader(Enum.Header.ETag, this.getRootETag);

    if (common.isClientCached(req, this.startTimeMs, this.getRootETag)) {
      this.logger.debug(_scope, 'client cached response', { ctx });
      res.statusCode = 304;
      res.end();
      return;
    }
    res.end(this.getRootContent);
    this.logger.info(_scope, 'finished', { ctx });
  }


  /** All the fields the root handler deals with.
   * @typedef {object} RootData
   * @property {string} callback - url
   * @property {string} mode
   * @property {string} topic
   * @property {number} topicId
   * @property {string} leaseSeconds
   * @property {string} secret
   * @property {string} httpRemoteAddr
   * @property {string} httpFrom
   * @property {boolean} isSecure
   * @property {boolean} isPublisherValidated
   */

  /**
   * Extract api parameters.
   * @param {http.ClientRequest} req 
   * @param {Object} ctx
   * @returns {RootData}
   */
  static _getRootData(req, ctx) {
    const postData = ctx.parsedBody;
    const mode = (postData['hub.mode'] || '').toLowerCase();
    return {
      callback: postData['hub.callback'],
      mode,
      ...(mode === Enum.Mode.Publish && { url: postData['hub.url'] }), // Publish accepts either hub.url or hub.topic
      topic: postData['hub.topic'],
      ...(postData['hub.lease_seconds'] && { leaseSeconds: parseInt(postData['hub.lease_seconds'], 10) }),
      secret: postData['hub.secret'],
      httpRemoteAddr: ctx.clientAddress,
      httpFrom: req.getHeader(Enum.Header.From),
      isSecure: ((ctx.clientProtocol || '').toLowerCase() === 'https'),
      isPublisherValidated: true, // Default to true. Will be set to false later, if topic has publisher validation url.
    };
  }


  /**
   * 
   * @param {*} dbCtx
   * @param {RootData} data
   * @param {String[]} warn
   * @param {String[]} err
   * @param {String} requestId
   */
  async _validateRootData(dbCtx, data, warn, err, requestId) {
    // These checks can modify data, so order matters.
    await this._checkTopic(dbCtx, data, warn, err, requestId);
    this._checkCallbackAndSecrets(data, warn, err, requestId);
    await this._checkMode(dbCtx, data, warn, err, requestId);
  }


  /**
   * Check that requested topic exists and values are in range.
   * Sets topic id, publisher validation state, and requested lease
   * seconds on data.
   * @param {*} dbCtx
   * @param {RootData} data
   * @param {String[]} warn
   * @param {String[]} err
   */
  async _checkTopic(dbCtx, data, warn, err, requestId) {
    const _scope = _fileScope('_checkTopic');
    let topic;

    if (data.topic) {
      topic = await this.db.topicGetByUrl(dbCtx, data.topic);

      if (!topic && this._newTopicCreationAllowed()) {
        this.logger.info(_scope, 'new topic from subscribe request', { data, requestId });

        try {
          new URL(data.topic);
        } catch (e) {
          err.push('invalid topic url (failed to parse url)');
          return;
        }

        await this.db.topicSet(dbCtx, {
          url: data.topic,
        });
        topic = await this.db.topicGetByUrl(dbCtx, data.topic);
      }
    }

    if (!topic || topic.isDeleted) {
      err.push('not a supported topic');
      return;
    }

    data.topicId = topic.id;

    if (data.leaseSeconds === undefined || isNaN(data.leaseSeconds)) {
      data.leaseSeconds = topic.leaseSecondsPreferred;
    } else {
      if (data.leaseSeconds > topic.leaseSecondsMax) {
        data.leaseSeconds = topic.leaseSecondsMax;
        warn.push(`requested lease too long, using ${data.leaseSeconds}`);
      } else if (data.leaseSeconds < topic.leaseSecondsMin) {
        data.leaseSeconds = topic.leaseSecondsMin;
        warn.push(`requested lease too short, using ${data.leaseSeconds}`);
      }
    }

    if (topic.publisherValidationUrl) {
      data.isPublisherValidated = false;
    }
  }


  /**
   * Check data for valid callback url and scheme constraints.
   * @param {RootData} data
   * @param {String[]} warn
   * @param {String[]} err
   */
  _checkCallbackAndSecrets(data, warn, err) {
    let isCallbackSecure = false;

    if (!data.callback) {
      err.push('invalid callback url (empty)');
    } else {
      try {
        const c = new URL(data.callback);
        isCallbackSecure = (c.protocol.toLowerCase() === 'https:'); // Colon included because url module is weird
      } catch (e) {
        err.push('invalid callback url (failed to parse url');
        return;
      }
    }

    if (!isCallbackSecure) {
      warn.push('insecure callback');
    }

    if (data.secret) {
      const secretSeverity = this.options.manager.strictSecrets ? err : warn;
      if (!data.isSecure) {
        secretSeverity.push('secret not safe (insecure hub)');
      }
      if (!isCallbackSecure) {
        secretSeverity.push('secret not safe (insecure callback)');
      }
      if (data.secret.length > 199) {
        err.push('cannot keep a secret that big');
      }
    }
  }

  /**
   * Check mode validity and subscription requirements.
   * Publish mode is handled elsewhere in the flow.
   * @param {*} dbCtx
   * @param {RootData} data
   * @param {String[]} warn
   * @param {String[]} err
   * @param {String} requestId
   */
  async _checkMode(dbCtx, data, warn, err) {
    switch (data.mode) {
      case Enum.Mode.Subscribe:
        break;

      case Enum.Mode.Unsubscribe: {
        const currentEpoch = Date.now() / 1000;
        let s;
        if (data.callback && data.topicId) {
          s = await this.db.subscriptionGet(dbCtx, data.callback, data.topicId);
        }
        if (s === undefined) {
          err.push('not subscribed');
        } else {
          if (s.expires < currentEpoch) {
            err.push('subscription already expired');
          }
        }
        break;
      }

      default: {
        err.push('invalid mode');
      }
    }
  }


  /**
   * Determine if a topic url is allowed to be created.
   * In the future, this may be more complicated.
   * @returns {Boolean}
   */
  _newTopicCreationAllowed() {
    return this.options.manager.publicHub;
  }


  /**
   * Check that a publish request's topic(s) are valid and exist,
   * returning an array with the results for each.
   * For a public-hub publish request, creates topics if they do not exist.
   * @param {*} dbCtx
   * @param {RootData} data
   * @param {String[]} warn
   * @param {String[]} err
   * @param {String} requestId
   */
  async _publishTopics(dbCtx, data, requestId) {
    const _scope = _fileScope('_checkPublish');

    // Publish requests may include multiple topics, consider them all, but deduplicate.
    const publishUrls = Array.from(new Set([
      ...common.ensureArray(data.url),
      ...common.ensureArray(data.topic),
    ]));

    // Map the requested topics to their ids, creating if necessary.
    return Promise.all(publishUrls.map(async (url) => {
      const result = {
        url,
        warn: [],
        err: [],
        topicId: undefined,
      };
      let topic = await this.db.topicGetByUrl(dbCtx, url);
      if (!topic && this._newTopicCreationAllowed()) {
        try {
          new URL(url);
        } catch (e) {
          result.err.push('invalid topic url (failed to parse url)');
          return result;
        }
        await this.db.topicSet(dbCtx, {
          // TODO: accept a publisherValidationUrl parameter
          url,
        });
        topic = await this.db.topicGetByUrl(dbCtx, url);
        this.logger.info(_scope, 'new topic from publish request', { url, requestId });
      }
      if (!topic || topic.isDeleted) {
        result.err.push('topic not supported');
        return result;
      }
      result.topicId = topic.id;
      return result;
    }));
  }


  /**
   * Render response for multi-topic publish requests.
   * @param {Object[]} publishTopics
   */
  static multiPublishContent(ctx, publishTopics) {
    const responses = publishTopics.map((topic) => ({
      href: topic.url,
      status: topic.status,
      statusMessage: topic.statusMessage,
      errors: topic.err,
      warnings: topic.warn,
    }));
    switch (ctx.responseType) {
      case Enum.ContentType.ApplicationJson:
        return JSON.stringify(responses);

      case Enum.ContentType.TextPlain:
      default: {
        const textResponses = responses.map((response) => {
          const details = Manager._prettyDetails(response.errors, response.warnings);
          const textDetails = (details.length ? '\n' : '') + details.map((d) => `\t${d}`).join('\n');
          return `${response.href} [${response.status} ${response.statusMessage}]${textDetails}`;
        });
        return textResponses.join('\n----\n');
      }
    }
  }


  /**
   * Process a publish request.
   * @param {*} dbCtx
   * @param {Object} data
   * @param {http.ServerResponse} res
   * @param {Object} ctx
   */
  async _publishRequest(dbCtx, data, res, ctx) {
    const _scope = _fileScope('_parsePublish');
    this.logger.debug(_scope, 'called', { data });

    const requestId = ctx.requestId;

    // Parse and validate all the topics in the request.
    data.publishTopics = await this._publishTopics(dbCtx, data, requestId);
    if (!data.publishTopics || !data.publishTopics.length) {
      const details = Manager._prettyDetails(['no valid topic urls to publish'], []);
      throw new ResponseError(Enum.ErrorResponse.BadRequest, details);
    }

    // Set status per topic
    for (const topicResult of data.publishTopics) {
      topicResult.status = topicResult.err.length ? 400 : 202;
      topicResult.statusMessage = topicResult.err.length ? 'Bad Request' : 'Accepted';
    }

    // Process the valid publish notifications
    const validPublishTopics = data.publishTopics.filter((topicResult) => !topicResult.err.length);
    try {
      await Promise.all(validPublishTopics.map(async (topicResult) => this.db.topicFetchRequested(dbCtx, topicResult.topicId)));
    } catch (e) {
      this.logger.error(_scope, 'topicFetchRequest failed', { error: e, ctx, data, requestId });
      throw e;
    }

    this.logger.info(_scope, 'request accepted', { ctx, data, requestId });

    if (data.publishTopics.length === 1) {
      const soleTopic = data.publishTopics[0];
      res.statusCode = soleTopic.status;
      res.end(Manager._prettyDetails(soleTopic.err, soleTopic.warn).join('\n'));
    } else {
      res.statusCode = 207;
      res.end(Manager.multiPublishContent(ctx, data.publishTopics));
    }

    if (this.options.manager.processImmediately
    &&  validPublishTopics.length) {
      try {
        await Promise.all(validPublishTopics.map(async (topicResult) => this.communication.topicFetchClaimAndProcessById(dbCtx, topicResult.topicId, requestId)));
      } catch (e) {
        this.logger.error(_scope, 'topicFetchClaimAndProcessById failed', { data, validPublishTopics, requestId });
        // Don't bother re-throwing, as we've already ended this response.
      }
    }
  }


  /**
   * Annotate any encountered issues.
   * @param {String[]} err
   * @param {String[]} warn
   * @returns {String[]}
   */
  static _prettyDetails(err, warn) {
    return [
      ...err.map((entry) => `error: ${entry}`),
      ...warn.map((entry) => `warning: ${entry}`),
    ];
  }


  /**
   * POST request for root.
   * @param {http.ClientRequest} req
   * @param {http.ServerResponse} res
   * @param {object} ctx
   */
  async postRoot(req, res, ctx) {
    const _scope = _fileScope('postRoot');
    this.logger.debug(_scope, 'called', { ctx });

    res.statusCode = 202; // Presume success.

    const warn = [];
    const err = [];
    const data = Manager._getRootData(req, ctx);
    const requestId = ctx.requestId;

    await this.db.context(async (dbCtx) => {

      // Handle publish requests elsewhere
      if (data.mode === Enum.Mode.Publish) {
        return this._publishRequest(dbCtx, data, res, ctx);
      }

      await this._validateRootData(dbCtx, data, warn, err, requestId);

      const details = Manager._prettyDetails(err, warn);

      // Any errors are fatal.  Stop and report anything that went wrong.
      if (err.length) {
        this.logger.debug(_scope, { msg: 'invalid request', data, err, warn, requestId });
        throw new ResponseError(Enum.ErrorResponse.BadRequest, details);
      }

      // Commit the request for later processing.
      let id;
      try {
        id = await this.db.verificationInsert(dbCtx, { ...data, requestId });
      } catch (e) {
        this.logger.error(_scope, 'verificationInsert failed', { error: e, data, warn, id, requestId });
        throw e;
      }

      // If we committed to the db, we've succeeded as far as the client is concerned.
      res.end(details.join('\n'));
      this.logger.info(_scope, 'request accepted', { data, warn, requestId });

      // Immediately attempt to claim and process the request.
      if (this.options.manager.processImmediately
      &&  id) {
        try {
          await this.communication.verificationClaimAndProcessById(dbCtx, id, requestId);
        } catch (e) {
          this.logger.error(_scope, 'verificationClaimAndProcessById failed', { ...data, id, requestId });
          // Don't bother re-throwing, as we've already ended this response.
        }
      }
    }); // dbCtx
  }


  /**
   * Render topic info content.
   * @param {Object} ctx
   * @param {String} ctx.responseType
   * @param {String} ctx.topicUrl
   * @param {Number} ctx.count
   * @returns {String}
   */
  // eslint-disable-next-line class-methods-use-this
  infoContent(ctx) {
    // eslint-disable-next-line sonarjs/no-small-switch
    switch (ctx.responseType) {
      case Enum.ContentType.ApplicationJson:
        return JSON.stringify({
          topic: ctx.topicUrl,
          count: ctx.count,
        });

      case Enum.ContentType.ImageSVG:
        return Template.badgeSVG({}, ` ${ctx.topicUrl} `, ` ${ctx.count} subscribers `, `${ctx.topicUrl} has ${ctx.count} subscribers.`);

      default:
        return ctx.count.toString();
    }
  }


  /**
   * GET request for /info?topic=url&format=type
   * @param {http.ServerResponse} res
   * @param {object} ctx
   */
  async getInfo(res, ctx) {
    const _scope = _fileScope('getInfo');
    this.logger.debug(_scope, 'called', { ctx });

    if (!ctx.queryParams.topic) {
      throw new ResponseError(Enum.ErrorResponse.BadRequest, 'missing required parameter');
    }
    ctx.topicUrl = ctx.queryParams.topic;

    switch ((ctx.queryParams.format || '').toLowerCase()) {
      case 'svg':
        ctx.responseType = Enum.ContentType.ImageSVG;
        res.setHeader(Enum.Header.ContentType, ctx.responseType);
        break;

      case 'json':
        ctx.responseType = Enum.ContentType.ApplicationJson;
        res.setHeader(Enum.Header.ContentType, ctx.responseType);
        break;

      default:
        break;
    }

    try {
      new URL(ctx.topicUrl);
    } catch (e) {
      throw new ResponseError(Enum.ErrorResponse.BadRequest, 'invalid topic');
    }

    let count;
    await this.db.context(async (dbCtx) => {
      count = await this.db.subscriptionCountByTopicUrl(dbCtx, ctx.topicUrl);
      if (!count) {
        throw new ResponseError(Enum.ErrorResponse.NotFound, 'no such topic');
      }
      ctx.count = count.count;
    });

    res.end(this.infoContent(ctx));
    this.logger.info(_scope, 'finished', { ...ctx });
  }


  /**
   * GET request for authorized /admin information.
   * @param {http.ServerResponse} res
   * @param {object} ctx
   */
  async getAdminOverview(res, ctx) {
    const _scope = _fileScope('getAdminOverview');
    this.logger.debug(_scope, 'called', { ctx });

    await this.db.context(async (dbCtx) => {
      ctx.topics = await this.db.topicGetAll(dbCtx);
    });
    this.logger.debug(_scope, 'got topics', { topics: ctx.topics });

    res.end(Template.adminOverviewHTML(ctx, this.options));
    this.logger.info(_scope, 'finished', { ...ctx, topics: ctx.topics.length })
  }


  /**
   * GET request for authorized /admin/topic/:topicId information.
   * @param {http.ServerResponse} res
   * @param {object} ctx
   */
  async getTopicDetails(res, ctx) {
    const _scope = _fileScope('getTopicDetails');
    this.logger.debug(_scope, 'called', { ctx });

    const topicId = ctx.params.topicId;
    await this.db.context(async (dbCtx) => {
      ctx.topic = await this.db.topicGetById(dbCtx, topicId);
      ctx.subscriptions = await this.db.subscriptionsByTopicId(dbCtx, topicId);
    });
    this.logger.debug(_scope, 'got topic details', { topic: ctx.topic, subscriptions: ctx.subscriptions });

    res.end(Template.adminTopicDetailsHTML(ctx, this.options));
    this.logger.info(_scope, 'finished', { ...ctx, subscriptions: ctx.subscriptions.length, topic: ctx.topic.id });
  }


  /**
   * PATCH and DELETE for updating topic data.
   * @param {http.ServerResponse} res
   * @param {Object} ctx
   */
  async updateTopic(res, ctx) {
    const _scope = _fileScope('updateTopic');
    this.logger.debug(_scope, 'called', { ctx });

    const topicId = ctx.params.topicId;

    await this.db.context(async (dbCtx) => {
      await this.db.transaction(dbCtx, async (txCtx) => {
        // Get topic without defaults filled in, to persist nulls
        const topic = await this.db.topicGetById(txCtx, topicId, false);
        if (!topic) {
          this.logger.debug(_scope, 'no topic', { ctx });
          throw new Errors.ResponseError(Enum.ErrorResponse.NotFound);
        }

        if (ctx.method === 'DELETE') {
          await this.db.topicDeleted(txCtx, topicId);
          res.end();
          this.logger.info(_scope, 'topic set deleted', { ctx, topicId });
          // Attempt to remove from db if no active subscriptions.
          await this.db.topicPendingDelete(txCtx, topicId);
          return;
        }

        const updatableFields = [
          'leaseSecondsPreferred',
          'leaseSecondsMin',
          'leaseSecondsMax',
          'publisherValidationUrl',
          'contentHashAlgorithm',
        ];
    
        const patchValues = common.pick({
          ...ctx.queryParams,
          ...ctx.parsedBody,
        }, updatableFields);

        [
          'leaseSecondsPreferred',
          'leaseSecondsMin',
          'leaseSecondsMax',
        ].filter((field) => field in patchValues).forEach((field) => {
          // eslint-disable-next-line security/detect-object-injection
          patchValues[field] = parseInt(patchValues[field], 10);
        });

        const patchKeys = Object.keys(patchValues);
        if (patchKeys.length === 0
        // eslint-disable-next-line security/detect-object-injection
        ||  patchKeys.every((k) => patchValues[k] == topic[k])) {
          res.statusCode = 204;
          res.end();
          this.logger.info(_scope, 'empty topic update', { ctx, topicId });
          return;
        }
        const patchedTopic = {
          ...topic,
          ...patchValues,
        };

        this.logger.debug(_scope, 'data', { topic, patchValues, patchedTopic });

        try {
          await this.db.topicUpdate(txCtx, { topicId, ...patchedTopic });
        } catch (e) {
          if (e instanceof DBErrors.DataValidation) {
            this.logger.debug(_scope, 'validation error', { error: e, ctx, topicId });
            throw new Errors.ResponseError(Enum.ErrorResponse.BadRequest, e.message);
          }
          this.logger.error(_scope, 'failed', { error: e, ctx, topicId });
          throw e;
        }
        res.end();
        this.logger.info(_scope, 'topic updated', { ctx, topicId, patchValues });
      }); // transaction
    }); // context
  }


  /**
   * PATCH and DELETE for updating subscription data.
   * @param {http.ServerResponse} res
   * @param {Object} ctx
   */
  async updateSubscription(res, ctx) {
    const _scope = _fileScope('updateSubscription');
    this.logger.debug(_scope, 'called', { ctx });

    const subscriptionId = ctx.params.subscriptionId;

    await this.db.context(async (dbCtx) => {
      await this.db.transaction(dbCtx, async (txCtx) => {
        const subscription = await this.db.subscriptionGetById(txCtx, subscriptionId);
        if (!subscription) {
          this.logger.debug(_scope, 'no subscription', { ctx });
          throw new Errors.ResponseError(Enum.ErrorResponse.NotFound);
        }

        if (ctx.method === 'DELETE') {
          const deleteFields = common.pick({
            ...ctx.queryParams,
            ...ctx.parsedBody,
          }, ['reason']);

          // Queue an unsubscription.
          const verification = {
            topicId: subscription.topicId,
            callback: subscription.callback,
            mode: Enum.Mode.Denied,
            reason: 'subscription removed by administrative action',
            isPublisherValidated: true,
            requestId: ctx.requestId,
            ...deleteFields,
          };

          await this.db.verificationInsert(txCtx, verification);
          this.logger.info(_scope, 'subscription removal initiated', { ctx, verification });
          res.end();
          return;
        }

        const updatableFields = [
          'signatureAlgorithm',
        ];

        const patchValues = common.pick({
          ...ctx.queryParams,
          ...ctx.parsedBody,
        }, updatableFields);

        const patchKeys = Object.keys(patchValues);
        if (patchKeys.length === 0
        // eslint-disable-next-line security/detect-object-injection
        ||  patchKeys.every((k) => patchValues[k] == subscription[k])) {
          res.statusCode = 204;
          res.end();
          return;
        }
        const patchedSubscription = {
          ...subscription,
          ...patchValues,
        };

        try {
          await this.db.subscriptionUpdate(txCtx, { subscriptionId, ...patchedSubscription });
        } catch (e) {
          if (e instanceof DBErrors.DataValidation) {
            this.logger.debug(_scope, 'validation error', { error: e, ctx, subscriptionId });
            throw new Errors.ResponseError(Enum.ErrorResponse.BadRequest, e.message);
          }
          this.logger.info(_scope, 'failed', { error: e, ctx, subscriptionId });
          throw e;
        }
        res.end();
        this.logger.info(_scope, 'subscription updated', { ctx, subscriptionId, patchValues });
      }); // transaction
    }); // context
  }

  /**
   * POST request for manually running worker.
   * @param {http.ServerResponse} res
   * @param {object} ctx
   */
  async processTasks(res, ctx) {
    const _scope = _fileScope('getTopicDetails');
    this.logger.debug(_scope, 'called', { ctx });

    // N.B. no await on this
    this.communication.worker.process().catch((e) => {
      this.logger.error(_scope, 'failed', { error: e, ctx });
    });

    res.end();
    this.logger.info(_scope, 'invoked worker process', { ctx });
  }

}

module.exports = Manager;