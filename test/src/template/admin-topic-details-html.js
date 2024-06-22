/* eslint-env mocha */
'use strict';

const assert = require('node:assert');
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

  it('renders', async function () {
    const result = template(ctx, config);
    await lintHtml(result);
    assert(result);
  });
  it('covers null topic', async function () {
    ctx.topic = null;
    ctx.subscriptions = null;
    const result = template(ctx, config);
    await lintHtml(result);
    assert(result);
  });
  it('covers missing subscriptions', async function () {
    delete ctx.subscriptions;
    const result = template(ctx, config);
    await lintHtml(result);
    assert(result);
  });
  it('covers plural subscriptions', async function () {
    ctx.subscriptions = [{}, {}, {}];
    const result = template(ctx, config);
    await lintHtml(result);
    assert(result);
  });
});
