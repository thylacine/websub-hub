'use strict';

const th = require('./template-helper');

/**
 * Show a topic with all of its subscribers.
 * @param {Object} ctx
 * @param {Object} ctx.topic
 * @param {Object[]} ctx.subscriptions
 * @param {Object} options
 * @param {Object} options.manager
 * @param {String} options.manager.pageTitle
 * @returns {String}
 */
module.exports = (ctx, options) => {
  const pageTitle = `${options.manager.pageTitle} - Topic Details`;
  const logoUrl = options.manager.logoUrl;
  const navLinks = [
    {
      href: '..',
      text: '&uarr; All Topics',
    },
  ];
  const footerEntries = options.manager.footerEntries;
  if (!ctx.subscriptions) {
    ctx.subscriptions = [];
  }

  const htmlOptions = {
    pageTitle,
    logoUrl,
    navLinks,
    footerEntries,
  };

  const content = [
    '<script>0</script>', // This fixes a layout rendering flash on load in FF; do not know why this works but it does.
    `      <section class="topics">
        <table>
          <thead>`,
    th.renderTopicRowHeader(),
    `          </thead>
        <tbody>`,
    ...(ctx.topic && [ th.renderTopicRow(ctx.topic, ctx.subscriptions, false) ] || []),
    `        </tbody>
        </table>
      </section>`,
    `      <section class="subscriptions">
        <p>${ctx.subscriptions.length ? ctx.subscriptions.length : 'no'} subscription${(ctx.subscriptions.length === 1) ? '' : 's'}</p>
        <table>
          <thead>`,
    th.renderSubscriptionRowHeader(),
    `          </thead>
          <tbody>`,
    ...(ctx.subscriptions && ctx.subscriptions.map(th.renderSubscriptionRow)),
    `          </tbody>
        </table>
      </section>`,
  ];

  return th.htmlPage(2, ctx, htmlOptions, content);
};