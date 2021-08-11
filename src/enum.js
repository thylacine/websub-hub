'use strict';

const common = require('./common');
const { Enum: DingusEnum } = require('@squeep/api-dingus');

const Enum = common.mergeDeep(DingusEnum, {
  Specification: 'W3C.REC-websub-20180123',

  Mode: {
    Denied: 'denied',
    Publish: 'publish',
    Subscribe: 'subscribe',
    Unsubscribe: 'unsubscribe',
  },
  
  Header: {
    Authorization: 'Authorization',
    From: 'From',
    LastSeen: 'Last-Seen',
    Link: 'Link',
    Location: 'Location',
    Signature: 'Signature',
    UserAgent: 'User-Agent',
    WWWAuthenticate: 'WWW-Authenticate',
    XHubSignature: 'X-Hub-Signature',
  },

  ContentType: {
    ApplicationAtom: 'application/atom+xml',
    ApplicationOctetStream: 'application/octet-stream',
    ApplicationRDF: 'application/rdf+xml',
    ApplicationRSS: 'application/rss+xml',
    ApplicationXML: 'application/xml',
    ImageSVG: 'image/svg+xml',
    TextXML: 'text/xml',
  },
});

module.exports = common.freezeDeep(Enum);