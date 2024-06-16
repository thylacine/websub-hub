'use strict';

const sinon = require('sinon');

const nop = () => { /* */ };
const stubLogger = process.env.VERBOSE_TESTS ? console : {
  debug: nop,
  error: nop,
  info: nop,
};
stubLogger['_reset'] = () => {
  sinon.spy(stubLogger, 'debug');
  sinon.spy(stubLogger, 'error');
  sinon.spy(stubLogger, 'info');
};


module.exports = stubLogger;