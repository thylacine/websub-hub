'use strict';

// Provide default values for all configuration.

const packageName = require('../package.json').name;
const common = require('../src/common');

const defaultOptions = {
  // Uniquely identify this instance, used to tag work-in-progress.
  nodeId: common.requestId(), // Default to ephemeral ID: easiest for clustered deployments.

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
    strictSecrets: false, // If true, reject requests with secrets but not over https
    publicHub: true, // Accept publish requests as new topics.
    processImmediately: true, // If true, immediately attempt to process requests when accepted.
  },

  communication: {
    strictTopicHubLink: true, // If true, deletes topics which do not list us (dingus.selfBaseUrl) as a hub relation.
    retryBackoffSeconds: [60, 120, 360, 1440, 7200, 43200, 86400], // failed requests retry according to number of attempts
    claimTimeoutSeconds: 600, // how long until an in-progress task is deemed abandoned
  },

  // Outgoing request UA header. Comments are defaults in code.
  userAgent: {
    // product: packageName,
    // version: packageVersion,
    // implementation: Enum.Specification,
  },

  authenticator: {
    basicRealm: packageName, // Realm prompt for login on administration pages
    secureAuthOnly: true, // Require secure transport for authentication.
  },

  worker: {
    concurrency: 10, // maximum number of tasks to process at once
    pollingEnabled: true, // periodically check for new tasks
    recurrSleepMs: 60000, // check this often
  },

};

module.exports = defaultOptions;