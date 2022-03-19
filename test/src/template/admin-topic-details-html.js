/* eslint-env mocha */
'use strict';

const assert = require('assert');
const template = require('../../../src/template/admin-topic-details-html');
const Config = require('../../../config');
const lintHtml = require('../../lint-html');

describe('Admin Topic Details HTML Template', function () {
  let ctx, config;

  beforeEach(function () {
    ctx = {
      params: {
        topicId: '97dd5488-a303-11ec-97ab-0025905f714a',
      },
      topic: {},
      subscriptions: [
        {},
      ],
    };
    config = new Config('test');
  });

  it('renders', function () {
    const result = template(ctx, config);
    lintHtml(result);
    assert(result);
  });
  it('covers null topic', function () {
    ctx.topic = null;
    ctx.subscriptions = null;
    const result = template(ctx, config);
    lintHtml(result);
    assert(result);
  });
  it('covers missing subscriptions', function () {
    delete ctx.subscriptions;
    const result = template(ctx, config);
    lintHtml(result);
    assert(result);
  });
  it('covers plural subscriptions', function () {
    ctx.subscriptions = [{}, {}, {}];
    const result = template(ctx, config);
    lintHtml(result);
    assert(result);
  });
});
