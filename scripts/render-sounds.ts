// Milestone 33 (sound): `npm run sounds -- <folder>`. Run by hand, not in CI.
//
// Builds the game, serves dist/ with `vite preview`, and renders every
// sound through the master chain (level and limiter) in the Playwright
// Chromium's OfflineAudioContext (window.__tarpit.audioLab.reel(),
// src/game/audio/lab.ts): each sound in turn with a 0.4 s gap, then a
// 10 s busy wave (six towers firing, impacts on arrival, hits, deaths, an
// exit, a Powder Keg, the charge ready and the wave clear, thinned and
// capped as in play). Writes m33-sounds.wav (mono, 16-bit, 22.05 kHz) and
// m33-sounds.txt (each sound's name, start and length, in order) into the
// folder (default: the system temp folder). The WAV is for listening only:
// never commit it.

import { execFileSync, spawn } from 'node:child_process';
import { mkdirSync, statSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { chromium } from '@playwright/test';

const ROOT = fileURLToPath(new URL('..', import.meta.url));
const PORT = Number(process.env.SOUNDS_PORT ?? 4178);
const URL_BASE = `http://localhost:${PORT}/`;
const MAX_MB = 6;

async function waitForServer(url: string, timeoutMs = 20000): Promise<void> {
  const end = Date.now() + timeoutMs;
  while (Date.now() < end) {
    try {
      if ((await fetch(url)).ok) return;
    } catch {
      // not up yet
    }
    await new Promise((r) => setTimeout(r, 200));
  }
  throw new Error(`preview server did not start at ${url}`);
}

/** A mono 16-bit PCM WAV file around little-endian samples. */
function wav(pcm: Buffer, rate: number): Buffer {
  const h = Buffer.alloc(44);
  h.write('RIFF', 0);
  h.writeUInt32LE(36 + pcm.length, 4);
  h.write('WAVE', 8);
  h.write('fmt ', 12);
  h.writeUInt32LE(16, 16);
  h.writeUInt16LE(1, 20);
  h.writeUInt16LE(1, 22);
  h.writeUInt32LE(rate, 24);
  h.writeUInt32LE(rate * 2, 28);
  h.writeUInt16LE(2, 32);
  h.writeUInt16LE(16, 34);
  h.write('data', 36);
  h.writeUInt32LE(pcm.length, 40);
  return Buffer.concat([h, pcm]);
}

async function main(): Promise<void> {
  const out = resolve(process.argv[2] ?? join(tmpdir(), 'tarpit-sounds'));
  mkdirSync(out, { recursive: true });
  execFileSync('npm', ['run', 'build'], { cwd: ROOT, stdio: 'inherit' });
  const server = spawn('npx', ['vite', 'preview', '--port', String(PORT), '--strictPort'], { cwd: ROOT, stdio: 'ignore' });
  try {
    await waitForServer(URL_BASE);
    const browser = await chromium.launch();
    const page = await browser.newPage();
    // Test mode: nothing plays live; offline rendering needs no gesture.
    await page.goto(`${URL_BASE}?test=1`);
    await page.waitForFunction(() => window.__tarpit?.audioLab !== undefined);
    const reel = await page.evaluate(() => window.__tarpit!.audioLab.reel());
    await browser.close();
    const file = join(out, 'm33-sounds.wav');
    writeFileSync(file, wav(Buffer.from(reel.pcm16, 'base64'), reel.rate));
    const lines = [
      `Tarpit milestone 33 sounds: ${file}`,
      `Mono, 16-bit, ${reel.rate} Hz, through the master chain (level and limiter). Peak ${reel.peak.toFixed(3)}.`,
      '',
      'start (s)  length (s)  sound',
      ...reel.order.map((o) => `${o.at.toFixed(2).padStart(9)}  ${o.length.toFixed(2).padStart(10)}  ${o.name}`),
      `${reel.busyAt.toFixed(2).padStart(9)}  ${'10.50'.padStart(10)}  busy wave: six towers, impacts, hits, deaths, an exit at +4.2 s, a Powder Keg at +5.5 s, the charge ready at +8.2 s, the wave clear at +9.5 s`,
    ];
    writeFileSync(join(out, 'm33-sounds.txt'), `${lines.join('\n')}\n`);
    const mb = statSync(file).size / 1024 / 1024;
    console.log(`[sounds] wrote ${file} (${mb.toFixed(2)} MB) and m33-sounds.txt; peak ${reel.peak.toFixed(3)}`);
    if (mb >= MAX_MB) throw new Error(`the WAV is ${MAX_MB} MB or more`);
  } finally {
    server.kill();
  }
}

await main();
