'use strict';

const common = require('../../common');
const Database = require('../base');
const DBErrors = require('../errors');
const svh = require('../schema-version-helper');
const SQLite = require('better-sqlite3');
const fs = require('fs');
const path = require('path');
const { performance } = require('perf_hooks');

const _fileScope = common.fileScope(__filename);

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

// max of signed int64 (2^63 - 1), should be enough
const EPOCH_FOREVER = BigInt('9223372036854775807');
const epochToDate = (epoch) => new Date(Number(epoch) * 1000);
const dateToEpoch = (date) => Math.round(date.getTime() / 1000);

class DatabaseSQLite extends Database {
  constructor(logger, options) {
    super(logger, options);

    const connectionString = options.db.connectionString || 'sqlite://:memory:';
    const csDelim = '://';
    const dbFilename = connectionString.slice(connectionString.indexOf(csDelim) + csDelim.length);

    const queryLogLevel = options.db.queryLogLevel;

    const sqliteOptions = {
      ...(queryLogLevel && {
        // eslint-disable-next-line security/detect-object-injection
        verbose: (query) => this.logger[queryLogLevel](_fileScope('SQLite:verbose'), '', { query }),
      }),
    };
    this.db = new SQLite(dbFilename, sqliteOptions);
    this.schemaVersionsSupported = schemaVersionsSupported;
    this.changesSinceLastOptimize = BigInt(0);
    this.optimizeAfterChanges = options.db.connectionString.optimizeAfterChanges;
    this.db.pragma('foreign_keys = on'); // Enforce consistency.
    this.db.pragma('journal_mode = WAL'); // Be faster, expect local filesystem.
    this.db.defaultSafeIntegers(true); // This probably isn't necessary, but by using these BigInts we keep weird floats out of the query logs.

    this._initTables();
    this._initStatements();
  }


  /**
   * SQLite cannot prepare its statements without a schema, ensure such exists.
   */
  _initTables() {
    const _scope = _fileScope('_initTables');

    // Migrations rely upon this table, ensure it exists.
    const metaVersionTable = '_meta_schema_version';
    const tableExists = this.db.prepare('SELECT name FROM sqlite_master WHERE type=:type AND name=:name').pluck(true).bind({ type: 'table', name: metaVersionTable });
    let metaExists = tableExists.get();
    if (metaExists === undefined) {
      const fPath = path.join(__dirname, 'sql', 'schema', 'init.sql');
      // eslint-disable-next-line security/detect-non-literal-fs-filename
      const fSql = fs.readFileSync(fPath, { encoding: 'utf8' });
      this.db.exec(fSql);
      metaExists = tableExists.get();
      /* istanbul ignore if */
      if (metaExists === undefined) {
        throw new DBErrors.UnexpectedResult(`did not create ${metaVersionTable} table`);
      }
      this.logger.info(_scope, 'created schema version table', { metaVersionTable });
    }

    // Apply migrations
    const currentSchema = this._currentSchema();
    const migrationsWanted = svh.unappliedSchemaVersions(__dirname, currentSchema, this.schemaVersionsSupported);
    this.logger.debug(_scope, 'schema migrations wanted', { migrationsWanted });
    migrationsWanted.forEach((v) => {
      const fPath = path.join(__dirname, 'sql', 'schema', v, 'apply.sql');
      try {
        // eslint-disable-next-line security/detect-non-literal-fs-filename
        const fSql = fs.readFileSync(fPath, { encoding: 'utf8' });
        this.logger.debug(_scope, 'applying migration', { version: v });
        const results = this.db.exec(fSql);
        this.logger.debug(_scope, 'migration results', { results });
        this.logger.info(_scope, 'applied migration', { version: v });
      } catch (e) {
        this.logger.error(_scope, 'migration failed', { error: e, fPath, version: v });
        throw e;
      }
    });
  }


  _initStatements() {
    const _scope = _fileScope('_initStatements');
    const sqlDir = path.join(__dirname, 'sql');
    this.statement = {};

    // Decorate the statement calls we use with timing and logging.
    const wrapFetch = (logName, statementName, fn) => {
      const _wrapScope = _fileScope(logName);
      return (...args) => {
        const startTimestampMs = performance.now();
        const rows = fn(...args);
        DatabaseSQLite._deOphidiate(rows);
        const elapsedTimeMs = performance.now() - startTimestampMs;
        this.logger.debug(_wrapScope, 'complete', { statementName, elapsedTimeMs });
        return rows;
      };
    };
    const wrapRun = (logName, statementName, fn) => {
      const _wrapScope = _fileScope(logName);
      return (...args) => {
        const startTimestampMs = performance.now();
        const result = fn(...args);
        const elapsedTimeMs = performance.now() - startTimestampMs;
        this.logger.debug(_wrapScope, 'complete', { ...result, statementName, elapsedTimeMs });
        result.duration = elapsedTimeMs;
        return result;
      };
    };

    // eslint-disable-next-line security/detect-non-literal-fs-filename
    for (const f of fs.readdirSync(sqlDir)) {
      const fPath = path.join(sqlDir, f);
      const { name: fName, ext: fExt } = path.parse(f);
      // eslint-disable-next-line security/detect-non-literal-fs-filename
      const stat = fs.statSync(fPath);
      if (!stat.isFile()
      ||  fExt.toLowerCase() !== '.sql') {
        continue;
      }
      // eslint-disable-next-line security/detect-non-literal-fs-filename
      const fSql = fs.readFileSync(fPath, { encoding: 'utf8' });
      const statementName = Database._camelfy(fName.toLowerCase(), '-');
      let statement;
      try {
        statement = this.db.prepare(fSql);
      } catch (e) {
        /* istanbul ignore next */
        this.logger.error(_scope, 'failed to prepare statement', { error: e, file: f });
        /* istanbul ignore next */
        throw e;
      }
      // eslint-disable-next-line security/detect-object-injection
      this.statement[statementName] = statement;
      const { get: origGet, all: origAll, run: origRun } = statement;
      statement.get = wrapFetch('SQLite:get', statementName, origGet.bind(statement));
      statement.all = wrapFetch('SQLite:all', statementName, origAll.bind(statement));
      statement.run = wrapRun('SQLite:run', statementName, origRun.bind(statement));
    }
    this.statement._optimize = this.db.prepare('SELECT * FROM pragma_optimize(0x03)');

    this.logger.debug(_scope, 'statements initialized', { statements: Object.keys(this.statement).length });
  }


  static _deOphidiate(rows) {
    const rowsIsArray = Array.isArray(rows);
    if (!rowsIsArray) {
      rows = [rows];
    }
    const exemplaryRow = rows[0];
    for (const prop in exemplaryRow) {
      const camel = Database._camelfy(prop);
      if (!(camel in exemplaryRow)) {
        for (const d of rows) {
          // eslint-disable-next-line security/detect-object-injection
          d[camel] = d[prop];
          // eslint-disable-next-line security/detect-object-injection
          delete d[prop];
        }
      }
    }
    return rowsIsArray ? rows : rows[0];
  }


  _currentSchema() {
    return this.db.prepare('SELECT major, minor, patch FROM _meta_schema_version ORDER BY major DESC, minor DESC, patch DESC LIMIT 1').get();
  }


  healthCheck() {
    const _scope = _fileScope('healthCheck');
    this.logger.debug(_scope, 'called', {});
    if (!this.db.open) {
      throw new DBErrors.UnexpectedResult('database is not open');
    }
    return { open: this.db.open };
  }


  _engineInfo(result) {
    if (result.changes) {
      this.changesSinceLastOptimize += BigInt(result.changes);
      this._optimize();
    }
    return {
      changes: Number(result.changes),
      lastInsertRowid: result.lastInsertRowid,
    };
  }


  _closeConnection() {
    this.db.close();
  }


  _optimize() {
    const _scope = _fileScope('_optimize');

    if (this.optimizeAfterChanges
    &&  this.changesSinceLastOptimize >= this.optimizeAfterChanges) {
      const optimize = this.statement._optimize.all();
      this.logger.debug(_scope, 'optimize', { optimize });
      this.db.pragma('optimize');
      this.changesSinceLastOptimize = BigInt(0);
    }
  }


  _purgeTables(really) {
    if (really) {
      [
        'topic',
        'topic_fetch_in_progress',
        'verification',
        'verification_in_progress',
        'subscription',
        'subscription_delivery_in_progress',
      ].map((table) => {
        const result = this.db.prepare(`DELETE FROM ${table}`).run();
        this.logger.debug(_fileScope('_purgeTables'), 'success', { table, result });
      });
    }
  }


  context(fn) {
    return fn(this.db);
  }


  transaction(dbCtx, fn) {
    dbCtx = dbCtx || this.db;
    return dbCtx.transaction(fn)();
  }


  authenticationSuccess(dbCtx, identifier) {
    const _scope = _fileScope('authenticationSuccess');
    this.logger.debug(_scope, 'called', { identifier });

    let result;
    try {
      result = this.statement.authenticationSuccess.run({ identifier });
      if (result.changes != 1) {
        throw new DBErrors.UnexpectedResult('did not update authentication success');
      }
    } catch (e) {
      this.logger.error(_scope, 'failed', { error: e, identifier });
      throw e;
    }
  }


  authenticationGet(dbCtx, identifier) {
    const _scope = _fileScope('authenticationGet');
    this.logger.debug(_scope, 'called', { identifier });

    try {
      return this.statement.authenticationGet.get({ identifier });
    } catch (e) {
      this.logger.error(_scope, 'failed', { error: e, identifier });
      throw e;
    }
  }


  authenticationUpsert(dbCtx, identifier, credential) {
    const _scope = _fileScope('authenticationUpsert');
    const scrubbedCredential = '*'.repeat((credential || '').length);
    this.logger.debug(_scope, 'called', { identifier, scrubbedCredential });

    let result;
    try {
      result = this.statement.authenticationUpsert.run({ identifier, credential });
      if (result.changes != 1) {
        throw new DBErrors.UnexpectedResult('did not upsert authentication');
      }
    } catch (e) {
      this.logger.error(_scope, 'failed', { error: e, identifier, scrubbedCredential })
      throw e;
    }
  }


  /**
   * Converts engine subscription fields to native types.
   * @param {Object} data
   */
  static _subscriptionDataToNative(data) {
    if (data) {
      ['created', 'verified', 'expires', 'contentDelivered'].forEach((field) => {
        // eslint-disable-next-line security/detect-object-injection
        data[field] = epochToDate(data[field]);
      });
    }
    return data;
  }


  subscriptionsByTopicId(dbCtx, topicId) {
    const _scope = _fileScope('subscriptionsByTopicId');
    this.logger.debug(_scope, 'called', { topicId });

    try {
      const subscriptions = this.statement.subscriptionsByTopicId.all({ topicId });
      return subscriptions.map((s) => DatabaseSQLite._subscriptionDataToNative(s));
    } catch (e) {
      this.logger.error(_scope, 'failed', { error: e, topicId });
      throw e;
    }
  }


  subscriptionCountByTopicUrl(dbCtx, topicUrl) {
    const _scope = _fileScope('subscriptionCountByTopicUrl');
    this.logger.debug(_scope, 'called', { topicUrl });

    try {
      return this.statement.subscriptionCountByTopicUrl.get({ topicUrl });
    } catch (e) {
      this.logger.error(_scope, 'failed', { error: e, topicUrl });
      throw e;
    }
  }


  subscriptionDelete(dbCtx, callback, topicId) {
    const _scope = _fileScope('subscriptionDelete');
    this.logger.debug(_scope, 'called', { callback, topicId });

    try {
      const result = this.statement.subscriptionDelete.run({ callback, topicId });
      if (result.changes != 1) {
        throw new DBErrors.UnexpectedResult('did not delete subscription');
      }
      return this._engineInfo(result);
    } catch (e) {
      this.logger.error(_scope, 'failed', { error: e, callback, topicId });
      throw e;
    }
  }


  subscriptionDeleteExpired(dbCtx, topicId) {
    const _scope = _fileScope('subscriptionDeleteExpired');
    this.logger.debug(_scope, 'called', { topicId });

    try {
      const result = this.statement.subscriptionDeleteExpired.run({ topicId });
      this.logger.debug(_scope, 'success', { topicId, deleted: result.changes });
      return this._engineInfo(result);
    } catch (e) {
      this.logger.error(_scope, 'failed', { error: e, topicId });
      throw e;
    }
  }


  subscriptionDeliveryClaim(dbCtx, wanted, claimTimeoutSeconds, claimant) {
    const _scope = _fileScope('subscriptionDeliveryClaim');
    this.logger.debug(_scope, 'called', { wanted, claimTimeoutSeconds, claimant });

    let subscriptionIds;
    try {
      this.db.transaction(() => {
        subscriptionIds = this.statement.subscriptionDeliveryNeeded.all({ wanted }).map((claim) => claim.id);
        subscriptionIds.forEach((subscriptionId) => {
          const result = this.statement.subscriptionDeliveryClaimById.run({ subscriptionId, claimTimeoutSeconds, claimant });
          if (result.changes != 1) {
            throw new DBErrors.UnexpectedResult('did not claim subscription delivery');
          }
        });
      })();
      return subscriptionIds;
    } catch (e) {
      this.logger.error(_scope, 'failed', { error: e, wanted, claimTimeoutSeconds, claimant, subscriptionIds });
      throw e;
    }
  }


  subscriptionDeliveryClaimById(dbCtx, subscriptionId, claimTimeoutSeconds, claimant) {
    const _scope = _fileScope('subscriptionDeliveryClaimById');
    this.logger.debug(_scope, 'called', { subscriptionId, claimTimeoutSeconds, claimant });

    try {
      const result = this.statement.subscriptionDeliveryClaimById.run({ subscriptionId, claimTimeoutSeconds, claimant });
      if (result.changes != 1) {
        throw new DBErrors.UnexpectedResult('did not claim subscription delivery');
      }
      return this._engineInfo(result);
    } catch (e) {
      this.logger.error(_scope, 'failed', { error: e, subscriptionId, claimTimeoutSeconds, claimant });
      throw e;
    }
  }


  subscriptionDeliveryComplete(dbCtx, callback, topicId, topicContentUpdated) {
    const _scope = _fileScope('subscriptionDeliveryComplete');
    this.logger.debug(_scope, 'called', { callback, topicId, topicContentUpdated });

    let result;
    try {
      this.db.transaction(() => {
        topicContentUpdated = dateToEpoch(topicContentUpdated);
        result = this.statement.subscriptionDeliverySuccess.run({ callback, topicId, topicContentUpdated });
        if (result.changes != 1) {
          throw new DBErrors.UnexpectedResult('did not set subscription delivery success');
        }
        result = this.statement.subscriptionDeliveryDone.run({ callback, topicId });
        if (result.changes != 1) {
          throw new DBErrors.UnexpectedResult('did not complete subscription delivery');
        }
      })();
      return this._engineInfo(result);
    } catch (e) {
      this.logger.error(_scope, 'failed', { error: e, callback, topicId, topicContentUpdated });
      throw e;
    }
  }


  subscriptionDeliveryGone(dbCtx, callback, topicId) {
    const _scope = _fileScope('subscriptionDeliveryGone');
    this.logger.debug(_scope, 'called', { callback, topicId });

    let result;
    try {
      this.db.transaction(() => {
        result = this.statement.subscriptionDelete.run({ callback, topicId });
        if (result.changes != 1) {
          throw new DBErrors.UnexpectedResult('did not delete subscription');
        }
        // Delete cascades to delivery
        // result = this.statement.subscriptionDeliveryDone.run({ callback, topicId });
        // if (result.changes != 1) {
        //   throw new DBErrors.UnexpectedResult('did not complete subscription delivery');
        // }
      })();
      return this._engineInfo(result);
    } catch (e) {
      this.logger.error(_scope, 'failed', { error: e, callback, topicId });
      throw e;
    }
  }


  subscriptionDeliveryIncomplete(dbCtx, callback, topicId, retryDelays = [60]) {
    const _scope = _fileScope('subscriptionDeliveryIncomplete');
    this.logger.debug(_scope, 'called', { callback, topicId, retryDelays });

    let result;
    try {
      this.db.transaction(() => {
        const { currentAttempt } = this.statement.subscriptionDeliveryAttempts.get({ callback, topicId });
        const nextAttemptDelaySeconds = common.attemptRetrySeconds(currentAttempt, retryDelays);
        result = this.statement.subscriptionDeliveryFailure.run({ nextAttemptDelaySeconds, callback, topicId });
        if (result.changes != 1) {
          throw new DBErrors.UnexpectedResult('did not set delivery failure');
        }
        result = this.statement.subscriptionDeliveryDone.run({ callback, topicId });
        if (result.changes != 1) {
          throw new DBErrors.UnexpectedResult('did not complete subscription delivery');
        }
      })();
    } catch (e) {
      this.logger.error(_scope, 'failed', { error: e, callback, topicId });
      throw e;
    }
  }


  subscriptionGet(dbCtx, callback, topicId) {
    const _scope = _fileScope('subscriptionGet');
    this.logger.debug(_scope, 'called', { callback, topicId });

    let subscription;
    try {
      subscription = this.statement.subscriptionGet.get({ callback, topicId });
      return DatabaseSQLite._subscriptionDataToNative(subscription);
    } catch (e) {
      this.logger.error(_scope, 'failed', { error: e, callback, topicId });
      throw e;
    }
  }


  subscriptionGetById(dbCtx, subscriptionId) {
    const _scope = _fileScope('subscriptionGetById');
    this.logger.debug(_scope, 'called', { subscriptionId });

    let subscription;
    try {
      subscription = this.statement.subscriptionGetById.get({ subscriptionId });
      return DatabaseSQLite._subscriptionDataToNative(subscription);
    } catch (e) {
      this.logger.error(_scope, 'failed', { error: e, subscriptionId });
      throw e;
    }
  }


  subscriptionUpdate(dbCtx, data) {
    const _scope = _fileScope('subscriptionUpdate');
    this.logger.debug(_scope, 'called', { data });

    const subscriptionData = {
      ...data,
    };

    this._subscriptionUpdateDataValidate(subscriptionData);

    try {
      const result = this.statement.subscriptionUpdate.run(subscriptionData);
      if (result.changes != 1) {
        throw new DBErrors.UnexpectedResult('did not update subscription');
      }
    } catch (e) {
      this.logger.error(_scope, 'failed', { error: e, subscriptionData });
      throw e;
    }
  }


  subscriptionUpsert(dbCtx, data) {
    const _scope = _fileScope('subscriptionUpsert');
    this.logger.debug(_scope, 'called', { ...data });

    const subscriptionData = {
      secret: null,
      httpRemoteAddr: null,
      httpFrom: null,
      ...data,
    }
    this._subscriptionUpsertDataValidate(subscriptionData);

    let result;
    try {
      result = this.statement.subscriptionUpsert.run(subscriptionData);
      if (result.changes != 1) {
        throw new DBErrors.UnexpectedResult('did not upsert subscription');
      }
      return this._engineInfo(result);
    } catch (e) {
      this.logger.error(_scope, 'failed', { error: e, subscriptionData });
      throw e;
    }
  }


  topicDeleted(dbCtx, topicId) {
    const _scope = _fileScope('topicDeleted');
    this.logger.debug(_scope, 'called', { topicId });

    let result;
    try {
      result = this.statement.topicDeleted.run({ topicId });
      if (result.changes != 1) {
        throw new DBErrors.UnexpectedResult('did not update topic as deleted');
      }
    } catch (e) {
      this.logger.error(_scope, 'failed', { error: e, topicId });
      throw e;
    }
  }


  topicFetchClaim(dbCtx, wanted, claimTimeoutSeconds, claimant) {
    const _scope = _fileScope('topicFetchClaim');
    this.logger.debug(_scope, 'called', { wanted, claimTimeoutSeconds });

    let topicIds;
    try {
      this.db.transaction(() => {
        topicIds = this.statement.topicContentFetchNeeded.all({ wanted }).map((claim) => claim.id);
        topicIds.forEach((topicId) => {
          const result = this.statement.topicContentFetchClaimById.run({ topicId, claimTimeoutSeconds, claimant });
          if (result.changes != 1) {
            throw new DBErrors.UnexpectedResult('did not claim topic fetch');
          }
        });
      })();
      return topicIds;
    } catch (e) {
      this.logger.error(_scope, 'failed to claim topics for fetch', { error: e, wanted, claimTimeoutSeconds, claimant, topicIds });
      throw e;
    }
  }


  topicFetchClaimById(dbCtx, topicId, claimTimeoutSeconds, claimant) {
    const _scope = _fileScope('topicFetchClaimById');
    this.logger.debug(_scope, 'called', { topicId, claimTimeoutSeconds, claimant });

    let result;
    try {
      result = this.statement.topicContentFetchClaimById.run({ topicId, claimTimeoutSeconds, claimant });
      if (result.changes != 1) {
        throw new DBErrors.UnexpectedResult('did not claim topic fetch');
      }
      return this._engineInfo(result);
    } catch (e) {
      this.logger.error(_scope, 'failed to claim topics for fetch', { error: e, topicId, claimTimeoutSeconds, claimant });
      throw e;
    }
  }


  topicFetchComplete(dbCtx, topicId) {
    const _scope = _fileScope('topicFetchComplete');
    this.logger.debug(_scope, 'called', { topicId });

    let result;
    try {
      this.db.transaction(() => {
        result = this.statement.topicAttemptsReset.run({ topicId, forever: EPOCH_FOREVER });
        if (result.changes != 1) {
          throw new DBErrors.UnexpectedResult('did not reset topic attempts');
        }
        result = this.statement.topicContentFetchDone.run({ topicId });
        if (result.changes != 1) {
          throw new DBErrors.UnexpectedResult('did not release topic fetch');
        }
      })();
      return this._engineInfo(result);
    } catch (e) {
      this.logger.error(_scope, 'failed', { error: e, result, topicId });
      throw e;
    }
  }


  topicFetchIncomplete(dbCtx, topicId, retryDelays = [60]) {
    const _scope = _fileScope('topicFetchIncomplete');
    this.logger.debug(_scope, 'called', { topicId });

    let result;
    try {
      this.db.transaction(() => {
        const { contentFetchAttemptsSinceSuccess: currentAttempt } = this.statement.topicAttempts.get({ topicId });
        const nextAttemptDelaySeconds = common.attemptRetrySeconds(currentAttempt, retryDelays);
        result = this.statement.topicAttemptsIncrement.run({ topicId, nextAttemptDelaySeconds });
        if (result.changes != 1) {
          throw new DBErrors.UnexpectedResult('did not set topic attempts');
        }
        result = this.statement.topicContentFetchDone.run({ topicId });
        if (result.changes != 1) {
          throw new DBErrors.UnexpectedResult('did not release topic fetch');
        }
        return result;
      })();
      return this._engineInfo(result);
    } catch (e) {
      this.logger.error(_scope, 'failed', { error: e, result, topicId });
      throw e;
    }
  }


  topicFetchRequested(dbCtx, topicId) {
    const _scope = _fileScope('topicFetchRequested');
    this.logger.debug(_scope, 'called', { topicId });

    let result;
    try {
      result = this.statement.topicContentFetchRequested.run({ topicId });
      if (result.changes != 1) {
        throw new DBErrors.UnexpectedResult('did not set topic fetch requested');
      }
      return this._engineInfo(result);
    } catch (e) {
      this.logger.error(_scope, 'failed', { error: e, topicId });
      throw e;
    }
  }


  /**
   * Converts engine topic fields to native types.
   * @param {Object} data
   */
  static _topicDataToNative(data) {
    if (data) {
      data.isActive = !!data.isActive;
      data.isDeleted = !!data.isDeleted;
      ['created', 'lastPublish', 'contentFetchNextAttempt', 'contentUpdated'].forEach((field) => {
        // eslint-disable-next-line security/detect-object-injection
        data[field] = epochToDate(data[field]);
      });
    }
    return data;
  }


  // eslint-disable-next-line no-unused-vars
  topicGetAll(dbCtx) {
    const _scope = _fileScope('topicGetAll');
    this.logger.debug(_scope, 'called');

    let topics;
    try {
      topics = this.statement.topicGetInfoAll.all();
    } catch (e) {
      this.logger.error(_scope, 'failed', { error: e, topics });
      throw e;
    }
    if (topics) {
      topics = topics
        .map(DatabaseSQLite._topicDataToNative)
        .map(this._topicDefaults.bind(this));
    }
    return topics;
  }


  topicGetById(dbCtx, topicId, applyDefaults = true) {
    const _scope = _fileScope('topicGetById');
    this.logger.debug(_scope, 'called', { topicId });

    let topic;
    try {
      topic = this.statement.topicGetById.get({ topicId });
      DatabaseSQLite._topicDataToNative(topic);
      if (applyDefaults) {
        topic = this._topicDefaults(topic);
      }
      return topic;
    } catch (e) {
      this.logger.error(_scope, 'failed', { error: e, topic, topicId });
      throw e;
    }
  }


  topicGetByUrl(dbCtx, topicUrl) {
    const _scope = _fileScope('topicGetByUrl');
    this.logger.debug(_scope, 'called', { topicUrl });

    let topic;
    try {
      topic = this.statement.topicGetByUrl.get({ topicUrl });
      DatabaseSQLite._topicDataToNative(topic);
      return this._topicDefaults(topic);
    } catch (e) {
      this.logger.error(_scope, 'failed', { error: e, topic, topicUrl });
      throw e;
    }
  }


  topicGetContentById(dbCtx, topicId) {
    const _scope = _fileScope('topicGetContentById');
    this.logger.debug(_scope, 'called', { topicId });

    let topic;
    try {
      topic = this.statement.topicGetContentById.get({ topicId });
      DatabaseSQLite._topicDataToNative(topic);
      return this._topicDefaults(topic);
    } catch (e) {
      this.logger.error(_scope, 'failed', { error: e, topic, topicId });
      throw e;
    }
  }


  topicPendingDelete(dbCtx, topicId) {
    const _scope = _fileScope('topicPendingDelete');
    this.logger.debug(_scope, 'called', { topicId });

    try {
      this.db.transaction(() => {
        const topic = this.statement.topicGetById.get({ topicId });
        if (!topic.isDeleted) {
          this.logger.debug(_scope, 'topic not set deleted, not deleting', { topicId });
          return;
        }

        const { count: subscriberCount } = this.statement.subscriptionCountByTopicUrl.get({ topicUrl: topic.url });
        if (subscriberCount) {
          this.logger.debug(_scope, 'topic has subscribers, not deleting', { topicId, subscriberCount });
          return;
        }

        const result = this.statement.topicDeleteById.run({ topicId });
        if (result.changes !== 1) {
          throw new DBErrors.UnexpectedResult('did not delete topic');
        }
      })();
      this.logger.debug(_scope, 'success', { topicId });
    } catch (e) {
      this.logger.error(_scope, 'failed', { error: e, topicId });
      throw e;
    }
  }


  topicSet(dbCtx, data) {
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
      result = this.statement.topicUpsert.run(topicSetData);
      if (result.changes != 1) {
        throw new DBErrors.UnexpectedResult('did not set topic data');
      }
      return this._engineInfo(result);
    } catch (e) {
      this.logger.error(_scope, 'failed', { error: e, result });
      throw e;
    }
  }


  topicSetContent(dbCtx, data) {
    const _scope = _fileScope('topicSetContent');
    const topicSetContentData = {
      contentType: null,
      ...data,
    };
    const logData = {
      ...topicSetContentData,
      content: common.logTruncate(topicSetContentData.content, 100),
    };
    this.logger.debug(_scope, 'called', logData);

    let result;
    try {
      this._topicSetContentDataValidate(topicSetContentData);
      result = this.statement.topicSetContent.run(topicSetContentData);
      logData.result = result;
      if (result.changes !=  1) {
        throw new DBErrors.UnexpectedResult('did not set topic content');
      }
      result = this.statement.topicSetContentHistory.run({ topicId: data.topicId, contentHash: data.contentHash, contentSize: data.content.length });
      if (result.changes != 1) {
        throw new DBErrors.UnexpectedResult('did not set topic content history');
      }
      return this._engineInfo(result);
    } catch (e) {
      this.logger.error(_scope, 'failed', { error: e, ...logData });
      throw e;
    }
  }


  topicUpdate(dbCtx, data) {
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

    try {
      const result = this.statement.topicUpdate.run(topicData);
      if (result.changes != 1) {
        throw new DBErrors.UnexpectedResult('did not update topic');
      }
    } catch (e) {
      this.logger.error(_scope, 'failed', { error: e, topicData });
      throw e;
    }
  }


  verificationClaim(dbCtx, wanted, claimTimeoutSeconds, claimant) {
    const _scope = _fileScope('verificationClaim');
    this.logger.debug(_scope, 'called', { wanted, claimTimeoutSeconds });

    let verificationIds;
    try {
      this.db.transaction(() => {
        verificationIds = this.statement.verificationNeeded.all({ wanted }).map((claim) => claim.id);
        verificationIds.forEach((verificationId) => {
          const result = this.statement.verificationClaimById.run({ verificationId, claimTimeoutSeconds, claimant });
          if (result.changes != 1) {
            throw new DBErrors.UnexpectedResult('did not claim verification');
          }
        });
      })();
      return verificationIds;
    } catch (e) {
      this.logger.error(_scope, 'failed to claim verifications', { wanted, claimTimeoutSeconds });
      throw e;
    }
  }


  verificationClaimById(dbCtx, verificationId, claimTimeoutSeconds, claimant) {
    const _scope = _fileScope('verificationClaimById');
    this.logger.debug(_scope, 'called', { verificationId, claimTimeoutSeconds, claimant });

    let result;
    try {
      result = this.statement.verificationClaimById.run({ verificationId, claimTimeoutSeconds, claimant });
      if (result.changes != 1) {
        throw new DBErrors.UnexpectedResult('did not claim verification');
      }
      return this._engineInfo(result);
    } catch (e) {
      this.logger.error(_scope, 'failed to claim verification', { error: e, verificationId, claimTimeoutSeconds, claimant });
      throw e;
    }
  }


  verificationComplete(dbCtx, verificationId, callback, topicId) {
    const _scope = _fileScope('verificationComplete');
    this.logger.debug(_scope, 'called', { verificationId });

    let result;
    try {
      this.db.transaction(() => {
        result = this.statement.verificationScrub.run({ verificationId, callback, topicId });
        if (result.changes < 1) {
          throw new DBErrors.UnexpectedResult('did not remove verifications');
        }
      })();
    } catch (e) {
      this.logger.error(_scope, 'failed', { verificationId });
      throw e;
    }
    return this._engineInfo(result);
  }


  /**
   * Converts engine verification fields to native types.
   * @param {Object} data
   */
  static _verificationDataToNative(data) {
    if (data) {
      data.isPublisherValidated = !!data.isPublisherValidated;
    }
  }


  verificationGetById(dbCtx, verificationId) {
    const _scope = _fileScope('verificationGetById');
    this.logger.debug(_scope, 'called', { verificationId });

    let verification;
    try {
      verification = this.statement.verificationGetById.get({ verificationId });
      DatabaseSQLite._verificationDataToNative(verification);
      return verification;
    } catch (e) {
      this.logger.error(_scope, 'failed', { error: e, verificationId });
      throw e;
    }
  }


  verificationIncomplete(dbCtx, verificationId, retryDelays = [60]) {
    const _scope = _fileScope('verificationIncomplete');
    this.logger.debug(_scope, 'called', { verificationId });

    let result;
    try {
      this.db.transaction(() => {
        const { attempts: currentAttempt } = this.statement.verificationAttempts.get({ verificationId });
        const nextAttemptDelaySeconds = common.attemptRetrySeconds(currentAttempt, retryDelays);
        result = this.statement.verificationAttemptsIncrement.run({ verificationId, nextAttemptDelaySeconds });
        if (result.changes != 1) {
          throw new DBErrors.UnexpectedResult('did not increment verification attempts');
        }
        result = this.statement.verificationDone.run({ verificationId });
        if (result.changes != 1) {
          throw new DBErrors.UnexpectedResult('did not release verification in progress');
        }
        return result;
      })();
      return this._engineInfo(result);
    } catch (e) {
      this.logger.error(_scope, 'failed', { error: e, result, verificationId });
      throw e;
    }
  }


  /**
   * Convert native verification fields to engine types.
   */
  static _verificationDataToEngine(data) {
    if (data) {
      data.isPublisherValidated = data.isPublisherValidated ? 1 : 0;
    }
  }


  verificationInsert(dbCtx, verification) {
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
      DatabaseSQLite._verificationDataToEngine(verificationData);
      result = this.statement.verificationInsert.run(verificationData);
      if (result.changes != 1) {
        throw new DBErrors.UnexpectedResult('did not insert verification');
      }
      verificationId = result.lastInsertRowid;
      this.logger.debug(_scope, 'inserted verification', { verificationId });

      return verificationId;
    } catch (e) {
      this.logger.error(_scope, 'failed', { error: e, verificationData });
      throw e;
    }
  }


  verificationRelease(dbCtx, verificationId) {
    const _scope = _fileScope('verificationRelease');
    this.logger.debug(_scope, 'called', { verificationId });

    let result;
    try {
      result = this.statement.verificationDone.run({ verificationId });
      if (result.changes != 1) {
        throw new DBErrors.UnexpectedResult('did not release verification');
      }
    } catch (e) {
      this.logger.error(_scope, 'failed', { error: e, verificationId });
      throw e;
    }
  }


  verificationUpdate(dbCtx, verificationId, data) {
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
      DatabaseSQLite._verificationDataToEngine(verificationData);
      result = this.statement.verificationUpdate.run(verificationData);
      if (result.changes != 1) {
        throw new DBErrors.UnexpectedResult('did not update verification');
      }
    } catch (e) {
      this.logger.error(_scope, 'failed', { error: e, verificationData });
      throw e;
    }
  }


  verificationValidated(dbCtx, verificationId) {
    const _scope = _fileScope('verificationValidated');
    this.logger.debug(_scope, 'called', { verificationId });

    let result;
    try {
      result = this.statement.verificationValidate.run({ verificationId });
      if (result.changes != 1) {
        throw new DBErrors.UnexpectedResult('did not set verification validation');
      }
    } catch (e) {
      this.logger.error(_scope, 'failed', { error: e, verificationId });
      throw e;
    } 
  }


}

module.exports = DatabaseSQLite;