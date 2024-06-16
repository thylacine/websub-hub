'use strict';

const th = require('./template-helper');


const ctxDefaults = {
  charWidth: 7.2,
  height: 20,
  labelColor: '#444',
  messageColor: '#f73',
  color: '#fff',
  fontFamily: 'DejaVu Sans,Verdana,Geneva,sans-serif',
};


/**
 *
 * @param {number} n number
 * @param {number} p precision
 * @returns {number} rounded
 */
function fixedRound(n, p = 2) {
  return Number(n.toFixed(p));
}


/**
 * image/svg+xml;charset=utf-8 formatted badge with subscriber count for a topic
 * @param {object} ctx - badge-specific context (not request context)
 * @param {string} label label
 * @param {string} message message
 * @param {string} accessibleText accessible text
 * @returns {string} svg element
 */
module.exports = (ctx, label, message, accessibleText) => {

  ctx = {
    ...ctxDefaults,
    ...ctx,
    label,
    message,
    accessibleText,
  };
  ctx.verticalMargin = fixedRound(ctx.height * 0.69);
  ctx.labelWidth = fixedRound(ctx.label.length * ctx.charWidth);
  ctx.messageWidth = fixedRound(ctx.message.length * ctx.charWidth);
  ctx.width = ctx.labelWidth + ctx.messageWidth;
  ctx.halfCharWidth = fixedRound(ctx.charWidth * 0.5);

  /* 
   * This SVG content mostly replicates the output of the 'Plastic' badge
   * renderer from https://github.com/badges/shields/tree/master/badge-maker which
   * is under the http://creativecommons.org/publicdomain/zero/1.0/ license.
   */
  return `<svg xmlns="http://www.w3.org/2000/svg" xmlns:xlink="http://www.w3.org/1999/xlink" width="${ctx.width}" height="${ctx.height}" role="img" aria-label="${th.xmlEscape(ctx.accessibleText)}">
  <title>${th.xmlEscape(ctx.accessibleText)}</title>
  <linearGradient id="s" x2="0" y2="100%">
    <stop offset="0"  stop-color="#fff" stop-opacity=".7"/>
    <stop offset=".1" stop-color="#aaa" stop-opacity=".1"/>
    <stop offset=".9" stop-color="#000" stop-opacity=".3"/>
    <stop offset="1"  stop-color="#000" stop-opacity=".5"/>
  </linearGradient>
  <clipPath id="r">
    <rect width="${ctx.width}" height="${ctx.height}" rx="4" fill="#fff"/>
  </clipPath>
  <g clip-path="url(#r)">
    <rect width="${ctx.labelWidth}" height="${ctx.height}" fill="${ctx.labelColor}"/>
    <rect x="${ctx.labelWidth}" width="${ctx.messageWidth}" height="${ctx.height}" fill="${ctx.messageColor}"/>
    <rect width="${ctx.width}" height="${ctx.height}" fill="url(#s)"/>
  </g>
  <g fill="${ctx.color}" text-anchor="left" font-family="${ctx.fontFamily}" text-rendering="geometricPrecision" font-size="11" font-weight="bold">
    <text x="${ctx.halfCharWidth}" y="${ctx.verticalMargin}">${th.xmlEscape(ctx.label)}</text>
    <text x="${fixedRound(ctx.halfCharWidth + ctx.labelWidth)}" y="${ctx.verticalMargin}">${th.xmlEscape(ctx.message)}</text>
  </g>
</svg>`;
};
