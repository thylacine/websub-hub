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
 * @param {string} algorithm potential sha* algorithm
 * @returns {boolean} is supported
 */
const validHash = (algorithm) => getHashes()
  .filter((h) => h.match(/^sha\d+$/))
  .includes(algorithm);


/**
 * Return an array containing x if x is not an array.
 * @param {*} x possibly an array
 * @returns {Array} x or [x]
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
 * @param {object} o object
 * @returns {object} frozen object
 */
const freezeDeep = (o) => {
  Object.freeze(o);
  Object.getOwnPropertyNames(o).forEach((prop) => {
    if (Object.hasOwn(o, prop)
    &&  ['object', 'function'].includes(typeof o[prop])
    &&  !Object.isFrozen(o[prop])) {
      return freezeDeep(o[prop]);
    }
  });
  return o;
};


/**
 * Pick out useful got response fields.
 * @param {*} res response
 * @returns {object} winnowed response
 */
const gotResponseLogData = (res) => {
  const data = common.pick(res, [
    'statusCode',
    'statusMessage',
    'headers',
    'body',
    'error',
  ]);
  if (typeof res.body === 'string') {
    data.body = logTruncate(data.body, 100);
  } else if (res.body instanceof Buffer) {
    data.body = `<Buffer ${res.body.byteLength} bytes>`;
  }
  if (res?.timings?.phases?.total) {
    data.elapsedTimeMs = res.timings.phases.total;
  }
  if (res?.redirectUrls?.length) {
    data.redirectUrls = res.redirectUrls;
  }
  if (res?.retryCount) {
    data.retryCount = res.retryCount;
  }
  return data;
};


/**
 * Fallback values, if not configured.
 * @returns {object} object
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
 * @param {number} attempt attempt number
 * @param {number[]=} retryBackoffSeconds array of indexed delays
 * @param {number=} jitter vary backoff by up to this fraction additional
 * @returns {number} seconds to delay retry
 */
const attemptRetrySeconds = (attempt, retryBackoffSeconds = [60, 120, 360, 1440, 7200, 43200, 86400], jitter = 0.618) => {
  const maxAttempt = retryBackoffSeconds.length - 1;
  if (typeof attempt !== 'number' || attempt < 0) {
    attempt = 0;
  } else if (attempt > maxAttempt) {
    attempt = maxAttempt;
  }
   
  let seconds = retryBackoffSeconds[attempt];
  seconds += Math.floor(Math.random() * seconds * jitter);
  return seconds;
};


/**
 * Return array items split as an array of arrays of no more than per items each.
 * @param {Array} array items
 * @param {number} per chunk size
 * @returns {Array[]} array of chunks
 */
const arrayChunk = (array, per = 1) => {
  const nChunks = Math.ceil(array.length / per);
  return Array.from(Array(nChunks), (_, i) => array.slice(i * per, (i + 1) * per));
};


/**
 * Be paranoid about blowing the stack when pushing to an array.
 * @param {Array} dst destination array
 * @param {Array} src source array
 */
const stackSafePush = (dst, src) => {
  const jsEngineMaxArguments = 2**16; // Current as of Node 12
  arrayChunk(src, jsEngineMaxArguments).forEach((items) => {
    Array.prototype.push.apply(dst, items);
  });
};


/**
 * Limit length of string to keep logs sane
 * @param {string} str string
 * @param {number} len max length
 * @returns {string} truncated string
 */
const logTruncate = (str, len) => {
  if (typeof str !== 'string' || str.toString().length <= len) {
    return str;
  }
  return str.toString().slice(0, len) + `... (${str.toString().length} bytes)`;
};

const nop = () => undefined;

module.exports = {
  ...common,
  arrayChunk,
  attemptRetrySeconds,
  gotResponseLogData,
  ensureArray,
  freezeDeep,
  logTruncate,
  nop,
  randomBytesAsync,
  stackSafePush,
  topicLeaseDefaults,
  validHash,
};
