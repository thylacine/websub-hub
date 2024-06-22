'use strict';

const th = require('./template-helper');
const { sessionNavLinks } = require('@squeep/authentication-module');

/**
 * Show a summary of all topics.
 * @param {object} ctx context
 * @param {object[]} ctx.topics topics
 * @param {object} options options
 * @param {object} options.manager manager options
 * @param {string} options.manager.pageTitle page title
 * @returns {string} html
 */
module.exports = (ctx, options) => {
  const pagePathLevel = 1;
  const pageTitle = `${options.manager.pageTitle} - Topics`;
  const logoUrl = options.manager.logoUrl;
  const footerEntries = options.manager.footerEntries;
  if (!ctx.topics) {
    ctx.topics = [];
  }

  const htmlOptions = {
    pageIdentifier: 'admin',
    pageTitle,
    logoUrl,
    footerEntries,
  };
  th.navLinks(pagePathLevel, ctx, htmlOptions);
  sessionNavLinks(pagePathLevel, ctx, htmlOptions);

  const content = [
    `      <section class="topics">
        <p>${ctx.topics.length ? ctx.topics.length : 'no'} topic${(ctx.topics.length === 1) ? '' : 's'}</p>
        <table>
          <thead>`,
    th.renderTopicRowHeader(),
    `          </thead>
        <tbody>`,
    ...((ctx?.topics || []).map((topic) => th.renderTopicRow(topic, { length: topic.subscribers }))),
    `        </tbody>
        </table>
      </section>`,
  ];

  return th.htmlPage(pagePathLevel, ctx, htmlOptions, content);
};