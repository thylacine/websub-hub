/* eslint-env mocha */
'use strict';

const assert = require('assert');
const th = require('../../../src/template/template-helper');
const Config = require('../../../config');
const config = new Config('test');

describe('Template Helper', function () {
  let ctx;

  beforeEach(function () {
    ctx = {};
  });

  describe('dateOrNot', function () {
    let date, otherwise;
    beforeEach(function () {
      date = new Date();
      otherwise = 'otherwise';
    });
    it('covers', function () {
      const result = th.dateOrNot(date, otherwise);
      assert.strictEqual(result, date.toString());
    });
    it('covers no date', function () {
      date = undefined;
      const result = th.dateOrNot(date, otherwise);
      assert.strictEqual(result, otherwise);
    });
    it('covers ms', function () {
      const result = th.dateOrNot(date.getTime(), otherwise);
      assert.strictEqual(result, date.toString());
    });
    it('covers naught', function () {
      const result = th.dateOrNot(0, otherwise);
      assert.strictEqual(result, otherwise);
    });
    it('covers the infinite', function () {
      const result = th.dateOrNot(-Infinity, otherwise);
      assert.strictEqual(result, otherwise);
    });
  }); // dateOrNot

  describe('secondsToPeriod', function () {
    it('covers seconds', function () {
      const result = th.secondsToPeriod(45);
      assert.strictEqual(result, '45 seconds');
    });
    it('covers minutes', function () {
      const result = th.secondsToPeriod(105);
      assert.strictEqual(result, '1 minute 45 seconds');
    });
    it('covers hours', function () {
      const result = th.secondsToPeriod(3705);
      assert.strictEqual(result, '1 hour 1 minute 45 seconds');
    });
    it('covers days', function () {
      const result = th.secondsToPeriod(90105);
      assert.strictEqual(result, '1 day 1 hour 1 minute 45 seconds');
    });
    it('covers months', function () {
      const result = th.secondsToPeriod(5274105);
      assert.strictEqual(result, '2 months 1 day 1 hour 1 minute 45 seconds');
    });
  }); // secondsToPeriod

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
  }); // renderSubscriptionRow

  describe('renderSubscriptionRowHeader', function () {
    it('covers', function () {
      const result = th.renderSubscriptionRowHeader();
      assert(result);
    });
  }); // renderSubscriptionRowHeader

  describe('htmlHead', function () {
    let pagePathLevel, pageTitle, headElements;
    beforeEach(function () {
      pagePathLevel = 2;
      pageTitle = 'title';
    });
    it('covers', function () {
      const result = th.htmlHead(pagePathLevel, pageTitle, headElements);
      assert(result);
    });
    it('covers elements', function () {
      headElements = [ '<div>foop</div>', '<div>poof</div>' ];
      const result = th.htmlHead(pagePathLevel, pageTitle, headElements);
      assert(result);
    });
  }); // htmlHead

  describe('htmlTail', function () {
    it('covers', function () {
      const result = th.htmlTail();
      assert(result);
    });
  }); // htmlTail

  describe('renderNavLink', function () {
    let nav;
    beforeEach(function () {
      nav = {
        href: 'https://example.com/',
        text: 'example',
      };
    });
    it('covers no class', function () {
      const result = th.renderNavLink(nav);
      assert(result);
    });
    it('covers class', function () {
      nav.class = 'foo bar';
      const result = th.renderNavLink(nav);
      assert(result);
    });
  }); // renderNavLink

  describe('htmlHeader', function () {
    let pageTitle, navLinks;
    beforeEach(function () {
      pageTitle = 'title';
      navLinks = [];
    });
    it('covers no links', function () {
      const result = th.htmlHeader(pageTitle);
      assert(result);
    });
    it('covers links', function () {
      navLinks = [
        {
          href: 'https://exmaple.com/',
          text: 'example',
        },
      ];
      const result = th.htmlHeader(pageTitle, navLinks);
      assert(result);
    });
  }); // htmlHeader

  describe('htmlFooter', function () {
    it('covers', function () {
      const result = th.htmlFooter();
      assert(result);
    });
  }); // htmlFooter

  describe('htmlTemplate', function () {
    let pagePathLevel, pageTitle, headElements, navLinks, main;
    beforeEach(function () {
      pagePathLevel = 1;
      pageTitle = 'title';
      headElements = [];
      navLinks = [];
      main = [];
    });
    it('covers', function () {
      const result = th.htmlTemplate(pagePathLevel, pageTitle, headElements, navLinks, main);
      assert(result);
    });
    it('covers defaults', function () {
      const result = th.htmlTemplate(pagePathLevel, pageTitle);
      assert(result);
    });
  }); // htmlTemplate

});
