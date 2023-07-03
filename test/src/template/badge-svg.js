/* eslint-env mocha */
'use strict';

const assert = require('assert');
const template = require('../../../src/template/badge-svg');

describe('Badge SVG Template', function () {
  let ctx, label, message, accessibleText;

  beforeEach(function () {
    ctx = {};
    label = 'label';
    message = 'message';
    accessibleText = 'accessibleText';
  });

  it('renders', function () {
    const result = template(ctx, label, message, accessibleText);
    assert(result);
  });

  it('covers escaping number', function () {
    label = 123;
    const result = template(ctx, label, message, accessibleText);
    assert(result);
  });

  it('covers escaping unknown', function () {
    label = {};
    const result = template(ctx, label, message, accessibleText);
    assert(result);
  });
});
