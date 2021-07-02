'use strict';

const { DatabaseError } = require('../errors');

class DataValidation extends DatabaseError {
  constructor(...args) {
    super(...args);
    Error.captureStackTrace(DataValidation);
  }
}

class NotImplemented extends DatabaseError {
  constructor(...args) {
    super(...args);
    Error.captureStackTrace(NotImplemented);
  }
}

class UnexpectedResult extends DatabaseError {
  constructor(...args) {
    super(...args);
    Error.captureStackTrace(UnexpectedResult);
  }
}

class UnsupportedEngine extends DatabaseError {
  constructor(...args) {
    super(...args);
    Error.captureStackTrace(UnsupportedEngine);
  }
}

class MigrationNeeded extends DatabaseError {
  constructor(...args) {
    super(...args);
  }
}

module.exports = {
  DataValidation,
  MigrationNeeded,
  NotImplemented,
  UnexpectedResult,
  UnsupportedEngine,
};
