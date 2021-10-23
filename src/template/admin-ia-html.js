'use strict';

const th = require('./template-helper');

function errorsSection(ctx) {
  return (ctx.errors && ctx.errors.length) ? `        <section class="errors">
          <h2>Troubles</h2>
          <p>Problems were encountered while trying to authenticate your profile URL.</p>
          <ul>` +
          ctx.errors.map((error) => `<li>${error}</li>`).join('\n') + `
          </ul>
        </section>
        <div>
          <a href="./login">Try Again?</a>
        </div>`
    : '';
}

/**
 * Render any errors from attempting IndieAuth.
 * @param {Object} ctx
 * @param {String[]} ctx.errors
 * @param {Object} options
 * @param {Object} options.manager
 * @param {String} options.manager.pageTitle
 * @param {Object} options.dingus
 * @param {String} options.dingus.selfBaseUrl
 * @returns {String}
 */
module.exports = (ctx, options) => {
  const pageTitle = options.manager.pageTitle;
  const footerEntries = options.manager.footerEntries;
  const headElements = [];
  const navLinks = [];
  const mainContent = [
    errorsSection(ctx),
  ];
  return th.htmlTemplate(ctx, 2, pageTitle, headElements, navLinks, mainContent, footerEntries);
};