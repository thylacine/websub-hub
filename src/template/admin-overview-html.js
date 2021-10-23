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
  const headElements = [];
  const navLinks = [];
  const footerEntries = options.manager.footerEntries;
  if (!ctx.topics) {
    ctx.topics = [];
  }
  return th.htmlTemplate(ctx, 1, pageTitle, headElements, navLinks, [
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
  ], footerEntries);
};