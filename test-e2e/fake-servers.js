/* eslint-disable sonarjs/no-duplicate-string */
'use strict';

/**
 * For testing, this is a configurable endpoint server.
 * 
 * Set how a subscriber id responds to a verification GET call
 *   PUT /subscriber/:id/verify?responseCode=xxx&matchChallenge=true
 * Set how an id responds to a content delivery POST call
 *   PUT /subscriber/:id/content?responseCode=xxx
 * Remove an id
 *   DELETE /subscriber/:id
 * 
 * Set how a topic id returns
 *   PUT /topic/:id?statusCode=xxx&content=xxx&contentType=foo/bar
 */

const http = require('http');
const { Dingus, Enum, Errors } = require('@squeep/api-dingus');

const subscriberPort = process.env.FAKE_SUBSCRIBER_PORT || 9876;
const topicPort = process.env.FAKE_TOPIC_PORT || 9875;
const listenAddress = process.env.FAKE_LISTEN_ADDR || '127.0.0.1';

class TopicFake extends Dingus {
  constructor() {
    super(console, {
      ignoreTrailingSlash: true,
    });
    this.topicBehaviors = new Map();
    this.on(['GET'], '/topic/:id', this.getId.bind(this));

    this.on(['PUT'], '/topic/:id', this.putId.bind(this));
    this.on(['DELETE'], '/topic/:id', this.deleteId.bind(this));
  }

  async getId(req, res, ctx) {
    this.setResponseType(this.responseTypes, req, res, ctx);
    const behavior = this.topicBehaviors.get(ctx.params.id);
    if (!behavior) {
      throw new Errors.ResponseError(Enum.ErrorResponse.NotFound);
    }
    if (behavior.contentType) {
      res.setHeader(Enum.Header.ContentType, behavior.contentType);
    }
    res.setHeader('Link', behavior.selfLink + (behavior.hubLink ? `, ${behavior.hubLink}` : ''));
    res.statusCode = behavior.statusCode;
    res.end(behavior.content);
    this.logger.info({ method: req.method, statusCode: res.statusCode, url: req.url });
  }

  async putId(req, res, ctx) {
    const id = ctx.params.id;
    this.setResponseType(this.responseTypes, req, res, ctx);
    const behavior = {
      statusCode: ctx.queryParams.statusCode || 200,
      ...(ctx.queryParams.contentType && { contentType: ctx.queryParams.contentType }),
      content: ctx.queryParams.content,
      selfLink: `<http://${listenAddress}:${topicPort}/${id}>; rel="self"`,
      ...(ctx.queryParams.hubUrl && { hubLink: `<${ctx.queryParams.hubUrl}>; rel="hub"` }),
    };
    this.topicBehaviors.set(id, behavior);
    res.statusCode = 200;
    res.end();
  }

  async deleteId(req, res, ctx) {
    this.setResponseType(this.responseTypes, req, res, ctx);
    this.topicBehaviors.delete(ctx.params.id);
    res.statusCode = 200;
    res.end();
  }

} // TopicFake

class SubscriberFake extends Dingus {
  constructor() {
    super(console, {
      ignoreTrailingSlash: true,
    });
    this.verifyBehaviors = new Map();
    this.contentBehaviors = new Map();
    this.on(['GET'], '/subscriber/:id', this.getId.bind(this));
    this.on(['POST'], '/subscriber/:id', this.postId.bind(this));

    this.on(['PUT'], '/subscriber/:id/verify', this.putVerify.bind(this));
    this.on(['PUT'], '/subscriber/:id/content', this.putContent.bind(this));
    this.on(['DELETE'], '/subscriber/:id', this.deleteId.bind(this));
  }

  // eslint-disable-next-line class-methods-use-this
  parseBody() {
    // do not parse, just ingest
  }

  async getId(req, res, ctx) {
    this.setResponseType(this.responseTypes, req, res, ctx);
    const behavior = this.verifyBehaviors.get(ctx.params.id);
    res.statusCode = behavior ? behavior.statusCode : 404;
    const response = (behavior && behavior.matchChallenge) ? ctx.queryParams['hub.challenge'] : (behavior && behavior.response);
    res.end(response);
    this.logger.info({ method: req.method, statusCode: res.statusCode, matchChallenge: !!(behavior && behavior.matchChallenge), url: req.url });
  }

  async postId(req, res, ctx) {
    this.setResponseType(this.responseTypes, req, res, ctx);
    await this.ingestBody(req, res, ctx);
    const behavior = this.contentBehaviors.get(ctx.params.id);
    res.statusCode = behavior ? behavior.statusCode : 404;
    if (behavior) {
      behavior.updated = new Date();
      behavior.content = ctx.rawBody;
    }
    res.end();
    this.logger.info({ content: behavior && behavior.content, method: req.method, statusCode: res.statusCode, matchChallenge: !!(behavior && behavior.matchChallenge), url: req.url });
  }

  async putVerify(req, res, ctx) {
    this.setResponseType(this.responseTypes, req, res, ctx);
    const behavior = {
      matchChallenge: ctx.queryParams.matchChallenge === 'true',
      statusCode: ctx.queryParams.statusCode || 200,
    };
    this.verifyBehaviors.set(ctx.params.id, behavior);
    if (!this.contentBehaviors.get(ctx.params.id)) {
      this.contentBehaviors.set(ctx.params.id, {
        statusCode: 200,
      });
    }
    res.statusCode = 200;
    res.end();
  }

  async putContent(req, res, ctx) {
    this.setResponseType(this.responseTypes, req, res, ctx);
    const behavior = {
      statusCode: ctx.queryParams.statusCode || 200,
    };
    this.contentBehaviors.set(ctx.params.id, behavior);
    res.statusCode = 200;
    res.end();
  }

  async deleteId(req, res, ctx) {
    this.setResponseType(this.responseTypes, req, res, ctx);
    this.contentBehaviors.delete(ctx.params.id);
    this.verifyBehaviors.delete(ctx.params.id);
    res.statusCode = 200;
    res.end();
  }

} // SubscriberFake

const subscriberService = new SubscriberFake();
http.createServer((req, res) => {
  subscriberService.dispatch(req, res);
}).listen(subscriberPort, listenAddress, (err) => {
  if (err) {
    console.error(err);
    throw err;
  }
  console.log(`Fake Subscriber Server started on ${listenAddress}:${subscriberPort}`);
});

const topicService = new TopicFake();
http.createServer((req, res) => {
  topicService.dispatch(req, res);
}).listen(topicPort, listenAddress, (err) => {
  if (err) {
    console.error(err);
    throw err;
  }
  console.log(`Fake Topic Server started on ${listenAddress}:${topicPort}`);
});
