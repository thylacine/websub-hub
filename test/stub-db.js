/* eslint-disable security/detect-object-injection */
'use strict';

const sinon = require('sinon');

const spyFns = [
  'context',
  'transaction',
];

const stubFns = [
  'authenticationSuccess',
  'authenticationGet',
  'authenticationUpsert',
  'authenticationUpdateCredential',
  'authenticationUpdateOTPKey',
  'healthCheck',
  'initialize',
  'subscriptionsByTopicId',
  'subscriptionCountByTopicUrl',
  'subscriptionDelete',
  'subscriptionDeleteExpired',
  'subscriptionDeliveryClaim',
  'subscriptionDeliveryClaimById',
  'subscriptionDeliveryComplete',
  'subscriptionDeliveryGone',
  'subscriptionDeliveryIncomplete',
  'subscriptionGet',
  'subscriptionGetById',
  'subscriptionUpdate',
  'subscriptionUpsert',
  'topicDeleted',
  'topicFetchClaim',
  'topicFetchClaimById',
  'topicFetchComplete',
  'topicFetchIncomplete',
  'topicFetchRequested',
  'topicGetAll',
  'topicGetById',
  'topicGetByUrl',
  'topicGetContentById',
  'topicPendingDelete',
  'topicPublishHistory',
  'topicSet',
  'topicSetContent',
  'topicUpdate',
  'verificationClaim',
  'verificationClaimById',
  'verificationComplete',
  'verificationGetById',
  'verificationIncomplete',
  'verificationInsert',
  'verificationRelease',
  'verificationUpdate',
  'verificationValidated',
];

const stubDatabase = {
  _implementation: [ ...spyFns, ...stubFns ],
  _reset: () => {
    spyFns.forEach((fn) => sinon.spy(stubDatabase, fn));
    stubFns.forEach((fn) => sinon.stub(stubDatabase, fn));
  },
  context: async (fn) => await fn({}),
  transaction: async (dbCtx, fn) => await fn(dbCtx),
};

stubFns.forEach((fn) => {
  stubDatabase[fn] = () => {};
});

module.exports = stubDatabase;