#!/usr/bin/env node
/* eslint-disable node/shebang */

'use strict';

const Config = require('../config');
const config = new Config(process.env.NODE_ENV);

console.log(config);
