// Open the delivered ZIP offline, check controls/framing/mobile, optionally
// capture same-camera before/after review images from temporary viewer copies.
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
const shots = process.argv.includes('--shots');
const positional = process.argv.slice(2).filter(arg => arg !== '--shots');
const result = path.resolve(positional[0] || path.join(root, 'work/character-model-search/selected-a/refined'));
const outZip = path.join(result, 'female_A_and_detailed_well.zip');
const sourceZip = path.join(root, 'work/character-model-search/selected-a/female_A_with_lashes_showcase.zip');
const previous = path.join(root, 'work/character-model-search/selected-a/female_A_with_lashes.glb');
const temporary = fs.mkdtempSync(path.join(os.tmpdir(), 'bow-a-well-review-'));
const unzip = (zip, entry) => execFileSync('unzip', ['-p', zip, entry], { maxBuffer: 20_000_000 });
const html = unzip(outZip, 'BladesOfWar_Showcase.html').toString('utf8');
const outputModel = fs.readFileSync(path.join(result, 'female_A_refined.glb'));
const uri = data => `data:model/gltf-binary;base64,${data.toString('base64')}`;
assert.equal(html.split(uri(outputModel)).length, 2, 'Exactly one revised model expected in the HTML');
const cases = {
  after: html,
  before: html.replace(uri(outputModel), uri(unzip(sourceZip, 'female_A_original.glb'))),
  previous: html.replace(uri(outputModel), uri(fs.readFileSync(previous))),
};
for (const [name, source] of Object.entries(cases)) fs.writeFileSync(path.join(temporary, `${name}.html`), source);

const browser = await puppeteer.launch({
  executablePath: process.env.CHROME_BIN || await chromium.executablePath(),
  headless: 'shell',
  args: [...chromium.args, '--allow-file-access-from-files'],
  defaultViewport: { width: 1280, height: 900, deviceScaleFactor: 1 },
});

const frame = page => page.evaluate(() => new Promise(resolve => requestAnimationFrame(() => requestAnimationFrame(resolve))));
const failures = [];
async function open(name) {
  const page = await browser.newPage();
  page.on('pageerror', error => failures.push(`${name}: ${error}`));
  page.on('console', message => { if (message.type() === 'error') failures.push(`${name}: ${message.text()}`); });
  await page.setRequestInterception(true);
  page.on('request', request => {
    if (/^(file|data|blob):/.test(request.url())) request.continue();
    else {
      failures.push(`${name}: unexpected network request ${request.url()}`);
      request.abort();
    }
  });
  await page.setOfflineMode(true);
  await page.goto(pathToFileURL(path.join(temporary, `${name}.html`)).href, { waitUntil: 'load', timeout: 120_000 });
  await page.waitForFunction('window.ready === true', { timeout: 120_000 });
  await page.evaluate(() => {
    preview.state.animateWell = false;
    if (preview.wellProp.pendulum) preview.wellProp.pendulum.rotation.set(0, 0, 0);
  });
  await frame(page);
  return page;
}

async function bounds(page) {
  return page.evaluate(() => {
    const { camera, female, well } = preview;
    camera.updateMatrixWorld(true);
    let xmin = Infinity, xmax = -Infinity, ymin = Infinity, ymax = -Infinity, count = 0;
    for (const root of [female, well]) {
      if (!root.visible) continue;
      root.updateMatrixWorld(true);
      root.traverse(object => {
        if (!object.isMesh || !object.geometry?.attributes?.position) return;
        let ancestor = object;
        while (ancestor && ancestor !== root) {
          if (!ancestor.visible) return;
          ancestor = ancestor.parent;
        }
        object.geometry.computeBoundingBox();
        const box = object.geometry.boundingBox;
        if (!box || box.isEmpty()) return;
        for (const x of [box.min.x, box.max.x]) for (const y of [box.min.y, box.max.y]) for (const z of [box.min.z, box.max.z]) {
          const vector = camera.position.clone().set(x, y, z).applyMatrix4(object.matrixWorld).project(camera);
          xmin = Math.min(xmin, vector.x); xmax = Math.max(xmax, vector.x);
          ymin = Math.min(ymin, vector.y); ymax = Math.max(ymax, vector.y);
          count++;
        }
      });
    }
    return { xmin, xmax, ymin, ymax, count };
  });
}

async function exercise(page, viewportName) {
  const modes = { female: [true, false], well: [false, true], pair: [true, true] };
  for (const [mode, visible] of Object.entries(modes)) {
    await page.evaluate(mode => document.querySelector(`[data-mode="${mode}"]`).click(), mode);
    for (const view of ['front', 'angle', 'side', 'back']) {
      await page.evaluate(view => document.querySelector(`[data-view="${view}"]`).click(), view);
      await frame(page);
      const state = await page.evaluate(() => ({
        mode: preview.state.mode, view: preview.state.view,
        visible: [preview.female.visible, preview.well.visible],
        selectedMode: document.querySelector(`[data-mode="${preview.state.mode}"]`).getAttribute('aria-pressed'),
        selectedView: document.querySelector(`[data-view="${preview.state.view}"]`).getAttribute('aria-pressed'),
      }));
      assert.equal(state.mode, mode); assert.equal(state.view, view);
      assert.deepEqual(state.visible, visible);
      assert.equal(state.selectedMode, 'true'); assert.equal(state.selectedView, 'true');
      const b = await bounds(page);
      assert.ok(b.count > 0 && b.xmin > -1 && b.xmax < 1 && b.ymin > -1 && b.ymax < 1,
        `${viewportName} ${mode}/${view} clipped: ${JSON.stringify(b)}`);
    }
  }
  await page.evaluate(() => document.querySelector('[data-view="face"]').click());
  assert.deepEqual(await page.evaluate(() => [preview.state.mode, preview.state.view, preview.female.visible, preview.well.visible]),
    ['female', 'face', true, false]);
  const sizes = await page.evaluate(() => ({
    client: document.documentElement.clientWidth, scroll: document.documentElement.scrollWidth,
    canvas: [document.querySelector('canvas').clientWidth, document.querySelector('canvas').clientHeight],
    aspect: preview.camera.aspect,
  }));
  assert.equal(sizes.client, sizes.scroll, `${viewportName} has horizontal overflow`);
  assert.ok(sizes.canvas[0] > 0 && sizes.canvas[1] > 0);
  assert.ok(Math.abs(sizes.aspect - sizes.canvas[0] / sizes.canvas[1]) < 0.001);
  console.log(`PASS ${viewportName}: all 3 modes × 4 views framed, face shortcut and responsive canvas`);
}

const photoViews = [
  ['face', [0, 1.56, .75], [0, 1.56, .02]],
  ['eyes', [0, 1.564, .36], [0, 1.564, .10]],
  ['angle', [.32, 1.57, .60], [0, 1.56, .02]],
  ['profile', [.62, 1.56, .02], [0, 1.56, .02]],
  ['figure-front', [0, .85, 3.75], [0, .85, 0]],
  ['figure-side', [3.75, .85, 0], [0, .85, 0]],
  ['figure-back', [0, .85, -3.75], [0, .85, 0]],
  ['torso-front', [0, 1.19, 1.20], [0, 1.19, .03]],
  ['torso-side', [1.35, 1.19, .02], [0, 1.19, .02]],
  ['butt-side', [1.15, .88, 0], [0, .88, 0]],
];

async function cleanStage(page) {
  await page.setViewport({ width: 1200, height: 1000, deviceScaleFactor: 1 });
  await page.evaluate(() => {
    document.querySelector('header').style.display = 'none';
    document.querySelector('aside').style.display = 'none';
    document.querySelector('.hint').style.display = 'none';
    document.body.style.height = '100vh';
    document.querySelector('.workspace').style.height = '100vh';
    document.querySelector('.stage').style.height = '100vh';
    window.dispatchEvent(new Event('resize'));
  });
  await frame(page);
  assert.deepEqual(await page.evaluate(() => [document.querySelector('canvas').clientWidth, document.querySelector('canvas').clientHeight]),
    [1200, 1000], 'Unexpected screenshot canvas size');
}

async function savePhotos(page, name) {
  await cleanStage(page);
  if (name === 'after') {
    for (const [file, mode, view] of [
      ['scene-front', 'pair', 'front'], ['scene-angle', 'pair', 'angle'],
      ['well-front', 'well', 'front'], ['well-angle', 'well', 'angle'],
    ]) {
      await page.evaluate(({ mode, view }) => { preview.setMode(mode); preview.setView(view); }, { mode, view });
      await frame(page);
      const b = await bounds(page);
      assert.ok(b.xmin > -1 && b.xmax < 1 && b.ymin > -1 && b.ymax < 1, `${file} screenshot clipped`);
      await page.screenshot({ path: path.join(temporary, `${file}.png`) });
    }
  }
  for (const [view, position, target] of photoViews) {
    if (name === 'previous' && view !== 'eyes') continue;
    await page.evaluate(({ position, target }) => {
      preview.setMode('female');
      preview.controls.target.set(...target);
      preview.camera.position.set(...position);
      preview.controls.update();
    }, { position, target });
    await frame(page);
    const camera = await page.evaluate(() => ({ position: preview.camera.position.toArray(), target: preview.controls.target.toArray() }));
    assert.ok(camera.position.every((v, i) => Math.abs(v - position[i]) < 1e-8));
    assert.ok(camera.target.every((v, i) => Math.abs(v - target[i]) < 1e-8));
    await page.screenshot({ path: path.join(temporary, `${name}-${view}.png`) });
  }
}

try {
  const page = await open('after');
  const model = await page.evaluate(() => {
    const meshes = [];
    preview.female.traverse(object => { if (object.isMesh) meshes.push(object.name); });
    return { meshes, maleControl: !!document.querySelector('[data-mode="male"]'),
      status: document.querySelector('#status').textContent };
  });
  assert.deepEqual(model.meshes.sort(), ['basemesh_female_body', 'basemesh_female_eyes', 'upper_lashes_cat_eye'].sort());
  assert.equal(model.maleControl, false);
  assert.match(model.status, /колодец/i);
  await exercise(page, 'desktop');

  // Real pointer input: orbit, zoom and pan rather than only clicking buttons.
  await page.evaluate(() => preview.setMode('female'));
  await frame(page);
  const initial = await page.evaluate(() => ({ position: preview.camera.position.toArray(), target: preview.controls.target.toArray() }));
  const canvas = await (await page.$('canvas')).boundingBox();
  const x = canvas.x + canvas.width * .5, y = canvas.y + canvas.height * .5;
  await page.mouse.move(x, y); await page.mouse.down(); await page.mouse.move(x + 90, y + 25, { steps: 8 }); await page.mouse.up();
  await frame(page);
  const rotated = await page.evaluate(() => preview.camera.position.toArray());
  assert.ok(rotated.some((v, i) => Math.abs(v - initial.position[i]) > .01), 'Drag did not orbit camera');
  await page.mouse.wheel({ deltaY: 100 }); await frame(page);
  const zoomed = await page.evaluate(() => preview.camera.position.distanceTo(preview.controls.target));
  assert.ok(Math.abs(zoomed - Math.hypot(...rotated.map((v, i) => v - initial.target[i]))) > .01, 'Wheel did not zoom');
  const beforePan = await page.evaluate(() => preview.controls.target.toArray());
  await page.mouse.down({ button: 'right' }); await page.mouse.move(x + 55, y + 35, { steps: 6 }); await page.mouse.up({ button: 'right' });
  await frame(page);
  const afterPan = await page.evaluate(() => preview.controls.target.toArray());
  assert.ok(afterPan.some((v, i) => Math.abs(v - beforePan[i]) > .001), 'Right drag did not pan');
  await page.click('#spin');
  assert.equal(await page.evaluate(() => preview.controls.autoRotate && preview.state.spin), true);
  await page.click('#spin');
  assert.equal(await page.evaluate(() => preview.controls.autoRotate || preview.state.spin), false);
  console.log('PASS desktop: pointer orbit/zoom/pan and auto-rotation toggle');

  for (const [width, height] of [[390, 844], [320, 568]]) {
    await page.setViewport({ width, height, deviceScaleFactor: 1 });
    await frame(page);
    await exercise(page, `mobile ${width}×${height}`);
  }
  if (shots) {
    await savePhotos(page, 'after');
    for (const name of ['before', 'previous']) {
      const other = await open(name);
      await savePhotos(other, name);
      await other.close();
    }
    execFileSync(process.env.PYTHON || 'python3', [path.join(root, 'tools/model-a-refinement/review.py'),
      '--raw', temporary, '--output', path.join(result, 'review')], { stdio: 'inherit' });
  }
  await page.close();
  assert.deepEqual(failures, [], 'Browser console errors or external network requests');
  console.log('PASS: offline viewer, expected female meshes, no page errors or external requests');
} finally {
  await browser.close();
  fs.rmSync(temporary, { recursive: true, force: true });
}
