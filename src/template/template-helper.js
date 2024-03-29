'use strict';

const { TemplateHelper } = require('@squeep/html-template-helper');
const { Message } = require('../enum');

/**
 * Render a topic as a row of details.
 * @param {Object} topic
 * @param {Object[]} subscribers
 * @param {Boolean} detailsLink
 * @returns {String}
 */
function renderTopicRow(topic, subscribers, detailsLink = true) {
  if (!topic) {
    return `<tr>
    <th colspan="15">(topic not found)</th>
</tr>`;
  }
  return `<tr>
  <th scope="row">${detailsLink ? '<a href="topic/' + topic.id + '">' : ''}${topic.url}${detailsLink ? '</a>' : ''}</th>
  <td>${subscribers.length}</td>
  <td>${TemplateHelper.dateFormat(topic.created, Message.EndOfTime, Message.BeginningOfTime, Message.Unknown)}</td>
  <td>${TemplateHelper.secondsToPeriod(topic.leaseSecondsPreferred)}</td>
  <td>${TemplateHelper.secondsToPeriod(topic.leaseSecondsMin)}</td>
  <td>${TemplateHelper.secondsToPeriod(topic.leaseSecondsMax)}</td>
  <td>${topic.publisherValidationUrl ? topic.publisherValidationUrl : 'None'}</td>
  <td>${topic.isActive}</td>
  <td>${topic.isDeleted}</td>
  <td>${TemplateHelper.dateFormat(topic.lastPublish, Message.EndOfTime, Message.Never, Message.Never)}</td>
  <td>${TemplateHelper.dateFormat(topic.contentFetchNextAttempt, Message.NextPublish, Message.Pending, Message.NextPublish)}</td>
  <td>${topic.contentFetchAttemptsSinceSuccess}</td>
  <td>${TemplateHelper.dateFormat(topic.contentUpdated, Message.EndOfTime, Message.Never, Message.Never)}</td>
  <td>${topic.contentType}</td>
  <td>${topic.id}</td>
</tr>`;
}


/**
 * Render the header row for topic details.
 * @returns {String}
 */
function renderTopicRowHeader() {
  return `<tr>
  <th scope="col">Topic URL</th>
  <th scope="col">Subscribers</th>
  <th scope="col">Created</th>
  <th scope="col">Lease Time Preferred</th>
  <th scope="col">Lease Time Minimum</th>
  <th scope="col">Lease Time Maximum</th>
  <th scope="col">Publisher Validation URL</th>
  <th scope="col">Active</th>
  <th scope="col">Deleted</th>
  <th scope="col">Last Publish Notification</th>
  <th scope="col">Next Content Fetch</th>
  <th scope="col">Content Fetch Failures</th>
  <th scope="col">Content Updated</th>
  <th scope="col">Content Type</th>
  <th scope="col">Internal Id</th>
</tr>`;
}


/**
 * Render a subscription as a row of details.
 * @param {Object} subscription
 * @returns {String}
 */
function renderSubscriptionRow(subscription) {
  if (!subscription) {
    return `<tr>
    <th colspan="12">(topic not found)</th>
</tr>`;
  }
  return `<tr>
  <td scope="row">${subscription.callback}</td>
  <td>${TemplateHelper.dateFormat(subscription.created, Message.EndOfTime, Message.BeginningOfTime, Message.Unknown)}</td>
  <td>${TemplateHelper.dateFormat(subscription.verified, Message.EndOfTime, Message.Never, Message.Never)}</td>
  <td>${TemplateHelper.dateFormat(subscription.expires, Message.Never, Message.BeginningOfTime, Message.Never)}</td>
  <td>${!!subscription.secret}</td>
  <td>${subscription.signatureAlgorithm}</td>
  <td>${subscription.httpRemoteAddr}</td>
  <td>${subscription.httpFrom}</td>
  <td>${TemplateHelper.dateFormat(subscription.contentDelivered, Message.EndOfTime, Message.Never, Message.Never)}</td>
  <td>${subscription.deliveryAttemptsSinceSuccess}</td>
  <td>${TemplateHelper.dateFormat(subscription.deliveryNextAttempt, Message.EndOfTime, Message.NextPublish, Message.NextPublish)}</td>
  <td>${subscription.id}</td>
</tr>`;
}


/**
 * Render a row of headers for subscription details.
 * @returns {String}
 */
function renderSubscriptionRowHeader() {
  return `<tr>
  <th scope="col">Callback URL</th>
  <th scope="col">Created</th>
  <th scope="col">Verified</th>
  <th scope="col">Expires</th>
  <th scope="col">Using Secret</th>
  <th scope="col">Signature Type</th>
  <th scope="col">Remote Address</th>
  <th scope="col">From</th>
  <th scope="col">Content Delivered</th>
  <th scope="col">Content Delivery Failures</th>
  <th scope="col">Next Delivery</th>
  <th scope="col">Internal Id</th>
</tr>
`;
}


/**
 * Escape some xml things in strings.
 * @param {String} string
 */
function xmlEscape(string) {
  if (typeof string === 'number') {
    return string;
  }
  if (typeof string !== 'string') {
    return undefined;
  }
  // eslint-disable-next-line security/detect-object-injection
  return string.replace(/[<>&'"]/, (c) => ({
    '<': '&lt;',
    '>': '&gt;',
    '&': '&amp;',
    '\'': '&apos;',
    '"': '&quot;',
  }[c]));
}

module.exports = Object.assign(Object.create(TemplateHelper), {
  xmlEscape,
  renderTopicRowHeader,
  renderTopicRow,
  renderSubscriptionRowHeader,
  renderSubscriptionRow,
});