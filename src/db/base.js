/* eslint-disable no-unused-vars */
'use strict';

/**
 * This is the semi-abstract database class, providing interface and utility methods.
 */

const common = require('../common');
const DBErrors = require('./errors');
const svh = require('./schema-version-helper');

const _fileScope = common.fileScope(__filename);

class Database {
  constructor(logger = common.nullLogger, options = {}) {
    this.logger = logger;
    common.ensureLoggerLevels(this.logger);

    // Store the merged config and default values for lease values.
    // N.B. breaking hierarchy of config options here
    this.topicLeaseDefaults = {};
    common.setOptions(this.topicLeaseDefaults, common.topicLeaseDefaults(), options.topicLeaseDefaults || {});
  }


  /**
   * Turn a snake into a camel.
   * Used when translating SQL column names to JS object style.
   * @param {String} snakeCase
   * @param {String|RegExp} delimiter
   * @returns {String}
   */
  static _camelfy(snakeCase, delimiter = '_') {
    if (!snakeCase || typeof snakeCase.split !== 'function') {
      return undefined;
    }
    const words = snakeCase.split(delimiter);
    return [
      words.shift(),
      ...words.map((word) => word.charAt(0).toUpperCase() + word.slice(1)),
    ].join('');
  }


  /**
   * Basic type checking of object properties.
   * @param {Object} object
   * @param {String[]} properties
   * @param {String[]} types
   */
  _ensureTypes(object, properties, types) {
    const _scope = _fileScope('_ensureTypes');

    if (!(object && properties && types)) {
      this.logger.error(_scope, 'undefined argument', { object, properties, types });
      throw new DBErrors.DataValidation();
    }
    properties.forEach((p) => {
      // eslint-disable-next-line security/detect-object-injection
      const pObj = object[p];
      const pType = typeof pObj;
      if (!types.includes(pType)
      &&  !(pObj instanceof Buffer && types.includes('buffer'))
      &&  !(pObj === null && types.includes('null'))
      &&  !(pType === 'bigint' && types.includes('number'))) {
        const reason = `'${p}' is '${pType}', but must be ${types.length > 1 ? 'one of ' : ''}'${types}'`;
        this.logger.error(_scope, reason, {});
        throw new DBErrors.DataValidation(reason);
      }
    });
  }


  /**
   * Interface methods need implementations.
   * @param {String} method
   * @param {arguments} args
   */
  _notImplemented(method, args) {
    this.logger.error(_fileScope(method), 'abstract method called', Array.from(args));
    throw new DBErrors.NotImplemented(method);
  }


  /**
   * Perform tasks needed to prepare database for use.  Ensure this is called
   * after construction, and before any other database activity.
   * At the minimum, this will validate a compatible schema is present and usable.
   * Some engines will also perform other initializations or async actions which
   * are easier handled outside the constructor.
  */
  async initialize() {
    const _scope = _fileScope('initialize');

    const currentSchema = await this._currentSchema();
    const current = svh.schemaVersionObjectToNumber(currentSchema);
    const min = svh.schemaVersionObjectToNumber(this.schemaVersionsSupported.min);
    const max = svh.schemaVersionObjectToNumber(this.schemaVersionsSupported.max);
    if (current >= min && current <= max) {
      this.logger.debug(_scope, 'schema supported', { currentSchema, schemaVersionsSupported: this.schemaVersionsSupported });
    } else {
      this.logger.error(_scope, 'schema not supported', { currentSchema, schemaVersionsSupported: this.schemaVersionsSupported });
      throw new DBErrors.MigrationNeeded();
    }
  }


  /**
   * Perform db connection healthcheck.
   */
  async healthCheck() {
    this._notImplemented('healthCheck', arguments);
  }


  /**
   * Replace any NULL from topic DB entry with default values.
   * @param {Object} topic
   * @returns {Object}
   */
  _topicDefaults(topic) {
    if (topic) {
      for (const [key, value] of Object.entries(this.topicLeaseDefaults)) {
        // eslint-disable-next-line security/detect-object-injection
        if (!(key in topic) || topic[key] === null) {
          // eslint-disable-next-line security/detect-object-injection
          topic[key] = value;
        }
      }
    }
    return topic;
  }


  /**
   * Ensures any lease durations in data are consistent.
   * @param {Object} data
   */
  _leaseDurationsValidate(data) {
    const leaseProperties = Object.keys(this.topicLeaseDefaults)
    this._ensureTypes(data, leaseProperties, ['number', 'undefined', 'null']);

    // Populate defaults on a copy of values so we can check proper numerical ordering
    const leaseValues = common.pick(data, leaseProperties);
    this._topicDefaults(leaseValues);
    for (const [prop, value] of Object.entries(leaseValues)) {
      if (value <= 0) {
        throw new DBErrors.DataValidation(`${prop} must be positive`);
      }
    }
    if (!(leaseValues.leaseSecondsMin <= leaseValues.leaseSecondsPreferred && leaseValues.leaseSecondsPreferred <= leaseValues.leaseSecondsMax)) {
      throw new DBErrors.DataValidation('lease durations violate numerical ordering');
    }
  }


  /**
   * Basic field validation for setting topic data.
   * @param {Object} data
   */
  _topicSetDataValidate(data) {
    this._ensureTypes(data, ['url'], ['string']);
    this._ensureTypes(data, ['publisherValidationUrl'], ['string', 'undefined', 'null']);
    this._leaseDurationsValidate(data);
  }


  /**
   * Basic field validation for setting topic content.
   * @param {Object} data
   */
  _topicSetContentDataValidate(data) {
    this._ensureTypes(data, ['content'], ['string', 'buffer']);
    this._ensureTypes(data, ['contentHash'], ['string']);
    this._ensureTypes(data, ['contentType'], ['string', 'null', 'undefined']);
  }


  /**
   * Basic field validation for updating topic.
   * @param {Object} data
   */
  _topicUpdateDataValidate(data) {
    this._ensureTypes(data, ['publisherValidationUrl'], ['string', 'undefined', 'null']);
    if (data.publisherValidationUrl) {
      try {
        new URL(data.publisherValidationUrl);
      } catch (e) {
        throw new DBErrors.DataValidation('invalid URL format');
      }
    }
    this._ensureTypes(data, ['contentHashAlgorithm'], ['string']);
    if (!common.validHash(data.contentHashAlgorithm)) {
      throw new DBErrors.DataValidation('unsupported hash algorithm');
    }
    this._leaseDurationsValidate(data);
  }


  /**
   * Basic field validation for setting verification data.
   * @param {Object} data
   */
  _verificationDataValidate(data) {
    this._ensureTypes(data, ['topicId'], ['string', 'number']);
    this._ensureTypes(data, ['callback', 'mode'], ['string']);
    this._ensureTypes(data, ['secret', 'httpRemoteAddr', 'httpFrom', 'requestId'], ['string', 'null', 'undefined']);
    this._ensureTypes(data, ['leaseSeconds'], ['number']);
    this._ensureTypes(data, ['isPublisherValidated'], ['boolean']);
  }


  /**
   * Basic field validation for updating verification data.
   * @param {Object} verification
   */
  _verificationUpdateDataValidate(data) {
    this._ensureTypes(data, ['verificationId'], ['string', 'number']);
    this._ensureTypes(data, ['mode'], ['string']);
    this._ensureTypes(data, ['reason'], ['string', 'null', 'undefined']);
    this._ensureTypes(data, ['isPublisherValidated'], ['boolean']);
  }


  /**
   * Basic field validation for upserting subscription data.
   * @param {Object} subscription
   */
  _subscriptionUpsertDataValidate(data) {
    this._ensureTypes(data, ['topicId'], ['string', 'number']);
    this._ensureTypes(data, ['callback'], ['string']);
    this._ensureTypes(data, ['leaseSeconds'], ['number']);
    this._ensureTypes(data, ['secret', 'httpRemoteAddr', 'httpFrom'], ['string', 'null', 'undefined']);
  }


  _subscriptionUpdateDataValidate(data) {
    this._ensureTypes(data, ['signatureAlgorithm'], ['string', 'null', 'undefined']);
    if (!common.validHash(data.signatureAlgorithm)) {
      throw new DBErrors.DataValidation('unsupported hash algorithm');
    }

  }

  /* Interface methods */

  /**
   * Normalize query information to a common form from a specific backend.
   * @param {*} result
   * @returns {Object} info
   * @returns {Number} info.changes
   * @returns {*} info.lastInsertRowid
   * @returns {Number} info.duration
   */
  _engineInfo(result) {
    this._notImplemented('engineInfo', arguments);
  }


  /**
   * Query the current schema version.
   * This is a standalone query function, as it is called before statements are loaded.
   * @returns {Object} version
   * @returns {Number} version.major
   * @returns {Number} version.minor
   * @returns {Number} version.patch
   */
  async _currentSchema() {
    this._notImplemented('_currentSchema', arguments);
  }


  /**
   * Wrap a function call in a database context.
   * @param {Function} fn fn(ctx)
   */
  async context(fn) {
    this._notImplemented('context', arguments);
  }


  /**
   * Wrap a function call in a transaction context.
   * @param {*} dbCtx
   * @param {Function} fn fn(txCtx)
   */
  async transaction(dbCtx, fn) {
    this._notImplemented('transaction', arguments);
  }


  /**
   * Store an authentication success event.
   * @param {*} dbCtx
   * @param {String} identifier
   */
  async authenticationSuccess(dbCtx, identifier) {
    this._notImplemented('authenticationSuccess', arguments);
  }


  /**
   * Fetch authentication data for identifier.
   * @param {*} dbCtx
   * @param {*} identifier
   */
  async authenticationGet(dbCtx, identifier) {
    this._notImplemented('authenticationGet', arguments);
  }


  /**
   * Create or update an authentication entity.
   * @param {*} dbCtx
   * @param {String} identifier
   * @param {String} credential
   */
  async authenticationUpsert(dbCtx, identifier, credential) {
    this._notImplemented('authenticationUpsert', arguments);
  }


  /**
   * All subscriptions to a topic.
   * @param {*} dbCtx
   * @param {String} topicId
   */
  async subscriptionsByTopicId(dbCtx, topicId) {
    this._notImplemented('subscriptionsByTopicId', arguments);
  }


  /**
   * Number of subscriptions to a topic.
   * @param {*} dbCtx
   * @param {String} topicUrl
   */
  async subscriptionCountByTopicUrl(dbCtx, topicUrl) {
    this._notImplemented('subscriptionCountByTopicUrl', arguments);
  }


  /**
   * Remove an existing subscription.
   * @param {*} dbCtx
   * @param {String} callback
   * @param {*} topicId
   */
  async subscriptionDelete(dbCtx, callback, topicId) {
    this._notImplemented('subscriptionDelete', arguments);
  }


  /**
   * Remove any expired subscriptions to a topic.
   * @param {*} dbCtx
   * @param {*} topicId
   */
  async subscriptionDeleteExpired(dbCtx, topicId) {
    this._notImplemented('subscriptionDeleteExpired', arguments);
  }


  /**
   * Claim subscriptions needing content updates attempted.
   * @param {*} dbCtx 
   * @param {Number} wanted maximum subscription updates to claim
   * @param {Integer} claimTimeoutSeconds age of claimed updates to reclaim
   * @param {String} claimant
   * @returns {Array} list of subscriptions
   */
  async subscriptionDeliveryClaim(dbCtx, wanted, claimTimeoutSeconds, claimant) {
    this._notImplemented('subscriptionDeliveryClaim', arguments);
  }


  /**
   * Claim a subscription delivery.
   * @param {*} dbCtx 
   * @param {*} subscriptionId 
   * @param {*} claimTimeoutSeconds 
   * @param {*} claimant 
   */
  async subscriptionDeliveryClaimById(dbCtx, subscriptionId, claimTimeoutSeconds, claimant) {
    this._notImplemented('subscriptionDeliveryClaimById', arguments);
  }


  /**
   * A subscriber successfully received new topic content, update subscription.
   * @param {*} dbCtx 
   * @param {String} callback
   * @param {*} topicId
   */
  async subscriptionDeliveryComplete(dbCtx, callback, topicId) {
    this._notImplemented('subscriptionDeliveryComplete', arguments);
  }


  /**
   * A subscriber denied new topic content, remove subscription.
   * @param {*} dbCtx 
   * @param {String} callback
   * @param {*} topicId
   */
  async subscriptionDeliveryGone(dbCtx, callback, topicId) {
    this._notImplemented('subscriptionDeliveryGone', arguments);
  }


  /**
   * An attempt to deliver content to a subscriber did not complete, update delivery accordingly.
   * @param {*} dbCtx 
   * @param {String} callback
   * @param {*} topicId
   * @param {Number[]} retryDelays
   */
  async subscriptionDeliveryIncomplete(dbCtx, callback, topicId, retryDelays) {
    this._notImplemented('subscriptionDeliveryIncomplete', arguments);
  }
  

  /**
   * Fetch subscription details
   * @param {*} dbCtx
   * @param {String} callback
   * @param {*} topicId
   */
  async subscriptionGet(dbCtx, callback, topicId) {
    this._notImplemented('subscriptionGet', arguments);
  }

  
  /**
   * Fetch subscription details
   * @param {*} dbCtx 
   * @param {*} subscriptionId 
   */
  async subscriptionGetById(dbCtx, subscriptionId) {
    this._notImplemented('subscriptionGetById', arguments);
  }


  /**
   * Set subscription details
   * @param {*} dbCtx
   * @param {Object} data
   * @param {String} data.callback
   * @param {*} data.topicId
   * @param {Number} data.leaseSeconds
   * @param {String=} data.secret
   * @param {String=} data.httpRemoteAddr
   * @param {String=} data.httpFrom
   */
  async subscriptionUpsert(dbCtx, data) {
    this._notImplemented('subscriptionUpsert', arguments);
  }


  /**
   * Set some subscription fields
   * @param {*} dbCtx
   * @param {Object} data
   * @param {*} data.subscriptionId
   * @param {String} data.signatureAlgorithm
   */
  async subscriptionUpdate(dbCtx, data) {
    this._notImplemented('subscriptionUpdate', arguments);
  }


  /**
   * Sets the isDeleted flag on a topic, and reset update time.
   * @param {*} txCtx
   * @param {*} topicId
   */
  async topicDeleted(dbCtx, topicId) {
    this._notImplemented('topicDeleted', arguments);
  }


  /**
   * Claim topics to fetch updates for, from available.
   * @param {*} dbCtx 
   * @param {Integer} wanted maximum topic fetches to claim
   * @param {Integer} claimTimeoutSeconds age of claimed topics to reclaim
   * @param {String} claimant node id claiming these fetches
   */
  async topicFetchClaim(dbCtx, wanted, claimTimeoutSeconds, claimant) {
    this._notImplemented('topicFetchClaim', arguments);
  }


  /**
   * Claim a topic to update.
   * @param {*} dbCtx 
   * @param {*} topicId 
   * @param {Integer} claimTimeoutSeconds age of claimed topics to reclaim
   * @param {String} claimant node id claiming these fetches
   */
  async topicFetchClaimById(dbCtx, topicId, claimTimeoutSeconds, claimant) {
    this._notImplemented('topicFetchClaim', arguments);
  }


  /**
   * Reset publish state, and reset deliveries for subscribers.
   * @param {*} dbCtx 
   * @param {*} topicId
   */
  async topicFetchComplete(dbCtx, topicId) {
    this._notImplemented('topicFetchComplete', arguments);
  }


  /**
   * Bump count of attempts and release claim on update.
   * @param {*} dbCtx 
   * @param {*} topicId
   * @param {Number[]} retryDelays
   */
  async topicFetchIncomplete(dbCtx, topicId, retryDelays) {
    this._notImplemented('topicFetchIncomplete', arguments);
  }


  /**
   * Set a topic as ready to be checked for an update.
   * @param {*} dbCtx
   * @param {*} topicId
   * @returns {Boolean}
   */
  async topicFetchRequested(dbCtx, topicId) {
    this._notImplemented('topicPublish', arguments);
  }


  /**
   * Get all data for all topics, including subscription count.
   * @param {*} dbCtx
   */
  async topicGetAll(dbCtx) {
    this._notImplemented('topicGetAll', arguments);
  }


  /**
   * Get topic data, without content.
   * @param {*} dbCtx 
   * @param {String} topicUrl
   */
  async topicGetByUrl(dbCtx, topicUrl) {
    this._notImplemented('topicGetByUrl', arguments);
  }


  /**
   * Get topic data, without content.
   * @param {*} dbCtx 
   * @param {*} topicId
   * @param {Boolean} applyDefaults
   */
  async topicGetById(dbCtx, topicId, applyDefaults = true) {
    this._notImplemented('topicGetById', arguments);
  }
  

  /**
   * Returns topic data with content.
   * @param {*} dbCx
   * @param {*} topicId
   */
  async topicGetContentById(dbCx, topicId) {
    this._notImplemented('topicGetContentById', arguments);
  }


  /**
   * Attempt to delete a topic, which must be set isDeleted, if there
   * are no more subscriptions belaying its removal.
   * @param {*} topicId
   */
  async topicPendingDelete(dbCtx, topicId) {
    this._notImplemented('topicPendingDelete', arguments);
  }


  /**
   * Create or update the basic parameters of a topic.
   * @param {*} dbCtx 
   * @param {TopicData} data
   */
  async topicSet(dbCtx, data) {
    this._notImplemented('topicSet', arguments);
  }


  /**
   * Updates a topic's content data and content update timestamp.
   * @param {Object} data
   * @param {Integer} data.topicId
   * @param {String} data.content
   * @param {String} data.contentHash
   * @param {String=} data.contentType
   */
  async topicSetContent(dbCtx, data) {
    this._notImplemented('topicSetContent', arguments);
  }


  /**
   * Set some topic fields.
   * @param {*} dbCtx
   * @param {Object} data
   * @param {*} data.topicId
   * @param {Number=} data.leaseSecondsPreferred
   * @param {Number=} data.leaseSecondsMin
   * @param {Number=} data.leaseSecondsMax
   * @param {String=} data.publisherValidationUrl
   * @param {String=} data.contentHashAlgorithm
   */
  async topicUpdate(dbCtx, data) {
    this._notImplemented('topicUpdate', arguments);
  }


  /**
   * Claim pending verifications for attempted resolution.
   * @param {*} dbCtx 
   * @param {Integer} wanted maximum verifications to claim
   * @param {Integer} claimTimeoutSeconds age of claimed verifications to reclaim
   * @returns {Verification[]} array of claimed verifications
   */
  async verificationClaim(dbCtx, wanted, claimTimeoutSeconds, claimant) {
    this._notImplemented('verificationClaim', arguments);
  }


  /**
   * Claim a specific verification by id, if no other similar verification claimed.
   * @param {*} dbCtx
   * @param {*} verificationId
   * @param {Number} claimTimeoutSeconds
   * @param {String} claimant
   */
  async verificationClaimById(dbCtx, verificationId, claimTimeoutSeconds, claimant) {
    this._notImplemented('verificationClaimById', arguments);
  }


  /**
   * Remove the verification, any older
   * verifications for that same client/topic, and the claim.
   * @param {*} dbCtx
   * @param {*} verificationId
   * @param {String} callback
   * @param {*} topicId
   */
  async verificationComplete(dbCtx, verificationId, callback, topicId) {
    this._notImplemented('verificationComplete', arguments);
  }


  /**
   * Get verification data.
   * @param {*} dbCtx
   * @param {*} verificationId
   */
  async verificationGetById(dbCtx, verificationId) {
    this._notImplemented('verificationGetById', arguments);
  }


  /**
   * Update database that a client verification was unable to complete.
   * This releases the delivery claim and reschedules for some future time.
   * @param {*} dbCtx
   * @param {String} callback client callback url
   * @param {*} topicId internal topic id
   * @param {Number[]} retryDelays
   */
  async verificationIncomplete(dbCtx, verificationId, retryDelays) {
    this._notImplemented('verificationIncomplete', arguments);
  }


  /**
   * Create a new pending verification.
   * @param {*} dbCtx
   * @param {VerificationData} data
   * @param {Boolean} claim
   * @returns {*} verificationId
   */
  async verificationInsert(dbCtx, verification) {
    this._notImplemented('verificationInsert', arguments);
  }


  /**
   * Relinquish the claim on a verification, without any other updates.
   * @param {*} dbCtx
   * @param {String} callback client callback url
   * @param {*} topicId internal topic id
   */
  async verificationRelease(dbCtx, verificationId) {
    this._notImplemented('verificationRelease', arguments);
  }


  /**
   * Updates some fields of an existing (presumably claimed) verification.
   * @param {*} dbCtx
   * @param {*} verificationId
   * @param {Object} data
   * @param {String} data.mode
   * @param {String} data.reason
   * @param {Boolean} data.isPublisherValidated
   */
  async verificationUpdate(dbCtx, verificationId, data) {
    this._notImplemented('verificationUpdate', arguments);
  }


  /**
   * Sets the isPublisherValidated flag on a verification and resets the delivery
   * @param {*} dbCtx
   * @param {*} verificationId
   */
  async verificationValidated(dbCtx, verificationId) {
    this._notImplemented('verificationValidated', arguments);
  }

}

module.exports = Database;
