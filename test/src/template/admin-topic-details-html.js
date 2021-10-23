/* eslint-env mocha */
'use strict';

const assert = require('assert');
const template = require('../../../src/template/admin-topic-details-html');
const Config = require('../../../config');
const config = new Config('test');

describe('Admin Topic Details HTML Template', function () {
  let ctx;

  beforeEach(function () {
    ctx = {
      topic: {},
      subscriptions: [
        {},
      ],
    };
  });

  it('renders', function () {
    const result = template(ctx, config);
    assert(result);
  });
  it('covers null topic', function () {
    ctx.topic = null;
    ctx.subscriptions = null;
    const result = template(ctx, config);
    assert(result);
  });
  it('covers missing subscriptions', function () {
    delete ctx.subscriptions;
    const result = template(ctx, config);
    assert(result);
  });
  it('covers plural subscriptions', function () {
    ctx.subscriptions = [{}, {}, {}];
    const result = template(ctx, config);
    assert(result);
  });
});
