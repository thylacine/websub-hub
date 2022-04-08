'use strict';

/**
 * Scrub credential from POST login body data.
 * @param {Object} data
 * @param {Boolean} sanitize
 * @returns {Boolean}
 */
function sanitizePostCredential(data, sanitize = true) {
  let unclean = false;

  const credentialLength = data && data.ctx && data.ctx.parsedBody && data.ctx.parsedBody.credential && data.ctx.parsedBody.credential.length;
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