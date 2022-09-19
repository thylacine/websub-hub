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
    Cookie: 'Cookie',
    From: 'From',
    LastSeen: 'Last-Seen',
    Link: 'Link',
    Location: 'Location',
    SetCookie: 'Set-Cookie',
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

  Message : {
    BeginningOfTime: 'Beginning of Time',
    EndOfTime: 'End of Time',
    Never: 'Never',
    NextPublish: 'Next Publish',
    NoSuchTopicId: 'no such topic id',
    Pending: 'Pending',
    Unknown: 'Unknown',
  },
});

module.exports = common.freezeDeep(Enum);