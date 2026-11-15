// Smoke-test opening the archived HTML directly from disk, without Chromium's
// file-access or web-security-disabling flags. No server or network is used.
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import { execFileSync } from 'node:child_process';
import { fileURLToPath, pathToFileURL } from 'node:url';
import path from 'node:path';
import os from 'node:os';
import fs from 'node:fs';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const require = createRequire(path.join(root, 'tools/character-showcase/package.json'));
const puppeteer = require('puppeteer-core');
const chromium = require('@sparticuz/chromium').default;
const result = path.resolve(process.argv[2] || path.join(root, 'work/character-model-search/selected-a/fist-refinement-trial'));
const temp = fs.mkdtempSync(path.join(os.tmpdir(), 'bow-fist-offline-'));
let browser;
try {
  const html = execFileSync('unzip', ['-p', path.join(result, 'female_A_fist_trial_and_well.zip'), 'BladesOfWar_Showcase.html'],
    { maxBuffer: 20_000_000 });
  const file = path.join(temp, 'BladesOfWar_Showcase.html');
  fs.writeFileSync(file, html);
  const args = chromium.args.filter(arg => !['--disable-web-security', '--allow-running-insecure-content',
    '--allow-file-access-from-files'].includes(arg));
  browser = await puppeteer.launch({ executablePath: process.env.CHROME_BIN || await chromium.executablePath(),
    headless: 'shell', args });
  const page = await browser.newPage();
  const failures = [];
  page.on('pageerror', error => failures.push(String(error)));
  page.on('console', message => { if (message.type() === 'error') failures.push(message.text()); });
  await page.setRequestInterception(true);
  page.on('request', request => {
    if (/^(file|data|blob):/.test(request.url())) request.continue();
    else { failures.push(`Unexpected request: ${request.url()}`); request.abort(); }
  });
  await page.setOfflineMode(true);
  await page.goto(pathToFileURL(file).href, { waitUntil: 'load', timeout: 120_000 });
  await page.waitForFunction('window.ready === true', { timeout: 120_000 });
  const weights = await page.evaluate(() => {
    preview.setMode('female');
    preview.state.animateMotion = false;
    preview.setFistWeight(.75);
    return [...preview.bodyMesh.morphTargetInfluences];
  });
  assert.deepEqual(weights, [.75, 0, 0, 1]);
  assert.deepEqual(failures, []);
  await page.close();
  console.log('PASS: standalone HTML opens offline from file:// with browser web security enabled; 75% morph weights are correct');
} finally {
  if (browser) await browser.close();
  fs.rmSync(temp, { recursive: true, force: true });
}
