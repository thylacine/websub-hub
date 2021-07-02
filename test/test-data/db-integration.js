'use strict';

const remoteAddress = '127.0.0.10';
const callbackUrl = 'https://example.com/consume?id=123&token=abc';
const topicUrl = 'https://example.com/some_blog';
const modeSubscribe = 'subscribe';

module.exports = {
  topicSet: {
    url: topicUrl,
    leaseSecondsPreferred: null,
    leaseSecondsMin: 86400,
    leaseSecondsMax: 8640000,
    publisherValidationUrl: null,
  },
  anotherTopicSet: {
    url: 'https://example.com/another_blog/',
    leaseSecondsPreferred: null,
    leaseSecondsMin: 86400,
    leaseSecondsMax: 8640000,
    publisherValidationUrl: null,
  },
  topicUpdate: {
    url: topicUrl,
    leaseSecondsPreferred: 864000,
  },
  topicSetContent: {
    topicId: undefined,
    content: 'content',
    contentHash: 'b2d1d285b5199c85f988d03649c37e44fd3dde01e5d69c50fef90651962f48110e9340b60d49a479c4c0b53f5f07d690686dd87d2481937a512e8b85ee7c617f',
    contentType: 'text/plain',
  },
  subscriptionUpsert: {
    callback: callbackUrl,
    topicId: undefined,
    leaseSeconds: 172800,
    secret: 'SecretSecret',
    httpRemoteAddr: remoteAddress,
  },
  verificationInsert: {
    topicId: undefined,
    callback: callbackUrl,
    mode: modeSubscribe,
    secret: 'SecretSecret',
    leaseSeconds: 864000,
    httpRemoteAddr: remoteAddress,
    isPublisherValidated: false,
  },
  verificationUpdate: {
    mode: modeSubscribe,
    reason: 'reason',
    isPublisherValidated: true,
  },
};