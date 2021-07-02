'use strict';

const fs = require('fs');
const path = require('path');

/**
 * Utility functions for wrangling schema migrations.
 */

/**
 * @typedef {Object} SchemaVersionObject
 * @property {Number} major
 * @property {Number} minor
 * @property {Number} patch
 */


/**
 * Split a dotted version string into parts.
 * @param {String} v
 * @returns {SchemaVersionObject}
 */
function schemaVersionStringToObject(v) {
  const [ major, minor, patch ] = v.split('.', 3).map((x) => parseInt(x, 10));
  return { major, minor, patch };
}


/**
 * Render a version object numerically.
 * @param {SchemaVersionObject} v 
 * @returns {Number}
 */
function schemaVersionObjectToNumber(v) {
  const vScale = 1000;
  return parseInt(v.major) * vScale * vScale + parseInt(v.minor) * vScale + parseInt(v.patch);
}


/**
 * Convert dotted version string into number.
 * @param {String} v
 * @returns {Number}
 */
function schemaVersionStringToNumber(v) {
  return schemaVersionObjectToNumber(schemaVersionStringToObject(v));
}


/**
 * Version string comparison, for sorting.
 * @param {String} a
 * @param {String} b
 * @returns {Number}
 */
function schemaVersionStringCmp(a, b) {
  return schemaVersionStringToNumber(a) - schemaVersionStringToNumber(b);
}


/**
 * Check if an entry in a directory is a directory containing a migration file.
 * @param {String} schemaDir
 * @param {String} name
 * @returns {Boolean}
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
    } catch (e) {
      return false;
    }
  }
  return false;
}


/**
 * Return an array of schema migration directory names within engineDir.
 * @param {String} engineDir
 * @returns {String[]}
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
 * @param {String} engineDir
 * @param {SchemaVersionObject} current
 * @param {Object} supported
 * @param {SchemaVersionObject} supported.min
 * @param {SchemaVersionObject} supported.max
 * @returns {String[]}
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