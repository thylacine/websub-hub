/* eslint-env mocha */
'use strict';

const assert = require('node:assert');
const th = require('../../../src/template/template-helper');

describe('Template Helper', function () {

  describe('renderTopicRow', function () {
    let topic, subscribers;
    beforeEach(function () {
      topic = {};
      subscribers = [];
    });
    it('covers', function () {
      const result = th.renderTopicRow(topic, subscribers);
      assert(result);
    });
    it('covers empty', function () {
      topic = null;
      subscribers = null;
      const result = th.renderTopicRow(topic, subscribers);
      assert(result);
    });
    it('covers no link', function () {
      subscribers = [{}, {}];
      const result = th.renderTopicRow(topic, subscribers, false);
      assert(result);
    });
    it('covers validation', function () {
      topic.publisherValidationUrl = 'https://example.com/';
      const result = th.renderTopicRow(topic, subscribers, false);
      assert(result);
    });
  }); // renderTopicRow

  describe('renderTopicRowHeader', function () {
    it('covers', function () {
      const result = th.renderTopicRowHeader();
      assert(result);
    });
  }); // renderTopicRowHeader

  describe('renderSubscriptionRow', function () {
    let subscription;
    beforeEach(function () {
      subscription = {};
    });
    it('covers', function () {
      const result = th.renderSubscriptionRow(subscription);
      assert(result);
    });
    it('covers empty', function () {
      const result = th.renderSubscriptionRow();
      assert(result);
    });
  }); // renderSubscriptionRow

  describe('renderSubscriptionRowHeader', function () {
    it('covers', function () {
      const result = th.renderSubscriptionRowHeader();
      assert(result);
    });
  }); // renderSubscriptionRowHeader

  describe('xmlEscape', function () {
    it('ignores numbers', function () {
      const result = th.xmlEscape(3);
      assert.strictEqual(result, 3);
    });
    it('ignores objects', function () {
      const result = th.xmlEscape({});
      assert.strictEqual(result, undefined);
    });
    it('escapes a thing', function () {
      const result = th.xmlEscape('&');
      assert.strictEqual(result, '&amp;');
    });
  }); // xmlEscape

});
