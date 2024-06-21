/* eslint-env mocha */
'use strict';

const assert = require('node:assert');
const template = require('../../../src/template/root-html');
const Config = require('../../../config');
const lintHtml = require('../../lint-html');

describe('Root HTML Template', function () {
  let ctx, config;

  beforeEach(function () {
    ctx = {};
    config = new Config('test');
  });

  it('renders', async function () {
    const result = template(ctx, config);
    await lintHtml(result);
    assert(result);
  });

  it('covers options', async function () {
    delete config.dingus.selfBaseUrl;
    const result = template(ctx, config);
    await lintHtml(result);
    assert(result);
  });

  it('covers options', async function () {
    config.adminContactHTML = '<div>support</div>';
    config.manager.publicHub = false;
    const result = template(ctx, config);
    await lintHtml(result);
    assert(result);
  });

});
