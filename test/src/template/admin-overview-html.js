/* eslint-env mocha */
'use strict';

const assert = require('assert');
const template = require('../../../src/template/admin-overview-html');
const Config = require('../../../config');
const config = new Config('test');

describe('Admin Overview HTML Template', function () {
  let ctx;

  beforeEach(function () {
    ctx = {};
  });

  it('covers missing topics', function () {
    const result = template(ctx, config);
    assert(result);
  });
  it('covers single topic', function () {
    ctx.topics = [{}];
    const result = template(ctx, config);
    assert(result);
  });
  it('covers plural topics', function () {
    ctx.topics = [{}, {}, {}];
    const result = template(ctx, config);
    assert(result);
  });
});
