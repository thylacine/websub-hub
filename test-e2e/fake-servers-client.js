'use strict';

/**
 * Wrapper interface for controlling fake-servers.
 */

class FakeClient {
  constructor(host, subscriberPort, topicPort) {
    this.logger = console;
    this.host = host;
    this.subscriberPort = subscriberPort;
    this.topicPort = topicPort;
    this.Got = undefined;
    this.got = this._init.bind(this);
  }

  async _init(...args) {
    if (!this.Got) {
      // eslint-disable-next-line
      this.Got = await import('got');
      this.got = this.Got.got.extend({
        headers: {
          'User-Agent': 'FakeClient',
        },
        responseType: 'text',
      });
    }
    if (args.length) {
      return this.got(...args);
    }
  }

  topicUrl(id) {
    return `http://${this.host}:${this.topicPort}/topic/${id}`;
  }

  subscriberUrl(id, extra = '') {
    return `http://${this.host}:${this.subscriberPort}/subscriber/${id}${extra}`;
  }

  static _requestConfig(method, url, params = {}, headers = {}, body = undefined) {
    const gotConfig = {
      method,
      url: new URL(url),
      headers,
      ...(body && { body }),
    };
    Object.entries(params).forEach(([k, v]) => gotConfig.url.searchParams.set(k, v));
    return gotConfig;
  }

  static _formData(obj) {
    return Object.entries(obj)
      .map((entry) => entry.map(encodeURIComponent).join('='))
      .join('&')
    ;
  }

  async subscribe(hubUrl, subscriberId, topicId, postData = {}) {
    const topicUrl = this.topicUrl(topicId);
    const subscriberUrl = this.subscriberUrl(subscriberId);
    const data = FakeClient._formData({
      'hub.callback': subscriberUrl,
      'hub.mode': 'subscribe',
      'hub.topic': topicUrl,
      'hub.lease_seconds': 60,
      'hub.secret': 'sharedSecret',
      ...postData,
    });
    const config = FakeClient._requestConfig('POST', hubUrl, {}, {
      'Content-Type': 'application/x-www-form-urlencoded',
    }, data);
    try {
      return await this.got(config);
    } catch (error) {
      this.logger.error('subscribe', error, config);
      throw error;
    }
  }
  
  /**
   * Set the behavior for a topic id.
   * @param {String} id
   * @param {Object} behavior
   * @param {Number} behavior.statusCode
   * @param {String} behavior.content
   * @param {String} behavior.contentType
   * @param {String} behavior.hubUrl
   */
  async topicSet(id, behavior = {}) {
    const defaultBehavior = {
      statusCode: 200,
      content: 'some content',
      contentType: 'text/plain',
    };
    const url = this.topicUrl(id);
    const config = FakeClient._requestConfig('PUT', url, {
      ...defaultBehavior,
      ...behavior,
    });
    try {
      return await this.got(config);
    } catch (error) {
      this.logger.error('topicSet', error, config);
      throw error;
    }
  }

  /**
   * Remove a topic id.
   * @param {String} id
   */
  async topicDelete(id) {
    const url = this.topicUrl(id);
    const config = FakeClient._requestConfig('DELETE', url);
    try {
      return await this.got(config);
    } catch (error) {
      this.logger.error('topicDelete', error, config);
      throw error;
    }
  }

  /**
   * Set the behavior for a subscriber id verify response.
   * @param {String} id
   * @param {Object} behavior
   * @param {Number} behavior.statusCode
   * @param {Boolean} behavior.matchChallenge
   */
  async subscriberSetVerify(id, behavior = {}) {
    const defaultBehavior = {
      statusCode: 200,
      matchChallenge: true,
    };
    const url = this.subscriberUrl(id, '/verify');
    const config = FakeClient._requestConfig('PUT', url, {
      ...defaultBehavior,
      ...behavior,
    });
    try {
      return await this.got(config);
    } catch (error) {
      this.logger.error('subscriberSetVerify', error, config);
      throw error;
    }
  }

  /**
   * Set the behavior for a subscriber id content-update response.
   * @param {String} id
   * @param {Object} behavior
   * @param {Number} behavior.statusCode
   */
  async subscriberSetContent(id, behavior = {}) {
    const defaultBehavior = {
      statusCode: 200,
    };
    const url = this.subscriberUrl(id, '/content');
    const config = FakeClient._requestConfig('PUT', url, {
      ...defaultBehavior,
      ...behavior,
    });
    try {
      return await this.got(config);
    } catch (error) {
      this.logger.error('subscriberSetContent', error, config);
      throw error;
    }
  }

  /**
   * Removes a topic id.
   * @param {String} id
   */
  async subscriberDelete(id) {
    const url = this.subscriberUrl(id);
    const config = FakeClient._requestConfig('DELETE', url);
    try {
      return await this.got(config);
    } catch (error) {
      this.logger.error('subscriberDelete', error, config);
      throw error;
    }
  }

} // FakeClient

module.exports = FakeClient;
