'use strict';

/**
 * A utility class for checking link values in a topic's data and metadata.
 * Used to determine if we are a valid hub for topic.
 */

const { parse: parseLinkHeader, SyntaxError: ParseSyntaxError } = require('@squeep/web-linking');
const common = require('./common');
const Enum = require('./enum');
const FeedParser = require('feedparser');
const { Readable } = require('stream');
const htmlparser2 = require('htmlparser2');
const { Iconv } = require('iconv');

const _fileScope = common.fileScope(__filename);

/**
 * Helper for accessing headers
 * @param {object} headers header object
 * @param {string} header header name
 * @returns {string} header content
 */
function getHeader(headers, header) {
  return headers[header.toLowerCase()];
}


class LinkHelper {
  constructor(logger, options) {
    this.logger = logger;
    this.options = options;
    this.selfUrl = options.dingus.selfBaseUrl;
  }


  /**
   * Determine if this hub is listed in response data from url.
   * @param {string} url content url
   * @param {object} headers headers from accessing url
   * @param {string | Buffer} body body from accessing url
   * @returns {Promise<boolean>} url lists this hub
   */
  async validHub(url, headers, body) {
    const _scope = _fileScope('validHub');
    this.logger.debug(_scope, 'called', { headers, body: common.logTruncate(body, 100) });

    // Add Link headers first, as they take priority over link elements in body.
    const linkHeader = getHeader(headers, Enum.Header.Link);
    const links = [];
    if (linkHeader) {
      try {
        links.push(...parseLinkHeader(linkHeader));
      } catch (e) {
        /* istanbul ignore else */
        if (e instanceof ParseSyntaxError) {
          this.logger.debug(_scope, 'failed to parse link header, bad syntax', { error: e, linkHeader });
        } else {
          this.logger.error(_scope, 'failed to parse link header', { error: e, linkHeader });
        }
      }
    }

    const contentType = LinkHelper.parseContentType(getHeader(headers, Enum.Header.ContentType));
    const nonUTF8Charset = !/utf-*8/i.test(contentType.params.charset) && contentType.params.charset;
    if (nonUTF8Charset) {
      const iconv = new Iconv(nonUTF8Charset, 'utf-8//translit//ignore');
      try {
        body = iconv.convert(body).toString('utf8');
      } catch (e) {
        /* istanbul ignore next */
        this.logger.error(_scope, 'iconv conversion error', { error: e, contentType, url });
        // But try to carry on, anyhow.
      }
    }

    let bodyLinks = [];
    switch (contentType.mediaType) {
      case Enum.ContentType.ApplicationAtom:
      case Enum.ContentType.ApplicationRDF:
      case Enum.ContentType.ApplicationRSS:
      case Enum.ContentType.ApplicationXML:
      case Enum.ContentType.TextXML: {
        bodyLinks = await this.linksFromFeedBody(url, body);
        break;
      }

      case Enum.ContentType.TextHTML:
        bodyLinks = this.linksFromHTMLBody(body);
        break;

      default:
        this.logger.debug(_scope, 'no parser for content type', { contentType });
    }
    links.push(...bodyLinks);

    // Fetch all hub relation targets from headers, resolving relative URIs.
    const hubs = LinkHelper.locateHubTargets(links).map((link) => this.absoluteURI(link, url));

    this.logger.debug(_scope, 'valid hubs for url', { url, hubs });

    return hubs.includes(this.selfUrl);
  }


  /**
   * @typedef {object} ContentType
   * @property {string} mediaType media type
   * @property {object} params map of parameters
   */
  /**
   * Convert a Content-Type string to normalized components.
   * RFC7231 §3.1.1
   * N.B. this non-parser implementation will not work if a parameter
   * value for some reason includes a ; or = within a quoted-string.
   * @param {string} contentTypeHeader content type header
   * @returns {ContentType} contentType
   */
  static parseContentType(contentTypeHeader) {
    const [ mediaType, ...params ] = (contentTypeHeader || '').split(/ *; */);
    return {
      mediaType: mediaType.toLowerCase() || Enum.ContentType.ApplicationOctetStream,
      params: params.reduce((obj, param) => {
        const [field, value] = param.split('=');
        const isQuoted = value.startsWith('"') && value.endsWith('"');
        obj[field.toLowerCase()] = isQuoted ? value.slice(1, value.length - 1) : value;
        return obj;
      }, {}),
    };
  }


  /**
   * Parse XML-ish feed content, extracting link elements into our own format.
   * @param {string} feedurl feed url
   * @param {string} body feed body
   * @returns {Promise<object[]>} array of link elements
   */
  async linksFromFeedBody(feedurl, body) {
    const _scope = _fileScope('linksFromFeedBody');
    this.logger.debug(_scope, 'called', { feedurl, body: common.logTruncate(body, 100) });

    const feedParser = new FeedParser({
      feedurl,
      addmeta: false,
    });
    const bodyStream = Readable.from(body);
    const links = [];

    return new Promise((resolve) => {
      feedParser.on('error', (err) => {
        this.logger.debug(_scope, 'FeedParser error', { err, feedurl, body });
      });
      feedParser.on('end', () => {
        this.logger.debug(_scope, 'FeedParser finished', { links });
        resolve(links);
      });
      feedParser.on('meta', (meta) => {
        this.logger.debug(_scope, 'FeedParser meta', { meta });
        let feedLinks = meta['atom:link'] || [];
        if (!Array.isArray(feedLinks)) {
          // Parsing RSS seems to return a single entry for this rather than a list.
          feedLinks = [feedLinks];
        }
        feedLinks
          .map((l) => l['@'])
          .forEach((l) => {
            const link = {
              target: l.href,
              attributes: Object.entries(l)
                .filter(([name]) => name !== 'href')
                .map(([name, value]) => ({ name, value })),
            };
            links.push(link);
          });
      });
      feedParser.on('readable', () => {
        let _item;
        while ((_item = feedParser.read())) {
          // Quietly consume remaining stream content
        }
      });

      bodyStream.pipe(feedParser);
    });
  }


  /**
   * Parse HTML-ish content, extracting link elements into our own format.
   * @param {string} body html body
   * @returns {object[]} array of link elements
   */
  linksFromHTMLBody(body) {
    const _scope = _fileScope('linksFromHTMLBody');
    this.logger.debug(_scope, 'called', { body: common.logTruncate(body, 100) });

    const links = [];
    const parser = new htmlparser2.Parser({
      onopentag(tagName, attributes) {
        if (tagName.toLowerCase() === 'link') {
          const link = {
            target: attributes.href,
            attributes: Object.entries(attributes)
              .filter(([name]) => name !== 'href')
              .map(([name, value]) => ({ name, value })),
          };
          links.push(link);
        }
      },
    });
    parser.write(body);
    parser.end();
    return links;
  }


  /**
   * Attempt to resolve a relative target URI
   * @param {string} uri target
   * @param {string} context base
   * @returns {string} uri
   */
  absoluteURI(uri, context) {
    const _scope = _fileScope('absoluteURI');
    try {
      new URL(uri);
    } catch (e) { // eslint-disable-line no-unused-vars
      try {
        uri = new URL(uri, context).href;
      } catch (e) { // eslint-disable-line no-unused-vars
        this.logger.debug(_scope, 'could not resolve link URI', { uri, context });
      }
    }
    return uri;
  }


  /**
   * Return all link targets with a hub relation.
   * @param {object[]} links array of link objects
   * @returns {string[]} array of hub targets
   */
  static locateHubTargets(links) {
    return links
      .filter((link) => link.attributes.some((attr) => attr.name === 'rel' && ` ${attr.value} `.includes(' hub ')))
      .map((link) => link.target);
  }

}

module.exports = LinkHelper;
