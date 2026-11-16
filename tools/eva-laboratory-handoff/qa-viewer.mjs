// Validate the two GLBs and the rebranded, extracted offline handoff viewer.
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import { execFileSync } from 'node:child_process';
import { fileURLToPath, pathToFileURL } from 'node:url';
import path from 'node:path';
import os from 'node:os';
import fs from 'node:fs';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const require = createRequire(path.join(root, 'tools/character-showcase/package.json'));
const validator = require('gltf-validator');
const puppeteer = require('puppeteer-core');
const chromium = require('@sparticuz/chromium').default;
const directory = path.resolve(process.argv[2] || path.join(root, 'work/eva-laboratory-game/handoff'));
const zip = path.join(directory, '03_heroine_model.zip');
const extract = name => execFileSync('unzip', ['-p', zip, `models/heroine/${name}`], { maxBuffer: 12_000_000 });
for (const name of ['female_A_ears_refined.glb', 'female_A_eyes_refined.glb']) {
  const report = await validator.validateBytes(new Uint8Array(extract(name)), { uri: name });
  console.log(`${name}: ${report.issues.numErrors} errors, ${report.issues.numWarnings} warnings, ${report.issues.numInfos} infos`);
  assert.deepEqual([report.issues.numErrors, report.issues.numWarnings, report.issues.numInfos], [0, 0, 0]);
}
const temp = fs.mkdtempSync(path.join(os.tmpdir(), 'laboratory-viewer-'));
const html = path.join(temp, 'Heroine_Showcase.html');
fs.writeFileSync(html, extract('Heroine_Showcase.html'));
const errors = [];
const frame = page => page.evaluate(() => new Promise(resolve => requestAnimationFrame(() => requestAnimationFrame(resolve))));
let browser;
try {
  const args = chromium.args.filter(arg => !['--disable-web-security', '--allow-running-insecure-content',
    '--allow-file-access-from-files'].includes(arg));
  browser = await puppeteer.launch({ executablePath: process.env.CHROME_BIN || await chromium.executablePath(),
    headless: 'shell', args, defaultViewport: { width: 1000, height: 900, deviceScaleFactor: 1 } });
  const page = await browser.newPage();
  page.on('pageerror', error => errors.push(error.toString()));
  page.on('console', message => { if (message.type() === 'error') errors.push(message.text()); });
  await page.setRequestInterception(true);
  page.on('request', request => {
    if (/^(file|data|blob):/.test(request.url())) request.continue();
    else { errors.push(`Unexpected network request: ${request.url()}`); request.abort(); }
  });
  await page.setOfflineMode(true);
  await page.goto(pathToFileURL(html).href, { waitUntil: 'load', timeout: 120_000 });
  await page.waitForFunction('window.ready === true', { timeout: 120_000 });
  assert.equal(await page.title(), 'Просмотр героини — проба ушей');
  assert.equal(await page.$eval('h1', h => h.textContent), 'ПРОБА ГЕРОИНИ');
  assert.deepEqual(await page.evaluate(() => [preview.state.mode, preview.state.view]), ['female', 'face']);
  for (const [view, sign] of [['left-ear', 1], ['right-ear', -1]]) {
    await page.evaluate(view => document.querySelector(`[data-view="${view}"]`).click(), view);
    const info = await page.evaluate(() => [preview.state.view, preview.controls.target.x, preview.camera.position.x]);
    assert.equal(info[0], view);
    assert.ok(Math.abs(info[1] - sign * .077) < .005 && sign * info[2] > sign * info[1]);
  }
  await page.evaluate(() => {
    preview.setMode('female'); preview.renderer.setPixelRatio(.35);
    const toggle = document.querySelector('#auto-blink'); if (toggle.checked) toggle.click();
    let weight = preview.state.blinkWeight; window.blinkSamples = [];
    Object.defineProperty(preview.state, 'blinkWeight', { configurable: true, get: () => weight,
      set: value => { weight = value; window.blinkSamples.push(value); } });
  });
  await page.click('#fists');
  await page.waitForFunction('preview.state.fistWeight === 1', { timeout: 20_000 });
  await page.click('#blink-once');
  await page.waitForFunction('window.blinkSamples.some(v => v > .2) && preview.state.blinkWeight === 0', { timeout: 20_000 });
  assert.deepEqual(await page.evaluate(() => [...preview.bodyMesh.morphTargetInfluences]), [1, 0, 0, 0]);
  await page.$eval('#fist-range', element => { element.value = '25'; element.dispatchEvent(new Event('input', { bubbles: true })); });
  await frame(page);
  assert.deepEqual(await page.evaluate(() => [...preview.bodyMesh.morphTargetInfluences]), [.25, 1, 0, 0]);
  await page.$eval('#fist-range', element => { element.value = '0'; element.dispatchEvent(new Event('input', { bubbles: true })); });
  await frame(page);
  assert.deepEqual(await page.evaluate(() => [...preview.bodyMesh.morphTargetInfluences]), [0, 0, 0, 0]);
  await page.setViewport({ width: 390, height: 844, deviceScaleFactor: 1 });
  await frame(page);
  const mobile = await page.evaluate(() => ({
    width: document.documentElement.clientWidth, scrollWidth: document.documentElement.scrollWidth,
    header: document.querySelector('h1').getBoundingClientRect().right,
  }));
  assert.equal(mobile.width, 390);
  assert.ok(mobile.scrollWidth <= 390 && mobile.header <= 390, `Overflow on mobile: ${JSON.stringify(mobile)}`);
  if (process.env.CAPTURE) await page.screenshot({ path: process.env.CAPTURE });
  assert.deepEqual(errors, []);
  console.log('PASS: extracted viewer loads offline without security relaxation; ear views, blink, fists and mobile layout');
} finally {
  if (browser) await browser.close();
  fs.rmSync(temp, { recursive: true, force: true });
}
