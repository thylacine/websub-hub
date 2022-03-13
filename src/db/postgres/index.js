/* eslint-disable security/detect-object-injection */
'use strict';

const pgpInitOptions = {
  capSQL: true,
};

const path = require('path');
const pgp = require('pg-promise')(pgpInitOptions);
const svh = require('../schema-version-helper');
const Database = require('../base');
const DBErrors = require('../errors');
const Listener = require('./listener');
const common = require('../../common');

const _fileScope = common.fileScope(__filename);

const PGTypeIdINT8 = 20; // Type Id 20 == INT8 (BIGINT)
const PGTYpeIdINT8Array = 1016; //Type Id 1016 == INT8[] (BIGINT[])
pgp.pg.types.setTypeParser(PGTypeIdINT8, BigInt); // Type Id 20 = INT8 (BIGINT)
const parseBigIntArray = pgp.pg.types.getTypeParser(PGTYpeIdINT8Array); // Type Id 1016 = INT8[] (BIGINT[])
pgp.pg.types.setTypeParser(PGTYpeIdINT8Array, (a) => parseBigIntArray(a).map(BigInt));

const schemaVersionsSupported = {
  min: {
    major: 1,
    minor: 0,
    patch: 0,
  },
  max: {
    major: 1,
    minor: 0,
    patch: 3,
  },
};

class DatabasePostgres extends Database {
  constructor(logger, options, _pgp = pgp) {
    super(logger, options);

    this.db = _pgp(options.db.connectionString);
    this.schemaVersionsSupported = schemaVersionsSupported;

    // Suppress QF warnings when running tests
    this.noWarnings = options.db.noWarnings;

    if (options.db.cacheEnabled) {
      this.listener = new Listener(logger, this.db, Object.assign({}, options.db.listener, {
        channel: 'topic_changed',
        dataCallback: this._topicChanged.bind(this),
        connectionEstablishedCallback: this._listenerEstablished.bind(this),
        connectionLostCallback: this._listenerLost.bind(this),
      }));
    }

    // Log queries
    const queryLogLevel = options.db.queryLogLevel;
    if (queryLogLevel) {
      pgpInitOptions.query = (event) => {
        // Quell outgoing pings
        if (event && event.query && event.query.startsWith('NOTIFY')) {
          return;
        }
        this.logger[queryLogLevel](_fileScope('pgp:query'), '', { ...common.pick(event, ['query', 'params']) });
      };
    }

    // Log errors
    pgpInitOptions.error = (err, event) => {
      this.logger.error(_fileScope('pgp:error'), '', { err, event });
    };

    // Deophidiate column names in-place, log results
    pgpInitOptions.receive = (data, result, event) => {
      const exemplaryRow = data[0];
      for (const prop in exemplaryRow) {
        const camel = Database._camelfy(prop);
        if (!(camel in exemplaryRow)) {
          for (const d of data) {
            d[camel] = d[prop];
            delete d[prop];
          }
        }
      }
      if (queryLogLevel) {
        // Quell outgoing pings
        if (result && result.command === 'NOTIFY') {
          return;
        }
        // Omitting .rows
        const resultLog = common.pick(result, ['command', 'rowCount', 'duration']);
        this.logger[queryLogLevel](_fileScope('pgp:result'), '', { query: event.query, ...resultLog });
      }
    };

    // Expose these for test coverage
    this.pgpInitOptions = pgpInitOptions;
    this._pgp = _pgp;

    this._initStatements(_pgp);
  }


  _queryFileHelper(_pgp) {
    return (file) => {
      const _scope = _fileScope('_queryFile');
      /* istanbul ignore next */
      const qfParams = {
        minify: true,
        ...(this.noWarnings && { noWarnings: this.noWarnings }),
      };
      const qf = new _pgp.QueryFile(file, qfParams);
      if (qf.error) {
        this.logger.error(_scope, 'failed to create SQL statement', { error: qf.error, file });
        throw qf.error;
      }
      return qf;
    };
  }


  async initialize(applyMigrations = true) {
    const _scope = _fileScope('initialize');
    this.logger.debug(_scope, 'called', { applyMigrations });
    if (applyMigrations) {
      await this._initTables();
    }
    await super.initialize();
    if (this.listener) {
      await this.listener.start();
    }
  }


  async _initTables(_pgp) {
    const _scope = _fileScope('_initTables');
    this.logger.debug(_scope, 'called', {});

    const _queryFile = this._queryFileHelper(_pgp || this._pgp);

    // Migrations rely upon this table, ensure it exists.
    const metaVersionTable = '_meta_schema_version';

    const tableExists = async (name) => this.db.oneOrNone('SELECT table_name FROM information_schema.tables WHERE table_name=$(name)', { name });
    let metaExists = await tableExists(metaVersionTable);
    if (!metaExists) {
      const fPath = path.join(__dirname, 'sql', 'schema', 'init.sql');
      const initSql = _queryFile(fPath);
      const results = await this.db.multiResult(initSql);
      this.logger.debug(_scope, 'executed init sql', { results });
      metaExists = await tableExists(metaVersionTable);
      /* istanbul ignore if */
      if (!metaExists) {
        throw new DBErrors.UnexpectedResult(`did not create ${metaVersionTable} table`);
      }
      this.logger.info(_scope, 'created schema version table', { metaVersionTable });
    }

    // Apply migrations
    const currentSchema = await this._currentSchema();
    const migrationsWanted = svh.unappliedSchemaVersions(__dirname, currentSchema, this.schemaVersionsSupported);
    this.logger.debug(_scope, 'schema migrations wanted', { migrationsWanted });
    for (const v of migrationsWanted) {
      const fPath = path.join(__dirname, 'sql', 'schema', v, 'apply.sql');
      try {
        const migrationSql = _queryFile(fPath);
        this.logger.debug(_scope, 'applying migration', { version: v });
        const results = await this.db.multiResult(migrationSql);
        this.logger.debug(_scope, 'migration results', { results });
        this.logger.info(_scope, 'applied migration', { version: v });
      } catch (e) {
        this.logger.error(_scope, 'migration failed', { error: e, fPath, version: v });
        throw e;
      }
    }
  }

  
  _initStatements(_pgp) {
    const _scope = _fileScope('_initStatements');
    const _queryFile = this._queryFileHelper(_pgp);
    this.statement = _pgp.utils.enumSql(path.join(__dirname, 'sql'), {}, _queryFile);
    this.logger.debug(_scope, 'statements initialized', { statements: Object.keys(this.statement).length });
  }

  
  async healthCheck() {
    const _scope = _fileScope('healthCheck');
    this.logger.debug(_scope, 'called', {});
    const c = await this.db.connect();
    c.done();
    return { serverVersion: c.client.serverVersion };
  }


  async _currentSchema() {
    return this.db.one('SELECT major, minor, patch FROM _meta_schema_version ORDER BY major DESC, minor DESC, patch DESC LIMIT 1');
  }

  
  async _closeConnection() {
    const _scope = _fileScope('_closeConnection');
    try {
      if (this.listener) {
        await this.listener.stop();
      }
      await this._pgp.end();
    } catch (e) {
      this.logger.error(_scope, 'failed', { error: e });
      throw e;
    }
  }

  
  /* istanbul ignore next */
  async _purgeTables(really = false) {
    const _scope = _fileScope('_purgeTables');
    try {
      if (really) {
        await this.db.tx(async (t) => {
          await t.batch([
            'topic',
            // 'topic_fetch_in_progress',
            // 'verification',
            // 'verification_in_progress',
            // 'subscription',
            // 'subscription_delivery_in_progress',
          ].map(async (table) => t.query('TRUNCATE TABLE $(table:name) CASCADE', { table })));
        });
      }
    } catch (e) {
      this.logger.error(_scope, 'failed', { error: e });
      throw e;
    }
  }


  // eslint-disable-next-line class-methods-use-this
  _engineInfo(result) {
    return {
      changes: result.rowCount,
      lastInsertRowid: result.rows.length ? result.rows[0].id : undefined,
      duration: result.duration,
    };
  }


  // eslint-disable-next-line class-methods-use-this
  _resultLog(result) {
    return common.pick(result, ['command', 'rowCount', 'duration']);
  }


  /**
   * Receive notices when topic entry is updated.
   * Clear relevant cache entry.
   * @param {String} payload
   */
  _topicChanged(payload) {
    const _scope = _fileScope('_topicChanged');
    if (payload !== 'ping') {
      this.logger.debug(_scope, 'called', { payload });
      this.cache.delete(payload);
    }
  }


  /**
   * Called when a listener connection is opened.
   * Enable cache.
   */
  _listenerEstablished() {
    const _scope = _fileScope('_listenerEstablished');
    this.logger.debug(_scope, 'called', {});
    this.cache = new Map();
  }


  /**
   * Called when a listener connection is closed.
   * Disable cache.
   */
  _listenerLost() {
    const _scope = _fileScope('_listenerLost');
    this.logger.debug(_scope, 'called', {});
    delete this.cache;
  }


  /**
   * Return a cached entry, if available.
   * @param {*} key
   */
  _cacheGet(key) {
    const _scope = _fileScope('_cacheGet');
    if (this.cache && this.cache.has(key)) {
      const cacheEntry = this.cache.get(key);
      this.logger.debug(_scope, 'found cache entry', { key, ...common.pick(cacheEntry, ['added', 'hits', 'lastHit']) });
      cacheEntry.hits += 1;
      cacheEntry.lastHit = new Date();
      return cacheEntry.data;
    }
  }


  /**
   * Store an entry in cache, if available.
   * @param {*} key
   * @param {*} data
   */
  _cacheSet(key, data) {
    const _scope = _fileScope('_cacheSet');
    if (this.cache) {
      this.cache.set(key, {
        added: new Date(),
        hits: 0,
        lastHit: undefined,
        data,
      });
      this.logger.debug(_scope, 'added cache entry', { key });
    }
  }


  async context(fn) {
    return this.db.task(async (t) => fn(t));
  }


  // eslint-disable-next-line class-methods-use-this
  async transaction(dbCtx, fn) {
    return dbCtx.txIf(async (t) => fn(t));
  }


  async authenticationSuccess(dbCtx, identifier) {
    const _scope = _fileScope('authenticationSuccess');
    this.logger.debug(_scope, 'called', { identifier });

    let result;
    try {
      result = await dbCtx.result(this.statement.authenticationSuccess, { identifier });
      if (result.rowCount != 1) {
        throw new DBErrors.UnexpectedResult('did not update authentication success event');
      }
    } catch (e) {
      this.logger.error(_scope, 'failed', { error: e, identifier });
      throw e;
    }
  }


  async authenticationGet(dbCtx, identifier) {
    const _scope = _fileScope('authenticationGet');
    this.logger.debug(_scope, 'called', { identifier });

    let auth;
    try {
      auth = await dbCtx.oneOrNone(this.statement.authenticationGet, { identifier });
      return auth;
    } catch (e) {
      this.logger.error(_scope, 'failed', { error: e, identifier });
      throw e;
    }
  }


  async authenticationUpsert(dbCtx, identifier, credential) {
    const _scope = _fileScope('authenticationUpsert');
    const scrubbedCredential = '*'.repeat((credential || '').length);
    this.logger.debug(_scope, 'called', { identifier, scrubbedCredential });

    let result;
    try {
      result = await dbCtx.result(this.statement.authenticationUpsert, { identifier, credential });
      if (result.rowCount != 1) {
        throw new DBErrors.UnexpectedResult('did not upsert authentication');
      }
    } catch (e) {
      this.logger.error(_scope, 'failed', { error: e, identifier, scrubbedCredential })
      throw e;
    }
  }


  async subscriptionsByTopicId(dbCtx, topicId) {
    const _scope = _fileScope('subscriptionsByTopicId');
    this.logger.debug(_scope, 'called', { topicId });

    let count;
    try {
      count = await dbCtx.manyOrNone(this.statement.subscriptionsByTopicId, { topicId });
      return count;
    } catch (e) {
      this.logger.error(_scope, 'failed', { error: e, topicId });
      throw e;
    }
  }


  async subscriptionCountByTopicUrl(dbCtx, topicUrl) {
    const _scope = _fileScope('subscriptionCountByTopicUrl');
    this.logger.debug(_scope, 'called', { topicUrl });

    let count;
    try {
      count = await dbCtx.one(this.statement.subscriptionCountByTopicUrl, { topicUrl });
      return count;
    } catch (e) {
      this.logger.error(_scope, 'failed', { error: e, topicUrl });
      throw e;
    }
  }


  async subscriptionDelete(dbCtx, callback, topicId) {
    const _scope = _fileScope('subscriptionDelete');
    this.logger.debug(_scope, 'called', { callback, topicId });

    try {
      const result = await dbCtx.result(this.statement.subscriptionDelete, { callback, topicId });
      return this._engineInfo(result);
    } catch (e) {
      this.logger.error(_scope, 'failed', { error: e, callback, topicId });
      throw e;
    }
  }


  async subscriptionDeleteExpired(dbCtx, topicId) {
    const _scope = _fileScope('subscriptionDeleteExpired');
    this.logger.debug(_scope, 'called', { topicId });

    try {
      const result = await dbCtx.result(this.statement.subscriptionDeleteExpired, { topicId });
      this.logger.debug(_scope, 'success', { topicId, deleted: result.rowCount });
      return this._engineInfo(result);
    } catch (e) {
      this.logger.error(_scope, 'failed', { error: e, topicId });
      throw e;
    }
  }


  async subscriptionDeliveryClaim(dbCtx, wanted, claimTimeoutSeconds, claimant) {
    const _scope = _fileScope('subscriptionDeliveryClaim');
    this.logger.debug(_scope, 'called', { wanted, claimTimeoutSeconds, claimant });

    try {
      const claims = await dbCtx.txIf(async (txCtx) => {
        return txCtx.manyOrNone(this.statement.subscriptionDeliveryClaim, { claimant, wanted, claimTimeoutSeconds });
      });
      return claims.map((r) => r.id);
    } catch (e) {
      this.logger.error(_scope, 'failed', { error: e, claimant, wanted, claimTimeoutSeconds });
      throw e;
    }
  }


  async subscriptionDeliveryClaimById(dbCtx, subscriptionId, claimTimeoutSeconds, claimant) {
    const _scope = _fileScope('subscriptionDeliveryClaimById');
    this.logger.debug(_scope, 'called', { subscriptionId, claimTimeoutSeconds, claimant });

    let result;
    try {
      result = await dbCtx.txIf(async (txCtx) => {
        result = await txCtx.result(this.statement.subscriptionDeliveryClaimById, { claimant, subscriptionId, claimTimeoutSeconds });
        if (result.rowCount != 1) {
          throw new DBErrors.UnexpectedResult('did not claim subscription delivery');
        }
        return result;
      });
      return this._engineInfo(result);
    } catch (e) {
      this.logger.error(_scope, 'failed', { error: e, claimant, subscriptionId, claimTimeoutSeconds });
      throw e;
    }
  }


  async subscriptionDeliveryComplete(dbCtx, callback, topicId, topicContentUpdated) {
    const _scope = _fileScope('subscriptionDeliveryComplete');
    this.logger.debug(_scope, 'called', { callback, topicId, topicContentUpdated });

    let result;
    try {
      await dbCtx.txIf(async (txCtx) => {
        result = await txCtx.result(this.statement.subscriptionDeliverySuccess, { callback, topicId, topicContentUpdated });
        if (result.rowCount != 1) {
          throw new DBErrors.UnexpectedResult('did not set subscription delivery success');
        }
        result = await txCtx.result(this.statement.subscriptionDeliveryDone, { callback, topicId });
        if (result.rowCount != 1) {
          throw new DBErrors.UnexpectedResult('did not release subscription delivery');
        }
      });
    } catch (e) {
      this.logger.error(_scope, 'failed', { error: e, callback, topicId, topicContentUpdated });
      throw e;
    }
  }


  async subscriptionDeliveryGone(dbCtx, callback, topicId) {
    const _scope = _fileScope('subscriptionDeliveryGone');
    this.logger.debug(_scope, 'called', { callback, topicId });

    let result;
    try {
      await dbCtx.txIf(async (txCtx) => {
        result = await txCtx.result(this.statement.subscriptionDelete, { callback, topicId });
        if (result.rowCount != 1) {
          throw new DBErrors.UnexpectedResult('did not delete subscription');
        }
        // Delete cascades to delivery
        // result = await txCtx.result(this.statement.subscriptionDeliveryDone, { callback, topicId });
        // if (result.rowCount != 1) {
        //   throw new DBErrors.UnexpectedResult('did not release subscription delivery');
        // }
      });
    } catch (e) {
      this.logger.error(_scope, 'failed', { error: e, callback, topicId });
      throw e;
    }
  }


  async subscriptionDeliveryIncomplete(dbCtx, callback, topicId, retryDelays = [60]) {
    const _scope = _fileScope('subscriptionDeliveryIncomplete');
    this.logger.debug(_scope, 'called', { callback, topicId, retryDelays });

    let result;
    try {
      await dbCtx.txIf(async (txCtx) => {
        const { currentAttempt } = await txCtx.one(this.statement.subscriptionDeliveryAttempts, { callback, topicId });
        const nextAttemptDelaySeconds = common.attemptRetrySeconds(currentAttempt, retryDelays);
        result = await txCtx.result(this.statement.subscriptionDeliveryFailure, { nextAttemptDelaySeconds, callback, topicId });
        if (result.rowCount != 1) {
          throw new DBErrors.UnexpectedResult('did not set subscription delivery failure');
        }
        result = await txCtx.result(this.statement.subscriptionDeliveryDone, { callback, topicId });
        if (result.rowCount != 1) {
          throw new DBErrors.UnexpectedResult('did not release subscription delivery');
        }
      });
    } catch (e) {
      this.logger.error(_scope, 'failed', { error: e, callback, topicId });
      throw e;
    }
  }


  async subscriptionGet(dbCtx, callback, topicId) {
    const _scope = _fileScope('subscriptionGet');
    this.logger.debug(_scope, 'called', { callback, topicId });

    let subscription;
    try {
      subscription = await dbCtx.oneOrNone(this.statement.subscriptionGet, { callback, topicId });
      return subscription;
    } catch (e) {
      this.logger.error(_scope, 'failed', { error: e, callback, topicId });
      throw e;
    }
  }


  async subscriptionGetById(dbCtx, subscriptionId) {
    const _scope = _fileScope('subscriptionGetById');
    this.logger.debug(_scope, 'called', { subscriptionId });

    let subscription;
    try {
      subscription = await dbCtx.oneOrNone(this.statement.subscriptionGetById, { subscriptionId });
      return subscription;
    } catch (e) {
      this.logger.error(_scope, 'failed', { error: e, subscriptionId });
      throw e;
    }
  }


  async subscriptionUpdate(dbCtx, data) {
    const _scope = _fileScope('subscriptionUpdate');
    this.logger.debug(_scope, 'called', { data });

    const subscriptionData = {
      ...data,
    };

    this._subscriptionUpdateDataValidate(subscriptionData);

    let result;
    try {
      result = await dbCtx.result(this.statement.subscriptionUpdate, subscriptionData);
      if (result.rowCount != 1) {
        throw new DBErrors.UnexpectedResult('did not update subscription');
      }
    } catch (e) {
      this.logger.error(_scope, 'failed', { error: e, subscriptionData });
      throw e;
    }
  }


  async subscriptionUpsert(dbCtx, data) {
    const _scope = _fileScope('subscriptionUpsert');
    this.logger.debug(_scope, 'called', { ...data });

    const subscriptionData = {
      secret: null,
      httpRemoteAddr: null,
      httpFrom: null,
      ...data,
    };
    this._subscriptionUpsertDataValidate(subscriptionData);

    let result;
    try {
      result = await dbCtx.result(this.statement.subscriptionUpsert, subscriptionData);
      if (result.rowCount != 1) {
        throw new DBErrors.UnexpectedResult('did not upsert subscription');
      }
      return this._engineInfo(result);
    } catch (e) {
      this.logger.error(_scope, 'failed', { error: e, subscriptionData });
      throw e;
    }
  }


  async topicDeleted(dbCtx, topicId) {
    const _scope = _fileScope('topicDeleted');
    this.logger.debug(_scope, 'called', { topicId });

    let result;
    try {
      result = await dbCtx.result(this.statement.topicDeleted, { topicId });
      if (result.rowCount != 1) {
        throw new DBErrors.UnexpectedResult('did not update topic as deleted');
      }
    } catch (e) {
      this.logger.error(_scope, 'failed to update topic as deleted', { error: e, topicId });
      throw e;
    }
  }


  async topicFetchClaim(dbCtx, wanted, claimTimeoutSeconds, claimant) {
    const _scope = _fileScope('topicFetchClaim');
    this.logger.debug(_scope, 'called', { wanted, claimTimeoutSeconds });

    let claims;
    try {
      await dbCtx.txIf(async (txCtx) => {
        claims = await txCtx.manyOrNone(this.statement.topicContentFetchClaim, { claimant, wanted, claimTimeoutSeconds });
      });
      return claims.map((r) => r.id);
    } catch (e) {
      this.logger.error(_scope, 'failed to claim topics for fetch', { error: e });
      throw e;
    }
  }


  async topicFetchClaimById(dbCtx, topicId, claimTimeoutSeconds, claimant) {
    const _scope = _fileScope('topicFetchClaimById');
    this.logger.debug(_scope, 'called', { topicId, claimTimeoutSeconds, claimant });

    let result;
    try {
      await dbCtx.txIf(async (txCtx) => {
        result = await txCtx.result(this.statement.topicContentFetchClaimById, { topicId, claimant, claimTimeoutSeconds });
      });
      return this._engineInfo(result);
    } catch (e) {
      this.logger.error(_scope, 'failed', { error: e, topicId });
      throw e;
    }
  }


  async topicFetchComplete(dbCtx, topicId) {
    const _scope = _fileScope('topicFetchComplete');
    this.logger.debug(_scope, 'called', { topicId });

    let result;
    try {
      await dbCtx.txIf(async (txCtx) => {
        result = await txCtx.result(this.statement.topicAttemptsReset, { topicId });
        if (result.rowCount != 1) {
          throw new DBErrors.UnexpectedResult('did not reset topic attempts');
        }
        result = await txCtx.result(this.statement.topicContentFetchDone, { topicId });
        if (result.rowCount != 1) {
          throw new DBErrors.UnexpectedResult('did not release topic fetch');
        }
      });
      this.logger.debug(_scope, 'success', { topicId, ...this._resultLog(result) });
      return this._engineInfo(result);
    } catch (e) {
      this.logger.error(_scope, 'failed', { error: e, result, topicId });
      throw e;
    }
  }


  async topicFetchIncomplete(dbCtx, topicId, retryDelays = [60]) {
    const _scope = _fileScope('topicFetchIncomplete');
    this.logger.debug(_scope, 'called', { topicId });

    let result;
    try {
      result = await dbCtx.txIf(async (txCtx) => {
        const { contentFetchAttemptsSinceSuccess: currentAttempt } = await txCtx.one(this.statement.topicAttempts, { topicId });
        const nextAttemptDelaySeconds = common.attemptRetrySeconds(currentAttempt, retryDelays);
        result = await txCtx.result(this.statement.topicAttemptsIncrement, { topicId, nextAttemptDelaySeconds });
        if (result.rowCount != 1) {
          throw new DBErrors.UnexpectedResult('did not set topic attempts');
        }
        result = await txCtx.result(this.statement.topicContentFetchDone, { topicId });
        if (result.rowCount != 1) {
          throw new DBErrors.UnexpectedResult('did not release topic fetch');
        }
        return result;
      });
      this.logger.debug(_scope, 'success', { topicId, ...this._resultLog(result) });
      return this._engineInfo(result);
    } catch (e) {
      this.logger.error(_scope, 'failed', { error: e, result, topicId });
      throw e;
    }
  }


  async topicFetchRequested(dbCtx, topicId) {
    const _scope = _fileScope('topicFetchRequested');
    this.logger.debug(_scope, 'called', { topicId });

    let result;
    try {
      result = await dbCtx.result(this.statement.topicContentFetchRequested, { topicId });
      if (result.rowCount != 1) {
        throw new DBErrors.UnexpectedResult('did not set topic fetch requested');
      }
      this.logger.debug(_scope, 'success', { topicId, ...this._resultLog(result) });
      return this._engineInfo(result);
    } catch (e) {
      this.logger.error(_scope, 'failed', { error: e, topicId });
      throw e;
    }
  }


  async topicGetAll(dbCtx) {
    const _scope = _fileScope('topicGetAll');
    this.logger.debug(_scope, 'called');

    let topics;
    try {
      topics = await dbCtx.manyOrNone(this.statement.topicGetInfoAll);
    } catch (e) {
      this.logger.error(_scope, 'failed', { error: e, topics });
      throw e;
    }
    if (topics) {
      topics = topics.map(this._topicDefaults.bind(this));
    }
    return topics;
  }


  async topicGetById(dbCtx, topicId, applyDefaults = true) {
    const _scope = _fileScope('topicGetById');
    this.logger.debug(_scope, 'called', { topicId });

    let topic;
    try {
      topic = await dbCtx.oneOrNone(this.statement.topicGetById, { topicId });
      if (applyDefaults) {
        topic = this._topicDefaults(topic);
      }
      return topic;
    } catch (e) {
      this.logger.error(_scope, 'failed', { error: e, topic, topicId });
      throw e;
    }
  }


  async topicGetByUrl(dbCtx, topicUrl) {
    const _scope = _fileScope('topicGetByUrl');
    this.logger.debug(_scope, 'called', { topicUrl });

    let topic;
    try {
      topic = await dbCtx.oneOrNone(this.statement.topicGetByUrl, { topicUrl });
      return this._topicDefaults(topic);
    } catch (e) {
      this.logger.error(_scope, 'failed', { error: e, topic, topicUrl });
      throw e;
    }
  }


  async topicGetContentById(dbCtx, topicId) {
    const _scope = _fileScope('topicGetContentById');
    this.logger.debug(_scope, 'called', { topicId });

    let topic;
    try {
      topic = this._cacheGet(topicId);
      if (topic) {
        return topic;
      }
      topic = await dbCtx.oneOrNone(this.statement.topicGetContentById, { topicId });
      const topicWithDefaults = this._topicDefaults(topic);
      this._cacheSet(topicId, topicWithDefaults);
      return topicWithDefaults;
    } catch (e) {
      this.logger.error(_scope, 'failed', { error: e, topic, topicId });
      throw e;
    }
  }


  async topicPendingDelete(dbCtx, topicId) {
    const _scope = _fileScope('topicPendingDelete');
    this.logger.debug(_scope, 'called', { topicId });

    try {
      await dbCtx.txIf(async (txCtx) => {
        const topic = await txCtx.one(this.statement.topicGetById, { topicId });
        if (!topic.isDeleted) {
          this.logger.debug(_scope, 'topic not set deleted, not deleting', { topicId });
          return;
        }

        const { count: subscriberCount } = await txCtx.one(this.statement.subscriptionCountByTopicUrl, { topicUrl: topic.url });
        if (subscriberCount) {
          this.logger.debug(_scope, 'topic has subscribers, not deleting', { topicId, subscriberCount });
          return;
        }

        const result = await txCtx.result(this.statement.topicDeleteById, { topicId });
        if (result.rowCount !== 1) {
          throw new DBErrors.UnexpectedResult('did not delete topic');
        }
      });
      this.logger.debug(_scope, 'success', { topicId });
    } catch (e) {
      this.logger.error(_scope, 'failed', { error: e, topicId });
      throw e;
    }
  }


  async topicPublishHistory(dbCtx, topicId, days) {
    const _scope = _fileScope('topicPublishHistory');
    this.logger.debug(_scope, 'called', { topicId, days });

    const events = await dbCtx.manyOrNone(this.statement.topicPublishHistory, { topicIds: [topicId], daysAgo: days });
    const history = Array.from({ length: days }, () => 0);
    events.forEach(({ daysAgo, contentUpdates }) => history[daysAgo] = Number(contentUpdates));

    return history;
  }


  async topicSet(dbCtx, data) {
    const _scope = _fileScope('topicSet');
    this.logger.debug(_scope, 'called', data);

    const topicSetData = {
      publisherValidationUrl: null,
      leaseSecondsPreferred: null,
      leaseSecondsMin: null,
      leaseSecondsMax: null,
      ...data,
    };
  
    let result;
    try {
      this._topicSetDataValidate(topicSetData);
      result = await dbCtx.result(this.statement.topicUpsert, topicSetData);
      if (result.rowCount != 1) {
        throw new DBErrors.UnexpectedResult('did not set topic data');
      }
      this.logger.debug(_scope, 'success', { topicSetData, ...this._resultLog(result) });
      return this._engineInfo(result);
    } catch (e) {
      this.logger.error(_scope, 'failed', { error: e, result });
      throw e;
    }
  }


  async topicSetContent(dbCtx, data) {
    const _scope = _fileScope('topicSetContent');
    const topicSetContentData = {
      contentType: null,
      ...data,
    };
    const logData = {
      ...topicSetContentData,
      content: common.logTruncate(topicSetContentData.content, 100),
    };
    this.logger.debug(_scope, 'called', data);

    let result;
    try {
      this._topicSetContentDataValidate(topicSetContentData);
      result = await dbCtx.result(this.statement.topicSetContent, topicSetContentData);
      logData.result = this._resultLog(result);
      if (result.rowCount !=  1) {
        throw new DBErrors.UnexpectedResult('did not set topic content');
      }
      result = await dbCtx.result(this.statement.topicSetContentHistory, { topicId: data.topicId, contentHash: data.contentHash, contentSize: data.content.length });
      if (result.rowCount != 1) {
        throw new DBErrors.UnexpectedResult('did not set topic content history');
      }
      this.logger.debug(_scope, 'success', { ...logData });
      return this._engineInfo(result);
    } catch (e) {
      this.logger.error(_scope, 'failed', { error: e, ...logData });
      throw e;
    }
  }


  async topicUpdate(dbCtx, data) {
    const _scope = _fileScope('topicUpdate');
    this.logger.debug(_scope, 'called', { data });

    const topicData = {
      leaseSecondsPreferred: null,
      leaseSecondsMin: null,
      leaseSecondsMax: null,
      publisherValidationUrl: null,
      ...data,
    };

    this._topicUpdateDataValidate(topicData);

    let result;
    try {
      result = await dbCtx.result(this.statement.topicUpdate, topicData);
      if (result.rowCount != 1) {
        throw new DBErrors.UnexpectedResult('did not update topic');
      }
    } catch (e) {
      this.logger.error(_scope, 'failed', { error: e, topicData });
      throw e;
    }
  }


  async verificationClaim(dbCtx, wanted, claimTimeoutSeconds, claimant) {
    const _scope = _fileScope('verificationClaim');
    this.logger.debug(_scope, 'called', { wanted, claimTimeoutSeconds });

    let result;
    try {
      await dbCtx.txIf(async (txCtx) => {
        result = await txCtx.manyOrNone(this.statement.verificationClaim, { claimant, wanted, claimTimeoutSeconds });
      });
      return result.map((r) => r.id);
    } catch (e) {
      this.logger.error(_scope, 'failed', { wanted, claimTimeoutSeconds });
      throw e;
    }
  }



  async verificationClaimById(dbCtx, verificationId, claimTimeoutSeconds, claimant) {
    const _scope = _fileScope('verificationClaimById');
    this.logger.debug(_scope, 'called', { verificationId, claimant, claimTimeoutSeconds });

    let result;
    try {
      await dbCtx.txIf(async (txCtx) => {
        result = await txCtx.result(this.statement.verificationClaimById, { verificationId, claimant, claimTimeoutSeconds });
      });
      return this._engineInfo(result);
    } catch (e) {
      this.logger.error(_scope, 'failed', { verificationId, claimant, claimTimeoutSeconds });
      throw e;
    }
  }


  async verificationComplete(dbCtx, verificationId, callback, topicId) {
    const _scope = _fileScope('verificationComplete');
    this.logger.debug(_scope, 'called', { verificationId });

    let result;
    try {
      await dbCtx.txIf(async (txCtx) => {
        result = await txCtx.result(this.statement.verificationScrub, { verificationId, callback, topicId });
        if (result.rowCount < 1) {
          throw new DBErrors.UnexpectedResult('did not remove verifications');
        }
      });
    } catch (e) {
      this.logger.error(_scope, 'failed', { verificationId });
      throw e;
    }
    return this._engineInfo(result);
  }


  async verificationGetById(dbCtx, verificationId) {
    const _scope = _fileScope('verificationGetById');
    this.logger.debug(_scope, 'called', { verificationId });

    let verification;
    try {
      verification = await dbCtx.oneOrNone(this.statement.verificationGetById, { verificationId });
      return verification;
    } catch (e) {
      this.logger.error(_scope, 'failed', { error: e, verificationId });
      throw e;
    }
  }


  async verificationIncomplete(dbCtx, verificationId, retryDelays = [60]) {
    const _scope = _fileScope('verificationIncomplete');
    this.logger.debug(_scope, 'called', { verificationId });

    let result;
    try {
      await dbCtx.txIf(async (txCtx) => {
        const { attempts } = await txCtx.one(this.statement.verificationAttempts, { verificationId });
        const nextAttemptDelaySeconds = common.attemptRetrySeconds(attempts, retryDelays);
        result = await txCtx.result(this.statement.verificationAttemptIncrement, { verificationId, nextAttemptDelaySeconds });
        if (result.rowCount != 1) {
          throw new DBErrors.UnexpectedResult('did not update verification attempts');
        }
        result = await txCtx.result(this.statement.verificationDone, { verificationId });
        if (result.rowCount != 1) {
          throw new DBErrors.UnexpectedResult('did not release verification');
        }
      });
    } catch (e) {
      this.logger.error(_scope, 'failed', { error: e, verificationId });
      throw e;
    }
  }


  async verificationInsert(dbCtx, verification) {
    const _scope = _fileScope('verificationInsert');
    this.logger.debug(_scope, 'called', { verification });

    const verificationData = {
      secret: null,
      httpRemoteAddr: null,
      httpFrom: null,
      requestId: null,
      ...verification,
    };

    let result, verificationId;
    try {
      this._verificationDataValidate(verificationData);
      result = await dbCtx.result(this.statement.verificationInsert, verificationData);
      if (result.rowCount != 1) {
        throw new DBErrors.UnexpectedResult('did not insert verification');
      }
      verificationId = result.rows[0].id;
      this.logger.debug(_scope, 'inserted verification', { verificationId });

      return verificationId;
    } catch (e) {
      this.logger.error(_scope, 'failed', { error: e, verificationData });
      throw e;
    }
  }


  async verificationRelease(dbCtx, verificationId) {
    const _scope = _fileScope('verificationRelease');
    this.logger.debug(_scope, 'called', { verificationId });

    let result;
    try {
      result = await dbCtx.result(this.statement.verificationDone, { verificationId });
      if (result.rowCount != 1) {
        throw new DBErrors.UnexpectedResult('did not release verification');
      }
      return this._engineInfo(result);
    } catch (e) {
      this.logger.error(_scope, 'failed', { error: e, verificationId });
      throw e;
    }
  }


  async verificationUpdate(dbCtx, verificationId, data) {
    const _scope = _fileScope('verificationUpdate');
    this.logger.debug(_scope, 'called', { verificationId, data });

    const verificationData = {
      reason: null,
      verificationId,
      ...data,
    };

    let result;
    try {
      this._verificationUpdateDataValidate(verificationData);
      result = await dbCtx.result(this.statement.verificationUpdate, verificationData);
      if (result.rowCount != 1) {
        throw new DBErrors.UnexpectedResult('did not update verification');
      }
    } catch (e) {
      this.logger.error(_scope, 'failed', { error: e, verificationData });
      throw e;
    }
  }


  async verificationValidated(dbCtx, verificationId) {
    const _scope = _fileScope('verificationValidated');
    this.logger.debug(_scope, 'called', { verificationId });

    let result;
    try {
      result = await dbCtx.result(this.statement.verificationValidate, { verificationId });
      if (result.rowCount != 1) {
        throw new DBErrors.UnexpectedResult('did not set verification validation');
      }
    } catch (e) {
      this.logger.error(_scope, 'failed', { error: e, verificationId });
      throw e;
    } 
  }

}

module.exports = DatabasePostgres;
