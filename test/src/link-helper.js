'use strict';

const assert = require('node:assert');
const sinon = require('sinon');
const LinkHelper = require('../../src/link-helper');
const stubLogger = require('../stub-logger');
const testData = require('../test-data/link-helper');

describe('LinkHelper', function () {
  let lh, options;
  beforeEach(function () {
    options = {
      dingus: {
        selfBaseUrl: 'https://example.com/hub/',
      },
    };
    lh = new LinkHelper(stubLogger, options);
  });
  afterEach(function () {
    sinon.restore();
  });
  describe('validHub', function () {
    let url, headers, body;
    beforeEach(function () {
      url = 'https://example.com/feed/';
      headers = {};
      body = '';
    });
    it('covers success', async function () {
      headers = {
        link: '<https://example.com/hub/>; rel="hub"',
      };
      const expected = true;
      const result = await lh.validHub(url, headers, body);
      assert.strictEqual(result, expected);
    });
    it('covers wrong hub', async function () {
      headers = {
        link: '<https://example.com/other/hub/>; rel="hub"',
      };
      const expected = false;
      const result = await lh.validHub(url, headers, body);
      assert.strictEqual(result, expected);
    });
    it('covers link in Atom body', async function () {
      headers = {
        'content-type': 'application/xml',
      };
      body = testData.atomFeedBody;
      url = testData.atomFeedUrl;
      lh.selfUrl = 'https://hub.squeep.com/';
      const expected = true;
      const result = await lh.validHub(url, headers, body);
      assert.strictEqual(result, expected);
    });
    it('covers link in HTML body', async function () {
      headers = {
        'content-type': 'text/html',
      };
      body = '<html><head><link rel="hub" href="https://example.com/hub/"></head></html>';
      const expected = true;
      const result = await lh.validHub(url, headers, body);
      assert.strictEqual(result, expected);
    });
    it('covers link in HTML body with charset translation', async function () {
      headers = {
        'content-type': 'text/html; charset=ASCII',
      };
      body = '<html><head><link rel="hub" href="https://example.com/hub/"></head></html>';
      const expected = true;
      const result = await lh.validHub(url, headers, body);
      assert.strictEqual(result, expected);
    });
    it('covers parser failure', async function () {
      headers = {
        link: 'Invalid Link Header',
      };
      const expected = false;
      const result = await lh.validHub(url, headers, body);
      assert.strictEqual(result, expected);
    });
    it('covers other failure', async function () {
      const expected = false;
      const result = await lh.validHub(url, headers, body);
      assert.strictEqual(result, expected);
    });
  }); // validHub

  describe('parseContentType', function () {
    it('handles no data', function () {
      const expected = {
        mediaType: 'application/octet-stream',
        params: {},
      };
      const result = LinkHelper.parseContentType();
      assert.deepStrictEqual(result, expected);
    });
    it('handles only media type', function () {
      const expected = {
        mediaType: 'application/json',
        params: {},
      };
      const result = LinkHelper.parseContentType('application/json');
      assert.deepStrictEqual(result, expected);
    });
    it('handles parameters', function () {
      const expected = {
        mediaType: 'text/html',
        params: {
          charset: 'ISO-8859-4',
        },
      };
      const result = LinkHelper.parseContentType('text/html; charset=ISO-8859-4');
      assert.deepStrictEqual(result, expected);
    });
    it('handles more parameters', function () {
      const expected = {
        mediaType: 'multipart/form-data',
        params: {
          boundary: '--123--',
          other: 'foo',
        },
      };
      const result = LinkHelper.parseContentType('multipart/form-data; boundary="--123--"; other=foo');
      assert.deepStrictEqual(result, expected);
    });
  }); // parseContentType

  describe('absoluteURI', function () {
    it('success', function () {
      const uri = '../rel';
      const context = 'https://example.com/base/';
      const expected = 'https://example.com/rel';
      const result = lh.absoluteURI(uri, context);
      assert.strictEqual(result, expected);
    });
    it('failure', function () {
      const uri = '../rel';
      const context = '/not/valid';
      const expected = '../rel';
      const result = lh.absoluteURI(uri, context);
      assert.strictEqual(result, expected);
    });
  }); // absoluteURI

  describe('locateHubTargets', function () {
    it('covers', function () {
      const links = [
        {
          target: 'https://example.com/hub1/',
          attributes: [
            {
              name: 'rel',
              value: 'hub',
            },
          ],
        },
        {
          target: 'https://example.com/index',
          attributes: [
            {
              name: 'rel',
              value: 'index',
            },
          ],
        },
        {
          target: 'https://example.com/hub2/',
          attributes: [
            {
              name: 'rel',
              value: 'hub other',
            },
          ],
        },
      ];
      const expected = ['https://example.com/hub1/', 'https://example.com/hub2/'];
      const result = LinkHelper.locateHubTargets(links);
      assert.deepStrictEqual(result, expected);
    });
  }); // locateHubTargets

  describe('linksFromFeedBody', function () {
    it('parses rss', async function () {
      const feedData = testData.rssFeedBody;
      const feedUrl = testData.rssFeedUrl;
      const expected = [
        {
          attributes: [
            {
              name: 'rel',
              value: 'hub',
            },
          ],
          target: 'https://hub.squeep.com/',
        },
      ];
      const result = await lh.linksFromFeedBody(feedUrl, feedData);
      assert.deepStrictEqual(result, expected);
    });
    it('parses more rss', async function () {
      const feedData = testData.rssFeedBody2;
      const feedUrl = testData.rssFeedUrl2;
      const expected = [
        {
          attributes: [
            {
              name: 'rel',
              value: 'self',
            },
            {
              name: 'type',
              value: 'application/rss+xml',
            },
          ],
          target: 'https://puppetcircuits.wordpress.com/feed/',
        },
        {
          attributes: [
            {
              name: 'rel',
              value: 'search',
            },
            {
              name: 'type',
              value: 'application/opensearchdescription+xml',
            },
            {
              name: 'title',
              value: 'Puppet Circuits',
            },
          ],
          target: 'https://puppetcircuits.wordpress.com/osd.xml',
        },
        {
          attributes: [
            {
              name: 'rel',
              value: 'hub',
            },
          ],
          target: 'https://puppetcircuits.wordpress.com/?pushpress=hub',
        },
      ];
      const result = await lh.linksFromFeedBody(feedUrl, feedData);
      assert.deepStrictEqual(result, expected);
    });
    it('parses atom', async function () {
      const feedData = testData.atomFeedBody;
      const feedUrl = testData.atomFeedUrl;
      const expected = [
        {
          attributes: [
            {
              name: 'rel',
              value: 'alternate',
            },
            {
              name: 'type',
              value: 'text/xhtml',
            },
          ],
          target: 'https://squeep.com/eats/',
        },
        {
          attributes: [
            {
              name: 'rel',
              value: 'self',
            },
            {
              name: 'type',
              value: 'application/atom+xml',
            },
          ],
          target: 'https://squeep.com/eats/atom/',
        },
        {
          attributes: [
            {
              name: 'rel',
              value: 'hub',
            },
          ],
          target: 'https://hub.squeep.com/',
        },
      ];
      const result = await lh.linksFromFeedBody(feedUrl, feedData);
      assert.deepStrictEqual(result, expected);
    });
    it('does not parse HTML', async function () {
      const feedData = testData.htmlBody;
      const feedUrl = testData.htmlUrl;
      const expected = [];
      const result = await lh.linksFromFeedBody(feedUrl, feedData);
      assert.deepStrictEqual(result, expected);
    });
  }); // hubLinksFromFeedBody

  describe('linksFromHTMLBody', function () {
    it('parses HTML', function () {
      const htmlData = testData.htmlBody;
      const expected = [
        {
          attributes: [
            {
              name: 'rel',
              value: 'preload',
            },
            {
              name: 'as',
              value: 'font',
            },
            {
              name: 'type',
              value: 'font/opentype',
            },
            {
              name: 'crossorigin',
              value: 'anonymous',
            },
          ],
          target: 'oldstyle.otf',
        },
        {
          attributes: [
            {
              name: 'rel',
              value: 'stylesheet',
            },
            {
              name: 'type',
              value: 'text/css',
            },
          ],
          target: 'eats.css',
        },
        {
          attributes: [
            {
              name: 'rel',
              value: 'hub',
            },
          ],
          target: 'https://hub.squeep.com/',
        },
        {
          attributes: [
            {
              name: 'rel',
              value: 'alternate',
            },
            {
              name: 'type',
              value: 'application/atom+xml',
            },
            {
              name: 'title',
              value: 'Atom 1.0',
            },
          ],
          target: 'https://squeep.com/eats/atom/',
        },
      ];
      const result = lh.linksFromHTMLBody(htmlData);
      assert.deepStrictEqual(result, expected);
    });
  }); // linksFromHTMLBody

}); // LinkHelper