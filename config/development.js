'use strict';

module.exports = {
  logger: {
    ignoreBelowLevel: 'debug',
  },
  db: {
    connectionString: `postgresql://${encodeURIComponent('/home/develop/websub-hub/postgres_dev-13')}/websubhub`,
  },
};
