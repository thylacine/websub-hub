'use strict';

const BaseLogger = require('@squeep/logger-json-console');
const dataSanitizers = require('./data-sanitizers');

class Logger extends BaseLogger {
  constructor(options, ...args) {
    super(options, ...args);
    Array.prototype.push.apply(this.dataSanitizers, Object.values(dataSanitizers));
  }
}

module.exports = Logger;