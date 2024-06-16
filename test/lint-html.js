'use strict';

const assert = require('node:assert');
const stubLogger = require('./stub-logger');
const { lint } = require('html-minifier-lint');

function lintHtml(html) {
  const result = lint(html);
  stubLogger.debug('lintHtml', '', { result, html });
  assert(!result);
}

module.exports = lintHtml;
