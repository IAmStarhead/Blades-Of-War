// Capture real 3D frames from the offline ZIP: shared-floor scene and face details.
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
const result = path.resolve(process.argv[2] || path.join(root, 'work/character-model-search/women-variants-v3'));
const temp = fs.mkdtempSync(path.join(os.tmpdir(), 'bow-women-v3-review-'));
const output = path.join(result, 'review'); fs.mkdirSync(output, {recursive: true});
const errors = [];
const frame = page => page.evaluate(() => new Promise(resolve => requestAnimationFrame(() => requestAnimationFrame(resolve))));
const women = [['eve', 1], ['north', 1.05], ['central', 1], ['east', .95], ['africa', 1.02]];
let browser;
try {
  const html = execFileSync('unzip', ['-p', path.join(result, 'five_women_face_details_and_well.zip'),
    'BladesOfWar_Showcase.html'], {maxBuffer: 50_000_000});
  const file = path.join(temp, 'index.html'); fs.writeFileSync(file, html);
  const args = chromium.args.filter(arg => !['--disable-web-security', '--allow-running-insecure-content',
    '--allow-file-access-from-files'].includes(arg));
  browser = await puppeteer.launch({executablePath: process.env.CHROME_BIN || await chromium.executablePath(),
    headless: 'shell', args, defaultViewport: {width: 1600, height: 900, deviceScaleFactor: 1}});
  const page = await browser.newPage();
  page.on('pageerror', error => errors.push(`page: ${error}`));
  page.on('console', message => {if (message.type() === 'error') errors.push(`console: ${message.text()}`);});
  await page.setRequestInterception(true);
  page.on('request', request => {
    if (/^(file|data|blob):/.test(request.url())) request.continue();
    else {errors.push(`unexpected network request ${request.url()}`); request.abort();}
  });
  await page.setOfflineMode(true);
  await page.goto(pathToFileURL(file).href, {waitUntil: 'load', timeout: 180_000});
  await page.waitForFunction('window.ready === true && preview.comparisonReady', {timeout: 180_000});
  await page.evaluate(() => {
    preview.state.animateMotion = false; preview.state.animateWell = false;
    preview.setBlinkWeight(0); preview.setFistWeight(0);
    document.querySelector('header').style.display = 'none';
    document.querySelector('aside').style.display = 'none';
    document.querySelector('.hint').style.display = 'none';
    document.body.style.height = '100vh';
    document.querySelector('.workspace').style.height = '100vh';
    document.querySelector('.stage').style.height = '100vh';
    window.dispatchEvent(new Event('resize'));
    preview.controls.enableDamping = false;
  });
  for (const [view, filename] of [['front', '01-comparison-front.png'], ['side', '02-comparison-side.png'],
    ['back', '03-comparison-back.png']]) {
    await page.evaluate(view => preview.setView(view), view); await frame(page);
    await page.screenshot({path: path.join(output, filename)});
  }
  for (const [mode, filename] of [['compare-faces', '11-viewer-face-comparison.png'],
    ['compare-ears', '12-viewer-ear-comparison.png']]) {
    await page.evaluate(mode => preview.setMode(mode), mode);
    await page.waitForFunction(mode => preview.state.mode === mode && preview.comparisonReady, {}, mode);
    await frame(page); await page.screenshot({path: path.join(output, filename)});
  }
  await page.setViewport({width: 1000, height: 900, deviceScaleFactor: 1});
  // Let the resize event and frameView finish before setting the first face
  // camera. Otherwise the delayed resize can reset Eve to a full-body view.
  await frame(page);
  for (const [key, scale] of women) {
    await page.evaluate(async key => { await preview.selectWoman(key); preview.setMode('female');
      preview.setBlinkWeight(0); preview.setFistWeight(0); }, key);
    for (const [view, position, target] of [
      ['face', [0, 1.56 * scale, .60 * scale], [0, 1.56 * scale, .02 * scale]],
      ['angle', [.25 * scale, 1.58 * scale, .54 * scale], [0, 1.56 * scale, .02 * scale]],
      ['eyes', [0, 1.565 * scale, .34 * scale], [0, 1.565 * scale, .10 * scale]],
      ['mouth', [0, 1.501 * scale, .32 * scale], [0, 1.501 * scale, .10 * scale]],
      // Rotate each model identically to show its left ear under the same
      // frontal key light as the other details, instead of facing the camera
      // towards the shadowed side of the head.
      ['ear', [-.018 * scale, 1.555 * scale, .34 * scale], [-.018 * scale, 1.555 * scale, .075 * scale]],
    ]) {
      await page.evaluate(view => { preview.setBlinkWeight(0);
        preview.female.rotation.y = view === 'ear' ? -Math.PI / 2 : 0; }, view);
      await page.evaluate(({position, target}) => { preview.controls.target.set(...target);
        preview.camera.position.set(...position); preview.controls.update(); }, {position, target});
      await frame(page);
      await page.screenshot({path: path.join(temp, `${key}-${view}.png`)});
      if (view === 'eyes') {
        await page.evaluate(() => preview.setBlinkWeight(1)); await frame(page);
        await page.screenshot({path: path.join(temp, `${key}-blink.png`)});
      }
    }
    console.log(`rendered ${key}`);
  }
  // Render the published v2 central model in the same viewer, lighting,
  // viewport and face camera as the new frame. No image compositing or
  // colour correction is applied to either screenshot.
  const oldZip = path.join(root, 'work/character-model-search/women-variants-v2/five_women_comparison_and_well.zip');
  const oldHtml = execFileSync('unzip', ['-p', oldZip, 'BladesOfWar_Showcase.html'], {maxBuffer: 50_000_000});
  const oldFile = path.join(temp, 'previous.html'); fs.writeFileSync(oldFile, oldHtml);
  await page.goto(pathToFileURL(oldFile).href, {waitUntil: 'load', timeout: 180_000});
  await page.waitForFunction('window.ready === true && preview.comparisonReady', {timeout: 180_000});
  await page.evaluate(async () => {
    preview.state.animateMotion = false; preview.state.animateWell = false;
    await preview.selectWoman('central'); preview.setMode('female');
    preview.setBlinkWeight(0); preview.setFistWeight(0);
    document.querySelector('header').style.display = 'none';
    document.querySelector('aside').style.display = 'none';
    document.querySelector('.hint').style.display = 'none';
    document.body.style.height = '100vh'; document.querySelector('.workspace').style.height = '100vh';
    document.querySelector('.stage').style.height = '100vh'; window.dispatchEvent(new Event('resize'));
    preview.controls.enableDamping = false;
  });
  await frame(page);
  await page.evaluate(() => { preview.controls.target.set(0, 1.56, .02);
    preview.camera.position.set(0, 1.56, .60); preview.controls.update(); });
  await frame(page); await page.screenshot({path: path.join(temp, 'central-v2.png')});
  assert.deepEqual(errors, [], 'Unexpected network or browser error');
  execFileSync(process.env.PYTHON || 'python3', [path.join(root, 'tools/women-variants-v3/review.py'),
    '--raw', temp, '--output', output], {stdio: 'inherit'});
  console.log('PASS: offline 3D shared-floor renders and unretouched face/blink panels');
} finally {
  if (browser) await browser.close();
  fs.rmSync(temp, {recursive: true, force: true});
}
