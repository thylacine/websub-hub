'use strict';

/**
 * Wrapper interface for controlling fake-servers.
 */

const axios = require('axios');

class FakeClient {
  constructor(host, subscriberPort, topicPort) {
    this.logger = console;
    this.host = host;
    this.subscriberPort = subscriberPort;
    this.topicPort = topicPort;
    this.axios = axios.create({
      validateStatus: (statusCode) => (Math.floor(statusCode / 100)) === 2,
      headers: {
        'User-Agent': 'FakeClient',
      },
    });
  }

  topicUrl(id) {
    return `http://${this.host}:${this.topicPort}/topic/${id}`;
  }

  subscriberUrl(id, extra = '') {
    return `http://${this.host}:${this.subscriberPort}/subscriber/${id}${extra}`;
  }

  static _axiosRequestConfig(method, url, params = {}, headers = {}, data) {
    const urlObj = new URL(url);
    const config = {
      method,
      url: `${urlObj.origin}${urlObj.pathname}`,
      params: urlObj.searchParams,
      headers,
      ...(data && { data }),
      responseType: 'text',
      transformResponse: [ (res) => res ],
    };
    Object.entries(params).map(([k, v]) => config.params.set(k, v));
    return config;
  }

  async subscribe(hubUrl, subscriberId, topicId, postData = {}) {
    const topicUrl = this.topicUrl(topicId);
    const subscriberUrl = this.subscriberUrl(subscriberId);
    const data = {
      'hub.callback': subscriberUrl,
      'hub.mode': 'subscribe',
      'hub.topic': topicUrl,
      'hub.lease_seconds': 60,
      'hub.secret': 'sharedSecret',
      ...postData,
    };
    const formData = new URLSearchParams(data).toString();
    const headers = {
      'Content-Type': 'application/x-www-form-urlencoded',
    };
  
    try {
      return this.axios(FakeClient._axiosRequestConfig('POST', hubUrl, {}, headers, formData));
    } catch (e) {
      this.logger.error('subscribe', e);
      throw e;
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
    try {
      return this.axios(FakeClient._axiosRequestConfig('PUT', url, {
        ...defaultBehavior,
        ...behavior,
      }));
    } catch (e) {
      this.logger.error('topicSet', e);
      throw e;
    }
  }

  /**
   * Remove a topic id.
   * @param {String} id
   */
  async topicDelete(id) {
    const url =this.topicUrl(id);
    try {
      return this.axios(FakeClient._axiosRequestConfig('DELETE', url));
    } catch (e) {
      this.logger.error('topicDelete', e);
      throw e;
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
    try {
      return this.axios(FakeClient._axiosRequestConfig('PUT', url, {
        ...defaultBehavior,
        ...behavior,
      }));
    } catch (e) {
      this.logger.error('subscriberSetVerify', e);
      throw e;
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
    try {
      return this.axios(FakeClient._axiosRequestConfig('PUT', url, {
        ...defaultBehavior,
        ...behavior,
      }));
    } catch (e) {
      this.logger.error('subscriberSetContent', e);
      throw e;
    }
  }

  /**
   * Removes a topic id.
   * @param {String} id
   */
  async subscriberDelete(id) {
    const url = this.subscriberUrl(id);
    try {
      return this.axios(FakeClient._axiosRequestConfig('DELETE', url));
    } catch (e) {
      this.logger.error('subscriberDelete', e);
      throw e;
    }
  }

} // FakeClient

module.exports = FakeClient;
