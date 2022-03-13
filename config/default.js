'use strict';

// Provide default values for all configuration.

const { name: packageName, version: packageVersion } = require('../package.json');
const common = require('../src/common');
const Enum = require('../src/enum');

const defaultOptions = {
  // Uniquely identify this instance, used to tag work-in-progress.
  nodeId: common.requestId(), // Default to ephemeral ID: easiest for clustered deployments.

  // This should be set to a reasonably long passphrase or random buffer, to keep client session data secure.
  encryptionSecret: undefined, // REQUIRED

  // Dingus API Server Framework options. Be sure to set the one REQUIRED option here.
  dingus: {
    // This needs to be the full externally accessible root URL, including any proxyPrefix component, which clients will connect to, and which topics will list as their hub link.
    selfBaseUrl: '', // REQUIRED

    // trustProxy: true, // If true, trust values of some headers regarding client IP address and protocol.
    proxyPrefix: '', // Leading path parts to ignore when parsing routes, and include when constructing links, e.g. /hub
  },

  // Database options
  db: {
    connectionString: '', // e.g. sqlite://path/to/dbfile.sqlite
    queryLogLevel: undefined, // Set to log queries
    cacheEnabled: true, // Cache some db responses. (Postgres only)
    listener: { // Settings for the cache-invalidator connection. (Postgres only)
      // pingDelayMs: 5000, // Connection keep-alive/health-check.
      // reconnectDelayMs: 6000, // Wait time before attempting reconnection.
      // reconnectTimes: 10, // Retries limit.
    },
  },

  // Logging options
  logger: {
    ignoreBelowLevel: 'info',
  },

  // Lease time limits, if not specified per-topic. Comments are defaults in code.
  topicLeaseDefaults: {
    // leaseSecondsPreferred: 86400 * 10,
    // leaseSecondsMin: 86400 * 1,
    // leaseSecondsMax: 86400 * 365,
  },

  manager: {
    pageTitle: packageName, // title on html pages
    logoUrl: '/static/logo.svg', // image to go with title
    footerEntries: [ // common footers on all html pages
      '<a href="https://git.squeep.com/?p=websub-hub;a=tree">Development Repository</a> / <a href="https://github.com/thylacine/websub-hub/">GitHub mirror</a>',
      '<span class="copyright">&copy;<time datetime="2022">&#8559;&#8559;&#8553;&#8553;&#8544;&#8544;</time></span>',
    ],
    publishHistoryDays: 60, // Number of days of update history to show on topic details page
    strictSecrets: false, // If true, reject requests with secrets but not over https
    publicHub: true, // Accept publish requests as new topics.
    processImmediately: true, // If true, immediately attempt to process requests when accepted.
  },

  communication: {
    strictTopicHubLink: true, // If true, deletes topics which do not list us (dingus.selfBaseUrl) as a hub relation.
    retryBackoffSeconds: [60, 120, 360, 1440, 7200, 43200, 86400], // failed requests retry according to number of attempts
    claimTimeoutSeconds: 600, // how long until an in-progress task is deemed abandoned
  },

  // Outgoing request UA header.
  // These values are the same as the defaults in the code, but we are setting
  // them here so they also apply to UA of other modules, e.g. @squeep/indieauth-helper
  userAgent: {
    product: packageName,
    version: packageVersion,
    implementation: Enum.Specification,
  },

  authenticator: {
    basicRealm: packageName, // Realm prompt for login on administration pages
    secureAuthOnly: true, // Require secure transport for authentication.
    authnEnabled: ['indieAuth', 'argon2', 'pam'],
    forbiddenPAMIdentifiers: ['root'],
  },

  worker: {
    concurrency: 10, // maximum number of tasks to process at once
    pollingEnabled: true, // periodically check for new tasks
    recurrSleepMs: 60000, // check this often
  },

};

module.exports = defaultOptions;
