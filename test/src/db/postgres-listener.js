/* eslint-env mocha */
'use strict';

const assert = require('node:assert');
const sinon = require('sinon');
const stubLogger = require('../../stub-logger');
const Listener = require('../../../src/db/postgres/listener');

const snooze = async (ms) => new Promise((resolve) => setTimeout(resolve, ms));
const noExpectedException = 'did not get expected exception';

describe('Postgres Listener', function () {
  let listener, options, connectionStub, pgpStub;
  beforeEach(function () {
    connectionStub = {
      client: {
        on: sinon.stub(),
        removeListener: sinon.stub(),
      },
      done: sinon.stub(),
      none: sinon.stub(),
    };
    pgpStub = {
      connect: sinon.stub().resolves(connectionStub),
    };
    options = {
      dataCallback: sinon.stub(),
      connectionLostCallback: sinon.stub(),
      connectionEstablishedCallback: sinon.stub(),
      pingDelayMs: 100,
      reconnectDelayMs: 1000,
      reconnectTimes: 1,
    };
    listener = new Listener(stubLogger, pgpStub, options);
  });
  afterEach(function () {
    sinon.restore();
  });

  describe('start', function () {
    it('covers', async function () {
      sinon.stub(listener, '_reconnect').resolves();
      sinon.stub(listener, '_sendPing').resolves();
      await listener.start();
      assert(listener._reconnect.called);
      assert(listener._sendPing.called);
    });
  }); // start

  describe('stop', function () {
    it('covers not started', async function () {
      await listener.stop();
    });
    it('cancels pending reconnect', async function() {
      this.slow(300);
      const pendingReconnect = sinon.stub();
      listener.reconnectPending = setTimeout(pendingReconnect, 100);
      await listener.stop();
      await snooze(110);
      assert(!pendingReconnect.called);
    });
    it('closes existing connection', async function () {
      listener.connection = connectionStub;
      await listener.stop();
      assert(connectionStub.client.removeListener.called);
      assert.strictEqual(listener.connection, null);
      assert(options.connectionLostCallback.called);
    });
  }); // stop

  describe('_reconnect', function () {
    it('reconnects', async function () {
      await listener._reconnect(0, 1);
      assert(listener.connection);
      assert(options.connectionEstablishedCallback.called);
    });
    it('closes existing connection before reconnecting', async function () {
      const existingConnection = {
        done: sinon.stub(),
      };
      listener.connection = existingConnection;
      await listener._reconnect(0, 1);
      assert(existingConnection.done.called);
    });
    it('overrides a pending reconnect', async function () {
      this.slow(300);
      const pendingReconnect = sinon.stub();
      listener.reconnectPending = setTimeout(pendingReconnect, 100);
      await listener._reconnect(0, 1);
      await snooze(110);
      assert(!pendingReconnect.called);
    });
    it('fails with no remaining retries', async function () {
      const expected = new Error('foo');
      pgpStub.connect = sinon.stub().rejects(expected);
      try {
        await listener._reconnect(0, 0);
        assert.fail(noExpectedException);
      } catch (e) {
        assert.deepStrictEqual(e, expected);
      }
    });
    it('fails all remaining retries', async function () {
      const expected = new Error('foo');
      pgpStub.connect = sinon.stub().rejects(expected);
      try {
        await listener._reconnect(0, 1);
        assert.fail(noExpectedException);
      } catch (e) {
        assert.deepStrictEqual(e, expected);
      }
    });
    it('fails first retry', async function () {
      const expected = new Error('foo');
      pgpStub.connect = sinon.stub().onCall(0).rejects(expected).resolves(connectionStub);
      await listener._reconnect(0, 1);
      assert(options.connectionEstablishedCallback.called);
    });
  }); // _reconnect

  describe('_onConnectionLost', function () {
    let error, event;
    beforeEach(function () {
      error = new Error('blah');
      event = connectionStub;
      sinon.stub(listener, '_reconnect');
    });
    it('success', async function () {
      await listener._onConnectionLost(error, event);
      assert.strictEqual(listener.connection, null);
      assert(event.client.removeListener.called);
      assert(listener.options.connectionLostCallback.called);
      assert(listener._reconnect.called);
    });
    it('covers reconnect failure', async function () {
      listener._reconnect.rejects(error);
      await listener._onConnectionLost(error, event);
      assert.strictEqual(listener.connection, null);
      assert(event.client.removeListener.called);
      assert(listener.options.connectionLostCallback.called);
      assert(listener._reconnect.called);
    });
    it('covers listener removal failure', async function () {
      event.client.removeListener.throws(error);
      await listener._onConnectionLost(error, event);
      assert.strictEqual(listener.connection, null);
      assert(event.client.removeListener.called);
      assert(listener.options.connectionLostCallback.called);
      assert(listener._reconnect.called);
    });
  }); // _onConnectionLost

  describe('_onNotification', function () {
    it('sends data', async function () {
      const data = {
        payload: 'foo',
      };
      await listener._onNotification(data);
      assert(listener.options.dataCallback.called);
    });
    it('ignores pings', async function () {
      const data = {
        payload: 'ping',
      };
      await listener._onNotification(data);
      assert(!listener.options.dataCallback.called);
    });
  }); // _onNotification

  describe('_sendPing', function () {
    it('covers no connection', async function () {
      this.slow(300);
      await listener._sendPing();
      await snooze(110);
      clearTimeout(listener.nextPingTimeout);
    });
    it('success', async function () {
      this.slow(300);
      listener.connection = connectionStub;
      await listener._sendPing();
      await snooze(110);
      clearTimeout(listener.nextPingTimeout);
      assert(connectionStub.none.called);
    });
    it('covers error', async function () {
      const err = new Error('blah');
      this.slow(300);
      listener.connection = connectionStub;
      listener.connection.none.rejects(err);
      await listener._sendPing();
      await snooze(110);
      clearTimeout(listener.nextPingTimeout);
      assert(listener.connection.none.called);

    });
  }); // _sendPing

}); // Postgres Listener
