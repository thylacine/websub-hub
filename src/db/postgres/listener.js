'use strict';

const common = require('../../common');

const _fileScope = common.fileScope(__filename);


const defaultOptions = {
  channel: 'cache_invalidation',
  dataCallback: common.nop,
  connectionLostCallback: common.nop,
  connectionEstablishedCallback: common.nop,
  pingDelayMs: 5000,
  reconnectDelayMs: 6000,
  reconnectTimes: 10,
};

/**
 * Create a robust connection which listens to a notification channel.
 */
class PostgresListener {
  constructor(logger, db, options) {
    this.logger = logger;
    this.db = db;

    this.options = Object.assign({}, defaultOptions, options);
    this.notificationEventName = 'notification';

    this.connection = null;
    this.nextPingTimeout = undefined;

    this._onConnectionLostBound = this._onConnectionLost.bind(this);
    this._onNotificationBound = this._onNotification.bind(this);
  }


  /**
   * Establish the listener connection.
   */
  async start() {
    await this._reconnect(0, 1);
    this._sendPing();
  }


  /**
   * Shut down the listener connection.
   */
  async stop() {
    const _scope = _fileScope('stop');
    if (this.reconnectPending) {
      this.logger.debug(_scope, 'overriding existing reconnect retry');
      clearTimeout(this.reconnectPending);
      delete this.reconnectPending;
    }
    if (this.connection) {
      this.connection.client.removeListener(this.notificationEventName, this.onNotificationBound);
      this.connection.done();
      this.connection = null;
      await this.options.connectionLostCallback();
    }
  }


  /**
   * Begin sending connection pings.
   */
  _sendPing() {
    const _scope = _fileScope('_sendPing');
    this.nextPingTimeout = setTimeout(async () => {
      try {
        if (this.connection) {
          await this.connection.none('NOTIFY $(channel:name), $(payload)', { channel: this.options.channel, payload: 'ping' });
        }
      } catch (e) {
        this.logger.error(_scope, 'failed', { error: e });
      } finally {
        this._sendPing();
      }
    }, this.options.pingDelayMs);
  }


  /**
   * Notify callback.
   * @param {Object} data
   */
  async _onNotification(data) {
    const _scope = _fileScope('_onNotification');
    // Ignore our own messages
    if (data.payload === 'ping') {
      return;
    }
    this.logger.debug(_scope, 'called', data);
    await this.options.dataCallback(data.payload);
  }


  /**
   * Notify callback and attempt to reconnect.
   * @param {*} error
   * @param {*} event
   */
  async _onConnectionLost(error, event) {
    const _scope = _fileScope('_onConnectionLost');
    this.logger.error(_scope, 'listener connection lost', { error, event });
    this.connection = null;
    try {
      event.client.removeListener(this.notificationEventName, this.onNotificationBound);
    } catch (e) {
      this.logger.error(_scope, 'failed to remove listener', { error: e });
      // That's okay, it was probably just gone anyhow.
    }
    await this.options.connectionLostCallback();
    try {
      await this._reconnect(this.options.reconnectDelayMs, this.options.reconnectTimes);
    } catch (e) {
      this.logger.error(_scope, 'failed to reconnect listener', { error: e });
    }
  }


  /**
   * Schedule an attempt to establish a connection.
   * @param {Number} delay
   * @param {Number} retriesRemaining
   */
  async _reconnect(delay, retriesRemaining) {
    const _scope = _fileScope('_reconnect');
    if (this.connection) {
      this.logger.debug(_scope, 'closing existing connection');
      this.connection.done();
      this.connection = null;
    }
    if (this.reconnectPending) {
      this.logger.debug(_scope, 'overriding existing reconnect retry');
      clearTimeout(this.reconnectPending);
    }
    return new Promise((resolve, reject) => {
      this.reconnectPending = setTimeout(async () => {
        try {
          delete this.reconnectPending;
          this.connection = await this.db.connect({
            direct: true,
            onLost: this._onConnectionLostBound,
          });
          this.connection.client.on(this.notificationEventName, this._onNotificationBound);
          await this.connection.none('LISTEN $(channel:name)', { channel: this.options.channel });
          this.logger.debug(_scope, 'listener connection established');
          await this.options.connectionEstablishedCallback();
          resolve();
        } catch (e) {
          if (retriesRemaining <= 0) {
            return reject(e);
          }
          try {
            await this._reconnect(delay, retriesRemaining - 1);
            resolve();
          } catch (e2) {
            reject(e2);
          }
        }
      }, delay);
    });
  }

}

module.exports = PostgresListener;