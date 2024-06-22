'use strict';

/**
 * Scrub credential from POST login body data.
 * @param {object} data data
 * @param {boolean} sanitize perform sanitization
 * @returns {boolean} needed sanitization
 */
function sanitizePostCredential(data, sanitize = true) {
  let unclean = false;

  const credentialLength = data?.ctx?.parsedBody?.credential?.length;
  if (credentialLength) {
    unclean = true;
  }
  if (unclean && sanitize) {
    data.ctx.parsedBody.credential = '*'.repeat(credentialLength);
  }

  return unclean;
}

module.exports = {
  sanitizePostCredential,
};