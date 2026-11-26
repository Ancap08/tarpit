// Render static review screens with the repo's Chromium, without a web server.
import assert from 'node:assert/strict';
import { readFile, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { chromium } from '@playwright/test';

const root = fileURLToPath(new URL('../../', import.meta.url));
const output = join(root, 'docs/review/m54');
const scratch = process.argv[2];
assert.ok(scratch, 'Supply the prepared scratch directory.');
const fixture = JSON.parse(await readFile(join(scratch, 'fixture.json'), 'utf8'));
const sprites = JSON.parse(await readFile(join(scratch, 'sprites.json'), 'utf8'));

const inks = {
  coin: '<circle cx="12" cy="12" r="8.6"/><path d="m12 8 .01 8m-2.5-6.1c0-2.4 5-2.4 5 0 0 2-5 1.4-5 3.8 0 2.5 5 2.5 5 0"/>',
  heart: '<path d="M12 20 4.1 12.1C-.3 7.7 6.3 2 10.4 6.3L12 8l1.6-1.7c4.1-4.3 10.7 1.4 6.3 5.8Z"/>',
  wave: '<path d="M2 9c3.3 0 4-3 7.3-3s4.1 3 7.4 3c2.2 0 3.3-1.2 5.3-2M2 15c3.3 0 4-3 7.3-3s4.1 3 7.4 3c2.2 0 3.3-1.2 5.3-2"/>',
  pause: '<path d="M9 5v14m6-14v14" stroke-width="3.25"/>',
  audio: '<path d="M3 10h4l5-4v12l-5-4H3Zm12-1a4 4 0 0 1 0 6m3-9a8 8 0 0 1 0 12"/>',
  next: '<path d="m5 5 8 7-8 7Zm11 0v14"/>',
  play: '<path d="m8 5 11 7-11 7Z"/>',
  back: '<path d="m13 5-7 7 7 7m-7-7h13"/>',
  arrow: '<path d="m11 5 7 7-7 7m7-7H5"/>',
  close: '<path d="m6 6 12 12M18 6 6 18"/>',
  bolt: '<path d="m13.8 2-9 12h6L10 22l9-12h-6Z"/>',
  target: '<circle cx="12" cy="12" r="7"/><circle cx="12" cy="12" r="2.25"/><path d="M12 2v4m10 6h-4m-6 10v-4M2 12h4"/>',
  volley: '<path d="m6 18 9-9M6 18h5m-5 0v-5M9 9l6-6m1 13 5-5"/>',
  crown: '<path d="m3 6 2.7 11h12.6L21 6l-5.5 4L12 4l-3.5 6ZM7 21h10"/>',
  window: '<rect x="5" y="3" width="14" height="18" rx="2"/><path d="M12 3v18M5 12h14"/>',
  sparkle: '<path d="m12 2 2.5 7.5L22 12l-7.5 2.5L12 22l-2.5-7.5L2 12l7.5-2.5Z"/>',
  star: '<path d="m12 2 3 6 6.6 1-4.8 4.7 1.1 6.6-5.9-3.2-5.9 3.2 1.1-6.6-4.8-4.7L9 8Z"/>',
  flag: '<path d="M5 21V3m0 1c5-3 9 3 15 0v10c-6 3-10-3-15 0"/>',
  replay: '<path d="M4 10a8 8 0 1 1 0 5m0-11v6h6"/>',
  map: '<path d="m3 6 6-3 6 3 6-3v15l-6 3-6-3-6 3zm6-3v15m6-12v15"/>',
};
const icon = (name, cls = '') => `<svg class="icon ${cls}" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.75" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${inks[name]}</svg>`;
const uri = (file) => pathToFileURL(join(scratch, file)).href;
const gameArt = (kind, angle = 6) => uri(`${kind}-${angle}.png`);
const caslon = pathToFileURL(join(root, 'assets/fonts/LibreCaslonText-Regular-latin.woff2')).href;
const caslonBold = pathToFileURL(join(root, 'assets/fonts/LibreCaslonText-Bold-latin.woff2')).href;
const town = pathToFileURL(join(root, 'assets/art-painted/town-portraits/scuffed.webp')).href;

const builds = [
  ['musketeer','Musketeer',71], ['cannon','Cannon',114], ['tar-pit','Tar Pit',86],
  ['longbow','Longbow',57], ['mortar','Mortar',157], ['fire-pot','Fire Pot',100],
];
const towerKinds = { firepot: 'fire-pot', tarpit: 'tar-pit' };
const buttons = (label, glyph, cls = '', contents = '') =>
  `<button class="${cls}" aria-label="${label}">${glyph ? icon(glyph) : ''}${contents || (!glyph ? label : '')}</button>`;
const stars = (earned) => [0,1,2].map(index =>
  `<span class="${index < earned ? 'earned' : 'empty'}">${icon(index === 2 ? 'sparkle' : 'star')}</span>`).join('');

function hud(theme) {
  const stat = (key, glyph, value, suffix = '') =>
    `<div class="stat ${key.toLowerCase()}">${icon(glyph)}<span><small>${key}</small><b>${value}${suffix}</b></span></div>`;
  const wave = fixture.hud.wave.replace('Wave ', '').split('/');
  const wavePips = `<span class="wave-pips">${Array.from({ length: Number(wave[1]) }, (_, i) =>
    `<i class="${i < Number(wave[0]) - 1 ? 'passed' : i === Number(wave[0]) - 1 ? 'live' : ''}"></i>`).join('')}</span>`;
  const top = `<div class="hud-heading"><span class="stage"><b>Level 11</b><i></i>Window Money</span>
    <div class="hud-tools">${buttons('Sound', 'audio')}${buttons('Pause', 'pause')}</div></div>`;
  const stats = `<div class="stats">${stat('Gold', 'coin', fixture.hud.gold.split(' ')[1])}
    ${stat('Lives', 'heart', fixture.hud.lives.split(' ')[1])}
    ${stat('Wave', 'wave', wave[0], `<em>/${wave[1]}</em>`)}
    ${wavePips}</div>`;
  const next = fixture.hud.next.replace('Next: ', '');
  const report = `<div class="hud-report"><span>${icon('window')}Window Tax</span>
    <span><b>Next</b> ${next}</span></div>`;
  const special = buttons('Special ready', null, 'special', `<span class="charge">${icon('bolt')}</span>
    <span class="action-text"><b>Special</b><small>Ready</small></span>`);
  const waveButton = buttons(fixture.hud.startWave, 'next', 'call',
    `<span class="action-text"><b>Call next</b><small>${fixture.hud.startWave.split('+')[1] ? '+' + fixture.hud.startWave.split('+')[1] : ''} gold</small></span>`);
  return `<header class="hud">${top}${stats}${report}</header>
    <footer class="dock"><div class="build">${builds.map(([kind, label, price], index) =>
      `<button aria-label="${label}, ${price} gold" class="build-item hue-${index}">
      <img src="${gameArt(kind)}" alt=""><span class="build-label"><b>${label}</b><span>${price}</span></span></button>`).join('')}</div>
    <div class="controls">${special}${waveButton}${buttons('1× speed', theme === 'b' ? 'wave' : null, 'speed', '<b>1×</b>')}</div></footer>`;
}

function positionOnRoad(distance) {
  const road = [[0,384], [300,384], [300,96], [660,96], [660,384], [960,384]];
  for (let i = 1; i < road.length; i++) {
    const [x, y] = road[i - 1];
    const dx = road[i][0] - x;
    const dy = road[i][1] - y;
    const length = Math.abs(dx) + Math.abs(dy);
    if (distance <= length) return { x: x + dx * distance / length, y: y + dy * distance / length, dx, dy };
    distance -= length;
  }
  throw new RangeError('Enemy outside the road.');
}

function battlefield(wide, upgrade) {
  const map = wide ? { x: 0, y: 0, w: 960, h: 480, scale: 1 }
    : { x: 24, y: 130, w: 342, h: 578, scale: .684 };
  const project = (x, y) => wide ? [x, y]
    : [map.x + (480 - y) * map.w / 480, map.y + x * map.h / 960];
  const xy = ([x, y]) => `left:${x}px;top:${y}px`;
  const cell = (col, row) => project(col * 32 + 16, row * 32 + 16);
  const towerIndex = [[12,0],[0,6],[12,12],[4,4],[4,12]];
  const pieces = fixture.towers.map(({ col, row, type }, i) => {
    const [x, y] = cell(col, row);
    return { kind: towerKinds[type] || type, x, y, frame: towerIndex[i][Number(wide)], turret: i };
  });
  for (const { distance, type, hpRatio } of fixture.crowd) {
    const { x, y, dx, dy } = positionOnRoad(distance);
    const [sx, sy] = project(x, y);
    const [rx, ry] = wide ? [dx,dy] : [-dy,dx];
    const frame = ry < 0 ? 0 : rx > 0 ? 4 : ry > 0 ? 8 : 12;
    pieces.push({ kind: type, x: sx, y: sy, frame, hpRatio, flyer: type === 'harpy' });
  }
  pieces.sort((a, b) => (a.flyer ? 1000 : 0) - (b.flyer ? 1000 : 0) || a.y - b.y);
  const first = fixture.towers[0];
  const selected = cell(first.col, first.row);
  const spots = [[6,8],[7,5],[13,1],[16,1],[22,5],[23,6],[26,9],[27,10]];
  const impact = project(300, 339);
  const impacts = [project(563, 96), impact];
  const plate = wide ? 'board-wide.png' : 'phone-extended.png';
  const ringSize = map.scale * 250;
  return `<div class="terrain" style="background-image:url('${uri(plate)}')"></div><div class="lighting"></div>
    <div class="spots">${spots.map(([col, row]) => `<i class="spot" style="${xy(cell(col, row))}"><i></i></i>`).join('')}</div>
    <div class="reach ${upgrade ? 'selected' : ''}" style="${xy(selected)};--range:${ringSize}px"></div>
    ${pieces.map(({ kind, x, y, frame, turret, hpRatio, flyer }) => {
      const { size: [width, height], anchor: [ax, ay] } = sprites[kind];
      const scale = map.scale / 2 * (flyer ? .94 : 1);
      const top = (flyer ? -5 * map.scale : 0) - ay * scale;
      const isTower = turret !== undefined;
      const hp = hpRatio < 1 ? `<i class="health ${hpRatio < .4 ? 'low' : ''}"
        style="top:${Math.round(top + 1)}px;--hp:${hpRatio * 100}%"><i></i></i>` : '';
      return `<div class="piece ${isTower ? 'defender' : 'enemy'} ${turret === 0 ? 'tier-two' : ''}"
        style="${xy([x,y])}">${isTower ? '<i class="foot"></i>' : ''}
        <img src="${gameArt(kind, frame)}" alt="" style="width:${width * scale}px;height:${height * scale}px;
        left:${-ax * scale}px;top:${top}px">${hp}${turret === 0 ? '<i class="tier"></i>' : ''}</div>`;
    }).join('')}
    ${impacts.map((pos, i) => `<div class="hit hit-${i}" style="${xy(pos)}">${icon('sparkle')}<span>${i ? '−22' : '−2'}</span></div>`).join('')}`;
}

function upgradePanel() {
  const path = (name, glyph, info) => `<button class="upgrade-choice">
    <span class="choice-icon">${icon(glyph)}</span>
    <span class="choice-copy"><strong>${name}</strong><small>${info}</small></span>
    <span class="price">${icon('coin')}85</span></button>`;
  return `<div class="upgrade-shade"></div><section class="upgrade">
    <header><div class="tower-portrait"><img src="${gameArt('musketeer')}" alt=""></div>
    <div><p class="eyebrow">Level 2 · 12 kills</p><h1>Musketeer</h1></div>
    ${buttons('Close', 'close', 'close')}</header>
    <h2>Choose an upgrade</h2>
    <div class="paths">${path('Sharpshooter','target','23 more damage · 75 more range')}
      ${path('Volley','volley','2.8× as many shots per second')}</div>
    <div class="upgrade-foot">${buttons('Target: First', 'target', '', '<b>Target: First</b>')}
      ${buttons('Sell +59', 'coin', '', '<b>Sell +59</b>')}</div>
  </section>`;
}

function card() {
  return `<main class="level-card">
    <header class="card-top">${buttons('Back', 'back', 'back', '<b>Back</b>')}
    <span>Act Two <i></i> Level 11</span></header>
    <section class="card-body">
      <div class="card-head"><div class="royal-seal">${icon('crown')}</div>
      <h1>Window Money</h1><p>A tax on windows.</p></div>
      <figure class="map-print"><img src="${uri('board-wide.png')}" alt="The trail through Riverbend">
        <figcaption>${icon('map')}Riverbend</figcaption></figure>
      <p class="tactics">Spend on upgrades as new towers grow dearer.</p>
      <div class="decrees">
        <div class="decree tax"><span>${icon('window')}</span>
          <div><h2>Window Tax</h2><p>Each tower you build adds 8.5% of base price to the next.</p></div></div>
        <div class="decree feat"><span>${icon('sparkle')}</span>
          <div><h2>Bare hands <small>Third star</small></h2><p>Win without using a special.</p></div></div>
      </div>
      <p class="town-answer">${icon('bolt')}Tar Barrels feather crowds.</p>
    </section>
    <footer class="card-foot"><div class="saved"><small>Best stars</small><div class="saved-stars">${stars(2)}</div></div>
    ${buttons('Play', 'play', 'primary', '<b>Play</b>')}</footer>
  </main>`;
}

function result() {
  return `<main class="result-screen">
    <div class="result-backdrop" style="background-image:url('${uri('board-wide.png')}')"></div>
    <section class="result">
      <p class="eyebrow">Level 11 · Window Money</p>
      <h1>Victory!</h1>
      <div class="win-stars" aria-label="Three stars">${stars(3)}</div>
      <figure class="celebration"><div class="burst"></div><img src="${town}" alt="The town at Riverbend"></figure>
      <div class="summary"><span>${icon('heart')}<b>17</b> lives left</span>
        <span>${icon('sparkle')}<span><b>Bare hands</b> earned</span></span></div>
      <p class="reply">“We put the money into the roof.”</p>
      <div class="result-actions">${buttons('Next level', 'arrow', 'primary', '<b>Next level</b>')}
        <div>${buttons('Play again', 'replay', '', '<b>Play again</b>')}
          ${buttons('Level map', 'map', '', '<b>Level map</b>')}</div></div>
    </section>
  </main>`;
}

const css = await readFile(new URL('./m54-mockups.css', import.meta.url), 'utf8');
const browser = await chromium.launch();
try {
  for (const [theme, direction] of [['a','clean'], ['b','fine-print'], ['c','bold']]) {
    for (const [name, wide] of [
      ['01-mid-wave', false], ['01-mid-wave-wide', true],
      ['02-upgrade', false], ['03-level-card', false], ['04-result', false],
    ]) {
      const viewport = wide ? { width: 960, height: 580 } : { width: 390, height: 844 };
      const page = await browser.newPage({ viewport, deviceScaleFactor: 2 });
      try {
        const upgrade = name === '02-upgrade';
        const content = name === '03-level-card' ? card() : name === '04-result' ? result()
          : `<main class="battle">${battlefield(wide, upgrade)}${hud(theme)}${upgrade ? upgradePanel() : ''}</main>`;
        const html = `<!doctype html><html lang="en"><meta charset="utf-8"><title>Window Money</title>
        <style>@font-face{font-family:Caslon;src:url('${caslon}')}@font-face{font-family:Caslon;src:url('${caslonBold}');font-weight:700}${css}</style>
        <body class="${theme} ${wide ? 'wide' : 'phone'}">${content}</body></html>`;
        const pagePath = join(scratch, 'mock.html');
        await writeFile(pagePath, html);
        await page.goto(pathToFileURL(pagePath).href);
        await page.evaluate(() => document.fonts.ready);
        const badImages = await page.locator('img').evaluateAll(images => images.filter(img => !img.naturalWidth).map(img => img.src));
        assert.deepEqual(badImages, []);
        await page.screenshot({ path: join(output, `${theme}-${direction}-${name}.png`), scale: 'css' });
      } finally {
        await page.close();
      }
    }
  }
} finally {
  await browser.close();
}
