'use strict';

const common = require('../src/common');

const defaultEnvironment = 'development';
const testEnvironment = 'test';

function Config(environment) {
  environment = environment || defaultEnvironment;
  const defaultConfig = require('./default');
  let envConfig = require(`./${environment}`); // eslint-disable-line security/detect-non-literal-require
  if (!Array.isArray(envConfig)) {
    envConfig = Array(envConfig);
  }
  // We support arrays of config options in env to allow e.g. resetting an existing array
  const combinedConfig = common.mergeDeep(defaultConfig, ...envConfig, { environment });
  if (!environment.includes(testEnvironment)) {
    /* istanbul ignore next */
    common.freezeDeep(combinedConfig);
  }
  return combinedConfig;
}

module.exports = Config;