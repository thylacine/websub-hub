'use strict';

const common = require('../common');
const DatabaseErrors = require('./errors');

const _fileScope = common.fileScope(__filename);

class DatabaseFactory {
  constructor(logger, options, ...rest) {
    const _scope = _fileScope('constructor');

    const connectionString = options.db.connectionString || '';
    const protocol = connectionString.slice(0, connectionString.indexOf('://')).toLowerCase();

    let Engine;
    switch (protocol) {
      case DatabaseFactory.Engines.PostgreSQL:
        Engine = require('./postgres');
        break;

      case DatabaseFactory.Engines.SQLite:
        Engine = require('./sqlite');
        break;

      default:
        logger.error(_scope, 'unsupported connectionString', { protocol, options });
        throw new DatabaseErrors.UnsupportedEngine(protocol);
    }

    return new Engine(logger, options, ...rest);
  }

  static get Engines() {
    return {
      PostgreSQL: 'postgresql',
      SQLite: 'sqlite',
    };
  }

}

module.exports = DatabaseFactory;
