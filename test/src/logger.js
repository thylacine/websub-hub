/* eslint-env mocha */
'use strict';

const assert = require('assert');
const Logger = require('../../src/logger');
const Config = require('../../config');

describe('Logger', function () {
  let config;
  let logger;

  beforeEach(function () {
    config = new Config('test');
  });

  it('logs', function () {
    logger = new Logger(config);
    logger.info('testScope', 'message', { baz: 'quux' }, { foo: 1 }, 'more other');
  });

  it('stubs missing levels', function () {
    const backend = {};
    logger = new Logger(config, backend);
    assert.strictEqual(typeof logger.info, 'function');
  });

  it('logs BigInts', function () {
    logger = new Logger(config);
    logger.info('testScope', 'message', { aBigInteger: BigInt(2) });
  });

  it('logs Errors', function () {
    logger = new Logger(config);
    logger.error('testScope', 'message', { e: new Error('an error') });
  });

  it('covers config error', function () {
    config.logger.ignoreBelowLevel = 'not a level';
    try {
      logger = new Logger(config);
      assert.fail('expected RangeError here');
    } catch (e) {
      assert(e instanceof RangeError);
    }
  });

  it('covers empty fields', function () {
    logger = new Logger(config);
    logger.info();
  });
}); // Logger
