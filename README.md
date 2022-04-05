# Welcome to my WebSub Hub

## What

[WebSub](https://www.w3.org/TR/websub/) is a protocol for subscribing to content updates from publishers.  The Hub is the central component which manages that relationship.

This Hub implementation was created with personal [self-hostable](https://indieweb.org/WebSub) deployment in mind.  It is content-agnostic, supports multiple database backends, and can scale to multiple nodes for robustness and capacity.

## Beware

This is currently a Minimum Viable Product release.  Basic functionality is complete, but the administration experience may be challenging.

## Up And Running

Customize configuration within `config/${NODE_ENV}.js`.  All envs inherit settings from `default.js` if not specified.  Environment is selected using the `NODE_ENV` value, defaulting to `development` if unset.

Database table initialization and schema version migrations are automated.  Configure SQLite with a database file, or point PostgreSQL to a created database.

A user will need to be created in order to view the `/admin` pages; the `bin/authAddUser.js` script will do this.

The bundled logger spews JSON to stdout.

An IndieAuth profile may be used to view any topics associated with that profile.
![IndieAuth view of topics](./documentation/media/topics-indieauth.png)
### Quickstart Example

One way of deploying this server is behind nginx, with the pm2 package to manage the server process, and a local postgres database.  Some details on this are presented here as a rough guide to any parts of this stack which may be unfamiliar.

- Have NodeJS 12-ish available.
- Have PostgreSQL available.
- Clone the server repository.  
  ```git clone https://git.squeep.com/websub-hub```  
- Install the production dependencies.  
  ```cd websub-hub```  
  ```NODE_ENV=production npm i```  
- Create a ```config/production.js``` configuration file.  See ```config/default.js``` for available settings.  
  > <pre>
  > 'use strict';
  > // Minimum required configuration settings
  > module.exports = {
  >   encryptionSecret: 'this is a secret passphrase, it is pretty important to be unguessable',
  >   dingus: {
  >     selfBaseUrl: 'https://hub.squeep.com/',
  >   },
  >   db: {
  >     connectionString: 'postgresql://websubhub:mypassword@localhost/websubhub',
  >   },
  > };
  > </pre>
- Prepare PostgreSQL with a user and database, using e.g. ```psql```.  
  > <pre>
  > CREATE ROLE websubhub WITH CREATEDB LOGIN PASSWORD 'mypassword';
  > GRANT websubhub TO postgres
  > CREATE DATABASE websubhub OWNER=websubhub;
  > GRANT ALL PRIVILEGES ON DATABASE websubhub TO websubhub;
  > \c websubhub
  > CREATE EXTENSION IF NOT EXISTS pg_stat_statements;
  > </pre>
- Install the process manager, system-wide.  
  ```npm i -g pm2```
- Configure the process manager to keep the server logs from growing unbounded.  
  ```pm2 install pm2-logrotate```  
  ```pm2 set pm2-logrotate:rotateInterval '0 0 1 * *'``` (rotate monthly)  
  ```pm2 set pm2-logrotate:compress true```  
  ```pm2 startup``` (arrange to start process monitor on system boot)  
- Launch the server, running one process per CPU, and persist it through reboots.
  ```NODE_ENV=production pm2 start server.js --name websubhub -i max```  
  ```pm2 save```
- Create an administration user.
  ```NODE_ENV=production node bin/authUserAdd.js admin```
- Copy the static files to somewhere nginx will serve them from.  This will vary greatly depending on your setup.  
  ```cp -rp static /home/websubhub/hub.squeep.com/html/static```
- Expose the server through nginx.  
  > <pre>
  > server {
  >   listen 443 ssl http2;
  >   ssl_certificate /etc/ssl/nginx/server-chain.pem;
  >   ssl_certificate_key /etc/ssl/nginx/server.key;
  >   server_name hub.squeep.com;
  >   root /home/websubhub/hub.squeep.com/html
  >   try_files $uri $uri/ @websubhub;
  > 
  >   location @websubhub {
  >     proxy_pass http://websubhub$uri;
  >     proxy_set_header Host $host;
  >     proxy_set_header X-Forwarded-For $remote_addr;
  >     proxy_set_header X-Forwarded-Proto $scheme;
  >     proxy_http_version 1.1;
  >   }
  > 
  >   location = / {
  >     proxy_pass http://websubhub$is_args$args;
  >     proxy_set_header Host $host;
  >     proxy_set_header X-Forwarded-For $remote_addr;
  >     proxy_set_header X-Forwarded-Proto $scheme;
  >     proxy_http_version 1.1;
  >   }
  > }
  > </pre>
  ```nginx -s reload```
- The Hub server should now be available!

## Frills

A rudimentary tally of a topic's subscribers is available on the `/info?topic=topicUrl` endpoint.  The topicUrl should be URI encoded.  Formats available are SVG badge, JSON, and plain text, selectable by setting e.g. `format=svg` in the query parameters.

## Architecture

The Hub keeps track of three primary entities:

- Topics: data and metadata for a published content endpoint.  Topics are unique by source URL.
- Subscriptions: the relationship between a client requesting content and the topic providing it.  Subscriptions are unique by topic and client URL.
- Verifications: updates to subscriptions which are pending confirmation.  Verifications are not unique, but only the most recent for any Subscription pairing will be acted upon.

Any tasks in progress (notably: fetching new topic content, distributing that content to subscribers, or confirming pending verifications) are doled out and managed by a cooperative advisory locking mechanism.  The task queue is wrangled in the database within the `*_in_progress` tables.

![Entity relationship diagram for Postgres engine](./documentation/media/postgres-er.svg)

A Hub node will periodically check for more tasks to perform, executing them up to a set concurrency limit.

### Quirks

This implementation is built atop an in-house API framework, for Reasons.  It would not be hard to replace such with something more mainstream, but that is not currently a design goal.

### File Tour

- bin/ - utility scripts
- config/
  - default.js - defines all configuration parameters' default values
  - index.js - merges an environment's values over defaults
  - *.js - environment specific values, edit these as needed
- server.js - launches the application server
- src/
  - common.js - utility functions
  - communication.js - outgoing requests and associated logic
  - db/
    - base.js - abstract database class that any engine will implement
    - errors.js - database Error types
    - index.js - database factory
    - schema-version-helper.js - schema migrations aide
    - postgres/
      - index.js - PostgreSQL implementation
      - listener.js - notify/listen connection to support topic content caching
      - sql/ - statements and schemas
    - sqlite/
      - index.js - SQLite implementation
      - sql/ - statements and schemas
  - enum.js - invariants
  - errors.js - local Error types
  - link-helper.js - processes Link headers
  - logger/ - adds service-specific data filters to our logging module
  - manager.js - process incoming requests
  - service.js - defines incoming endpoints, linking the API server framework to the manager methods
  - template/ - HTML content
  - worker.js - maintains a pool of tasks in progress, for sending out updates, performing verifications, et cetera
- static/ - static assets
- test/ - unit and coverage tests
- test-e2e/ - support for whole-service testing
