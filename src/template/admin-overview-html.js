'use strict';

const th = require('./template-helper');

/**
 * Show a summary of all topics.
 * @param {Object} ctx
 * @param {Object[]} ctx.topics
 * @param {Object} options
 * @param {Object} options.manager
 * @param {String} options.manager.pageTitle
 * @returns {String}
 */
module.exports = (ctx, options) => {
  const pageTitle = `${options.manager.pageTitle} - Topics`;
  const logoUrl = options.manager.logoUrl;
  const footerEntries = options.manager.footerEntries;
  if (!ctx.topics) {
    ctx.topics = [];
  }

  const htmlOptions = {
    pageTitle,
    logoUrl,
    footerEntries,
  };

  const content = [
    `      <section class="topics">
        <p>${ctx.topics.length ? ctx.topics.length : 'no'} topic${(ctx.topics.length === 1) ? '' : 's'}</p>
        <table>
          <thead>`,
    th.renderTopicRowHeader(),
    `          </thead>
        <tbody>`,
    ...(ctx.topics && ctx.topics.map((topic) => th.renderTopicRow(topic, { length: topic.subscribers }))),
    `        </tbody>
        </table>
      </section>`,
  ];

  return th.htmlPage(1, ctx, htmlOptions, content);
};