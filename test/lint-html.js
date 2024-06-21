'use strict';

const { makeHtmlLint } = require('@squeep/html-template-helper');
const { HtmlValidate } = require('html-validate');
const stubLogger = require('./stub-logger');
const htmlValidate = new HtmlValidate();
const lintHtml = makeHtmlLint(stubLogger, htmlValidate);

module.exports = lintHtml;
