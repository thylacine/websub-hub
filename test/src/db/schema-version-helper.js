/* eslint-env mocha */
'use strict';

const assert = require('node:assert');
const sinon = require('sinon');
const fs = require('fs');
const svh = require('../../../src/db/schema-version-helper');

describe('SchemaVersionHelper', function () {
  const isDir = {
    isDirectory: () => true,
  };
  const isMig = {
    isFile: () => true,
  };
  const notDir = {
    isDirectory: () => false,
  };
  afterEach(function () {
    sinon.restore();
  });
  describe('schemaVersionStringToObject', function () {
    it('covers', function () {
      const expected = {
        major: 1,
        minor: 2,
        patch: 3,
      };
      const result = svh.schemaVersionStringToObject('1.2.3');
      assert.deepStrictEqual(result, expected);
    });
  }); // schemaVersionStringToObject

  describe('schemaVersionObjectToNumber', function () {
    it('covers', function () {
      const expected = 1002003;
      const result = svh.schemaVersionObjectToNumber({
        major: 1,
        minor: 2,
        patch: 3,
      });
      assert.strictEqual(result, expected);
    });
  }); // schemaVersionObjectToNumber

  describe('schemaVersionStringToNumber', function () {
    it('covers', function () {
      const expected = 1002003;
      const result = svh.schemaVersionStringToNumber('1.2.3');
      assert.strictEqual(result, expected);
    });
  }); // schemaVersionStringToNumber

  describe('schemaVersionStringCmp', function () {
    it('sorts', function () {
      const expected = ['0.0.0', '1.0.0', '1.5.3', '64.123.998', '64.123.999'];
      const source = ['1.5.3', '64.123.998', '1.0.0', '64.123.999', '0.0.0'];
      source.sort(svh.schemaVersionStringCmp);
      assert.deepStrictEqual(source, expected);
    });
  }); // schemaVersionStringCmp

  describe('isSchemaMigrationDirectory', function () {
    beforeEach(function () {
      sinon.stub(fs, 'statSync');
    });
    it('is directory, is file', function () {
      fs.statSync.returns({
        isDirectory: () => true,
        isFile: () => true,
      });
      const result = svh.isSchemaMigrationDirectory('path', '1.0.0');
      assert.strictEqual(result, true);
    });
    it('is directory, not file', function () {
      fs.statSync.returns({
        isDirectory: () => true,
        isFile: () => false,
      });
      const result = svh.isSchemaMigrationDirectory('path', '1.0.0');
      assert.strictEqual(result, false);
    });
    it('not directory', function () {
      fs.statSync.returns({
        isDirectory: () => false,
        isFile: () => {
          throw new Error('unexpected invocation');
        },
      });
      const result = svh.isSchemaMigrationDirectory('path', '1.0.0');
      assert.strictEqual(result, false);
    });
    it('file error', function () {
      fs.statSync.returns({
        isDirectory: () => true,
        isFile: () => {
          throw new Error('expected error');
        },
      });
      const result = svh.isSchemaMigrationDirectory('path', '1.0.0');
      assert.strictEqual(result, false);
    });
  }); // isSchemaMigrationDirectory

  describe('allSchemaVersions', function () {
    beforeEach(function () {
      sinon.stub(fs, 'readdirSync');
      sinon.stub(fs, 'statSync');
      sinon.stub(svh, 'isSchemaMigrationDirectory');
    });
    it('covers', function () {
      const expected = ['1.0.0', '1.0.1', '1.1.0', '1.1.1', '1.1.2'];
      fs.readdirSync.returns(['1.1.2', 'file.txt', '1.1.0', '1.1.1', 'init.sql', '1.0.1', '1.0.0']);
      // cannot seem to stub isSchemaMigration, so here are the internals of it stubbed
      let i = 0;
      fs.statSync
        .onCall(i++).returns(isDir).onCall(i++).returns(isMig) // '1.1.2'
        .onCall(i++).returns(notDir) // 'file.txt'
        .onCall(i++).returns(isDir).onCall(i++).returns(isMig) // '1.1.0'
        .onCall(i++).returns(isDir).onCall(i++).returns(isMig) // '1.1.1'
        .onCall(i++).returns(notDir) // 'init.sql'
        .onCall(i++).returns(isDir).onCall(i++).returns(isMig) // '1.0.1'
        .onCall(i++).returns(isDir).onCall(i++).returns(isMig) // '1.0.0'
      ;
      const result = svh.allSchemaVersions('path');
      assert.deepStrictEqual(result, expected);
    });
  }); // allSchemaVersions

  describe('unappliedSchemaVersions', function () {
    let current, supported;
    beforeEach(function () {
      sinon.stub(fs, 'readdirSync');
      sinon.stub(fs, 'statSync');
      sinon.stub(svh, 'isSchemaMigrationDirectory');
      supported = {
        min: { major: 1, minor: 0, patch: 1 },
        max: { major: 1, minor: 1, patch: 1 },
      };
      current = { major: 1, minor: 0, patch: 1 };
    });
    it('covers', function () {
      const expected = ['1.1.0', '1.1.1'];
      fs.readdirSync.returns(['1.1.2', 'file.txt', '1.1.0', '1.1.1', 'init.sql', '1.0.1', '1.0.0']);
      // cannot seem to stub isSchemaMigration, so here are the internals of it stubbed
      let i = 0;
      fs.statSync
        .onCall(i++).returns(isDir).onCall(i++).returns(isMig) // '1.1.2'
        .onCall(i++).returns(notDir) // 'file.txt'
        .onCall(i++).returns(isDir).onCall(i++).returns(isMig) // '1.1.0'
        .onCall(i++).returns(isDir).onCall(i++).returns(isMig) // '1.1.1'
        .onCall(i++).returns(notDir) // 'init.sql'
        .onCall(i++).returns(isDir).onCall(i++).returns(isMig) // '1.0.1'
        .onCall(i++).returns(isDir).onCall(i++).returns(isMig) // '1.0.0'
      ;
      const result = svh.unappliedSchemaVersions('path', current, supported);
      assert.deepStrictEqual(result, expected);
    });
  }); // unappliedSchemaVersions

});