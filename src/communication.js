'use strict';

/**
 * Here we wrangle all outgoing requests, as well as the
 * worker which initiates most of them.
 */

const axios = require('axios');
const common = require('./common');
const crypto = require('crypto');
const Enum = require('./enum');
const Errors = require('./errors');
const Worker = require('./worker');
const LinkHelper = require('./link-helper');
const { version: packageVersion, name: packageName } = require('../package.json'); // For default UA string

const { performance } = require('perf_hooks');

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

    // Set common options
    this.axios = axios.create({
      validateStatus: null, // Non-success responses are not exceptional
      headers: {
        [Enum.Header.UserAgent]: Communication.userAgentString(options.userAgent),
      },
    });

    this.axios.interceptors.request.use((request) => {
      request.startTimestampMs = performance.now();
      return request;
    });
    this.axios.interceptors.response.use((response) => {
      response.elapsedTimeMs = performance.now() - response.config.startTimestampMs;
      return response;
    });

    this.worker = new Worker(logger, db, this.workFeed.bind(this), options);
    this.worker.start();
  }


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
   * Generate a random string.
   * @param {Integer} bytes 
   * @returns {String}
   */
  static async generateChallenge(bytes = 30) {
    return (await common.randomBytesAsync(bytes)).toString('base64');
  }


  /**
   * Generate the signature string for content.
   * @param {Buffer} message 
   * @param {Buffer} secret 
   * @param {String} algorithm 
   * @returns {String}
   */
  static signature(message, secret, algorithm) {
    const hmac = crypto.createHmac(algorithm, secret);
    hmac.update(message);
    return `${algorithm}=${hmac.digest('hex')}`;
  }


  /**
   * Generate the hash for content.
   * @param {Buffer} content 
   * @param {String} algorithm 
   * @returns 
   */
  static contentHash(content, algorithm) {
    const hash = crypto.createHash(algorithm);
    hash.update(content);
    return hash.digest('hex');
  }


  /**
   * A request skeleton config.
   * @param {String} method
   * @param {String} requestUrl
   * @param {String} body
   * @param {Object} params
   */
  static _axiosConfig(method, requestUrl, body, params = {}, headers = {}) {
    const urlObj = new URL(requestUrl);
    const config = {
      method,
      url: `${urlObj.origin}${urlObj.pathname}`,
      params: urlObj.searchParams,
      headers,
      ...(body && { data: body }),
      // Setting this does not appear to be enough to keep axios from parsing JSON response into object
      responseType: 'text',
      // So force the matter by eliding all response transformations
      transformResponse: [ (res) => res ],
    };
    Object.entries(params).map(([k, v]) => config.params.set(k, v));
    return config;
  }


  /**
   * Create request config for verifying an intent.
   * @param {URL} requestUrl
   * @param {String} topicUrl
   * @param {String} mode
   * @param {Integer} leaseSeconds
   * @param {String} challenge
   */
  static _intentVerifyAxiosConfig(requestUrl, topicUrl, mode, leaseSeconds, challenge) {
    // Explicitly convert leaseSeconds to string, due to some DB backends. (Looking at you, sqlite..)
    leaseSeconds = leaseSeconds.toString();

    return Communication._axiosConfig('GET', requestUrl, undefined, {
      'hub.mode': mode,
      'hub.topic': topicUrl,
      'hub.challenge': challenge,
      'hub.lease_seconds': leaseSeconds,
    }, {});
  }


  /**
   * Create request config for denying an intent.
   * @param {String} requestUrl 
   * @param {String} topicUrl 
   * @param {String} reason 
   * @returns {String}
   */
  static _intentDenyAxiosConfig(requestUrl, topicUrl, reason) {
    return Communication._axiosConfig('GET', requestUrl, undefined, {
      'hub.mode': Enum.Mode.Denied,
      'hub.topic': topicUrl,
      ...(reason && { 'hub.reason': reason }),
    }, {});
  }


  /**
   * Create request config for querying publisher for subscription validation.
   * @param {Topic} topic 
   * @param {Verification} verification 
   * @returns {String}
   */
  static _publisherValidationAxiosConfig(topic, verification) {
    const body = {
      callback: verification.callback,
      topic: topic.url,
      ...(verification.httpFrom && { from: verification.httpFrom }),
      ...(verification.httpRemoteAddr && { address: verification.httpRemoteAddr }),
    };
    return Communication._axiosConfig('POST', topic.publisherValidationUrl, body, {}, {
      [Enum.Header.ContentType]: Enum.ContentType.ApplicationJson,
    });
  }


  /**
   * Create request config for fetching topic content.
   * Prefer existing content-type, but accept anything.
   * @param {Topic} topic 
   * @returns {String}
   */
  static _topicFetchAxiosConfig(topic) {
    const acceptWildcard = '*/*' + (topic.contentType ? ';q=0.9' : '');
    const acceptPreferred = [topic.contentType, acceptWildcard].filter((x) => x).join(', ');
    return Communication._axiosConfig('GET', topic.url, undefined, {}, {
      [Enum.Header.Accept]: acceptPreferred,
    });
  }


  /**
   * Attempt to verify a requested intent with client callback endpoint.
   * @param {*} dbCtx
   * @param {*} verificationId
   * @param {String} requestId
   * @returns {Boolean} whether to subsequently attempt next task if verification succeeds
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
      this.logger.error(_scope, 'no such topic id', { verification, requestId });
      throw new Errors.InternalInconsistencyError('no such topic id');
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

    const u = new URL(verification.callback);
    let callbackRequestConfig, challenge;
    if (verification.mode === Enum.Mode.Denied) {
      // Denials don't have a challenge.
      callbackRequestConfig = Communication._intentDenyAxiosConfig(u, topic.url, verification.reason);
    } else {
      // Subscriptions and unsubscriptions require challenge matching.
      challenge = await Communication.generateChallenge();
      callbackRequestConfig = Communication._intentVerifyAxiosConfig(u, topic.url, verification.mode, verification.leaseSeconds, challenge);
    }

    const logInfoData = {
      callbackUrl: u.href,
      topicUrl: topic.url,
      mode: verification.mode,
      originalRequestId: verification.requestId,
      requestId,
      verificationId,
    };

    this.logger.info(_scope, 'verification request', logInfoData);

    let response;
    try {
      response = await this.axios(callbackRequestConfig);
    } catch (e) {
      this.logger.error(_scope, 'verification request failed', { ...logInfoData, error: e });
      await this.db.verificationIncomplete(dbCtx, verificationId, this.options.communication.retryBackoffSeconds);
      return;
    }
    logInfoData.response = common.axiosResponseLogData(response);
    this.logger.debug(_scope, 'verification response', logInfoData );

    let verificationAccepted = true; // Presume success.

    switch (common.httpStatusCodeClass(response.status)) {
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
    &&  response.data !== challenge) {
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
            // Remove a deleted topic after he last subscription is notified.
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
   * Attempt to verify a pending subscription request with publisher.
   * Updates (and persists) verification.
   * Returns boolean of status of publisher contact, and hence
   * whether to continue verification with client.
   * @param {*} dbCtx
   * @param {TopicData} topic
   * @param {VerificationData} verification
   * @returns {Boolean}
   */
  async publisherValidate(dbCtx, topic, verification) {
    const _scope = _fileScope('publisherValidate');
    const publisherValidationRequestConfig = Communication._publisherValidationAxiosConfig(topic, verification);
    const logInfoData = {
      topicUrl: topic.url,
      callbackUrl: verification.callback,
      requestId: verification.requestId,
    };
    let response;

    this.logger.info(_scope, 'publisher validation request', logInfoData);

    try {
      response = await this.axios(publisherValidationRequestConfig);
    } catch (e) {
      this.logger.error(_scope, 'publisher validation failed', { ...logInfoData, error: e });
      return false; // Do not continue with client verification.
    }

    logInfoData.response = common.axiosResponseLogData(response);
    this.logger.debug(_scope, 'validation response', logInfoData);

    let verificationNeedsUpdate = false;
    switch (common.httpStatusCodeClass(response.status)) {
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
   * @param {*} dbCtx
   * @param {*} topicId
   * @param {String} requestId
   * @returns
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
      this.logger.error(_scope, 'no such topic id', logInfoData);
      throw new Errors.InternalInconsistencyError('no such topic id');
    }

    // Cull any expired subscriptions
    await this.db.subscriptionDeleteExpired(dbCtx, topicId);

    logInfoData.url = topic.url;

    if (topic.isDeleted) {
      this.logger.debug(_scope, 'topic deleted, skipping update request', logInfoData);
      return;
    }

    const updateRequestConfig = Communication._topicFetchAxiosConfig(topic);

    this.logger.info(_scope, 'topic update request', logInfoData);
    
    let response;
    try {
      response = await this.axios(updateRequestConfig);
    } catch (e) {
      this.logger.error(_scope, 'update request failed', logInfoData);
      await this.db.topicFetchIncomplete(dbCtx, topicId, this.options.communication.retryBackoffSeconds);
      return;
    }
    logInfoData.response = common.axiosResponseLogData(response);
    this.logger.debug(_scope, 'fetch response', logInfoData);

    switch (common.httpStatusCodeClass(response.status)) {
      case 2:
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

    const contentHash = Communication.contentHash(response.data, topic.contentHashAlgorithm);
    logInfoData.contentHash = contentHash;
    if (topic.contentHash === contentHash) {
      this.logger.info(_scope, 'content has not changed', logInfoData);
      await this.db.topicFetchComplete(dbCtx, topicId);
      return;
    }

    const validHub = await this.linkHelper.validHub(topic.url, response.headers, response.data);
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

    await this.db.transaction(dbCtx, async (txCtx) => {
      await this.db.topicSetContent(txCtx, {
        topicId,
        content: Buffer.from(response.data),
        contentHash,
        ...(contentType && { contentType }),
      });

      await this.db.topicFetchComplete(txCtx, topicId);
    });
    this.logger.info(_scope, 'content updated', logInfoData);
  }


  /**
   * Attempt to deliver a topic's content to a subscription.
   * @param {*} dbCtx 
   * @param {String} callback 
   * @param {*} topicId 
   * @param {String} requestId 
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
        await this.db.subscriptionDeliveryComplete(txCtx, subscription.callback, subscription.topicId);
      });
      this.logger.info(_scope, 'update unsubscription for deleted topic', logInfoData);
      return;
    }

    logInfoData.contentLength = topic.content.length;
    logInfoData.contentHash = topic.contentHash;

    const updateAxiosConfig = Communication._axiosConfig('POST', subscription.callback, topic.content, {}, {
      [Enum.Header.Link]: `<${topic.url}>; rel="self"${this.linkHub}`,
      [Enum.Header.ContentType]: topic.contentType || Enum.ContentType.TextPlain,
      ...(subscription.secret && { [Enum.Header.XHubSignature]: Communication.signature(topic.content, subscription.secret, subscription.signatureAlgorithm) }),
    });

    this.logger.info(_scope, 'update request', logInfoData);

    let response;
    try {
      response = await this.axios(updateAxiosConfig);
    } catch (e) {
      this.logger.error(_scope, 'update request failed', { ...logInfoData, error: e });
      await this.db.subscriptionDeliveryIncomplete(dbCtx, subscription.callback, subscription.topicId, this.options.communication.retryBackoffSeconds);
      return;
    }
    logInfoData.response = common.axiosResponseLogData(response);
    this.logger.debug(_scope, 'update response', logInfoData);

    switch (common.httpStatusCodeClass(response.status)) {
      case 2:
        // Fall out of switch on success.
        break;

      case 5:
        this.logger.info(_scope, 'update remote server error', logInfoData);
        await this.db.subscriptionDeliveryIncomplete(dbCtx, subscription.callback, subscription.topicId, this.options.communication.retryBackoffSeconds);
        return;

      case 4:
        if (response.status === 410) { // GONE
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

    await this.db.subscriptionDeliveryComplete(dbCtx, subscription.callback, subscription.topicId);
    this.logger.info(_scope, 'update success', logInfoData);
  }


  /**
   * Claim and work a specific topic fetch task.
   * @param {*} dbCtx 
   * @param {*} id 
   * @param {String} requestId 
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
   * @param {*} dbCtx
   * @param {*} verificationId
   * @param {String} requestId
   * @returns 
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
   * @param {*} dbCtx
   * @param {Number} wanted maximum tasks to claim
   * @returns {Promise<void>[]}
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
