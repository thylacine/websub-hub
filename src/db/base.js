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
  constructor(logger, options = {}) {
    this.logger = logger;

    // Store the merged config and default values for lease values.
    // N.B. breaking hierarchy of config options here
    this.topicLeaseDefaults = {};
    common.setOptions(this.topicLeaseDefaults, common.topicLeaseDefaults(), options.topicLeaseDefaults || {});
  }


  /**
   * Turn a snake into a camel.
   * Used when translating SQL column names to JS object style.
   * @param {string} snakeCase snake case string
   * @param {string | RegExp} delimiter default '_'
   * @returns {string} camelCaseString
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
   * @param {object} object object
   * @param {string[]} properties list of property names
   * @param {string[]} types list of valid types for property names
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
   * @param {string} method method name
   * @param {arguments} args arguments
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
   * @returns {Promise<void>}
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
   * @returns {Promise<void>}
   */
  async healthCheck() {
    this._notImplemented('healthCheck', arguments);
  }


  /**
   * Replace any NULL from topic DB entry with default values.
   * @param {object} topic topic entry
   * @returns {object} updated topic entry
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
   * @param {object} data topic data
   */
  _leaseDurationsValidate(data) {
    const leaseProperties = Object.keys(this.topicLeaseDefaults);
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
   * @param {object} data topic data
   */
  _topicSetDataValidate(data) {
    this._ensureTypes(data, ['url'], ['string']);
    this._ensureTypes(data, ['publisherValidationUrl'], ['string', 'undefined', 'null']);
    this._leaseDurationsValidate(data);
  }


  /**
   * Basic field validation for setting topic content.
   * @param {object} data topic data
   */
  _topicSetContentDataValidate(data) {
    this._ensureTypes(data, ['content'], ['string', 'buffer']);
    this._ensureTypes(data, ['contentHash'], ['string']);
    this._ensureTypes(data, ['contentType'], ['string', 'null', 'undefined']);
    this._ensureTypes(data, ['eTag'], ['string', 'null', 'undefined']);
    this._ensureTypes(data, ['lastModified'], ['string', 'null', 'undefined']);
  }


  /**
   * Basic field validation for updating topic.
   * @param {object} data topic data
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
   * @param {object} data topic data
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
   * @param {object} data verification data
   */
  _verificationUpdateDataValidate(data) {
    this._ensureTypes(data, ['verificationId'], ['string', 'number']);
    this._ensureTypes(data, ['mode'], ['string']);
    this._ensureTypes(data, ['reason'], ['string', 'null', 'undefined']);
    this._ensureTypes(data, ['isPublisherValidated'], ['boolean']);
  }


  /**
   * Basic field validation for upserting subscription data.
   * @param {object} data subscription data
   */
  _subscriptionUpsertDataValidate(data) {
    this._ensureTypes(data, ['topicId'], ['string', 'number']);
    this._ensureTypes(data, ['callback'], ['string']);
    this._ensureTypes(data, ['leaseSeconds'], ['number']);
    this._ensureTypes(data, ['secret', 'httpRemoteAddr', 'httpFrom'], ['string', 'null', 'undefined']);
  }


  /**
   * Basic field validation for subscription update data.
   * @param {object} data subscription data
   */
  _subscriptionUpdateDataValidate(data) {
    this._ensureTypes(data, ['signatureAlgorithm'], ['string', 'null', 'undefined']);
    if (!common.validHash(data.signatureAlgorithm)) {
      throw new DBErrors.DataValidation('unsupported hash algorithm');
    }

  }

  /* Interface methods */

  /**
   * @typedef {object} CommonDBInfo
   * @property {number} changes result changes
   * @property {*} lastInsertRowid result row id
   * @property {number} duration result duration
   */
  /**
   * Normalize query information to a common form from a specific backend.
   * @param {*} result db result
   */
  _engineInfo(result) {
    this._notImplemented('engineInfo', arguments);
  }


  /**
   * @typedef {object} SchemaVersion
   * @property {number} major semver major
   * @property {number} minor semver minor
   * @property {number} patch semver patch
   */
  /**
   * Query the current schema version.
   * This is a standalone query function, as it is called before statements are loaded.
   * @returns {SchemaVersion} schema version
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
   * @param {*} dbCtx db context
   * @param {Function} fn fn(txCtx)
   */
  async transaction(dbCtx, fn) {
    this._notImplemented('transaction', arguments);
  }


  /**
   * Store an authentication success event.
   * @param {*} dbCtx db context
   * @param {string} identifier authentication identifier
   */
  async authenticationSuccess(dbCtx, identifier) {
    this._notImplemented('authenticationSuccess', arguments);
  }


  /**
   * Fetch authentication data for identifier.
   * @param {*} dbCtx db context
   * @param {*} identifier authentication identifier
   */
  async authenticationGet(dbCtx, identifier) {
    this._notImplemented('authenticationGet', arguments);
  }


  /**
   * Create or update an authentication entity.
   * @param {*} dbCtx db context
   * @param {string} identifier authentication identifier
   * @param {string} credential authentication credential
   * @param {string=} otpKey authentication otp key
   */
  async authenticationUpsert(dbCtx, identifier, credential, otpKey) {
    this._notImplemented('authenticationUpsert', arguments);
  }


  /**
   * Update an authentication entity's otp key.
   * @param {*} dbCtx db context
   * @param {string} identifier authentication identifier
   * @param {string=} otpKey authentication otp key
   */
  async authenticationUpdateOTPKey(dbCtx, identifier, otpKey) {
    this._notImplemented('authenticationUpdateKey', arguments);
  }


  /**
   * Update an authentication entity's credential.
   * @param {*} dbCtx db context
   * @param {string} identifier authentication identifier
   * @param {string} credential authentication credential
   */
  async authenticationUpdateCredential(dbCtx, identifier, credential) {
    this._notImplemented('authenticationUpdateKey', arguments);
  }


  /**
   * All subscriptions to a topic.
   * @param {*} dbCtx db context
   * @param {string} topicId topic id
   */
  async subscriptionsByTopicId(dbCtx, topicId) {
    this._notImplemented('subscriptionsByTopicId', arguments);
  }


  /**
   * Number of subscriptions to a topic.
   * @param {*} dbCtx db context
   * @param {string} topicUrl topic url
   */
  async subscriptionCountByTopicUrl(dbCtx, topicUrl) {
    this._notImplemented('subscriptionCountByTopicUrl', arguments);
  }


  /**
   * Remove an existing subscription.
   * @param {*} dbCtx db context
   * @param {string} callback subscriber callback url
   * @param {*} topicId topic id
   */
  async subscriptionDelete(dbCtx, callback, topicId) {
    this._notImplemented('subscriptionDelete', arguments);
  }


  /**
   * Remove any expired subscriptions to a topic.
   * @param {*} dbCtx db context
   * @param {*} topicId topic id
   */
  async subscriptionDeleteExpired(dbCtx, topicId) {
    this._notImplemented('subscriptionDeleteExpired', arguments);
  }


  /**
   * @alias {number} Integer
   */
  /**
   * Claim subscriptions needing content updates attempted.
   * @param {*} dbCtx  db context
   * @param {number} wanted maximum subscription updates to claim
   * @param {Integer} claimTimeoutSeconds age of claimed updates to reclaim
   * @param {string} claimant worker claiming processing
   * @returns {Array} list of subscriptions
   */
  async subscriptionDeliveryClaim(dbCtx, wanted, claimTimeoutSeconds, claimant) {
    this._notImplemented('subscriptionDeliveryClaim', arguments);
  }


  /**
   * Claim a subscription delivery.
   * @param {*} dbCtx db context
   * @param {*} subscriptionId subscription id
   * @param {number} claimTimeoutSeconds duration of claim
   * @param {*} claimant worker claiming processing
   */
  async subscriptionDeliveryClaimById(dbCtx, subscriptionId, claimTimeoutSeconds, claimant) {
    this._notImplemented('subscriptionDeliveryClaimById', arguments);
  }


  /**
   * A subscriber successfully received new topic content, update subscription.
   * @param {*} dbCtx db context
   * @param {string} callback subscriber callback url
   * @param {*} topicId topic id
   */
  async subscriptionDeliveryComplete(dbCtx, callback, topicId) {
    this._notImplemented('subscriptionDeliveryComplete', arguments);
  }


  /**
   * A subscriber denied new topic content, remove subscription.
   * @param {*} dbCtx db context
   * @param {string} callback subscriber callback url
   * @param {*} topicId topic id
   */
  async subscriptionDeliveryGone(dbCtx, callback, topicId) {
    this._notImplemented('subscriptionDeliveryGone', arguments);
  }


  /**
   * An attempt to deliver content to a subscriber did not complete, update delivery accordingly.
   * @param {*} dbCtx db context
   * @param {string} callback subscriber callback url
   * @param {*} topicId topic id
   * @param {number[]} retryDelays list of retry delays
   */
  async subscriptionDeliveryIncomplete(dbCtx, callback, topicId, retryDelays) {
    this._notImplemented('subscriptionDeliveryIncomplete', arguments);
  }
  

  /**
   * Fetch subscription details
   * @param {*} dbCtx db context
   * @param {string} callback subscriber callback url
   * @param {*} topicId topic id
   */
  async subscriptionGet(dbCtx, callback, topicId) {
    this._notImplemented('subscriptionGet', arguments);
  }

  
  /**
   * Fetch subscription details
   * @param {*} dbCtx db context
   * @param {*} subscriptionId subscription id
   */
  async subscriptionGetById(dbCtx, subscriptionId) {
    this._notImplemented('subscriptionGetById', arguments);
  }


  /**
   * Set subscription details
   * @param {*} dbCtx db context
   * @param {object} data subscription data
   * @param {string} data.callback subscriber callback url
   * @param {*} data.topicId topic id
   * @param {number} data.leaseSeconds lease seconds
   * @param {string=} data.secret secret
   * @param {string=} data.httpRemoteAddr subscriber info
   * @param {string=} data.httpFrom subscriber info
   */
  async subscriptionUpsert(dbCtx, data) {
    this._notImplemented('subscriptionUpsert', arguments);
  }


  /**
   * Set some subscription fields
   * @param {*} dbCtx db context
   * @param {object} data subscription data
   * @param {*} data.subscriptionId subscription id
   * @param {string} data.signatureAlgorithm signature algorithm
   */
  async subscriptionUpdate(dbCtx, data) {
    this._notImplemented('subscriptionUpdate', arguments);
  }


  /**
   * Sets the isDeleted flag on a topic, and reset update time.
   * @param {*} dbCtx db context
   * @param {*} topicId topic id
   */
  async topicDeleted(dbCtx, topicId) {
    this._notImplemented('topicDeleted', arguments);
  }


  /**
   * Claim topics to fetch updates for, from available.
   * @param {*} dbCtx db context
   * @param {Integer} wanted maximum topic fetches to claim
   * @param {Integer} claimTimeoutSeconds age of claimed topics to reclaim
   * @param {string} claimant node id claiming these fetches
   */
  async topicFetchClaim(dbCtx, wanted, claimTimeoutSeconds, claimant) {
    this._notImplemented('topicFetchClaim', arguments);
  }


  /**
   * Claim a topic to update.
   * @param {*} dbCtx db context
   * @param {*} topicId topic id
   * @param {Integer} claimTimeoutSeconds age of claimed topics to reclaim
   * @param {string} claimant node id claiming these fetches
   */
  async topicFetchClaimById(dbCtx, topicId, claimTimeoutSeconds, claimant) {
    this._notImplemented('topicFetchClaim', arguments);
  }


  /**
   * Reset publish state, and reset deliveries for subscribers.
   * @param {*} dbCtx db context
   * @param {*} topicId topic id
   */
  async topicFetchComplete(dbCtx, topicId) {
    this._notImplemented('topicFetchComplete', arguments);
  }


  /**
   * Bump count of attempts and release claim on update.
   * @param {*} dbCtx db context
   * @param {*} topicId topic id
   * @param {number[]} retryDelays retry delays
   */
  async topicFetchIncomplete(dbCtx, topicId, retryDelays) {
    this._notImplemented('topicFetchIncomplete', arguments);
  }


  /**
   * Set a topic as ready to be checked for an update.
   * @param {*} dbCtx db context
   * @param {*} topicId topic id
   */
  async topicFetchRequested(dbCtx, topicId) {
    this._notImplemented('topicPublish', arguments);
  }


  /**
   * Get all data for all topics, including subscription count.
   * @param {*} dbCtx db context
   */
  async topicGetAll(dbCtx) {
    this._notImplemented('topicGetAll', arguments);
  }


  /**
   * Get topic data, without content.
   * @param {*} dbCtx db context
   * @param {string} topicUrl topic url
   * @param {boolean} applyDefaults merge defaults into result
   */
  async topicGetByUrl(dbCtx, topicUrl, applyDefaults = true) {
    this._notImplemented('topicGetByUrl', arguments);
  }


  /**
   * Get topic data, without content.
   * @param {*} dbCtx db context
   * @param {*} topicId topic id
   * @param {boolean} applyDefaults merge defaults into result
   */
  async topicGetById(dbCtx, topicId, applyDefaults = true) {
    this._notImplemented('topicGetById', arguments);
  }
  

  /**
   * Returns topic data with content.
   * @param {*} dbCtx db context
   * @param {*} topicId topic id
   */
  async topicGetContentById(dbCtx, topicId) {
    this._notImplemented('topicGetContentById', arguments);
  }


  /**
   * Attempt to delete a topic, which must be set isDeleted, if there
   * are no more subscriptions belaying its removal.
   * @param {*} dbCtx db context
   * @param {*} topicId topic id
   */
  async topicPendingDelete(dbCtx, topicId) {
    this._notImplemented('topicPendingDelete', arguments);
  }


  /**
   * Return an array of the counts of the last #days of topic updates.
   * @param {*} dbCtx db context
   * @param {*} topicId topic id
   * @param {number} days days back to count
   * @returns {number[]} updates in last days
   */
  async topicPublishHistory(dbCtx, topicId, days) {
    this._notImplemented('topicPublishHistory', arguments);
  }


  /**
   * @alias {object} TopicData
   */
  /**
   * Create or update the basic parameters of a topic.
   * @param {*} dbCtx db context
   * @param {TopicData} data topic data
   */
  async topicSet(dbCtx, data) {
    this._notImplemented('topicSet', arguments);
  }


  /**
   * Updates a topic's content data and content update timestamp.
   * @param {*} dbCtx db context
   * @param {object} data topic data
   * @param {*} data.topicId topic id
   * @param {string} data.content content
   * @param {string} data.contentHash content hash
   * @param {string=} data.contentType content-type
   * @param {string=} data.eTag etag header
   * @param {string=} data.lastModified last modified header
   */
  async topicSetContent(dbCtx, data) {
    this._notImplemented('topicSetContent', arguments);
  }


  /**
   * Set some topic fields.
   * @param {*} dbCtx db context
   * @param {object} data topic data
   * @param {*} data.topicId topic id
   * @param {number=} data.leaseSecondsPreferred preferred topic lease seconds
   * @param {number=} data.leaseSecondsMin min lease seconds
   * @param {number=} data.leaseSecondsMax max lease seconds
   * @param {string=} data.publisherValidationUrl publisher validation url
   * @param {string=} data.contentHashAlgorithm content hash algorithm
   */
  async topicUpdate(dbCtx, data) {
    this._notImplemented('topicUpdate', arguments);
  }


  /**
   * @alias {object} Verification
   */
  /**
   * Claim pending verifications for attempted resolution.
   * @param {*} dbCtx db context
   * @param {Integer} wanted maximum verifications to claim
   * @param {Integer} claimTimeoutSeconds age of claimed verifications to reclaim
   * @param {*} claimant worker claiming processing
   * @returns {Verification[]} array of claimed verifications
   */
  async verificationClaim(dbCtx, wanted, claimTimeoutSeconds, claimant) {
    this._notImplemented('verificationClaim', arguments);
  }


  /**
   * Claim a specific verification by id, if no other similar verification claimed.
   * @param {*} dbCtx db context
   * @param {*} verificationId verification id
   * @param {number} claimTimeoutSeconds claim duration
   * @param {string} claimant worker claiming processing
   */
  async verificationClaimById(dbCtx, verificationId, claimTimeoutSeconds, claimant) {
    this._notImplemented('verificationClaimById', arguments);
  }


  /**
   * Remove the verification, any older verifications for that same client/topic,
   * and remove the claim.
   * @param {*} dbCtx db context
   * @param {*} verificationId verification id
   * @param {string} callback subscriber callback url
   * @param {*} topicId topic id
   */
  async verificationComplete(dbCtx, verificationId, callback, topicId) {
    this._notImplemented('verificationComplete', arguments);
  }


  /**
   * Get verification data.
   * @param {*} dbCtx db context
   * @param {*} verificationId verification id
   */
  async verificationGetById(dbCtx, verificationId) {
    this._notImplemented('verificationGetById', arguments);
  }


  /**
   * Update database that a client verification was unable to complete.
   * This releases the delivery claim and reschedules for some future time.
   * @param {*} dbCtx db context
   * @param {*} verificationId verification id
   * @param {number[]} retryDelays retry delays
   */
  async verificationIncomplete(dbCtx, verificationId, retryDelays) {
    this._notImplemented('verificationIncomplete', arguments);
  }


  /**
   * @alias {object} VerificationData
   */
  /**
   * Create a new pending verification.
   * @param {*} dbCtx db context
   * @param {VerificationData} verification verification data
   * @returns {*} verificationId
   */
  async verificationInsert(dbCtx, verification) {
    this._notImplemented('verificationInsert', arguments);
  }


  /**
   * Relinquish the claim on a verification, without any other updates.
   * @param {*} dbCtx db context
   * @param {*} verificationId verification id
   */
  async verificationRelease(dbCtx, verificationId) {
    this._notImplemented('verificationRelease', arguments);
  }


  /**
   * Updates some fields of an existing (presumably claimed) verification.
   * @param {*} dbCtx db context
   * @param {*} verificationId verification id
   * @param {object} data verification data
   * @param {string} data.mode mode
   * @param {string} data.reason reason
   * @param {boolean} data.isPublisherValidated publisher validation result
   */
  async verificationUpdate(dbCtx, verificationId, data) {
    this._notImplemented('verificationUpdate', arguments);
  }


  /**
   * Sets the isPublisherValidated flag on a verification and resets the delivery
   * @param {*} dbCtx db context
   * @param {*} verificationId verification id
   */
  async verificationValidated(dbCtx, verificationId) {
    this._notImplemented('verificationValidated', arguments);
  }

}

module.exports = Database;
