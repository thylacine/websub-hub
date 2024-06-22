'use strict';

const fs = require('fs');
const path = require('path');

/**
 * Utility functions for wrangling schema migrations.
 */

/**
 * @typedef {object} SchemaVersionObject
 * @property {number} major semver major
 * @property {number} minor semver minor
 * @property {number} patch semver patch
 */


/**
 * Split a dotted version string into parts.
 * @param {string} v version
 * @returns {SchemaVersionObject} version
 */
function schemaVersionStringToObject(v) {
  const [ major, minor, patch ] = v.split('.', 3).map((x) => parseInt(x, 10));
  return { major, minor, patch };
}


/**
 * Render a version object numerically.
 * @param {SchemaVersionObject} v  version
 * @returns {number} version number
 */
function schemaVersionObjectToNumber(v) {
  const vScale = 1000;
  return parseInt(v.major) * vScale * vScale + parseInt(v.minor) * vScale + parseInt(v.patch);
}


/**
 * Convert dotted version string into number.
 * @param {string} v version
 * @returns {number} version number
 */
function schemaVersionStringToNumber(v) {
  return schemaVersionObjectToNumber(schemaVersionStringToObject(v));
}


/**
 * Version string comparison, for sorting.
 * @param {string} a version
 * @param {string} b version
 * @returns {number} difference
 */
function schemaVersionStringCmp(a, b) {
  return schemaVersionStringToNumber(a) - schemaVersionStringToNumber(b);
}


/**
 * Check if an entry in a directory is a directory containing a migration file.
 * @param {string} schemaDir path to schema version directories
 * @param {string} name schema version
 * @returns {boolean} is valid schema version
 */
function isSchemaMigrationDirectory(schemaDir, name) {
  // eslint-disable-next-line security/detect-non-literal-fs-filename
  const nameStat = fs.statSync(path.join(schemaDir, name));
  if (nameStat.isDirectory()) {
    let applyStat;
    try {
      // eslint-disable-next-line security/detect-non-literal-fs-filename
      applyStat = fs.statSync(path.join(schemaDir, name, 'apply.sql'));
      return applyStat.isFile();
    } catch (e) { // eslint-disable-line no-unused-vars
      return false;
    }
  }
  return false;
}


/**
 * Return an array of schema migration directory names within engineDir.
 * @param {string} engineDir path to engine implementation
 * @returns {string[]} schema versions
 */
function allSchemaVersions(engineDir) {
  const schemaDir = path.join(engineDir, 'sql', 'schema');
  // eslint-disable-next-line security/detect-non-literal-fs-filename
  const availableVersions = fs.readdirSync(schemaDir).filter((d) => isSchemaMigrationDirectory(schemaDir, d));
  availableVersions.sort(schemaVersionStringCmp);
  return availableVersions;
}


/**
 * Return an array of schema migration directory names within engineDir,
 * which are within supported range, and are greater than the current
 * @param {string} engineDir path to engine implementation
 * @param {SchemaVersionObject} current curernt version
 * @param {object} supported supported version range
 * @param {SchemaVersionObject} supported.min min version
 * @param {SchemaVersionObject} supported.max max version
 * @returns {string[]} unapplied versions
 */
function unappliedSchemaVersions(engineDir, current, supported) {
  const min = schemaVersionObjectToNumber(supported.min);
  const max = schemaVersionObjectToNumber(supported.max);
  const cur = schemaVersionObjectToNumber(current);
  const available = allSchemaVersions(engineDir);
  return available.filter((a) => {
    a = schemaVersionStringToNumber(a);
    return a >= min && a <= max && a > cur;
  });
}


module.exports = {
  schemaVersionStringToObject,
  schemaVersionObjectToNumber,
  schemaVersionStringToNumber,
  schemaVersionStringCmp,
  isSchemaMigrationDirectory,
  allSchemaVersions,
  unappliedSchemaVersions,
};