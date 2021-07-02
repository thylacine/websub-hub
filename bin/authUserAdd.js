'use strict';

const argon2 = require('argon2');
const readline = require('readline');
const stream = require('stream');
const DB = require('../src/db');
const Logger = require('../src/logger');
const Config = require('../config');
const config = new Config(process.env.NODE_ENV);

const logger = new Logger(config);
const db = new DB(logger, config);

const identifier = process.argv[2];

if (!identifier) {
  console.log('missing user to add');
  throw new Error('missing argument');
}

async function readPassword(prompt) {
  const input = process.stdin;
  const output = new stream.Writable({
    write: function (chunk, encoding, callback) {
      if (!this.muted) {
        process.stdout.write(chunk, encoding);
      }
      callback();
    },
  });
  const rl = readline.createInterface({ input, output, terminal: !!process.stdin.isTTY });
  rl.setPrompt(prompt);
  rl.prompt();
  output.muted = true;

  return new Promise((resolve) => {
    rl.question('', (answer) => {
      output.muted = false;
      rl.close();
      output.write('\n');
      resolve(answer);
    });
  });
}

(async () => {
  const password = await readPassword('password: ');
  const credential = await argon2.hash(password, { type: argon2.argon2id });
  console.log(`\t${identifier}:${credential}`);
  await db.context(async (dbCtx) => {
    const result = await db.authenticationUpsert(dbCtx, identifier, credential);
    console.log(result);
  });
  console.log('done');
  await db._closeConnection();
})();
