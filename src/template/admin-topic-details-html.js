'use strict';

const th = require('./template-helper');
const { sessionNavLinks } = require('@squeep/authentication-module');

/**
 * Show a topic with all of its subscribers.
 * @param {object} ctx context
 * @param {object} ctx.topic topic
 * @param {object[]} ctx.subscriptions subscriptions
 * @param {object} options options
 * @param {object} options.manager manager options
 * @param {string} options.manager.pageTitle page title
 * @returns {string} html
 */
module.exports = (ctx, options) => {
  const pagePathLevel = 2;
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
    pageIdentifier: 'admin',
    pageTitle,
    logoUrl,
    navLinks,
    footerEntries,
  };
  th.navLinks(pagePathLevel, ctx, htmlOptions);
  sessionNavLinks(pagePathLevel, ctx, htmlOptions);

  const content = [
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
    `      <section class="history">
        <p>Topic Publish History &mdash; ${ctx.publishCount} updates in the last ${ctx.publishSpan} days</p>
        <img title="Topic Publish History" src="${ctx.params.topicId}/history.svg">
      </section>`,
    `      <section class="subscriptions">
        <p>${ctx.subscriptions.length ? ctx.subscriptions.length : 'no'} subscription${(ctx.subscriptions.length === 1) ? '' : 's'}</p>`,
    ...(ctx.subscriptions.length && [`
        <label for="subscriptions-delivered">
          Successful Deliveries of Latest Content
        </label>
        <progress id="subscriptions-delivered" max="${ctx.subscriptions.length}" value="${ctx.subscriptionsDelivered}">
          ${ctx.subscriptionsDelivered} of ${ctx.subscriptions.length} (${Math.ceil(100 * ctx.subscriptions.length / ctx.subscriptionsDelivered)}%)
        </progress>`] || []),
    `        <table>
          <thead>`,
    th.renderSubscriptionRowHeader(),
    `          </thead>
          <tbody>`,
    ...((ctx?.subscriptions || []).map(th.renderSubscriptionRow)),
    `          </tbody>
        </table>
      </section>`,
  ];

  return th.htmlPage(pagePathLevel, ctx, htmlOptions, content);
};