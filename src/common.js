/* eslint-disable security/detect-object-injection */
'use strict';

/**
 * Assorted utility functions.
 */

const { common } = require('@squeep/api-dingus');

const { randomBytes, getHashes } = require('crypto');
const { promisify } = require('util');


/**
 * Wrap this in a promise, as crypto.randomBytes is capable of blocking.
 */
const randomBytesAsync = promisify(randomBytes);


/**
 * The HMAC hashes we are willing to support.
 * @param {String} algorithm
 * @returns {Boolean}
 */
const validHash = (algorithm) => getHashes()
  .filter((h) => h.match(/^sha[0-9]+$/))
  .includes(algorithm);


/**
 * Return an array containing x if x is not an array.
 * @param {*} x
 */
const ensureArray = (x) => {
  if (x === undefined) {
    return [];
  }
  if (!Array.isArray(x)) {
    return Array(x);
  }
  return x;
};


/**
 * Recursively freeze an object.
 * @param {Object} o 
 * @returns {Object}
 */
const freezeDeep = (o) => {
  Object.freeze(o);
  Object.getOwnPropertyNames(o).forEach((prop) => {
    if (Object.hasOwnProperty.call(o, prop)
    &&  ['object', 'function'].includes(typeof o[prop])
    &&  !Object.isFrozen(o[prop])) {
      return freezeDeep(o[prop]);
    }
  });
  return o;
};


/**
 * Pick out useful axios response fields.
 * @param {*} res 
 * @returns 
 */
const axiosResponseLogData = (res) => {
  const data = common.pick(res, [
    'status',
    'statusText',
    'headers',
    'elapsedTimeMs',
    'data',
  ]);
  if (data.data) {
    data.data = logTruncate(data.data, 100);
  }
  return data;
};


/**
 * Fallback values, if not configured.
 * @returns {Object}
 */
const topicLeaseDefaults = () => {
  return Object.freeze({
    leaseSecondsPreferred: 86400 * 10,
    leaseSecondsMin: 86400 * 1,
    leaseSecondsMax: 86400 * 365,
  });
};


/**
 * Pick from a range, constrained, with some fuzziness.
 * @param {Number} attempt
 * @param {Number[]} delays
 * @param {Number} jitter
 * @returns {Number}
 */
const attemptRetrySeconds = (attempt, retryBackoffSeconds = [60, 120, 360, 1440, 7200, 43200, 86400], jitter = 0.618) => {
  const maxAttempt = retryBackoffSeconds.length - 1;
  if (typeof attempt !== 'number' || attempt < 0) {
    attempt = 0;
  } else if (attempt > maxAttempt) {
    attempt = maxAttempt;
  }
  // eslint-disable-next-line security/detect-object-injection
  let seconds = retryBackoffSeconds[attempt];
  seconds += Math.floor(Math.random() * seconds * jitter);
  return seconds;
};


/**
 * Return array items split as an array of arrays of no more than per items each.
 * @param {Array} array
 * @param {Number} per
 */
const arrayChunk = (array, per = 1) => {
  const nChunks = Math.ceil(array.length / per);
  return Array.from(Array(nChunks), (_, i) => array.slice(i * per, (i + 1) * per));
};


/**
 * Be paranoid about blowing the stack when pushing to an array.
 * @param {Array} dst
 * @param {Array} src
 */
const stackSafePush = (dst, src) => {
  const jsEngineMaxArguments = 2**16; // Current as of Node 12
  arrayChunk(src, jsEngineMaxArguments).forEach((items) => {
    Array.prototype.push.apply(dst, items);
  });
};


/**
 * Limit length of string to keep logs sane
 * @param {String} str 
 * @param {Number} len 
 * @returns {String}
 */
const logTruncate = (str, len) => {
  if (typeof str !== 'string' || str.toString().length <= len) {
    return str;
  }
  return str.toString().slice(0, len) + `... (${str.toString().length} bytes)`;
};

module.exports = {
  ...common,
  arrayChunk,
  attemptRetrySeconds,
  axiosResponseLogData,
  ensureArray,
  freezeDeep,
  logTruncate,
  randomBytesAsync,
  stackSafePush,
  topicLeaseDefaults,
  validHash,
};
