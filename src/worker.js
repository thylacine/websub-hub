'use strict';

const common = require('./common');

const _fileScope = common.fileScope(__filename);

/**
 * Always try to do some things, but not too many.
 * This is a generic polling promise-wrangler, keeping a set number
 * of promises in flight, trying to replace them as they finish.
 */

/**
 * @callback PromiseGiver
 * @param {*} dbCtx
 * @param {number} atMost
 * @returns {Promise<void>[]}
 */

class Worker {
  /**
   * @param {object} logger logger instance
   * @param {object} db db instance
   * @param {PromiseGiver} promiseGiver function which fetches and processes work
   * @param {object} options options
   * @param {object} options.worker worker options
   * @param {object} options.worker.pollingEnabled whether to run worker at all
   * @param {number} options.worker.recurrSleepMs time between processing runs
   * @param {number} options.worker.concurrency how much work to be working on at once
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
    this.running = false; // Worker is running.
    this.isProcessing = false; // Only let one process() method execute on the work heap at a time
  }

  /**
   * Begin the scheduled loop.
   * @param {number} stagger vary startup time by some fraction of recurrence
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
   * @param {Promise} promise promise to watch
   * @returns {Promise} watchedPromise
   */
  static watchedPromise(promise) {
    if (Object.hasOwn(promise, 'isSettled')) {
      return promise;
    }

    let isSettled = false;
    let resolved;
    let rejected;

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
   * @callback HandlerFunction
   * @param {*} resolved
   * @param {*} rejected
   * @returns {void}
   */
  /**
   * Process the list of promises, removing any which have settled,
   * and passes their fulfilled values to the handler.
   * @param {HandlerFunction} handler invoked on settled promises
   * @returns {number} handled promises removed from inFlight list
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
   * @param {*} dbCtx db context
   * @returns {Promise<Promise[]>} wrapped promises
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
   * @param {*} resolved promise resolution value
   * @param {*} rejected promise rejection value
   */
  _watchedHandler(resolved, rejected) {
    const _scope = _fileScope('_watchedHandler');

    if (rejected) {
      this.logger.error(_scope, 'rejected', { rejected });
    } else {
      this.logger.debug(_scope, 'resolved', { resolved });
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

    this.logger.debug(_scope, 'called', { isProcessing: this.isProcessing });


    if (this.isProcessing) {
      return;
    }
    this.isProcessing = true;

    // Interrupt any pending sleep, if we were called out of timeout-cycle.
    clearTimeout(this.nextTimeout);
    this.nextTimeout = undefined;

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
          } catch (e) { // eslint-disable-line no-unused-vars
            // NOP here, as we'll handle it when we scan the list
          }

          // Address settled promises..
          this._handleWatchedList(this._watchedHandler.bind(this));

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

    this.isProcessing = false;
  }

}

module.exports = Worker;
