/* eslint-env mocha */
'use strict';

const assert = require('assert');
const template = require('../../../src/template/admin-login-html');
const Config = require('../../../config');
const config = new Config('test');

describe('Admin Login HTML Template', function () {
  let ctx;

  beforeEach(function () {
    ctx = {};
  });

  it('covers', function () {
    ctx.errors = ['bad'];
    ctx.clientProtocol = 'https';
    const result = template(ctx, config);
    assert(result);
  });
  it('covers empty', function () {
    const result = template(ctx, config);
    assert(result);
  });
});
