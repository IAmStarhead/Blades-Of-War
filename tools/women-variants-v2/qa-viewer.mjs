// Exercise the actual self-contained ZIP offline at desktop and phone sizes.
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
const result = path.resolve(process.argv[2] || path.join(root, 'work/character-model-search/women-variants-v2'));
const temp = fs.mkdtempSync(path.join(os.tmpdir(), 'bow-women-v2-qa-'));
const errors = [];
const names = ['eve', 'north', 'central', 'east', 'africa'];
const scales = {eve: 1, north: 1.05, central: 1, east: .95, africa: 1.02};
const frame = page => page.evaluate(() => new Promise(resolve => requestAnimationFrame(() => requestAnimationFrame(resolve))));
let browser;
async function newOfflinePage(viewport) {
  const page = await browser.newPage();
  await page.setViewport(viewport);
  page.on('pageerror', error => errors.push(`page: ${error}`));
  page.on('console', message => { if (message.type() === 'error') errors.push(`console: ${message.text()}`); });
  await page.setRequestInterception(true);
  page.on('request', request => {
    if (/^(file|data|blob):/.test(request.url())) request.continue();
    else { errors.push(`unexpected network request ${request.url()}`); request.abort(); }
  });
  await page.setOfflineMode(true);
  await page.goto(pathToFileURL(path.join(temp, 'index.html')).href, {waitUntil: 'load', timeout: 180_000});
  await page.waitForFunction('window.ready === true', {timeout: 180_000});
  await page.waitForFunction('preview.comparisonReady && preview.state.mode === "compare"', {timeout: 180_000});
  await page.evaluate(() => { preview.renderer.setPixelRatio(.4); preview.state.animateMotion = false;
    preview.setBlinkWeight(0); preview.setFistWeight(0); });
  await frame(page);
  return page;
}
try {
  const html = execFileSync('unzip', ['-p', path.join(result, 'five_women_comparison_and_well.zip'),
    'BladesOfWar_Showcase.html'], {maxBuffer: 50_000_000});
  fs.writeFileSync(path.join(temp, 'index.html'), html);
  const args = chromium.args.filter(arg => !['--disable-web-security', '--allow-running-insecure-content',
    '--allow-file-access-from-files'].includes(arg));
  browser = await puppeteer.launch({executablePath: process.env.CHROME_BIN || await chromium.executablePath(),
    headless: 'shell', args});
  const page = await newOfflinePage({width: 1400, height: 900, deviceScaleFactor: 1});
  assert.equal(await page.evaluate(() => preview.woman), 'eve', 'Eve remains the initially selected individual');
  const overview = await page.evaluate(() => {
    const point = preview.controls.target.clone();
    const models = Object.entries(preview.comparisonModels).map(([key, model]) => {
      model.updateMatrixWorld(true);
      const mesh = model.getObjectByName('basemesh_female_body');
      const position = mesh.geometry.attributes.position;
      let min = Infinity, max = -Infinity;
      for (let i = 0; i < position.count; i++) {
        point.fromBufferAttribute(position, i).applyMatrix4(mesh.matrixWorld);
        min = Math.min(min, point.y); max = Math.max(max, point.y);
      }
      return {key, x: model.position.x, y: model.position.y, visible: model.visible,
        parent: model.parent?.type, floor: min, cm: (max - min) * 100};
    });
    return {models, heights: preview.womanHeights, labels: document.querySelectorAll('.model-label').length,
      guide: document.querySelectorAll('#height-guide line').length,
      overlay: !document.querySelector('#comparison-overlay').hidden,
      active: document.querySelector('[data-mode="compare"]').getAttribute('aria-pressed')};
  });
  assert.deepEqual(overview.models.map(x => x.key), names);
  assert.equal(overview.labels, 5); assert.equal(overview.guide, 5);
  assert.equal(overview.overlay, true); assert.equal(overview.active, 'true');
  for (let i = 0; i < overview.models.length; i++) {
    const model = overview.models[i];
    assert.equal(model.visible, true); assert.equal(model.parent, 'Scene');
    assert.ok(Math.abs(model.x - (i - 2) * .64) < 1e-7 && model.y === 0, `${model.key}: placement`);
    assert.ok(Math.abs(model.floor) < 1e-5, `${model.key}: common floor`);
    assert.ok(Math.abs(model.cm - overview.heights[model.key]) < .051, `${model.key}: height label`);
  }
  assert.ok(overview.heights.north > overview.heights.africa && overview.heights.africa > overview.heights.eve
    && overview.heights.eve > overview.heights.east, 'Height order');

  await page.click('[data-view="side"]'); await frame(page);
  const side = await page.evaluate(() => ({mode: preview.state.mode, cameraX: preview.camera.position.x,
    rotation: Object.values(preview.comparisonModels).map(model => model.rotation.y)}));
  assert.equal(side.mode, 'compare'); assert.ok(Math.abs(side.cameraX) < 1e-6);
  assert.ok(side.rotation.every(angle => Math.abs(angle - Math.PI / 2) < 1e-6),
    'Side preset rotates each model in place instead of hiding them behind one another');
  await page.click('[data-view="back"]');
  assert.ok(await page.evaluate(() => Object.values(preview.comparisonModels).every(model => Math.abs(model.rotation.y - Math.PI) < 1e-6)));
  await page.click('[data-view="front"]');
  await page.evaluate(() => {preview.setBlinkWeight(.5); preview.setFistWeight(.75);});
  const weights = await page.evaluate(() => Object.entries(preview.comparisonModels).map(([key, model]) => ({key,
    body: [...model.getObjectByName('basemesh_female_body').morphTargetInfluences],
    face: [...model.getObjectByName('face_blink').morphTargetInfluences],
    line: [...model.getObjectByName('upper_eyelid_line').morphTargetInfluences]})));
  for (const entry of weights) {
    assert.deepEqual(entry.body, [.75, 0, 0, 1], `${entry.key}: fist`);
    assert.deepEqual(entry.face, [.5], `${entry.key}: blink`);
    assert.deepEqual(entry.line, [.5, 1], `${entry.key}: eyelid line`);
  }
  await page.evaluate(() => {preview.setBlinkWeight(0); preview.setFistWeight(0); preview.state.animateMotion = true;});
  await page.click('#fists');
  await page.waitForFunction('preview.state.fistWeight === 1', {timeout: 30_000});
  await page.click('#eyes-closed');
  await page.waitForFunction('preview.state.blinkWeight === 1', {timeout: 30_000});
  assert.ok(await page.evaluate(() => Object.values(preview.comparisonModels).every(model =>
    model.getObjectByName('face_blink').morphTargetInfluences[0] === 1)));
  await page.click('#eyes-closed');
  await page.waitForFunction('preview.state.blinkWeight === 0', {timeout: 30_000});
  await page.evaluate(() => {preview.state.animateMotion = false; preview.setFistWeight(.5); preview.setBlinkWeight(.5);});

  for (const key of names) {
    await page.click(`[data-woman="${key}"]`);
    await page.waitForFunction(expected => preview.woman === expected && preview.state.mode === 'female', {timeout: 90_000}, key);
    assert.equal(await page.$eval(`[data-woman="${key}"]`, el => el.getAttribute('aria-pressed')), 'true');
    assert.equal(await page.$eval('#comparison-overlay', el => el.hidden), true);
    assert.deepEqual(await page.evaluate(() => ({f: [...preview.bodyMesh.morphTargetInfluences],
      b: [...preview.faceMesh.morphTargetInfluences], line: [...preview.lineMesh.morphTargetInfluences]})),
      {f: [.5, 0, 1, 0], b: [.5], line: [.5, 1]}, `${key}: current motion survives selection`);
    await page.click('[data-view="face"]');
    assert.ok(Math.abs(await page.evaluate(() => preview.controls.target.y) - 1.56 * scales[key]) < 1e-5,
      `${key}: face preset respects uniform scale`);
    const parents = await page.evaluate(() => Object.entries(preview.comparisonModels)
      .filter(([key]) => key !== preview.woman).map(([, model]) => model.parent));
    assert.ok(parents.every(parent => parent === null), 'Other women are removed in single-model mode');
  }
  const race = await page.evaluate(async () => {
    const results = await Promise.all([preview.selectWoman('north'), preview.selectWoman('central'), preview.selectWoman('east')]);
    return {results, selected: preview.woman};
  });
  assert.deepEqual(race, {results: [false, false, true], selected: 'east'}, 'Newest selection wins');
  const compareRace = await page.evaluate(async () => {
    const [compare, selected] = await Promise.all([preview.setMode('compare'), preview.selectWoman('africa')]);
    return {compare, selected, woman: preview.woman, mode: preview.state.mode};
  });
  assert.deepEqual(compareRace, {compare: false, selected: true, woman: 'africa', mode: 'female'},
    'Selection cancels an in-flight comparison');
  await page.click('[data-mode="compare"]');
  await page.waitForFunction('preview.state.mode === "compare" && preview.comparisonReady', {timeout: 90_000});
  await page.click('[data-mode="well"]');
  assert.deepEqual(await page.evaluate(() => ({well: preview.well.visible, female: preview.female.visible,
    disabled: document.querySelector('#fist-range').disabled})), {well: true, female: false, disabled: true});
  await page.click('[data-mode="pair"]');
  assert.deepEqual(await page.evaluate(() => ({well: preview.well.visible, female: preview.female.visible,
    disabled: document.querySelector('#fist-range').disabled})), {well: true, female: true, disabled: false});
  await page.close();

  const mobile = await newOfflinePage({width: 390, height: 844, deviceScaleFactor: 1, isMobile: true, hasTouch: true});
  const layout = await mobile.evaluate(() => ({page: document.documentElement.scrollWidth,
    viewport: document.documentElement.clientWidth, stage: document.querySelector('.stage').clientHeight,
    labels: [...document.querySelectorAll('.model-label')].map(el => ({x: parseFloat(el.style.left), text: el.textContent}))}));
  assert.equal(layout.page, layout.viewport, 'Phone page should not scroll horizontally');
  assert.ok(layout.stage >= 340); assert.equal(layout.labels.length, 5);
  assert.ok(layout.labels.every(el => el.x >= 0 && el.x <= 390), 'All labels fit within the stage');
  await mobile.click('[data-woman="africa"]');
  await mobile.waitForFunction('preview.woman === "africa" && preview.state.mode === "female"', {timeout: 90_000});
  await mobile.click('[data-view="face"]');
  assert.ok(Math.abs(await mobile.evaluate(() => preview.controls.target.y) - 1.56 * 1.02) < 1e-5);
  await mobile.click('[data-mode="compare"]');
  await mobile.waitForFunction('preview.state.mode === "compare" && preview.comparisonReady', {timeout: 90_000});
  await mobile.$eval('#fist-range', el => {el.value = '25'; el.dispatchEvent(new Event('input', {bubbles: true}));});
  assert.ok(await mobile.evaluate(() => Object.values(preview.comparisonModels).every(model =>
    JSON.stringify([...model.getObjectByName('basemesh_female_body').morphTargetInfluences]) === JSON.stringify([.25, 1, 0, 0]))));
  await mobile.close();
  assert.deepEqual(errors, [], 'Unexpected network, JavaScript or browser error');
  console.log('PASS: offline desktop and 390px mobile; shared floor/height labels, five models, side/back presets, ' +
    'all morph controls, individual/prop modes and race-safe selection');
} finally {
  if (browser) await browser.close();
  fs.rmSync(temp, {recursive: true, force: true});
}
