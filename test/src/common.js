/* eslint-env mocha */
'use strict';

const assert = require('assert');
const common = require('../../src/common');

describe('Common', function () {
  
  describe('freezeDeep', function () {
    it('freezes things', function () {
      const obj = {
        sub1: {
          sub2: {
            foo: 'blah',
          },
        },
      };
      const result = common.freezeDeep(obj);
      assert(Object.isFrozen(result));
      assert(Object.isFrozen(result.sub1));
      assert(Object.isFrozen(result.sub1.sub2));
      assert(Object.isFrozen(result.sub1.sub2.foo));
    });
  }); // freezeDeep

  describe('axiosResponseLogData', function () {
    it('covers', function () {
      const response = {
        status: 200,
        statusText: 'OK',
        headers: {
          'Content-Type': 'text/plain',
        },
        otherData: 'blah',
        data: 'Old Mother West Wind had stopped to talk with the Slender Fir Tree. "I\'ve just come across the Green Meadows," said Old Mother West Wind, “and there I saw the Best Thing in the World.”',
      };
      const expected = {
        status: 200,
        statusText: 'OK',
        headers: {
          'Content-Type': 'text/plain',
        },
        data: 'Old Mother West Wind had stopped to talk with the Slender Fir Tree. "I\'ve just come across the Green... (184 bytes)',
      };
      const result = common.axiosResponseLogData(response);
      assert.deepStrictEqual(result, expected);
    });
    it('covers no data', function () {
      const response = {
        status: 200,
        statusText: 'OK',
        headers: {
          'Content-Type': 'text/plain',
        },
      };
      const expected = {
        status: 200,
        statusText: 'OK',
        headers: {
          'Content-Type': 'text/plain',
        },
      };
      const result = common.axiosResponseLogData(response);
      assert.deepStrictEqual(result, expected);
    });
  }); // axiosResponseLogData

  describe('topicLeaseDefaults', function () {
    it('supplies necessary properties', function () {
      const result = common.topicLeaseDefaults();
      assert('leaseSecondsPreferred' in result);
      assert.strictEqual(typeof result.leaseSecondsPreferred, 'number');
      assert('leaseSecondsMax' in result);
      assert.strictEqual(typeof result.leaseSecondsMax, 'number');
      assert('leaseSecondsMin' in result);
      assert.strictEqual(typeof result.leaseSecondsMin, 'number');
    });
    it('cannot be changed', function () {
      const result = common.topicLeaseDefaults();
      const origMin = result.leaseSecondsMin;
      try {
        result.leaseSecondsMin += 10;
        assert.fail('assign should fail');
      } catch (e) {
        assert(e instanceof TypeError);
      }
      assert.strictEqual(result.leaseSecondsMin, origMin);
    });
  }); // topicLeaseDefaults

  describe('attemptRetrySeconds', function () {
    const retries = [0, 1, 2];
    const jitter = 0;
    it('defaults without a number', function () {
      const result = common.attemptRetrySeconds('not a number', retries, jitter);
      assert.strictEqual(result, retries[0]);
    });
    it('brackets lower range', function () {
      const result = common.attemptRetrySeconds(-10, retries, jitter);
      assert.strictEqual(result, retries[0]);
    });
    it('brackets upper range', function () {
      const result = common.attemptRetrySeconds(10, retries, jitter);
      assert.strictEqual(result, retries[retries.length - 1]);
    });
    it('covers middle', function () {
      const result = common.attemptRetrySeconds(1, retries, jitter);
      assert.strictEqual(result, retries[1]);
    });
    it('covers default', function () {
      const result = common.attemptRetrySeconds(0);
      assert(result >= 60);
      assert(result <= 60 * 1.618)
    });
  }); // attemptRetrySeconds

  describe('arrayChunk', function () {
    it('covers default', function () {
      const result = common.arrayChunk([1, 2, 3]);
      assert.deepStrictEqual(result, [[1], [2], [3]]);
    });
    it('covers remainders', function () {
      const result = common.arrayChunk([1, 2, 3], 2);
      assert.deepStrictEqual(result, [[1, 2], [3]]);
    });
  }); // arrayChunk

  describe('stackSafePush', function () {
    it('pushes', function () {
      const bigArray = new Array(2**18);
      const dst = [];

      common.stackSafePush(dst, bigArray);

      assert.strictEqual(dst.length, bigArray.length);
    });
  }); // stackSafePush

  describe('logTruncate', function () {
    it('returns short string', function () {
      const str = 'this is a short string';
      const result = common.logTruncate(str, 100);
      assert.strictEqual(result, str);
    });
    it('truncates long string', function () {
      const str = 'this is not really a very long string but it is long enough for this test';
      const result = common.logTruncate(str, 10);
      assert(result.length < str.length);
    });
  }); // logTruncate

  describe('validHash', function () {
    it('should succeed', function () {
      const result = common.validHash('sha256');
      assert.strictEqual(result, true);
    });
    it('should fail', function () {
      const result = common.validHash('md5');
      assert.strictEqual(result, false);
    });
  }); // validHash

}); // Common
