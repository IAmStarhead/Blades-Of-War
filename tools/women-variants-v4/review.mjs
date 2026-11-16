// Capture the actual offline v4 and v3 WebGL viewers with matched cameras/light.
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
const result = path.resolve(process.argv[2] || path.join(root, 'work/character-model-search/women-variants-v4'));
const temp = fs.mkdtempSync(path.join(os.tmpdir(), 'bow-women-v4-review-'));
const output = path.join(result, 'review'); fs.mkdirSync(output, {recursive: true});
const errors = [];
const frame = page => page.evaluate(() => new Promise(resolve => requestAnimationFrame(() => requestAnimationFrame(resolve))));
const women = [['eve', 1], ['north', 1.05], ['central', 1], ['east', .95], ['africa', 1.02], ['spain', .985]];
let browser;

async function load(page, zip, name) {
  const html = execFileSync('unzip', ['-p', zip, 'BladesOfWar_Showcase.html'], {maxBuffer: 60_000_000});
  const file = path.join(temp, `${name}.html`); fs.writeFileSync(file, html);
  await page.goto(pathToFileURL(file).href, {waitUntil: 'load', timeout: 180_000});
  await page.waitForFunction('window.ready === true && preview.comparisonReady', {timeout: 180_000});
  await page.evaluate(() => {
    preview.state.animateMotion = false; preview.state.animateWell = false;
    // Software WebGL can be slow; use the same renderer scale for both
    // versions. Screenshot pixels are otherwise not retouched.
    preview.renderer.setPixelRatio(.75);
    preview.setBlinkWeight(0); preview.setFistWeight(0);
    document.querySelector('header').style.display = 'none';
    document.querySelector('aside').style.display = 'none';
    document.querySelector('.hint').style.display = 'none';
    document.body.style.height = '100vh'; document.querySelector('.workspace').style.height = '100vh';
    document.querySelector('.stage').style.height = '100vh'; window.dispatchEvent(new Event('resize'));
    preview.controls.enableDamping = false;
  });
  await frame(page);
}

async function captureIndividual(page, key, scale, prefix, views) {
  await page.evaluate(async key => {
    await preview.selectWoman(key); preview.setMode('female');
    preview.setBlinkWeight(0); preview.setFistWeight(0);
  }, key);
  for (const view of views) {
    const face = [0, 1.56 * scale, .60 * scale], faceTarget = [0, 1.56 * scale, .02 * scale];
    let position = face, target = faceTarget, angle = 0;
    if (view === 'angle') position = [.25 * scale, 1.58 * scale, .54 * scale];
    if (view === 'profile') angle = Math.PI / 2;
    if (view === 'eyes' || view.startsWith('blink')) {
      position = [0, 1.565 * scale, .34 * scale]; target = [0, 1.565 * scale, .10 * scale];
    }
    if (view === 'ear') {
      position = [-.018 * scale, 1.555 * scale, .34 * scale];
      target = [-.018 * scale, 1.555 * scale, .075 * scale]; angle = -Math.PI / 2;
    }
    if (view === 'body-side' || view === 'body-back') {
      position = [0, .86 * scale, 3.65 * scale]; target = [0, .86 * scale, 0];
      angle = view === 'body-side' ? Math.PI / 2 : Math.PI;
    }
    await page.evaluate(({position, target, angle, blink}) => {
      preview.setBlinkWeight(blink); preview.setFistWeight(0);
      preview.female.rotation.y = angle;
      preview.controls.target.set(...target); preview.camera.position.set(...position); preview.controls.update();
    }, {position, target, angle, blink: {'blink': 1, 'blink-half': .5, 'blink-three-quarter': .75}[view] ?? 0});
    await frame(page);
    await page.screenshot({path: path.join(temp, `${prefix}-${key}-${view}.png`)});
  }
  console.log(`rendered ${prefix} ${key}`);
}

try {
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
  await load(page, path.join(result, 'six_women_individual_studies_and_well.zip'), 'v4');
  for (const [view, filename] of [['front', '01-comparison-front.png'], ['side', '02-comparison-side.png'],
    ['back', '03-comparison-back.png']]) {
    await page.evaluate(view => preview.setView(view), view); await frame(page);
    await page.screenshot({path: path.join(output, filename)});
  }
  await page.evaluate(() => preview.setMode('compare-faces'));
  await page.waitForFunction('preview.state.mode === "compare-faces" && preview.comparisonReady', {timeout: 180_000});
  await frame(page); await page.screenshot({path: path.join(output, '13-viewer-face-comparison.png')});
  await page.setViewport({width: 1000, height: 900, deviceScaleFactor: 1}); await frame(page);
  for (const [key, scale] of women) {
    const views = ['face', 'angle', 'eyes', 'blink-half', 'blink-three-quarter', 'blink', 'ear'];
    if (!['eve', 'spain'].includes(key)) views.push('profile', 'body-side', 'body-back');
    await captureIndividual(page, key, scale, 'v4', views);
  }
  // Compare the actual v3 and v4 models using the same viewer light, viewport,
  // camera, rotation and relative scale. Only crop/resize/title are added later.
  await load(page, path.join(root, 'work/character-model-search/women-variants-v3/five_women_face_details_and_well.zip'), 'v3');
  for (const [key, scale] of women.slice(1, 5)) {
    await captureIndividual(page, key, scale, 'v3', ['face', 'profile', 'body-side', 'body-back']);
  }
  assert.deepEqual(errors, [], 'Unexpected network or browser error');
  execFileSync(process.env.PYTHON || 'python3', [path.join(root, 'tools/women-variants-v4/review.py'),
    '--raw', temp, '--output', output], {stdio: 'inherit'});
  console.log('PASS: offline, unretouched six-model captures and matched v3/v4 comparisons');
} finally {
  if (browser) await browser.close();
  fs.rmSync(temp, {recursive: true, force: true});
}
