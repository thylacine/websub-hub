'use strict';

const th = require('./template-helper');


/**
 * Login form.
 */
function indieAuthSection() {
  return `      <section class="indieauth">
        <h2>Login</h2>
        <form action="" method="POST">
          <fieldset>
            <legend>IndieAuth</legend>
            <label for="me">Profile URL:</label>
            <input id="me" name="me" type="url" size="40" placeholder="https://example.com/my_profile_url" value="" autofocus>
            <button>Login</button>
            <br>
            <div>
              Logging in with an <a class="external" href="https://indieweb.org/IndieAuth">IndieAuth</a> profile will allow you to view details of any topics on this hub which are related to that profile's domain.
            </div>
          </fieldset>
        </form>
      </section>`;
}


function userSection(ctx, options) {
  const secure = (ctx.clientProtocol || '').toLowerCase() === 'https';
  const showUserForm = secure || !options.authenticator.secureAuthOnly;
  return showUserForm ? `      <section class="user">
        <form action="" method="POST">
          <fieldset>
            <legend>User Account</legend>
            <label for="identifier">Username:</label>
            <input id="identifier" name="identifier" value="">
            <br>
            <label for="credential">Password:</label>
            <input id="credential" name="credential" type="password" value="">
            <br>
            <button>Login</button>
            <br>
          </fieldset>
        </form>
      </section>`
    : '';
}


function errorsSection(ctx) {
  return (ctx.errors && ctx.errors.length) ? `        <section class="errors">
          <h2>Troubles</h2>
          <p>Problems were encountered while trying to authenticate you.</p>
          <ul>` +
          ctx.errors.map((error) => `<li>${error}</li>`).join('\n') + `
          </ul>
        </section>`
    : '';
}


/**
 * Render login form for both local and profile authentication.
 * @param {Object} ctx
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
    indieAuthSection(),
    userSection(ctx, options),
  ];
  return th.htmlTemplate(ctx, 2, pageTitle, headElements, navLinks, mainContent, footerEntries);
};