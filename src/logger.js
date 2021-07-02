'use strict';

/**
 * Log as JSON to stdout/stderr.
 */

const common = require('./common');

// This is uncomfortable, but is the simplest way to let logging work for BigInts.
// TODO: revisit with better solution
BigInt.prototype.toJSON = function() {
  return this.toString();
}

// Also uncomfortable, but let us log Errors reasonably.
Object.defineProperty(Error.prototype, 'toJSON', {
  configurable: true,
  writable: true, // Required to let Axios override on its own Errors
  value: function () {
    const result = {};
    const dupKey = function (key) {
      // eslint-disable-next-line security/detect-object-injection
      result[key] = this[key];
    };
    Object.getOwnPropertyNames(this)
      // .filter((prop) => !(prop in []))
      .forEach(dupKey, this);
    return result;
  },
});

class Logger {
  /**
   * Wrap backend calls with payload normalization.
   * @param {Object} options
   * @param {*} backend Console style interface
   * @param {Object} options.logger
   * @param {String} options.logger.ignoreBelowLevel minimum level to log
   * @param {String} options.nodeId
   */
  constructor(options, backend = console) {
    const logLevels = Object.keys(common.nullLogger);
    const ignoreBelowLevel = options && options.logger && options.logger.ignoreBelowLevel || 'debug';
    this.nodeId = options.nodeId;

    if (!logLevels.includes(ignoreBelowLevel)) {
      throw new RangeError(`unrecognized minimum log level '${ignoreBelowLevel}'`);
    }
    const ignoreLevelIdx = logLevels.indexOf(ignoreBelowLevel);
    logLevels.forEach((level) => {
      // eslint-disable-next-line security/detect-object-injection
      this[level] = (logLevels.indexOf(level) > ignoreLevelIdx) ?
        common.nop :
        this.levelTemplateFn(backend, level);
    });
  }
  
  levelTemplateFn(backend, level) {
    // eslint-disable-next-line security/detect-object-injection
    if (!(level in backend) || typeof backend[level] !== 'function') {
      return common.nop;
    }

    // eslint-disable-next-line security/detect-object-injection
    return (...args) => backend[level](this.payload(level, ...args));
  }

  payload(level, scope, message, data, ...other) {
    const now = new Date();
    return JSON.stringify({
      nodeId: this.nodeId,
      timestamp: now.toISOString(),
      timestampMs: now.getTime(),
      level: level,
      scope: scope || '[unknown]',
      message: message || '',
      data: data || {},
      ...(other.length && { other }),
    });
  }
}

module.exports = Logger;
