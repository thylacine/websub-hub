'use strict';

const http = require('http');
const DB = require('./src/db');
const Logger = require('./src/logger');
const Service = require('./src/service');
const Config = require('./config');
const { fileScope } = require('./src/common');
const { version } = require('./package.json');

const _scope = fileScope(__filename)('main');

const PORT = process.env.PORT || 4001;
const ADDR = process.env.LISTEN_ADDR || '127.0.0.1';

(async function main () {
  let config, logger, db, service;
  try {
    config = new Config(process.env.NODE_ENV);
    logger = new Logger(config);
    db = new DB(logger, config);
    await db.initialize();
    service = new Service(logger, db, config);

    http.createServer((req, res) => {
      service.dispatch(req, res);
    }).listen(PORT, ADDR, (err) => {
      if (err) {
        logger.error(_scope, 'error starting server', err);
        throw err;
      }
      logger.info(_scope, 'server started', { version, listenAddress: ADDR, listenPort: PORT });
    });
  } catch (e) {
    (logger || console).error(_scope, 'error starting server', e);
  }
})();