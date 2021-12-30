'use strict';

const assert = require('assert');
const stubLogger = require('./stub-logger');
const { lint } = require('html-minifier-lint'); // eslint-disable-line node/no-unpublished-require

function lintHtml(html) {
  const result = lint(html);
  stubLogger.debug('lintHtml', '', { result, html });
  assert(!result);
}

module.exports = lintHtml;
