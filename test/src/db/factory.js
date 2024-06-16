'use strict';

const assert = require('node:assert');
const sinon = require('sinon');
const common = require('../../../src/common');
const DB = require('../../../src/db');
const DBErrors = require('../../../src/db/errors');
const DatabasePostgres = require('../../../src/db/postgres');
const DatabaseSQLite = require('../../../src/db/sqlite');

describe('DatabaseFactory', function () {
  let logger, options;
  beforeEach(function () {
    logger = common.nullLogger;
    options = {
      db: {
        connectionString: '',
      },
    };
  });
  afterEach(function () {
    sinon.restore();
  });
  it('gets engines', function () {
    const result = DB.Engines;
    assert(result instanceof Object);
    assert(Object.keys(result).length);
  });
  it('creates postgres db', function () {
    options.db.connectionString = 'postgresql://blah';
    const db = new DB(logger, options);
    assert(db instanceof DatabasePostgres);
  });
  it('creates sqlite db', function () {
    options.db.connectionString = 'sqlite://:memory:';
    const db = new DB(logger, options);
    assert(db instanceof DatabaseSQLite);
  });
  it('handles missing db', function () {
    delete options.db.connectionString;
    try {
      new DB(logger, options);
      assert.fail('did not get expected exception');
    } catch (e) {
      assert(e instanceof DBErrors.UnsupportedEngine);
    }
  });
}); // DatabaseFactory
