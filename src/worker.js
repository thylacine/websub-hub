'use strict';

const common = require('./common');

const _fileScope = common.fileScope(__filename);

/**
 * Always try to do some things, but not too many.
 * This is a generic polling promise-wrangler, keeping a set number
 * of promises in flight, trying to replace them as they finish.
 */

/**
 * @callback Worker~promiseGiver
 * @param {*} dbCtx
 * @param {number} atMost
 * @returns {Promise<void>[]}
 */

class Worker {
  /**
   * @param {object} logger
   * @param {object} db
   * @param {Worker~promiseGiver} promiseGiver
   * @param {object} options
   * @param {object} options.worker
   * @param {object} options.worker.pollingEnabled
   * @param {number} options.worker.recurrSleepMs
   * @param {number} options.worker.concurrency
   */
  constructor(logger, db, promiseGiver, options) {
    this.logger = logger;
    this.db = db;
    this.options = options;
    if (!promiseGiver || typeof promiseGiver !== 'function') {
      throw new TypeError('function required');
    }
    this.promiseGiver = promiseGiver;

    this.concurrency = this.options.worker.concurrency;
    this.recurrSleepMs = this.options.worker.recurrSleepMs;
    this.inFlight = []; // Our work heap of Promises  
    this.nextTimeout = undefined; // Allow clearTimeout() to reset waiting period.
    this.running = false;
  }

  /**
   * Begin the scheduled loop.
   */
  start(stagger = 0.618) {
    const _scope = _fileScope('start');
    this.logger.debug(_scope, 'called', {});
    if (this.options.worker.pollingEnabled) {
      this.running = true;
      // Try to keep clustered nodes from all processing at the same time.
      const staggerMs = Math.floor(Math.random() * this.recurrSleepMs * stagger);
      this.nextTimeout = setTimeout(this._recurr.bind(this), staggerMs);
    }
  }

  /**
   * Cancel the scheduled loop.
   */
  stop() {
    const _scope = _fileScope('stop');
    this.logger.debug(_scope, 'called', {});
    this.running = false;
    clearTimeout(this.nextTimeout);
    this.nextTimeout = undefined;
  }

  /**
   * The problem: Promise.race doesn't report which promise(s) settled, and 
   * there is no native interface for querying promise state.
   * So we will wrap all our pending-work promises with a flag and the
   * results, and use the race as a sort of condvar for checking everything
   * in the list of what we were waiting for.
   * NB this means promise cannot be further chained, or it loses the magic.
   * @param {Promise} promise
   * @returns {Promise} watchedPromise
   */
  static watchedPromise(promise) {
    if (Object.prototype.hasOwnProperty.call(promise, 'isSettled')) {
      return promise;
    }

    let isSettled = false;
    let resolved = undefined;
    let rejected = undefined;

    promise = promise.then(
      (res) => {
        isSettled = true;
        resolved = res;
        return res;
      },
      (rej) => {
        isSettled = true;
        rejected = rej;
        throw rej;
      });

    Object.defineProperties(promise, {
      isSettled: { get: () => isSettled },
      resolved: { get: () => resolved },
      rejected: { get: () => rejected },
    });

    return promise;
  }

  /**
   * Process the list of promises, removing any which have settled,
   * and passes their fulfilled values to the handler.
   *
   * @param {HandlerFunction} handler 
   * @returns {number} handled
   */
  _handleWatchedList(handler) {
    let handled = 0;
    for (let i = this.inFlight.length - 1; i >= 0; i--) {
      // eslint-disable-next-line security/detect-object-injection
      const p = this.inFlight[i];
      if (p.isSettled) {
        handler(p.resolved, p.rejected);
        this.inFlight.splice(i, 1);
        handled += 1;
      }
    }
    return handled;
  }

  /**
   * Refill the workpool with our special promises.
   * @param {*} dbCtx
   * @returns {Promise[]}
   */
  async _getWork(dbCtx) {
    const _scope = _fileScope('_getWork');
    let newPromises = [];
    const wanted = this.concurrency - this.inFlight.length;
    if (wanted > 0) {
      newPromises = await this.promiseGiver(dbCtx, wanted);
      newPromises = newPromises.map((p) => Worker.watchedPromise(p));
      common.stackSafePush(this.inFlight, newPromises);
    }
    this.logger.debug(_scope, 'completed', { wanted, added: newPromises.length });
    return newPromises;
  }

  /**
   * Simply log results of promises, for now.
   * @param {*} resolved 
   * @param {*} rejected 
   */
  _watchedHandler(resolved, rejected) {
    const _scope = _fileScope('_watchedHandler');

    this.logger.debug(_scope, { resolved, rejected });
    if (rejected) {
      this.logger.error(_scope, { rejected });
    }
  }

  /**
   * Schedule the next getWork.
   */
  _recurr() {
    if (this.running && this.recurrSleepMs) {
      this.nextTimeout = setTimeout(this.process.bind(this), this.recurrSleepMs);
    }
  }

  /**
   * Attempt to do as much work as we can.
   */
  async process() {
    const _scope = _fileScope('process');

    this.logger.debug(_scope, 'called', {});

    // Interrupt any pending sleep, if we were called out of timeout-cycle.
    clearTimeout(this.nextTimeout);

    // Share one db connection for all tasks.
    try {
      await this.db.context(async (dbCtx) => {

        // Try to fill the hopper
        await this._getWork(dbCtx);

        while (this.inFlight.length > 0) {
          /* Wait for one or more to be resolved.
          * We don't care what the result was, as we have to scan the list
          * for all settled promises anyhow, and our wrapper has stored the
          * results.
          */
          try {
            await Promise.race(this.inFlight);
          } catch (e) {
            // NOP here, as we'll handle it when we scan the list
          }
          this.logger.debug(_scope, { msg: 'race completed' });

          // Address settled promises..
          const settled = this._handleWatchedList(this._watchedHandler.bind(this));
          this.logger.debug(_scope, { settled });

          // Try to fill the vacancy
          // TODO: maybe rate-limit this call based on slot availability
          await this._getWork(dbCtx);
        }
      }); // dbCtx
    } catch (e) {
      this.logger.error(_scope, 'failed', { error: e });
      // Try again later anyhow.
    }

    // No more work, wait a while and retry
    this._recurr();
  }

}

module.exports = Worker;
