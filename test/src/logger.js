'use strict';

const assert = require('node:assert');
const sinon = require('sinon');
const Logger = require('../../src/logger');
const Config = require('../../config');

describe('Logger', function () {
  let config;
  let logger;

  beforeEach(function () {
    config = new Config('test');
    logger = new Logger(config);
    Object.keys(Logger.nullLogger).forEach((level) => sinon.stub(logger.backend, level));
  });

  afterEach(function () {
    sinon.restore();
  });

  it('logs', function () {
    logger.info('testScope', 'message', { baz: 'quux' }, { foo: 1 }, 'more other');
    assert(logger.backend.info.called);
  });

  it('logs BigInts', function () {
    logger.info('testScope', 'message', { aBigInteger: BigInt(2) });
    assert(logger.backend.info.called);
    assert(logger.backend.info.args[0][0].includes('"2"'));
  });

  it('logs Errors', function () {
    logger.error('testScope', 'message', { e: new Error('an error') });
    assert(logger.backend.error.called);
    assert(logger.backend.error.args[0][0].includes('an error'));
  });

  it('masks credentials', function () {
    logger.info('testScope', 'message', {
      ctx: {
        parsedBody: {
          identity: 'username',
          credential: 'password',
        },
      },
    });
    assert(logger.backend.info.called);
    assert(logger.backend.info.args[0][0].includes('"username"'));
    assert(logger.backend.info.args[0][0].includes('"********"'));
  });

}); // Logger
