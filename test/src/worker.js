/* eslint-env mocha */
'use strict';

const assert = require('assert');
const sinon = require('sinon'); // eslint-disable-line node/no-unpublished-require

const Worker = require('../../src/worker');
const Config = require('../../config');

const stubLogger = require('../stub-logger');

const noExpectedException = 'did not get expected exception';

describe('Worker', function () {
  let config;
  let worker;
  let promiseGiver;

  beforeEach(function () {
    config = new Config('test');
    promiseGiver = sinon.stub();
    worker = new Worker(stubLogger, promiseGiver, config);
  });

  afterEach(function () {
    sinon.restore();
  });

  describe('constructor', function () {
    it('instantiates', function () {
      assert(worker);
    });
  
    it('requires a promiseGiver function', function () {
      try {
        worker = new Worker(stubLogger, undefined, config);
        assert.fail('should require function argument');
      } catch (e) {
        assert(e instanceof TypeError);
      }
    });
  }); // constructor

  describe('start', function () {
    it('starts without polling', function () {
      config.worker.pollingEnabled = false;
      worker = new Worker(stubLogger, promiseGiver, config);
      worker.start();
      assert.strictEqual(worker.running, false);
    });
    it('starts with polling', function () {
      config.worker.pollingEnabled = true;
      worker = new Worker(stubLogger, promiseGiver, config);
      sinon.stub(worker, '_recurr');
      worker.start();
      clearTimeout(worker.nextTimeout);
      assert.strictEqual(worker.running, true);
    });
  }); // start

  describe('stop', function () {
    it('stops', function () {
      worker = new Worker(stubLogger, promiseGiver, config);
      worker.start();
      worker.stop();
      assert.strictEqual(worker.running, false);
      assert.strictEqual(worker.nextTimeout, undefined);
    });
  }); // stop

  describe('watchedPromise', function () {
    let promise;
    it('watches a resolvable promise', async function () {
      const res = 'yay';
      promise = Promise.resolve(res);
      const watched = Worker.watchedPromise(promise);
      const result = await watched;
      assert.strictEqual(result, res);
      assert.strictEqual(watched.resolved, res);
      assert(watched.isSettled);
    });
    it('watches a rejectable promise', async function () {
      const rej = new Error('boo');
      promise = Promise.reject(rej);
      const watched = Worker.watchedPromise(promise);
      try {
        await watched;
        assert.fail(noExpectedException);
      } catch (e) {
        assert.deepStrictEqual(e, rej);
        assert.deepStrictEqual(watched.rejected, rej);
        assert(watched.isSettled);
      }
    });
    it('covers wrapped promise', async function () {
      const res = 'yay';
      promise = Promise.resolve(res);
      const watched = Worker.watchedPromise(promise);
      const rewatched = Worker.watchedPromise(watched);
      const result = await rewatched;
      assert.strictEqual(result, res);
      assert.strictEqual(rewatched.resolved, res);
      assert(rewatched.isSettled);
    });
  }); // watchedPromise

  describe('_handleWatchedList', function () {
    let handler;
    beforeEach(function () {
      handler = sinon.stub();
    });
    it('handled resolveds', function () {
      worker.inFlight = [
        { isSettled: false, resolved: undefined, rejected: undefined },
        { isSettled: true, resolved: 'value', rejected: undefined },
        { isSettled: true, resolved: undefined, rejected: 'error' },
        { isSettled: false, resolved: undefined, rejected: undefined },
      ];
      const result = worker._handleWatchedList(handler);
      assert.strictEqual(result, 2);
      assert.strictEqual(worker.inFlight.length, 2);
      assert.strictEqual(handler.callCount, 2);
    });
  }); // _handleWatchedList

  describe('_getWork', function () {
    it('gets tasks', async function () {
      const expected = [
        Promise.resolve('first'),
        Promise.reject('bad'),
        Promise.resolve('second'),
      ];
      worker.promiseGiver.resolves(expected);
      const result = await worker._getWork();
      assert.deepStrictEqual(result, expected);
      assert.strictEqual(worker.inFlight.length, expected.length);
    });
    it('covers none wanted', async function () {
      worker.concurrency = 3;
      worker.inFlight = [
        Promise.resolve('first'),
        Promise.reject('bad'),
        Promise.resolve('second'),
      ];
      const result = await worker._getWork();
      assert(!worker.promiseGiver.called);
      assert.deepStrictEqual(result, []);
    });
  }); // _getWork

  describe('_watchedHandler', function () {
    it('covers resolved', function () {
      worker._watchedHandler('resolved', undefined);
    });
    it('covers rejected', function () {
      worker._watchedHandler(undefined, 'rejected');
    });
  }); // _watchedHandler

  describe('_recurr', function () {
    it('covers', function (done) {
      worker.recurrSleepMs = 10;
      this.slow(worker.recurrSleepMs * 3);
      sinon.stub(worker, 'process').callsFake(done);
      worker.running = true;
      worker._recurr();
    });
    it('covers not running', function () {
      worker.running = false;
      worker._recurr();
    });
  }); // _recurr

  describe('process', function () {
    beforeEach(function () {
      sinon.stub(worker, '_getWork');
      sinon.stub(worker, '_recurr');
    });
    it('covers', async function () {
      worker.inFlight = [
        Worker.watchedPromise(Promise.resolve('one')),
        Worker.watchedPromise(Promise.reject('foo')),
      ];
      await worker.process();
      assert.strictEqual(worker._getWork.callCount, 2);
      assert.strictEqual(worker._recurr.callCount, 1);
    });
    it('covers no work', async function () {
      await worker.process();
      assert.strictEqual(worker._getWork.callCount, 1);
      assert.strictEqual(worker._recurr.callCount, 1);
    });
  }); // process

}); // Worker
