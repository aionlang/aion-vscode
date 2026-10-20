'use strict';

// Writes icons/aion.svg and icons/aion-project.svg.  Run it from the extension folder:
//
//     node scripts/make-icons.js
//
// It also writes icons/icon.png, the 256 x 256 picture for the marketplace listing (needs the
// @resvg/resvg-js dev dependency).
//
// Both icons use the Aion logo (the two paths of docs/img/logo.svg in the compiler repository).
// The project icon adds a gear in the top right corner and cuts a gap round it out of the logo, so
// it reads on a light and a dark background alike.

const fs = require('fs');
const path = require('path');

const BLUE = '#4377df';
const GEAR = '#8b949e';

const LOGO = [
  'M73 15H817L598 344H292Z',
  'M292 445H598L817 865H649L622 814H267L241 865H73ZM405 550L323 707H566L484 550Z',
];
const LOGO_BOX = { x: 73, y: 14, width: 744, height: 852 };

const round = (n) => Math.round(n * 100) / 100;

/** The logo scaled to `height` units, with its top left corner at (x, y). */
function logoGroup(x, y, height) {
  const scale = height / LOGO_BOX.height;
  const transform = `translate(${round(x)} ${round(y)}) scale(${round(scale * 10000) / 10000}) translate(${-LOGO_BOX.x} ${-LOGO_BOX.y})`;
  return { transform, width: LOGO_BOX.width * scale };
}

/**
 * The outline of a gear as a path: `teeth` trapezoidal teeth between a root and an outer radius,
 * and a round hole in the middle (drawn with the even-odd rule).
 */
function gearPath(cx, cy, outer, root, hole, teeth) {
  const step = (Math.PI * 2) / teeth;
  // fractions of one step: the tooth's flank starts, its top starts, its top ends, its flank ends
  const marks = [
    [0.1, root],
    [0.24, outer],
    [0.5 - 0.1, outer],
    [0.5 + 0.04, root],
  ];
  const points = [];
  for (let i = 0; i < teeth; i++) {
    for (const [fraction, radius] of marks) {
      const angle = (i + fraction) * step - Math.PI / 2;
      points.push([cx + radius * Math.cos(angle), cy + radius * Math.sin(angle)]);
    }
  }
  const outline = 'M' + points.map(([x, y]) => `${round(x)} ${round(y)}`).join('L') + 'Z';
  const circle =
    `M${round(cx + hole)} ${round(cy)}` +
    `A${hole} ${hole} 0 1 0 ${round(cx - hole)} ${round(cy)}` +
    `A${hole} ${hole} 0 1 0 ${round(cx + hole)} ${round(cy)}Z`;
  return outline + circle;
}

function fileIcon() {
  const { width } = logoGroup(0, 0, 84);
  const placed = logoGroup((100 - width) / 2, 8, 84);
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 100 100" width="16" height="16">
  <title>Aion</title>
  <g fill="${BLUE}" fill-rule="evenodd" transform="${placed.transform}">
${LOGO.map((d) => `    <path d="${d}"/>`).join('\n')}
  </g>
</svg>
`;
}

function projectIcon() {
  const gear = { cx: 74, cy: 26, outer: 23, root: 18, hole: 7, teeth: 8 };
  const gap = gear.outer + 3.5;
  const placed = logoGroup(3, 14, 84);
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 100 100" width="16" height="16">
  <title>Aion project</title>
  <defs>
    <mask id="gap" maskUnits="userSpaceOnUse" x="0" y="0" width="100" height="100">
      <rect width="100" height="100" fill="#fff"/>
      <circle cx="${gear.cx}" cy="${gear.cy}" r="${gap}" fill="#000"/>
    </mask>
  </defs>
  <g mask="url(#gap)">
    <g fill="${BLUE}" fill-rule="evenodd" transform="${placed.transform}">
${LOGO.map((d) => `      <path d="${d}"/>`).join('\n')}
    </g>
  </g>
  <path fill="${GEAR}" fill-rule="evenodd" d="${gearPath(gear.cx, gear.cy, gear.outer, gear.root, gear.hole, gear.teeth)}"/>
</svg>
`;
}

const BACKGROUND = '#101826';

/** The logo on a dark rounded square, for the marketplace. */
function marketplaceIcon() {
  const { width } = logoGroup(0, 0, 176);
  const placed = logoGroup((256 - width) / 2, 40, 176);
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 256 256" width="256" height="256">
  <title>Aion</title>
  <rect width="256" height="256" rx="48" fill="${BACKGROUND}"/>
  <g fill="${BLUE}" fill-rule="evenodd" transform="${placed.transform}">
${LOGO.map((d) => `    <path d="${d}"/>`).join('\n')}
  </g>
</svg>
`;
}

const dir = path.join(__dirname, '..', 'icons');
fs.mkdirSync(dir, { recursive: true });
fs.writeFileSync(path.join(dir, 'aion.svg'), fileIcon());
fs.writeFileSync(path.join(dir, 'aion-project.svg'), projectIcon());
fs.writeFileSync(path.join(dir, 'icon.svg'), marketplaceIcon());

const { Resvg } = require('@resvg/resvg-js');
const png = new Resvg(marketplaceIcon(), { fitTo: { mode: 'width', value: 256 } }).render().asPng();
fs.writeFileSync(path.join(dir, 'icon.png'), png);
console.log('wrote icons/aion.svg, icons/aion-project.svg, icons/icon.svg and icons/icon.png');
