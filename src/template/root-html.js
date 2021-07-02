'use strict';

const th = require('./template-helper');

function aboutSection() {
  return `      <section class="about">
        <h2>What</h2>
        <p>
          This is a <a class="external" href="https://www.w3.org/TR/websub/">WebSub</a> Hub service.
        </p>
        <p>
          It facilitates the timely distribution of new content from publishers to subscribers.  
        </p>
        <aside>
          The typical use-case is where the content is a blog or news feed, but any type of content may be syndicated.
        </aside>
      </section>`;
}

function usageSection(isPublicHub, hubURL) {
  const usageContent = isPublicHub ? `      <h2>Public Hub</h2>
      <p>
        This hub is available as a public resource; any topic which lists it as a hub can be syndicated.
      </p>
      <p>
        To use this hub, your content needs to include some Link relations.
      </p>
      <div>
        <h3>For Any Content</h3>
        <ul>
          <li>
            The content must be served with a <code>Link</code> HTTP header indicating this service as the <code>hub</code> relation.
            <figure>
              <figcaption>Example:</figcaption>
              <code>
                Link: &lt;${hubURL}&gt;; rel="hub"
              </code>
            </figure>
          </li>
          <li>
            The content must be served with a <code>Link</code> HTTP header indicating its own URL with the <code>self</code> relation.
            <figure>
              <figcaption>Example:</figcaption>
              <code>
                Link: &lt;https://example.com/feed/&gt;; rel="self"
              </code>
            </figure>
          </li>
        </ul>
      </div>
      <div>
        <h3>For Atom or RSS feeds</h3>
        <ul>
          <li>
            The feed must include a <code>link</code> element within the <code>http://www.w3.org/2005/Atom</code> namespace with the <code>hub</code> relation and this service as the <code>href</code> attribute.
            <figure>
              <figcaption>Example:</figcaption>
              <code>
                &lt;link xmlns="http://www.w3.org/2005/Atom" href="${hubURL}" rel="hub"&gt;
              </code>
            </figure>
          </li>
          <li>
            The feed must include a <code>link</code> element within the <code>http://www.w3.org/2005/Atom</code> namespace with the <code>self</code> relation, its own URL as the <code>href</code> attribute, and its content-type as the <code>type</code> attribute.
            <figure>
              <figcaption>Example:</figcaption>
              <code>
                &lt;link xmlns="http://www.w3.org/2005/Atom" href="https://example.com/blog/feed" rel="self" type="application/atom+xml"&gt;
              </code>
            </figure>
          </li>
        <ul>
      </div>
      <div>
        <h3>Publishing Updates</h3>
        Send a <code>POST</code> request to this hub with Form Data:
        <ul>
          <li>
            <code>hub.mode</code> set to <code>publish</code>
          </li>
          <li>
            <code>hub.url</code> set to the <code>self</code> link relation of the content
          </li>
        </ul>
      </div>`
  : `
      <h2>Private Hub</h2>
      <p>
        This hub only serves specific topics.
      </p>`;
  return `
      <section class="usage">
${usageContent}
      </section>`;
}

function contactSection(contactHTML) {
  let section = '';
  if (contactHTML) {
    section = `      <section>
${contactHTML}
      </section>`;
  }
  return section;
}

/**
 * 
 * @param {Object} ctx
 * @param {Object} options
 * @param {Object} options.manager
 * @param {String} options.adminContactHTML
 * @param {String} options.manager.pageTitle
 * @param {String} options.manager.publicHub
 * @param {Object} options.dingus
 * @param {String} options.dingus.selfBaseUrl
 * @returns {String}
 */
module.exports = (ctx, options) => {
  const pageTitle = options.manager.pageTitle;
  const isPublicHub = options.manager.publicHub;
  const contactHTML = options.adminContactHTML;
  const hubURL = options.dingus.selfBaseUrl || '<s>https://hub.example.com/</s>';
  const headElements = [];
  const navLinks = [];
  return th.htmlTemplate(1, pageTitle, headElements, navLinks, [
    aboutSection(),
    usageSection(isPublicHub, hubURL),
    contactSection(contactHTML),
  ]);
};