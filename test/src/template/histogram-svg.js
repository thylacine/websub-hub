/* eslint-env mocha */
'use strict';

const assert = require('assert');
const template = require('../../../src/template/histogram-svg');

describe('Histogram SVG Template', function () {
  let items, options;
  beforeEach(function () {
    items = [];
    options = {};
  });
  it('covers defaults', function () {
    const result = template(items, options);
    assert(result);
  });
  it('covers options', function () {
    items = [0, 1, 2];
    options = {
      labelX: 'Days Ago',
      labelZero: 'Today',
      tickEvery: 2,
      frameColor: undefined,
      labelHeight: 0,
    };
    const result = template(items, options);
    assert(result);
  });
});