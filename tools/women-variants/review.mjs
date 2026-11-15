// Capture real renders from the four-model self-contained HTML, entirely offline.
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
const archive = path.join(result, 'four_women_studies_and_well.zip');
const temp = fs.mkdtempSync(path.join(os.tmpdir(), 'bow-women-review-'));
const errors = [];
const frame = page => page.evaluate(() => new Promise(resolve => requestAnimationFrame(() => requestAnimationFrame(resolve))));
const women = [['eve', 1], ['north', 1.05], ['central', 1], ['east', .95]];
let browser;
try {
  const html = execFileSync('unzip', ['-p', archive, 'BladesOfWar_Showcase.html'], { maxBuffer: 40_000_000 });
  const file = path.join(temp, 'index.html');
  fs.writeFileSync(file, html);
  const args = chromium.args.filter(arg => !['--disable-web-security', '--allow-running-insecure-content',
    '--allow-file-access-from-files'].includes(arg));
  browser = await puppeteer.launch({ executablePath: process.env.CHROME_BIN || await chromium.executablePath(),
    headless: 'shell', args, defaultViewport: { width: 1000, height: 900, deviceScaleFactor: 1 } });
  const page = await browser.newPage();
  page.on('pageerror', error => errors.push(`page: ${error}`));
  page.on('console', message => { if (message.type() === 'error') errors.push(`console: ${message.text()}`); });
  await page.setRequestInterception(true);
  page.on('request', request => {
    if (/^(file|data|blob):/.test(request.url())) request.continue();
    else { errors.push(`unexpected network request ${request.url()}`); request.abort(); }
  });
  await page.setOfflineMode(true);
  await page.goto(pathToFileURL(file).href, { waitUntil: 'load', timeout: 180_000 });
  await page.waitForFunction('window.ready === true', { timeout: 180_000 });
  assert.equal(await page.evaluate(() => preview.woman), 'eve', 'Eve must remain the default');
  await page.evaluate(() => { preview.renderer.setPixelRatio(.35); document.querySelector('#auto-blink').checked = false;
    document.querySelector('#auto-blink').dispatchEvent(new Event('change', { bubbles: true })); });
  for (const [key, scale] of women.slice(1)) {
    await page.click(`[data-woman="${key}"]`);
    await page.waitForFunction(expected => preview.woman === expected, { timeout: 90_000 }, key);
    assert.equal(await page.$eval(`[data-woman="${key}"]`, el => el.getAttribute('aria-pressed')), 'true');
    await page.click('[data-view="face"]');
    const y = await page.evaluate(() => preview.controls.target.y);
    assert.ok(Math.abs(y - 1.56 * scale) < 1e-5, `${key} face preset follows uniform height`);
    const fields = await page.evaluate(() => {
      preview.state.animateMotion = false;
      preview.setFistWeight(.75); preview.setBlinkWeight(.5);
      return {body: [...preview.bodyMesh.morphTargetInfluences], face: [...preview.faceMesh.morphTargetInfluences],
        line: [...preview.lineMesh.morphTargetInfluences], clips: preview.clips.map(clip => clip.name)};
    });
    assert.deepEqual(fields, {body: [.75, 0, 0, 1], face: [.5], line: [.5, 1],
      clips: ['Blink_Once', 'Fists_Close', 'Fists_Open']});
    // Selection keeps the current motion; next iteration tests this across models.
  }
  // Actual controls (not only programmatic weights) remain usable on a variant.
  await page.evaluate(() => { preview.state.animateMotion = true; preview.setBlinkWeight(0); preview.setFistWeight(0); });
  await page.click('#fists');
  await page.waitForFunction('preview.state.fistWeight === 1', {timeout: 20_000});
  await page.click('#eyes-closed');
  await page.waitForFunction('preview.state.blinkWeight === 1', {timeout: 20_000});
  assert.deepEqual(await page.evaluate(() => ({body: [...preview.bodyMesh.morphTargetInfluences],
    face: [...preview.faceMesh.morphTargetInfluences], line: [...preview.lineMesh.morphTargetInfluences]})),
    {body: [1, 0, 0, 0], face: [1], line: [1, 1]});
  await page.click('#eyes-closed');
  await page.waitForFunction('preview.state.blinkWeight === 0', {timeout: 20_000});
  await page.evaluate(() => {
    preview.renderer.setPixelRatio(1);
    preview.state.animateMotion = false; preview.state.animateWell = false;
    document.querySelector('header').style.display = 'none';
    document.querySelector('aside').style.display = 'none';
    document.querySelector('.hint').style.display = 'none';
    document.body.style.height = '100vh';
    document.querySelector('.workspace').style.height = '100vh';
    document.querySelector('.stage').style.height = '100vh';
    window.dispatchEvent(new Event('resize'));
    preview.controls.enableDamping = false;
  });
  for (const [key, scale] of women) {
    await page.evaluate(async k => await preview.selectWoman(k), key);
    assert.equal(await page.evaluate(() => preview.woman), key);
    await page.evaluate(() => {preview.setMode('female'); preview.setBlinkWeight(0); preview.setFistWeight(0);});
    for (const [view, position, target] of [
      ['front', [0, .84, 3.6], [0, .84, 0]],
      ['side', [3.6, .84, 0], [0, .84, 0]],
      ['back', [0, .84, -3.6], [0, .84, 0]],
      ['face', [0, 1.56 * scale, .60 * scale], [0, 1.56 * scale, .02 * scale]],
      ['angle', [.25 * scale, 1.58 * scale, .54 * scale], [0, 1.56 * scale, .02 * scale]],
      ['eyes', [0, 1.565 * scale, .34 * scale], [0, 1.565 * scale, .10 * scale]],
    ]) {
      await page.evaluate(({ position, target }) => {
        preview.controls.target.set(...target); preview.camera.position.set(...position); preview.controls.update();
      }, {position, target});
      await frame(page);
      await page.screenshot({path: path.join(temp, `${key}-${view}.png`)});
      if (view === 'eyes') {
        await page.evaluate(() => preview.setBlinkWeight(1));
        await frame(page);
        await page.screenshot({path: path.join(temp, `${key}-blink.png`)});
      }
    }
  }
  assert.deepEqual(errors, [], 'Unexpected network or browser error');
  execFileSync(process.env.PYTHON || 'python3', [path.join(root, 'tools/women-variants/review.py'),
    '--raw', temp, '--output', path.join(result, 'review')], {stdio: 'inherit'});
  console.log('PASS: offline model selector, scale-aware face presets, preserved motion and variant controls');
} finally {
  if (browser) await browser.close();
  fs.rmSync(temp, {recursive: true, force: true});
}
