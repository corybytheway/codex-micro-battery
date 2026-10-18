// Author: Cory McCabe
'use strict';
// An unchanged official product image with code-native SVG indicator overlays.
// Optional documentation tool: npm install --no-save @resvg/resvg-js
const fs = require('node:fs');
const path = require('node:path');
const {batteryFrame} = require('../lib/battery.cjs');
let Resvg;
try { ({Resvg} = require('@resvg/resvg-js')); }
catch { throw new Error('Rendering artwork requires the optional @resvg/resvg-js development tool. The battery helper does not require it.'); }
const root = path.resolve(__dirname, '..');
const output = process.argv[2];
if (!output) throw new Error('Pass a temporary output directory for animation frames.');
fs.mkdirSync(output, {recursive: true});
const photo = fs.readFileSync(path.join(root, 'docs/assets/codex-micro-official.png')).toString('base64');
const percentages = [100, 92, 91, 84, 83, 76, 75, 67, 66, 59, 58, 51, 50, 42, 41, 34, 33, 26, 25, 17, 16, 9, 8, 1, 0];
// Coordinates on a 1600 x 1600 rendering of the supplied 1653px official image.
const positions = [[750, 450], [949, 426], [480, 646], [675, 611], [875, 584], [1072, 545]];
const palette = {green: '#14985b', orange: '#ce7608', red: '#d64040'};
const text = (x, y, size, value, options = '') => `<text x="${x}" y="${y}" font-size="${size}" ${options}>${value}</text>`;
function device(state, x, y, size) {
  const color = palette[state.colorName];
  return `<g transform="translate(${x} ${y}) scale(${size / 1600})"><image width="1600" height="1600" href="data:image/png;base64,${photo}"/>` +
    state.levels.map((entry, i) => {
      const [cx, cy] = positions[i];
      const lit = entry.b > 0;
      return `<circle cx="${cx}" cy="${cy}" r="48" fill="${lit ? color : '#f6f7f4'}" fill-opacity="${entry.b === 0.5 ? 0.56 : 0.94}" stroke="${lit ? color : '#7e8984'}" stroke-width="4"/>` +
        text(cx, cy + 15, 44, entry.b === 1 ? '1' : entry.b ? '½' : '–', `text-anchor="middle" fill="${lit ? '#ffffff' : '#57665d'}" font-weight="700"`);
    }).join('') + '</g>';
}
function svg(state, cover = false) {
  const w = cover ? 1600 : 1200, h = cover ? 900 : 650;
  const color = palette[state.colorName];
  const body = cover ?
    text(80, 92, 20, 'CODEX MICRO / BATTERY LAYER', 'letter-spacing="2" fill="#536359"') +
    text(80, 250, 74, 'Six lights.', 'font-weight="700"') +
    text(80, 338, 74, 'One clear reading.', 'font-weight="700"') +
    text(80, 505, 118, '75%', `font-weight="700" fill="${color}"`) +
    text(85, 557, 25, 'Four full · one half · one off', 'fill="#46584b"') +
    text(85, 650, 24, 'Bottom row empties right to left.') +
    text(85, 689, 24, 'Top-left stays on last.') +
    text(85, 780, 19, '1 = full · ½ = half bright · – = off', 'fill="#536359"') +
    device(state, 620, 80, 920) +
    text(80, 864, 16, 'Official product image: OpenAI × Work Louder · Battery states superimposed', 'fill="#69786f"') :
    text(55, 55, 19, 'THE BATTERY LAYER', 'letter-spacing="2" fill="#536359"') +
    device(state, 5, 0, 720) +
    text(780, 170, 88, state.percent + '%', 'font-weight="700"') +
    text(784, 222, 26, state.percent ? state.colorName.toUpperCase() : 'EMPTY', `font-weight="700" fill="${state.percent ? color : '#69786f'}"`) +
    text(785, 300, 20, 'Bottom row: right to left.') +
    text(785, 338, 20, 'Then top-right. Top-left last.') +
    text(785, 408, 20, 'Two full lights stay orange.') +
    text(785, 446, 20, 'One-and-a-half or less: red.') +
    text(785, 523, 18, '1 full · ½ half bright · – off', 'fill="#536359"') +
    text(55, 624, 14, 'Official image: OpenAI × Work Louder · Superimposed states, not a photograph of the running helper', 'fill="#69786f"');
  return `<svg xmlns="http://www.w3.org/2000/svg" width="${w}" height="${h}" viewBox="0 0 ${w} ${h}"><rect width="${w}" height="${h}" fill="#f6f7f4"/><g font-family="Arial, Helvetica, sans-serif" fill="#1b3023">${body}</g></svg>`;
}
function render(source, file) {
  const renderer = new Resvg(source, {font: {loadSystemFonts: true, defaultFontFamily: 'Arial'}});
  fs.writeFileSync(file, renderer.render().asPng());
}
render(svg(batteryFrame(75), true), path.join(root, 'docs/assets/hero.png'));
const manifest = percentages.map((percent, i) => {
  const file = path.join(output, String(i).padStart(2, '0') + '.png');
  render(svg(batteryFrame(percent)), file);
  return {file, percent, duration: [100, 75, 50, 33, 25, 8, 0].includes(percent) ? 1400 : 420};
});
fs.writeFileSync(path.join(output, 'frames.json'), JSON.stringify(manifest));
console.log('Rendered official-image cover and ' + manifest.length + ' exact battery-state frames.');
