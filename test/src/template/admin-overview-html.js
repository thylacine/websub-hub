/* eslint-env mocha */
'use strict';

const assert = require('node:assert');
const template = require('../../../src/template/admin-overview-html');
const Config = require('../../../config');
const lintHtml = require('../../lint-html');

describe('Admin Overview HTML Template', function () {
  let ctx, config;

  beforeEach(function () {
    ctx = {};
    config = new Config('test');
  });

  it('covers missing topics', async function () {
    const result = template(ctx, config);
    await lintHtml(result);
    assert(result);
  });
  it('covers single topic', async function () {
    ctx.topics = [{}];
    const result = template(ctx, config);
    await lintHtml(result);
    assert(result);
  });
  it('covers plural topics', async function () {
    ctx.topics = [{}, {}, {}];
    const result = template(ctx, config);
    await lintHtml(result);
    assert(result);
  });
});
