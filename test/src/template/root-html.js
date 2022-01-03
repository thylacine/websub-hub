/* eslint-env mocha */
'use strict';

const assert = require('assert');
const template = require('../../../src/template/root-html');
const Config = require('../../../config');
const lintHtml = require('../../lint-html');

describe('Root HTML Template', function () {
  let ctx, config;

  beforeEach(function () {
    ctx = {};
    config = new Config('test');
  });

  it('renders', function () {
    const result = template(ctx, config);
    lintHtml(result);
    assert(result);
  });

  it('covers options', function () {
    delete config.dingus.selfBaseUrl;
    const result = template(ctx, config);
    lintHtml(result);
    assert(result);
  });

  it('covers options', function () {
    config.adminContactHTML = '<div>support</div>';
    config.manager.publicHub = false;
    const result = template(ctx, config);
    lintHtml(result);
    assert(result);
  });

});
