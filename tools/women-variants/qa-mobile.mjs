// Exercise mobile-sized UI, selection races, scale-aware presets and motion.
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
const result = path.resolve(process.argv[2] || path.join(root, 'work/character-model-search/women-variants'));
const temp = fs.mkdtempSync(path.join(os.tmpdir(), 'bow-women-mobile-'));
const errors = [];
let browser;
try {
  const html = execFileSync('unzip', ['-p', path.join(result, 'four_women_studies_and_well.zip'),
    'BladesOfWar_Showcase.html'], { maxBuffer: 40_000_000 });
  const file = path.join(temp, 'index.html'); fs.writeFileSync(file, html);
  const args = chromium.args.filter(arg => !['--disable-web-security', '--allow-running-insecure-content',
    '--allow-file-access-from-files'].includes(arg));
  browser = await puppeteer.launch({ executablePath: process.env.CHROME_BIN || await chromium.executablePath(),
    headless: 'shell', args, defaultViewport: { width: 390, height: 844, deviceScaleFactor: 1,
      isMobile: true, hasTouch: true } });
  const page = await browser.newPage();
  page.on('pageerror', error => errors.push(String(error)));
  page.on('console', message => { if (message.type() === 'error') errors.push(message.text()); });
  await page.setRequestInterception(true);
  page.on('request', request => {
    if (/^(file|data|blob):/.test(request.url())) request.continue();
    else { errors.push(`unexpected network request: ${request.url()}`); request.abort(); }
  });
  await page.setOfflineMode(true);
  await page.goto(pathToFileURL(file).href, {waitUntil: 'load', timeout: 180_000});
  await page.waitForFunction('window.ready === true', {timeout: 180_000});
  assert.equal(await page.evaluate(() => preview.woman), 'eve');
  const dimensions = await page.evaluate(() => ({page: document.documentElement.scrollWidth,
    viewport: document.documentElement.clientWidth, stage: document.querySelector('.stage').clientHeight}));
  assert.equal(dimensions.page, dimensions.viewport, 'Mobile page should not scroll sideways');
  assert.ok(dimensions.stage >= 340, 'Mobile stage has sufficient height');
  await page.evaluate(() => {preview.renderer.setPixelRatio(.35); preview.state.animateMotion = false;
    preview.state.autoBlink = false; preview.setBlinkWeight(.5); preview.setFistWeight(.5);});
  await page.click('[data-woman="north"]');
  await page.waitForFunction('preview.woman === "north"', {timeout: 90_000});
  assert.deepEqual(await page.evaluate(() => ({f: [...preview.bodyMesh.morphTargetInfluences],
    b: [...preview.faceMesh.morphTargetInfluences], line: [...preview.lineMesh.morphTargetInfluences]})),
    {f: [.5, 0, 1, 0], b: [.5], line: [.5, 1]});
  await page.click('[data-view="face"]');
  assert.ok(Math.abs(await page.evaluate(() => preview.controls.target.y) - 1.56 * 1.05) < 1e-5);
  await page.click('[data-woman="central"]');
  await page.waitForFunction('preview.woman === "central"', {timeout: 90_000});
  assert.ok(Math.abs(await page.evaluate(() => preview.controls.target.y) - 1.56) < 1e-5);
  assert.equal(await page.$eval('[data-woman="central"]', el => el.getAttribute('aria-pressed')), 'true');
  await page.click('[data-woman="east"]');
  await page.waitForFunction('preview.woman === "east"', {timeout: 90_000});
  assert.ok(Math.abs(await page.evaluate(() => preview.controls.target.y) - 1.56 * .95) < 1e-5);
  assert.equal(await page.$eval('[data-woman="east"]', el => el.getAttribute('aria-pressed')), 'true');
  await page.click('[data-view="left-hand"]');
  assert.ok(Math.abs(await page.evaluate(() => preview.controls.target.y) - .765 * .95) < 1e-5);
  await page.click('[data-woman="eve"]');
  await page.waitForFunction('preview.woman === "eve"', {timeout: 90_000});
  assert.equal(await page.$eval('[data-woman="eve"]', el => el.getAttribute('aria-pressed')), 'true');
  assert.ok(Math.abs(await page.evaluate(() => preview.controls.target.y) - .765) < 1e-5);
  await page.$eval('#fist-range', el => {el.value = '25'; el.dispatchEvent(new Event('input', {bubbles: true}));});
  assert.deepEqual(await page.evaluate(() => [...preview.bodyMesh.morphTargetInfluences]), [.25, 1, 0, 0]);
  const final = await page.evaluate(async () => {
    const results = await Promise.all([preview.selectWoman('north'), preview.selectWoman('central'), preview.selectWoman('east')]);
    return { results, selected: preview.woman };
  });
  assert.deepEqual(final, {results: [false, false, true], selected: 'east'}, 'Newest selection must win');
  assert.deepEqual(errors, []);
  console.log('PASS: offline 390px mobile layout, all model buttons, preserved motion, scale-aware views, slider and race-safe selection');
} finally {
  if (browser) await browser.close();
  fs.rmSync(temp, {recursive: true, force: true});
}
