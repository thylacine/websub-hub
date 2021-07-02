'use strict';

const remoteAddress = '127.0.0.10';
const callbackUrl = 'https://example.com/consume?id=123&token=abc';
const topicUrl = 'https://example.com/some_blog';
const modePublish = 'publish';
const modeSubscribe = 'subscribe';

module.exports = {
  validSubscribeCtx: {
    clientAddress: remoteAddress,
    clientProtocol: 'https',
    parsedBody: {
      'hub.mode': modeSubscribe,
      'hub.callback': callbackUrl,
      'hub.topic': topicUrl,
      'hub.extra': 'unused value',
      'hub.lease_seconds': '864000',
      'hub.secret': 'such secret',
    },
  },
  validRootData: {
    callback: callbackUrl,
    mode: modeSubscribe,
    topic: topicUrl,
    leaseSeconds: 864000,
    secret: 'such secret',
    httpRemoteAddr: remoteAddress,
    httpFrom: 'user@example.com',
    isSecure: true,
    isPublisherValidated: true,
  },
  validUnsubscribeCtx: {
    clientAddress: remoteAddress,
    clientProtocol: 'https',
    parsedBody: {
      'hub.mode': 'unsubscribe',
      'hub.callback': callbackUrl,
      'hub.topic': topicUrl,
    },
  },
  validPublishCtx: {
    clientAddress: remoteAddress,
    clientProtocol: 'https',
    parsedBody: {
      'hub.mode': modePublish,
      'hub.topic': topicUrl,
    },
  },
  validPublishRootData: {
    httpRemoteAddr: remoteAddress,
    mode: modePublish,
    topic: topicUrl,
  },
};