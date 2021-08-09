'use strict';

/**
 * A bunch of shorthand to put together common parts of an HTML page. 
 */

/**
 * Some fields may have values outside normal dates, handle them here.
 * @param {Date} date
 * @param {String} otherwise
 */
const dateOrNot = (date, otherwise) => {
  if (!date) {
    return otherwise;
  }
  if (typeof date === 'number') {
    date = new Date(date);
  }
  const dateMs = date.getTime();
  if (!Number.isFinite(dateMs)
  ||  dateMs == 0) {
    return otherwise;
  }
  return date.toString();
};


/**
 * Render a duration.
 * @param {Number} seconds
 * @returns {String}
 */
const secondsToPeriod = (seconds) => {
  let value = seconds;
  const result = [];

  const nextResult = (factor, label) => {
    const r = factor ? value % factor : value;
    if (r) {
      result.push(`${r} ${label}${r != 1 ? 's' : ''}`);
    }
    value = factor ? Math.floor(value / factor) : value;
  }

  nextResult(60, 'second');
  nextResult(60, 'minute');
  nextResult(24, 'hour');
  nextResult(30, 'day');
  nextResult(undefined, 'month');

  result.reverse();
  return result.join(' ');
};


/**
 * Render a topic as a row of details.
 * @param {Object} topic
 * @param {Object[]} subscribers
 * @param {Boolean} detailsLink
 * @returns {String}
 */
function renderTopicRow(topic, subscribers, detailsLink = true) {
  return `<tr>
  <th scope="row">${detailsLink ? '<a href="topic/' + topic.id + '">' : ''}${topic.url}${detailsLink ? '</a>' : ''}</th>
  <td>${subscribers.length}</td>
  <td>${dateOrNot(topic.created, 'Unknown')}</td>
  <td>${secondsToPeriod(topic.leaseSecondsPreferred)}</td>
  <td>${secondsToPeriod(topic.leaseSecondsMin)}</td>
  <td>${secondsToPeriod(topic.leaseSecondsMax)}</td>
  <td>${topic.publisherValidationUrl ? topic.publisherValidationUrl : 'None'}</td>
  <td>${topic.isActive}</td>
  <td>${topic.isDeleted}</td>
  <td>${dateOrNot(topic.lastPublish, 'Never')}</td>
  <td>${dateOrNot(topic.contentFetchNextAttempt, 'Next Publish')}</td>
  <td>${topic.contentFetchAttemptsSinceSuccess}</td>
  <td>${dateOrNot(topic.contentUpdated, 'Never')}</td>
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
  <th scope="col">ID</th>
</tr>`;
}


/**
 * Render a subscription as a row of details.
 * @param {Object} subscription
 * @returns {String}
 */
function renderSubscriptionRow(subscription) {
  return `<tr>
  <td scope="row">${subscription.callback}</td>
  <td>${dateOrNot(subscription.created, 'Unknown')}</td>
  <td>${dateOrNot(subscription.verified, 'Never')}</td>
  <td>${dateOrNot(subscription.expires, 'Never')}</td>
  <td>${!!subscription.secret}</td>
  <td>${subscription.signatureAlgorithm}</td>
  <td>${subscription.httpRemoteAddr}</td>
  <td>${subscription.httpFrom}</td>
  <td>${dateOrNot(subscription.contentDelivered, 'Never')}</td>
  <td>${subscription.deliveryAttemptsSinceSuccess}</td>
  <td>${dateOrNot(subscription.deliveryNextAttempt, 'Next Publish')}</td>
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
  <th scope="col">ID</th>
</tr>
`;
}


/**
 * Render the preamble for an HTML page, up through body.
 * @param {Number} pagePathLevel number of paths below root this page is
 * @param {String} pageTitle
 * @param {String[]} headElements
 * @returns 
 */
function htmlHead(pagePathLevel, pageTitle, headElements = []) {
  const rootPathPfx = '../'.repeat(pagePathLevel);
  return `<!DOCTYPE html>
<html lang="en>
  <head>
    <meta charset="utf-8">` +
  headElements.map((e) => `${'  '.repeat(2)}${e}`).join('\n') + `
    <title>${pageTitle}</title>
    <link rel="stylesheet" href="${rootPathPfx}static/theme.css">
  </head>
  <body>`;
}


/**
 * Closes remainder of HTML page body.
 * @returns {String}
 */
function htmlTail() {
  return `  </body>
</html>`;
}


/**
 * Render a navigation link for the header section.
 * @param {Object} nav
 * @param {String} nav.href
 * @param {String} nav.class
 * @param {String} nav.text
 * @returns {String}
 */
function renderNavLink(nav) {
  return `<li>
  <a href="${nav.href}"${nav.class ? (' class="' + nav.class + '"') : ''}>${nav.text}</a>
</li>`;
}


/**
 * Render the navigation header, and open the main section.
 * @param {String} pageTitle
 * @param {Object[]} navLinks
 * @returns {String}
 */
function htmlHeader(pageTitle, navLinks = []) {
  return `    <header>
      <h1>${pageTitle}</h1>
      <nav>` +
    (navLinks.length ? `
        <ol>
          ${navLinks.map((l) => renderNavLink(l)).join('\n')}
        </ol>`
      : '') + `
      </nav>
    </header>
    <main>`;
}


/**
 * Close the main section and finish off with boilerplate.
 * @returns {String}
 */
function htmlFooter() {
  return `    </main>
    <footer>
      <ol>
        <li>
          <a href="https://git.squeep.com/?p=websub-hub;a=tree">Development Repository</a>
        </li>
        <li>
          <a href="https://squeep.com/">A Squeep Infrastructure Component</a>
        </li>
        <li>
          &copy;<time datetime="2021">&#8559;&#8559;&#8553;&#8553;&#8544;</time>
        </li>
      </ol>
    </footer>`;
}


/**
 * Render all parts of an HTML page.
 * @param {Number} pagePathLevel
 * @param {String} pageTitle
 * @param {String[]} headElements
 * @param {Object[]} navLinks
 * @param {String[]} main
 * @returns {String}
 */
function htmlTemplate(pagePathLevel, pageTitle, headElements = [], navLinks = [], main = []) {
  return [
    htmlHead(pagePathLevel, pageTitle, headElements),
    htmlHeader(pageTitle, navLinks),
    ...main,
    htmlFooter(),
    htmlTail(),
  ].join('\n');
}


module.exports = {
  dateOrNot,
  secondsToPeriod,
  htmlHeader,
  htmlFooter,
  htmlHead,
  htmlTail,
  renderNavLink,
  renderTopicRowHeader,
  renderTopicRow,
  renderSubscriptionRowHeader,
  renderSubscriptionRow,
  htmlTemplate,
};