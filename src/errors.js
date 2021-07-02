'use strict';

const { Errors } = require('@squeep/api-dingus');

class DatabaseError extends Error {
  constructor(...args) {
    super(...args);
    Error.captureStackTrace(DatabaseError);
  }

  get name() {
    /* istanbul ignore next */
    return this.constructor.name;
  }
}

class InternalInconsistencyError extends Error {
  constructor(...args) {
    super(...args);
    Error.captureStackTrace(InternalInconsistencyError);
  }

  get name() {
    /* istanbul ignore next */
    return this.constructor.name;
  }
}

module.exports = {
  ...Errors,
  DatabaseError,
  InternalInconsistencyError,
};