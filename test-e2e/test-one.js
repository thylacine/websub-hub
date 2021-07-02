'use strict';

const assert = require('assert');
const uuid = require('uuid');
const FakeServersClient = require('./fake-servers-client');

const subscriberPort = process.env.FAKE_SUBSCRIBER_PORT || 9876;
const topicPort = process.env.FAKE_TOPIC_PORT || 9875;
const listenAddress = process.env.FAKE_LISTEN_ADDR || '127.0.0.1';
const hubAddress = process.env.LISTEN_ADDR || '127.0.0.1';
const hubPort = process.env.PORT || 4001;
const hubUrl = `http://${hubAddress}:${hubPort}/`;

const client = new FakeServersClient(listenAddress, subscriberPort, topicPort);

async function newTopic() {
  const id = uuid.v4();
  await client.topicSet(id, { hubUrl });
  console.log('created fake topic', id);
  return id;
}

async function newSubscriber() {
  const id = uuid.v4();
  await client.subscriberSetVerify(id);
  console.log('created fake subscriber', id);
  return id;
}

(async function main() {
  const topicId = await newTopic();
  const subscriberId = await newSubscriber();

  const result = await client.subscribe(hubUrl, subscriberId, topicId);
  console.log('subscribed', { status: result.status, headers: result.headers, data: result.data });
  
  console.log('done');
})().catch((e) => {
  console.log(e);
  throw e;
});