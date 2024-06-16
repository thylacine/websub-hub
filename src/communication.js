'use strict';

/**
 * Here we wrangle all outgoing requests, as well as the
 * worker which initiates most of them.
 */

const common = require('./common');
const crypto = require('crypto');
const Enum = require('./enum');
const Errors = require('./errors');
const Worker = require('./worker');
const LinkHelper = require('./link-helper');
const { version: packageVersion, name: packageName } = require('../package.json'); // For default UA string

const _fileScope = common.fileScope(__filename);

class Communication {
  constructor(logger, db, options) {
    this.logger = logger;
    this.db = db;
    this.options = options;
    this.linkHelper = new LinkHelper(logger, options);

    if (this.options.dingus.selfBaseUrl) {
      this.linkHub = `, <${this.options.dingus.selfBaseUrl}>; rel="hub"`;
    } else {
      this.linkHub = '';
      this.logger.error(_fileScope('constructor'), 'empty dingus.selfBaseUrl value, server responses will not be compliant');
    }

    this.Got = undefined; // Will become the async imported got.
    this.got = this._init; // First invocation imports got and replaces this.

    this.worker = new Worker(logger, db, this.workFeed.bind(this), options);
    this.worker.start();
  }


  /**
   * Do a little dance to cope with ESM dynamic import.
   * @param  {...any} args arguments
   * @returns {Promise<any>} got response
   */
  async _init(...args) {
    if (!this.Got) {
      // For some reason eslint is confused about import being supported here.
       
      this.Got = await import('got');
      this.got = this.Got.got.extend({
        followRedirect: false, // Outgoing API calls should not encounter redirects
        throwHttpErrors: false, // We will be checking status codes explicitly
        headers: {
          [Enum.Header.UserAgent]: Communication.userAgentString(this.options.userAgent),
        },
        timeout: {
          request: this.options.communication.requestTimeoutMs || 120000,
        },
        hooks: {
          beforeRetry: [
            this._onRetry,
          ],
        },
      });
    }

    /* istanbul ignore if */
    if (args.length) {
      /* istanbul ignore next */
      return this.got(...args);
    }
  }


  /**
   * Take note of transient retries.
   * @param {*} error error
   * @param {*} retryCount retry count
   */
  _onRetry(error, retryCount) {
    const _scope = _fileScope('_onRetry');
    this.logger.debug(_scope, 'retry', { retryCount, error });
  }


  /**
   * Construct a user-agent value.
   * @param {object} userAgentConfig user agent config
   * @param {string=} userAgentConfig.product product name (default package name)
   * @param {string=} userAgentConfig.version version (default package version)
   * @param {string=} userAgentConfig.implementation implementation (default spec supported)
   * @returns {string} user agent string 'product/version (implementation)'
   */
  static userAgentString(userAgentConfig) {
    // eslint-disable-next-line security/detect-object-injection
    const _conf = (field, def) => (userAgentConfig && field in userAgentConfig) ? userAgentConfig[field] : def;
    const product = _conf('product', packageName).split('/').pop();
    const version = _conf('version', packageVersion);
    let implementation = _conf('implementation', Enum.Specification);
    if (implementation) {
      implementation = ` (${implementation})`;
    }
    return `${product}/${version}${implementation}`;
  }


  /**
   * @alias {number} Integer
   */
  /**
   * Generate a random string.
   * @param {Integer} bytes size of challenge
   * @returns {Promise<string>} base64 randomness
   */
  static async generateChallenge(bytes = 30) {
    return (await common.randomBytesAsync(bytes)).toString('base64');
  }


  /**
   * Generate the signature string for content.
   * @param {Buffer} message message to sign
   * @param {Buffer} secret secret to sign with
   * @param {string} algorithm algorithm to sign with
   * @returns {string} signature string
   */
  static signature(message, secret, algorithm) {
    const hmac = crypto.createHmac(algorithm, secret)
      .update(message)
      .digest('hex');
    return `${algorithm}=${hmac}`;
  }


  /**
   * Generate the hash for content.
   * @param {Buffer} content content 
   * @param {string} algorithm algorithm
   * @returns {string} hash of content
   */
  static contentHash(content, algorithm) {
    return crypto.createHash(algorithm)
      .update(content)
      .digest('hex');
  }


  /**
   * Attempt to verify a requested intent with client callback endpoint.
   * @param {*} dbCtx db context
   * @param {*} verificationId verification id
   * @param {string} requestId request id
   * @returns {Promise<boolean>} whether to subsequently attempt next task if verification succeeds
   */
  async verificationProcess(dbCtx, verificationId, requestId) {
    const _scope = _fileScope('verificationProcess');

    const verification = await this.db.verificationGetById(dbCtx, verificationId);
    if (!verification) {
      this.logger.error(_scope, 'no such verification', { verificationId, requestId });
      throw new Errors.InternalInconsistencyError('no such verification id');
    }

    const topic = await this.db.topicGetById(dbCtx, verification.topicId);
    if (!topic) {
      this.logger.error(_scope, Enum.Message.NoSuchTopicId, { verification, requestId });
      throw new Errors.InternalInconsistencyError(Enum.Message.NoSuchTopicId);
    }

    if (!topic.isActive) {
      // These should be filtered out when selecting verification tasks to process.
      this.logger.debug(_scope, 'topic not active, skipping verification', { verification, requestId });
      await this.db.verificationRelease(dbCtx, verificationId);
      return;
    }

    // If topic is deleted, deny any subscriptions.
    // Un-subscriptions can continue to be verified.
    if (topic.isDeleted && verification.mode === Enum.Mode.Subscribe) {
      this.logger.info(_scope, 'topic is deleted, verification becomes denial', { verification, requestId });

      verification.mode = Enum.Mode.Denied;
      verification.reason = 'Gone: topic no longer valid on this hub.';
      verification.isPublisherValidated = true;
      await this.db.verificationUpdate(dbCtx, verification);
    }

    // If verification needs publisher validation, this delivery is for publisher.
    if (verification.mode === Enum.Mode.Subscribe && verification.isPublisherValidated === false) {
      this.logger.debug(_scope, 'attempting publisher validation', { verification, requestId });
      const continueVerification = await this.publisherValidate(dbCtx, topic, verification);

      // If publisher validation completed, verification will proceed.
      // If not, we're done for now and shall try again later.
      if (!continueVerification) {
        this.logger.debug(_scope, 'publisher validation did not complete, belaying verification', { verification });
        await this.db.verificationIncomplete(dbCtx, verificationId, this.options.communication.retryBackoffSeconds);
        return;
      }
    }

    const callbackRequestConfig = {
      method: 'GET',
      url: new URL(verification.callback),
      responseType: 'text',
    };
    const callbackParams = {
      'hub.topic': topic.url,
      'hub.mode': verification.mode,
    };

    let challenge;
    if (verification.mode === Enum.Mode.Denied) {
      // Denials don't have a challenge, but might have a reason.
      if (verification.reason) {
        callbackParams['hub.reason'] = verification.reason;
      }
    } else {
      // Subscriptions and unsubscriptions require challenge matching.
      challenge = await Communication.generateChallenge();
      Object.assign(callbackParams, {
        'hub.challenge': challenge,
        // Explicitly convert leaseSeconds to string, due to some DB backends. (Looking at you, sqlite..)
        'hub.lease_seconds': verification.leaseSeconds.toString(),
      });
    }
    Object.entries(callbackParams)
      .forEach(([k, v]) => callbackRequestConfig.url.searchParams.set(k, v))
    ;

    const logInfoData = {
      callbackUrl: callbackRequestConfig.url.href,
      topicUrl: topic.url,
      mode: verification.mode,
      originalRequestId: verification.requestId,
      requestId,
      verificationId,
    };

    this.logger.info(_scope, 'verification request', logInfoData);

    let response;
    try {
      response = await this.got(callbackRequestConfig);
    } catch (e) {
      this.logger.error(_scope, 'verification request failed', { ...logInfoData, error: e });
      await this.db.verificationIncomplete(dbCtx, verificationId, this.options.communication.retryBackoffSeconds);
      return;
    }
    logInfoData.response = common.gotResponseLogData(response);
    this.logger.debug(_scope, 'verification response', logInfoData );

    let verificationAccepted = true; // Presume success.

    switch (common.httpStatusCodeClass(response.statusCode)) {
      case 2:
        // Success, fall out of switch.
        break;

      case 5:
        // Retry
        this.logger.info(_scope, 'verification remote server error', logInfoData );
        await this.db.verificationIncomplete(dbCtx, verificationId, this.options.communication.retryBackoffSeconds);
        return;

      default:
        // Anything else is unsuccessful.
        this.logger.info(_scope, 'verification rejected by status', logInfoData );
        verificationAccepted = false;
    }

    // Any denial is not accepted.
    if (verification.mode === Enum.Mode.Denied) {
      this.logger.info(_scope, 'verification denial accepted', logInfoData );
      verificationAccepted = false;
    }

    if ([Enum.Mode.Subscribe, Enum.Mode.Unsubscribe].includes(verification.mode)
    &&  response.body !== challenge) {
      this.logger.info(_scope, 'verification rejected by challenge', logInfoData);
      verificationAccepted = false;
    }

    await this.db.transaction(dbCtx, async (txCtx) => {
      switch (verification.mode) {
        case Enum.Mode.Subscribe:
          if (verificationAccepted) {
            await this.db.subscriptionUpsert(txCtx, verification);
          }
          break;
      
        case Enum.Mode.Unsubscribe:
          if (verificationAccepted) {
            await this.db.subscriptionDelete(txCtx, verification.callback, verification.topicId);
            if (topic.isDeleted) {
              // Remove a deleted topic after the last subscription is notified.
              await this.db.topicPendingDelete(txCtx, topic.id);
            }
          }
          break;

        case Enum.Mode.Denied:
          await this.db.subscriptionDelete(txCtx, verification.callback, verification.topicId);
          if (topic.isDeleted) {
            // Remove a deleted topic after the last subscription is notified.
            await this.db.topicPendingDelete(txCtx, topic.id);
          }
          break;

        default:
          this.logger.error(_scope, 'unanticipated mode', { logInfoData });
          throw new Errors.InternalInconsistencyError(verification.mode);
      }

      await this.db.verificationComplete(txCtx, verificationId, verification.callback, verification.topicId);
    }); // txCtx

    this.logger.info(_scope, 'verification complete', { ...logInfoData, verificationAccepted });
  }


  /**
   * @alias {object} TopicData
   * @alias {object} VerificationData
   */
  /**
   * Attempt to verify a pending subscription request with publisher.
   * Updates (and persists) verification.
   * Returns boolean of status of publisher contact, and hence
   * whether to continue verification with client.
   *
   * This is not defined by the spec.  We opt to speak JSON here.
   * @param {*} dbCtx db context
   * @param {TopicData} topic topic
   * @param {VerificationData} verification verification
   * @returns {Promise<boolean>} true if successful contact with publisher
   */
  async publisherValidate(dbCtx, topic, verification) {
    const _scope = _fileScope('publisherValidate');
    const logInfoData = {
      topicUrl: topic.url,
      callbackUrl: verification.callback,
      requestId: verification.requestId,
    };
    let response;

    this.logger.info(_scope, 'publisher validation request', logInfoData);

    const publisherValidationRequestConfig = {
      method: 'POST',
      url: topic.publisherValidationUrl,
      json: {
        callback: verification.callback,
        topic: topic.url,
        ...(verification.httpFrom && { from: verification.httpFrom }),
        ...(verification.httpRemoteAddr && { address: verification.httpRemoteAddr }),
      },
      responseType: 'json',
    };
    try {
      response = await this.got(publisherValidationRequestConfig);
    } catch (e) {
      this.logger.error(_scope, 'publisher validation failed', { ...logInfoData, error: e });
      return false; // Do not continue with client verification.
    }

    logInfoData.response = common.gotResponseLogData(response);
    this.logger.debug(_scope, 'validation response', logInfoData);

    let verificationNeedsUpdate = false;
    switch (common.httpStatusCodeClass(response.statusCode)) {
      case 2:
        this.logger.info(_scope, 'publisher validation complete, allowed', logInfoData);
        break;

      case 5:
        this.logger.info(_scope, 'publisher validation remote server error', logInfoData);
        return false; // Do not continue with client verification.

      default:
        this.logger.info(_scope, 'publisher validation complete, denied', logInfoData);
        // Change client verification
        verification.mode = Enum.Mode.Denied;
        verification.reason = 'publisher rejected request'; // TODO: details from response?
        verificationNeedsUpdate = true;
    }

    // Success from publisher, either accepted or denied.
    // Set validated flag, and allow client verification to continue.
    await this.db.transaction(dbCtx, async (txCtx) => {
      if (verificationNeedsUpdate) {
        await this.db.verificationUpdate(txCtx, verification.id, verification);
      }
      await this.db.verificationValidated(txCtx, verification.id);
    });
    return true;
  }


  /**
   * Retrieve content from a topic.
   * @param {*} dbCtx db context
   * @param {*} topicId topic id
   * @param {string} requestId request id
   * @returns {Promise<void>}
   */
  async topicFetchProcess(dbCtx, topicId, requestId) {
    const _scope = _fileScope('topicFetchProcess');
    const logInfoData = {
      topicId,
      requestId,
    };

    this.logger.debug(_scope, 'called', logInfoData);

    const topic = await this.db.topicGetById(dbCtx, topicId);
    if (topic === undefined) {
      this.logger.error(_scope, Enum.Message.NoSuchTopicId, logInfoData);
      throw new Errors.InternalInconsistencyError(Enum.Message.NoSuchTopicId);
    }

    // Cull any expired subscriptions
    await this.db.subscriptionDeleteExpired(dbCtx, topicId);

    logInfoData.url = topic.url;

    if (topic.isDeleted) {
      this.logger.debug(_scope, 'topic deleted, skipping update request', logInfoData);
      return;
    }

    const updateRequestConfig = {
      followRedirect: true,
      method: 'GET',
      url: topic.url,
      headers: {
        [Enum.Header.Accept]: [topic.contentType, `*/*${topic.contentType ? ';q=0.9' : ''}`].filter((x) => x).join(', '),
        ...(topic.httpEtag && { [Enum.Header.IfNoneMatch]: topic.httpEtag }),
        ...(topic.httpLastModified && { [Enum.Header.IfModifiedSince]: topic.httpLastModified }),
      },
      responseType: 'buffer',
    };

    this.logger.info(_scope, 'topic update request', logInfoData);
    
    let response;
    try {
      response = await this.got(updateRequestConfig);
    } catch (e) {
      this.logger.error(_scope, 'update request failed', { ...logInfoData, error: e });
      await this.db.topicFetchIncomplete(dbCtx, topicId, this.options.communication.retryBackoffSeconds);
      return;
    }
    logInfoData.response = common.gotResponseLogData(response);
    this.logger.debug(_scope, 'fetch response', logInfoData);

    switch (common.httpStatusCodeClass(response.statusCode)) {
      case 2:
      case 3:
        // Fall out of switch on success
        break;

      case 5:
        this.logger.info(_scope, 'update remote server error', logInfoData);
        await this.db.topicFetchIncomplete(dbCtx, topicId, this.options.communication.retryBackoffSeconds);
        return;
  
      default:
        this.logger.info(_scope, 'fetch failed by status', logInfoData);
        await this.db.topicFetchIncomplete(dbCtx, topicId, this.options.communication.retryBackoffSeconds);
        return;
    }

    if (response.statusCode === 304) {
      this.logger.info(_scope, 'content has not changed, per server', logInfoData);
      await this.db.topicFetchComplete(dbCtx, topicId);
      return;
    }

    const contentHash = Communication.contentHash(response.body, topic.contentHashAlgorithm);
    logInfoData.contentHash = contentHash;
    if (topic.contentHash === contentHash) {
      this.logger.info(_scope, 'content has not changed', logInfoData);
      await this.db.topicFetchComplete(dbCtx, topicId);
      return;
    }

    const validHub = await this.linkHelper.validHub(topic.url, response.headers, response.body);
    if (!validHub) {
      this.logger.info(_scope, 'retrieved topic does not list us as hub', { logInfoData });
      if (this.options.communication.strictTopicHubLink) {
        await this.db.transaction(dbCtx, async (txCtx) => {
          // Set as deleted and set content_updated so subscriptions are notified.
          await this.db.topicDeleted(txCtx, topicId);
          await this.db.topicFetchComplete(txCtx, topicId);
        });
        // Attempt to remove from db, if no active subscriptions.
        await this.db.topicPendingDelete(dbCtx, topicId);
        return;
      }
    }

    const contentType = response.headers[Enum.Header.ContentType.toLowerCase()];
    const httpETag = response.headers[Enum.Header.ETag.toLowerCase()];
    const httpLastModified = response.headers[Enum.Header.LastModified.toLowerCase()];

    await this.db.transaction(dbCtx, async (txCtx) => {
      await this.db.topicSetContent(txCtx, {
        topicId,
        content: Buffer.from(response.body),
        contentHash,
        ...(contentType && { contentType }),
        ...(httpETag && { httpETag }),
        ...(httpLastModified && { httpLastModified }),
      });

      await this.db.topicFetchComplete(txCtx, topicId);
    });
    this.logger.info(_scope, 'content updated', logInfoData);
  }


  /**
   * Attempt to deliver a topic's content to a subscription.
   * @param {*} dbCtx db context
   * @param {string} subscriptionId subscription id
   * @param {string} requestId request id
   * @returns {Promise<void>}
   */
  async subscriptionDeliveryProcess(dbCtx, subscriptionId, requestId) {
    const _scope = _fileScope('subscriptionDeliveryProcess');

    const logInfoData = {
      subscriptionId,
      requestId,
    };

    this.logger.debug(_scope, 'called', logInfoData);

    const subscription = await this.db.subscriptionGetById(dbCtx, subscriptionId);
    if (!subscription) {
      this.logger.error(_scope, 'no such subscription', logInfoData);
      throw new Errors.InternalInconsistencyError('no such subscription');
    }

    logInfoData.callback = subscription.callback;

    const topic = await this.db.topicGetContentById(dbCtx, subscription.topicId);
    if (!topic) {
      this.logger.error(_scope, 'no such topic', logInfoData);
      throw new Errors.InternalInconsistencyError('no such topic');
    }

    if (topic.isDeleted) {
      // If a topic has been set deleted, it does not list us as a valid hub.
      // Queue an unsubscription.
      const verification = {
        topicId: subscription.topicId,
        callback: subscription.callback,
        mode: Enum.Mode.Denied,
        reason: 'Gone: topic no longer valid on this hub.',
        isPublisherValidated: true,
        requestId,
      };

      await this.db.transaction(dbCtx, async (txCtx) => {
        await this.db.verificationInsert(txCtx, verification);
        await this.db.subscriptionDeliveryComplete(txCtx, subscription.callback, subscription.topicId, topic.contentUpdated);
      });
      this.logger.info(_scope, 'update unsubscription for deleted topic', logInfoData);
      return;
    }

    logInfoData.contentLength = topic.content.length;
    logInfoData.contentHash = topic.contentHash;

    const updateConfig = {
      method: 'POST',
      url: subscription.callback,
      body: topic.content,
      headers: {
        [Enum.Header.Link]: `<${topic.url}>; rel="self"${this.linkHub}`,
        [Enum.Header.ContentType]: topic.contentType || Enum.ContentType.TextPlain,
        ...(subscription.secret && { [Enum.Header.XHubSignature]: Communication.signature(topic.content, subscription.secret, subscription.signatureAlgorithm) }),
      },
      responseType: 'text',
    };

    this.logger.info(_scope, 'update request', logInfoData);

    let response;
    try {
      response = await this.got(updateConfig);
    } catch (e) {
      this.logger.error(_scope, 'update request failed', { ...logInfoData, error: e });
      await this.db.subscriptionDeliveryIncomplete(dbCtx, subscription.callback, subscription.topicId, this.options.communication.retryBackoffSeconds);
      return;
    }
    logInfoData.response = common.gotResponseLogData(response);
    this.logger.debug(_scope, 'update response', logInfoData);

    switch (common.httpStatusCodeClass(response.statusCode)) {
      case 2:
        // Fall out of switch on success.
        break;

      case 5:
        this.logger.info(_scope, 'update remote server error', logInfoData);
        await this.db.subscriptionDeliveryIncomplete(dbCtx, subscription.callback, subscription.topicId, this.options.communication.retryBackoffSeconds);
        return;

      case 4:
        if (response.statusCode === 410) { // GONE
          this.logger.info(_scope, 'client declined further updates', logInfoData);
          await this.db.subscriptionDeliveryGone(dbCtx, subscription.callback, subscription.topicId);
          return;
        }
        // All other 4xx falls through as failure

      default:
        this.logger.info(_scope, 'update failed with non-2xx status code', logInfoData);
        await this.db.subscriptionDeliveryIncomplete(dbCtx, subscription.callback, subscription.topicId, this.options.communication.retryBackoffSeconds);
        return;
    }

    await this.db.subscriptionDeliveryComplete(dbCtx, subscription.callback, subscription.topicId, topic.contentUpdated);
    this.logger.info(_scope, 'update success', logInfoData);
  }


  /**
   * Claim and work a specific topic fetch task.
   * @param {*} dbCtx db context
   * @param {string} topicId topic id
   * @param {string} requestId request id
   * @returns {Promise<void>}
   */
  async topicFetchClaimAndProcessById(dbCtx, topicId, requestId) {
    const _scope = _fileScope('topicFetchClaimAndProcessById');
  
    const claimResult = await this.db.topicFetchClaimById(dbCtx, topicId, this.options.communication.claimTimeoutSeconds, this.options.nodeId);
    if (claimResult.changes != 1) {
      this.logger.debug(_scope, 'did not claim topic fetch', { topicId, requestId });
      return;
    }
    await this.topicFetchProcess(dbCtx, topicId, requestId);
  }


  /**
   * Claim and work a specific verification confirmation task.
   * @param {*} dbCtx db context
   * @param {*} verificationId verification id
   * @param {string} requestId request id
   * @returns {Promise<boolean>} whether to subsequently attempt next task if verification succeeds
   */
  async verificationClaimAndProcessById(dbCtx, verificationId, requestId) {
    const _scope = _fileScope('verificationClaimAndProcessById');

    const claimResult = await this.db.verificationClaimById(dbCtx, verificationId, this.options.communication.claimTimeoutSeconds, this.options.nodeId);
    if (claimResult.changes != 1) {
      this.logger.debug(_scope, 'did not claim verification', { verificationId, requestId });
      return;
    }
    await this.verificationProcess(dbCtx, verificationId, requestId);
  }


  /**
   * 
   * @param {*} dbCtx db context
   * @param {number} wanted maximum tasks to claim
   * @returns {Promise<void>[]} array of promises processing work
   */
  async workFeed(dbCtx, wanted) {
    const _scope = _fileScope('workFeed');
    const inProgress = [];
    const requestId = common.requestId();
    const claimTimeoutSeconds = this.options.communication.claimTimeoutSeconds;
    const nodeId = this.options.nodeId;
    let topicFetchPromises = [], verificationPromises = [], updatePromises = [];

    this.logger.debug(_scope, 'called', { wanted });

    try {
      if (wanted > 0) {
        // Update topics before anything else.
        const topicFetchIds = await this.db.topicFetchClaim(dbCtx, wanted, claimTimeoutSeconds, nodeId);
        topicFetchPromises = topicFetchIds.map((id) => this.db.context((ctx) => this.topicFetchProcess(ctx, id, requestId)));
        inProgress.push(...topicFetchPromises);
        wanted -= topicFetchPromises.length;
      }

      if (wanted > 0) {
        // Then any pending verifications.
        const verifications = await this.db.verificationClaim(dbCtx, wanted, claimTimeoutSeconds, nodeId);
        verificationPromises = verifications.map((id) => this.db.context((ctx) => this.verificationProcess(ctx, id, requestId)));
        inProgress.push(...verificationPromises);
        wanted -= verificationPromises.length;
      }

      if (wanted > 0) {
        // Finally dole out content.
        const updates = await this.db.subscriptionDeliveryClaim(dbCtx, wanted, claimTimeoutSeconds, nodeId);
        updatePromises = updates.map((id) => this.db.context((ctx) => this.subscriptionDeliveryProcess(ctx, id, requestId)));
        inProgress.push(...updatePromises);
        wanted -= updatePromises.length;
      }
    } catch (e) {
      this.logger.error(_scope, 'failed', { error: e });
      // do not re-throw, return what we've claimed so far
    }
    this.logger.debug(_scope, 'searched for work', { topics: topicFetchPromises.length, verifications: verificationPromises.length, updates: updatePromises.length, wantedRemaining: wanted, requestId });

    return inProgress;
  }


}

module.exports = Communication;
