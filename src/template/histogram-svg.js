'use strict';

const th = require('./template-helper');

const optionsDefaults = {
  barWidth: 20,
  barHeight: 100,
  scaleBars: true,
  barCaptionFn: () => '',
  labelZero: undefined,
  labelX: undefined,
  labelHeight: 8,
  fontFamily: 'DejaVu Sans,Verdana,Geneva,sans-serif',
  frameColor: 'gray',
  tickEvery: undefined,
  tickHeight: 4,
  tickColor: 'gray',
  minItems: 0,
  maxItems: undefined,
};

function grey(percent) {
  const value = Math.round(95 * (1.0 - percent));
  return `rgb(${value}%, ${value}%, ${value}%)`;
}

function svgHeader(options, width, height) {
  return [
    `<svg
version="1.1"
baseProfile="full"
xmlns="http://www.w3.org/2000/svg"
xmlns:xlink="http://www.w3.org/1999/xlink"
xmlns:ev="http://www.w3.org/2001/xml-events"
width="${width}px" height="${height}px"
viewBox="0 0 ${width} ${height}"
preserveAspectRatio="xMinYMin meet"`,
    options.accessibleText ? ` role="img" aria-label="${th.xmlEscape(options.accessibleText)}"` : '',
    '>',
    options.title ? `<title>${th.xmlEscape(options.title)}</title>` : '',
    options.description ? `<desc>${th.xmlEscape(options.description)}</desc>` : '',
    '\n',
  ];
}

function svgFrame(options, width) {
  if (!options.frameColor) {
    return '';
  }
  return `\t<g id="frame">
\t\t<rect x="0.5px" y="0.5px" width="${width - 1}px" height="${options.barHeight - 1}px" fill="none" stroke="${options.frameColor}" />
\t</g>\n`;
}

function svgTicks(options, width) {
  if (!options.tickEvery) {
    return '';
  }
  const tickSpacing = options.tickEvery * options.barWidth;
  const tickOffset = options.barWidth / 2;
  const numTicks = Math.ceil(width / tickSpacing);
  const ticks = Array.from({ length: numTicks }, (_, i) => i)
    .map((index) => `M ${(index * tickSpacing) + tickOffset} ${options.barHeight - 2} v ${options.tickHeight}`)
    .join(' ');

  return `\t<g id="ticks">
\t<path d="${ticks}" stroke="${options.tickColor}" fill="none" stroke-width="0.5px" />
\t</g>\n`;
}

function svgLabels(options, width, height) {
  const labels = [];
  if (!options.labelHeight) {
    return labels;
  }
  labels.push(`\t<g font-size="${options.labelHeight}px" font-family="${options.fontFamily}" font-variant="small-caps">\n`);
  const y = height - (options.labelHeight / 2) + 2;
  if (options.labelZero) {
    labels.push(`\t\t<text font-size="${options.labelHeight}px" text-anchor="start" x="0" y="${y}">${options.labelZero}</text>\n`);
  }
  if (options.labelX) {
    labels.push(`\t\t<text text-anchor="middle" x="${width / 2}" y="${y}">${options.labelX}</text>\n`);
  }
  labels.push('\t</g>\n');
  return labels;
}

function svgFooter() {
  return '</svg>';
}

function svgBar(options, value, index, maxValue) {
  const id = `i${index}`;
  const x = options.barWidth * index;
  const width = options.barWidth;
  const height = options.barHeight;
  const scale = value / Math.max(1, maxValue);
  const scaleHeight = options.scaleBars ? height * scale : height;
  const yOffset = height - scaleHeight;
  const fill = grey(scale);
  const emptyFill =  grey(0);
  const title = th.xmlEscape(options.barCaptionFn(index, value));
  return [
    ...(options.scaleBars && [
      `\t<rect id="${id}" x="${x}" y="0" width="${width}" height="${height}" fill="${emptyFill}">`,
      ...(title && `<title>${title}</title>`),
      '\t</rect>\n',
    ]),
    `\t<rect id="${id}" x="${x}" y="${yOffset}" width="${width}" height="${scaleHeight}" fill="${fill}">`,
    ...(title && `<title>${title}</title>`),
    '\t</rect>\n',
  ].join('');
}

module.exports = (items, options = {}) => {
  options = Object.assign({}, optionsDefaults, options);

  const maxValue = items.reduce((a, b) => Math.max(a, b), 0);
  const hasLabel = !!options.labelX || !!options.labelZero;
  const height = options.barHeight + 2 + (hasLabel ? options.labelHeight + 2 : 0);
  const width = Math.max(items.length, options.minItems) * options.barWidth;

  return [
    ...svgHeader(options, width, height),
    ...items.slice(0, options.maxItems).map((value, index) => svgBar(options, value, index, maxValue)),
    svgFrame(options, width),
    svgTicks(options, width),
    ...svgLabels(options, width, height),
    svgFooter(),
  ].join('');
};