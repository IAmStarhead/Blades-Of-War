// Exercise the delivered self-contained showcase offline. --shots saves real
// same-camera screenshots; review.py only labels/crops them and compares pixels.
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
const result = path.resolve(positional[0] || path.join(root, 'work/character-model-search/selected-a/hand-ear-study'));
const oldZip = path.join(root, 'work/character-model-search/selected-a/motion-study/female_A_motion_and_well.zip');
const newZip = path.join(result, 'female_A_hands_ears_and_well.zip');
const temp = fs.mkdtempSync(path.join(os.tmpdir(), 'bow-a-hand-ear-review-'));
const unzip = (zip, entry) => execFileSync('unzip', ['-p', zip, entry], { maxBuffer: 20_000_000 });
const beforeHtml = unzip(oldZip, 'BladesOfWar_Showcase.html');
const afterHtml = unzip(newZip, 'BladesOfWar_Showcase.html');
const model = fs.readFileSync(path.join(result, 'female_A_hands_ears.glb'));
assert.ok(afterHtml.includes(Buffer.from(`data:model/gltf-binary;base64,${model.toString('base64')}`)), 'Embedded GLB mismatch');
fs.writeFileSync(path.join(temp, 'before.html'), beforeHtml);
fs.writeFileSync(path.join(temp, 'after.html'), afterHtml);
const threeUrl = pathToFileURL(path.join(root, 'tools/model-a-motion/node_modules/three/build/three.module.js')).href;
assert.ok(fs.existsSync(fileURLToPath(threeUrl)), 'Run npm ci --prefix tools/model-a-motion');
const handIndices = JSON.parse(execFileSync(process.env.PYTHON || 'python3', [path.join(root, 'tools/model-a-hand-ear/review-indices.py')], { maxBuffer: 2_000_000 }).toString());

const browser = await puppeteer.launch({
  executablePath: process.env.CHROME_BIN || await chromium.executablePath(),
  headless: 'shell',
  args: [...chromium.args, '--allow-file-access-from-files'],
  defaultViewport: { width: 1000, height: 800, deviceScaleFactor: 1 },
});
const failures = [];
const frame = page => page.evaluate(() => new Promise(resolve => requestAnimationFrame(() => requestAnimationFrame(resolve))));
const closeTo = (actual, expected, tolerance = 1e-5) => assert.ok(Math.abs(actual - expected) < tolerance, `${actual} ≠ ${expected}`);
async function open(name, viewport = null, reducedMotion = false) {
  const page = await browser.newPage();
  if (viewport) await page.setViewport(viewport);
  if (reducedMotion) await page.emulateMediaFeatures([{ name: 'prefers-reduced-motion', value: 'reduce' }]);
  page.setDefaultTimeout(60_000);
  page.on('pageerror', error => failures.push(`${name}: ${error}`));
  page.on('console', message => { if (message.type() === 'error') failures.push(`${name}: ${message.text()}`); });
  await page.setRequestInterception(true);
  page.on('request', request => {
    if (/^(file|data|blob):/.test(request.url())) request.continue();
    else { failures.push(`${name}: unexpected request ${request.url()}`); request.abort(); }
  });
  await page.setOfflineMode(true);
  await page.goto(pathToFileURL(path.join(temp, `${name}.html`)).href, { waitUntil: 'load', timeout: 120_000 });
  await page.waitForFunction('window.ready === true', { timeout: 120_000 });
  await page.evaluate(() => {
    preview.state.animateWell = false;
    if (preview.wellProp.pendulum) preview.wellProp.pendulum.rotation.set(0, 0, 0);
  });
  await frame(page);
  return page;
}
async function disableAuto(page) {
  await page.evaluate(() => {
    const toggle = document.querySelector('#auto-blink');
    if (toggle?.checked) toggle.click();
  });
  await page.waitForFunction('preview.state.blinkWeight === 0');
}
async function lighting(page) {
  return page.evaluate(() => preview.female.parent.children.filter(object => object.isLight).map(light => ({
    type: light.type, intensity: light.intensity, position: light.position.toArray(),
    color: light.color.getHex(), ground: light.groundColor?.getHex() ?? null,
    castShadow: light.castShadow, size: light.shadow?.mapSize.toArray() ?? null,
    bias: light.shadow?.bias ?? null, normalBias: light.shadow?.normalBias ?? null,
  })));
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
        for (let ancestor = object; ancestor && ancestor !== root; ancestor = ancestor.parent) if (!ancestor.visible) return;
        object.geometry.computeBoundingBox();
        const box = object.geometry.boundingBox;
        if (!box || box.isEmpty()) return;
        for (const x of [box.min.x, box.max.x]) for (const y of [box.min.y, box.max.y]) for (const z of [box.min.z, box.max.z]) {
          const vector = camera.position.clone().set(x, y, z).applyMatrix4(object.matrixWorld).project(camera);
          xmin = Math.min(xmin, vector.x); xmax = Math.max(xmax, vector.x);
          ymin = Math.min(ymin, vector.y); ymax = Math.max(ymax, vector.y); count++;
        }
      });
    }
    return { xmin, xmax, ymin, ymax, count };
  });
}
async function testModes(page, label) {
  for (const [mode, visible] of Object.entries({ female: [true, false], well: [false, true], pair: [true, true] })) {
    await page.evaluate(mode => document.querySelector(`[data-mode="${mode}"]`).click(), mode);
    assert.equal(await page.$eval('#soft-light', el => el.disabled), mode !== 'female');
    assert.equal(await page.$eval('#fists', el => el.disabled), mode === 'well');
    assert.equal(await page.$eval('#fist-range', el => el.disabled), mode === 'well');
    for (const view of ['front', 'angle', 'side', 'back']) {
      await page.evaluate(view => document.querySelector(`[data-view="${view}"]`).click(), view);
      await frame(page);
      const state = await page.evaluate(() => ({ mode: preview.state.mode, view: preview.state.view,
        visible: [preview.female.visible, preview.well.visible],
        modePressed: document.querySelector(`[data-mode="${preview.state.mode}"]`).getAttribute('aria-pressed'),
        viewPressed: document.querySelector(`[data-view="${preview.state.view}"]`).getAttribute('aria-pressed') }));
      assert.deepEqual(state, { mode, view, visible, modePressed: 'true', viewPressed: 'true' });
      const b = await bounds(page);
      assert.ok(b.count > 0 && b.xmin > -1 && b.xmax < 1 && b.ymin > -1 && b.ymax < 1,
        `${label}: ${mode}/${view} clipped: ${JSON.stringify(b)}`);
    }
  }
  for (const view of ['face', 'hands', 'left-hand', 'right-hand', 'left-ear', 'right-ear']) {
    await page.evaluate(view => document.querySelector(`[data-view="${view}"]`).click(), view);
    assert.deepEqual(await page.evaluate(() => [preview.state.mode, preview.state.view, preview.female.visible, preview.well.visible]),
      ['female', view, true, false]);
    if (view === 'left-hand' || view === 'right-hand') {
      const sign = view === 'left-hand' ? 1 : -1;
      const camera = await page.evaluate(() => ({ target: preview.controls.target.toArray(), position: preview.camera.position.toArray() }));
      closeTo(camera.target[0], sign * .215, .005);
      assert.ok(sign * camera.position[0] > sign * camera.target[0], `${label}: wrong hand-side camera`);
    }
    if (view === 'left-ear' || view === 'right-ear') {
      const sign = view === 'left-ear' ? 1 : -1;
      const camera = await page.evaluate(() => ({ target: preview.controls.target.toArray(), position: preview.camera.position.toArray() }));
      closeTo(camera.target[0], sign * .077, .005);
      assert.ok(sign * camera.position[0] > sign * camera.target[0], `${label}: wrong ear-side camera`);
    }
  }
  const layout = await page.evaluate(() => ({ client: document.documentElement.clientWidth, scroll: document.documentElement.scrollWidth,
    canvas: [document.querySelector('canvas').clientWidth, document.querySelector('canvas').clientHeight], aspect: preview.camera.aspect,
    mouse: getComputedStyle(document.querySelector('.hint')).display, touch: getComputedStyle(document.querySelector('.touch-hint')).display }));
  assert.equal(layout.client, layout.scroll, `${label}: horizontal overflow`);
  assert.ok(layout.canvas[0] > 0 && layout.canvas[1] > 0);
  closeTo(layout.aspect, layout.canvas[0] / layout.canvas[1], .001);
  assert.equal(layout.mouse === 'none', layout.client <= 720);
  assert.equal(layout.touch !== 'none', layout.client <= 720);
  console.log(`PASS ${label}: 3 modes × 4 framed views, face/both/individual hand and ear shortcuts and responsive layout`);
}

async function testClips(page) {
  const result = await page.evaluate(async url => {
    const { AnimationMixer, LoopOnce } = await import(url);
    preview.state.animateMotion = false;
    preview.setBlinkWeight(0); preview.setFistWeight(0);
    const mixer = new AnimationMixer(preview.female);
    const clip = name => preview.clips.find(item => item.name === name);
    const blink = mixer.clipAction(clip('Blink_Once'));
    const close = mixer.clipAction(clip('Fists_Close'));
    for (const action of [blink, close]) { action.setLoop(LoopOnce, 1); action.clampWhenFinished = true; action.play(); }
    mixer.update(.14);
    const middle = [...preview.bodyMesh.morphTargetInfluences, ...preview.faceMesh.morphTargetInfluences, ...preview.lineMesh.morphTargetInfluences];
    mixer.update(.25);
    const closed = [...preview.bodyMesh.morphTargetInfluences, ...preview.faceMesh.morphTargetInfluences, ...preview.lineMesh.morphTargetInfluences];
    blink.stop(); close.stop();
    const open = mixer.clipAction(clip('Fists_Open'));
    open.setLoop(LoopOnce, 1); open.clampWhenFinished = true; open.play(); mixer.update(.175);
    const opening = [...preview.bodyMesh.morphTargetInfluences];
    mixer.update(.2);
    const opened = [...preview.bodyMesh.morphTargetInfluences];
    mixer.stopAllAction();
    preview.setBlinkWeight(0); preview.setFistWeight(0); preview.state.animateMotion = true;
    return { middle, closed, opening, opened, names: preview.clips.map(item => item.name) };
  }, threeUrl);
  const expected = f => [f, ...[.25, .5, .75].map(c => Math.max(0, 1 - Math.abs(f - c) / .25))];
  assert.deepEqual(result.names, ['Blink_Once', 'Fists_Close', 'Fists_Open']);
  assert.ok(result.middle[0] > .1 && result.middle[0] < .9);
  result.middle.slice(0, 4).forEach((v, i) => closeTo(v, expected(result.middle[0])[i]));
  result.middle.slice(4).forEach(v => closeTo(v, 1));
  assert.deepEqual(result.closed, [1, 0, 0, 0, 0, 0, 0]);
  result.opening.forEach((v, i) => closeTo(v, expected(.5)[i]));
  assert.deepEqual(result.opened, [0, 0, 0, 0]);
  console.log('PASS: real GLB clips play together; all intermediate correction weights and neutral return are correct');
}

async function testMotion(page) {
  await page.evaluate(() => preview.setMode('female'));
  await disableAuto(page);
  assert.deepEqual(await page.evaluate(() => [preview.bodyMesh.morphTargetDictionary, preview.faceMesh.morphTargetDictionary,
    preview.lineMesh.morphTargetDictionary]), [{ Fists: 0, FistQuarterCorrection: 1, FistHalfCorrection: 2,
    FistThreeQuarterCorrection: 3 }, { Blink: 0 }, { Blink: 0, BlinkLineNarrow: 1 }]);
  await page.evaluate(() => {
    let value = preview.state.blinkWeight;
    window.blinkSamples = [];
    Object.defineProperty(preview.state, 'blinkWeight', { configurable: true, get: () => value,
      set: next => { value = next; window.blinkSamples.push(next); } });
  });
  await page.click('#blink-once');
  await page.waitForFunction('window.blinkSamples.some(v => v > .2) && preview.state.blinkWeight === 0', { timeout: 20_000 });
  await page.click('#fists');
  await page.waitForFunction('preview.state.fistWeight === 1', { timeout: 20_000 });
  await page.click('#eyes-closed');
  await page.waitForFunction('preview.state.blinkWeight === 1', { timeout: 20_000 });
  assert.deepEqual(await page.evaluate(() => [preview.bodyMesh.morphTargetInfluences, preview.faceMesh.morphTargetInfluences,
    preview.lineMesh.morphTargetInfluences]), [[1, 0, 0, 0], [1], [1, 1]]);
  assert.equal(await page.$eval('#blink-once', el => el.disabled), true);
  await page.click('#eyes-closed'); await page.click('#fists');
  await page.waitForFunction('preview.state.blinkWeight === 0 && preview.state.fistWeight === 0', { timeout: 20_000 });
  assert.deepEqual(await page.evaluate(() => [preview.bodyMesh.morphTargetInfluences, preview.faceMesh.morphTargetInfluences,
    preview.lineMesh.morphTargetInfluences]), [[0, 0, 0, 0], [0], [0, 0]]);
  for (const value of [25, 50, 75, 100]) {
    await page.$eval('#fist-range', (el, next) => { el.value = String(next); el.dispatchEvent(new Event('input', { bubbles: true })); }, value);
    await frame(page);
    const state = await page.evaluate(() => ({ value: preview.state.fistWeight, weights: [...preview.bodyMesh.morphTargetInfluences],
      label: document.querySelector('#fist-value').value, checked: document.querySelector('#fists').checked }));
    const f = value / 100;
    closeTo(state.value, f);
    const expected = [f, ...[.25, .5, .75].map(c => Math.max(0, 1 - Math.abs(f - c) / .25))];
    state.weights.forEach((weight, i) => closeTo(weight, expected[i]));
    assert.equal(state.label, `${value}%`); assert.equal(state.checked, value === 100);
  }
  await page.click('#fists');
  await page.waitForFunction('preview.state.fistWeight === 0', { timeout: 20_000 });
  await page.evaluate(() => { window.blinkSamples = []; });
  await page.click('#auto-blink');
  await page.waitForFunction('window.blinkSamples.some(v => v > .2)', { timeout: 20_000 });
  await page.click('#auto-blink');
  await page.waitForFunction('preview.state.blinkWeight === 0', { timeout: 20_000 });
  console.log('PASS: once/automatic blink, independent fists, slider at 25/50/75/100% and neutral return');
}

async function testTouch(page) {
  await page.evaluate(() => { preview.setMode('female'); window.scrollTo(0, 0); });
  await frame(page);
  const box = await (await page.$('canvas')).boundingBox();
  const x = box.x + box.width * .5, y = box.y + box.height * .5;
  const initial = await page.evaluate(() => preview.camera.position.toArray());
  const finger = await page.touchscreen.touchStart(x, y);
  await finger.move(x + 60, y + 25); await finger.end(); await frame(page);
  const moved = await page.evaluate(() => preview.camera.position.toArray());
  assert.ok(moved.some((v, i) => Math.abs(v - initial[i]) > .01), 'Touch orbit failed');
  const distance = await page.evaluate(() => preview.camera.position.distanceTo(preview.controls.target));
  const left = await page.touchscreen.touchStart(x - 25, y);
  const right = await page.touchscreen.touchStart(x + 25, y);
  await left.move(x - 60, y); await right.move(x + 60, y); await left.end(); await right.end(); await frame(page);
  const zoom = await page.evaluate(() => preview.camera.position.distanceTo(preview.controls.target));
  assert.ok(Math.abs(zoom - distance) > .01, 'Two-finger pinch failed');
  console.log('PASS mobile touch: orbit and pinch-to-zoom');
}

async function cleanStage(page) {
  await page.setViewport({ width: 1000, height: 900, deviceScaleFactor: 1 });
  await page.evaluate(() => {
    document.querySelector('header').style.display = 'none';
    document.querySelector('aside').style.display = 'none';
    document.querySelector('.hint').style.display = 'none';
    document.body.style.height = '100vh';
    document.querySelector('.workspace').style.height = '100vh';
    document.querySelector('.stage').style.height = '100vh';
    window.dispatchEvent(new Event('resize'));
    preview.controls.enableDamping = false;
    if ('animateMotion' in preview.state) {
      preview.state.animateMotion = false; preview.setBlinkWeight(0); preview.setFistWeight(0);
    }
  });
  await frame(page);
  assert.deepEqual(await page.evaluate(() => [document.querySelector('canvas').clientWidth, document.querySelector('canvas').clientHeight]), [1000, 900]);
}
async function camera(page, position, target) {
  await page.evaluate(({ position, target }) => {
    preview.setMode('female'); preview.controls.target.set(...target); preview.camera.position.set(...position); preview.controls.update();
  }, { position, target });
  await frame(page);
}
async function saveWell(page, name) {
  for (const [mode, view, suffix] of [
    ['well', 'front', 'well-front'], ['well', 'angle', 'well-angle'],
    ['pair', 'front', 'pair-without-female-front'], ['pair', 'angle', 'pair-without-female-angle'],
  ]) {
    await page.evaluate(({ mode, view }) => { preview.setMode(mode); preview.setView(view); if (mode === 'pair') preview.female.visible = false; }, { mode, view });
    await frame(page); await page.screenshot({ path: path.join(temp, `${name}-${suffix}.png`) });
  }
  if (name === 'after' && shots) {
    for (const [mode, view, suffix] of [['pair', 'front', 'scene-front'], ['pair', 'angle', 'scene-angle'],
      ['well', 'front', 'well-front'], ['well', 'angle', 'well-angle'], ['female', 'front', 'figure-front']]) {
      await page.evaluate(({ mode, view }) => { preview.setMode(mode); preview.setView(view); }, { mode, view });
      await frame(page); await page.screenshot({ path: path.join(temp, `after-${suffix}.png`) });
    }
  }
}
async function saveFace(page, name) {
  await camera(page, [0, 1.56, .60], [0, 1.56, .02]);
  await page.screenshot({ path: path.join(temp, `${name}-face.png`) });
}
async function saveDetails(page, name) {
  // Identical cameras, both the old and new grip, both sides, plus ear views.
  await camera(page, [0, .77, 1.12], [0, .77, .05]);
  await page.evaluate(() => { preview.setBlinkWeight(0); preview.setFistWeight(1); });
  await frame(page); await page.screenshot({ path: path.join(temp, `${name}-both-fists.png`) });
  for (const [side, sign] of [['left', 1], ['right', -1]]) {
    await camera(page, [.62 * sign, .765, .05], [.215 * sign, .765, .05]);
    for (const [pose, weight] of [['open', 0], ['fist', 1], ['reset', 0]]) {
      await page.evaluate(weight => { preview.setBlinkWeight(0); preview.setFistWeight(weight); }, weight);
      await frame(page); await page.screenshot({ path: path.join(temp, `${name}-${side}-hand-${pose}.png`) });
    }
    await camera(page, [.215 * sign, .765, .45], [.215 * sign, .765, .05]);
    await page.evaluate(() => preview.setFistWeight(1)); await frame(page);
    await page.screenshot({ path: path.join(temp, `${name}-${side}-hand-front.png`) });
    await camera(page, [.215 * sign, .765, -.35], [.215 * sign, .765, .05]);
    await frame(page); await page.screenshot({ path: path.join(temp, `${name}-${side}-hand-back.png`) });
    await camera(page, [.38 * sign, 1.554, .018], [.077 * sign, 1.554, .018]);
    await page.evaluate(() => preview.setFistWeight(0)); await frame(page);
    await page.screenshot({ path: path.join(temp, `${name}-${side}-ear.png`) });
    await camera(page, [.34 * sign, 1.575, .19], [.077 * sign, 1.554, .018]);
    await frame(page); await page.screenshot({ path: path.join(temp, `${name}-${side}-ear-angle.png`) });
  }
  if (name === 'after') {
    await camera(page, [0, 1.564, .38], [0, 1.564, .1]);
    for (const [pose, weight] of [['open', 0], ['closed', 1], ['reset', 0]]) {
      await page.evaluate(weight => { preview.setFistWeight(0); preview.setBlinkWeight(weight); }, weight);
      await frame(page); await page.screenshot({ path: path.join(temp, `eyes-${pose}.png`) });
    }
  }
  // Isolating a hand is a viewer-only test: no mesh in the GLB is altered.
  // The resulting review is explicitly labelled as isolated to avoid implying
  // that its cut wrist is part of the delivered model.
  await page.evaluate(() => {
    window.originalHandReviewGeometry = preview.bodyMesh.geometry;
    preview.faceMesh.visible = false; preview.lineMesh.visible = false;
    preview.female.getObjectByName('basemesh_female_eyes').visible = false;
  });
  for (const [side, sign, key] of [['left', 1, 'L'], ['right', -1, 'R']]) {
    await page.evaluate(indices => {
      const geometry = window.originalHandReviewGeometry.clone();
      geometry.setIndex(indices);
      preview.bodyMesh.geometry = geometry;
    }, handIndices[key]);
    await camera(page, [-.13 * sign, .76, .05], [.21 * sign, .76, .05]);
    const poses = name === 'after' && side === 'left'
      ? [['0', 0], ['25', .25], ['50', .5], ['75', .75], ['100', 1]] : [['100', 1]];
    for (const [pose, weight] of poses) {
      await page.evaluate(weight => { preview.setBlinkWeight(0); preview.setFistWeight(weight); }, weight);
      await frame(page); await page.screenshot({ path: path.join(temp, `${name}-${side}-isolated-${pose}.png`) });
    }
    await page.evaluate(() => { preview.bodyMesh.geometry.dispose(); preview.bodyMesh.geometry = window.originalHandReviewGeometry; });
  }
  await page.evaluate(() => {
    preview.faceMesh.visible = true; preview.lineMesh.visible = true;
    preview.female.getObjectByName('basemesh_female_eyes').visible = true;
  });
}

try {
  const page = await open('after');
  await testClips(page);
  await testMotion(page);
  await testModes(page, 'desktop');
  await page.evaluate(() => preview.setMode('female')); await frame(page);
  const canvas = await (await page.$('canvas')).boundingBox();
  const x = canvas.x + canvas.width * .5, y = canvas.y + canvas.height * .5;
  const originalPosition = await page.evaluate(() => preview.camera.position.toArray());
  await page.mouse.move(x, y); await page.mouse.down(); await page.mouse.move(x + 80, y + 25, { steps: 6 }); await page.mouse.up(); await frame(page);
  const rotated = await page.evaluate(() => preview.camera.position.toArray());
  assert.ok(rotated.some((v, i) => Math.abs(v - originalPosition[i]) > .01), 'Mouse orbit failed');
  const distance = await page.evaluate(() => preview.camera.position.distanceTo(preview.controls.target));
  await page.mouse.wheel({ deltaY: 120 }); await frame(page);
  const zoom = await page.evaluate(() => preview.camera.position.distanceTo(preview.controls.target));
  assert.ok(Math.abs(zoom - distance) > .01, 'Mouse wheel zoom failed');
  const priorTarget = await page.evaluate(() => preview.controls.target.toArray());
  await page.mouse.down({ button: 'right' }); await page.mouse.move(x + 55, y + 35, { steps: 6 }); await page.mouse.up({ button: 'right' }); await frame(page);
  const afterTarget = await page.evaluate(() => preview.controls.target.toArray());
  assert.ok(afterTarget.some((v, i) => Math.abs(v - priorTarget[i]) > .001), 'Mouse pan failed');
  console.log('PASS desktop: pointer orbit, wheel zoom and pan');

  for (const [width, height] of [[390, 844], [320, 568]]) {
    await page.setViewport({ width, height, deviceScaleFactor: 1 }); await frame(page);
    await testModes(page, `mobile ${width}×${height}`);
    await page.click('#fists'); await page.waitForFunction('preview.state.fistWeight === 1', { timeout: 20_000 });
    await page.click('#fists'); await page.waitForFunction('preview.state.fistWeight === 0', { timeout: 20_000 });
  }
  await page.close();
  const touch = await open('after', { width: 390, height: 844, deviceScaleFactor: 1, isMobile: true, hasTouch: true });
  await disableAuto(touch); await testTouch(touch); await touch.close();
  const reduced = await open('after', null, true);
  assert.equal(await reduced.$eval('#auto-blink', el => el.checked), false);
  assert.equal(await reduced.evaluate(() => preview.state.autoBlink), false);
  await reduced.close();
  console.log('PASS: reduced-motion preference disables automatic blinking by default');

  const prior = await open('before');
  const revised = await open('after');
  await disableAuto(revised);
  await prior.evaluate(() => preview.setMode('pair')); await revised.evaluate(() => preview.setMode('pair'));
  assert.deepEqual(await lighting(prior), await lighting(revised), 'Pair lighting changed');
  await prior.evaluate(() => preview.setMode('female')); await revised.evaluate(() => preview.setMode('female'));
  assert.deepEqual(await lighting(prior), await lighting(revised), 'Female soft lighting changed');
  await revised.evaluate(() => document.querySelector('#soft-light').click());
  assert.equal(await revised.evaluate(() => preview.state.softLight), false);
  await revised.evaluate(() => preview.setMode('well'));
  const wellLights = await lighting(revised);
  await revised.evaluate(() => preview.setMode('pair'));
  assert.deepEqual(await lighting(revised), wellLights, 'Well/pair lighting diverged');
  await revised.evaluate(() => preview.setMode('female'));
  assert.deepEqual(await lighting(revised), wellLights, 'Soft-light off preference did not persist');
  await revised.evaluate(() => document.querySelector('#soft-light').click());
  await prior.close(); await revised.close();
  console.log('PASS: unchanged lights and retained female-only soft-light toggle');

  // Fresh pages and fixed cameras, with any animation disabled, for pixel checks.
  const before = await open('before'); await disableAuto(before); await cleanStage(before);
  await saveWell(before, 'before'); await saveFace(before, 'before'); await saveDetails(before, 'before'); await before.close();
  const after = await open('after'); await disableAuto(after); await cleanStage(after);
  await saveWell(after, 'after'); await saveFace(after, 'after'); await saveDetails(after, 'after'); await after.close();
  const args = [path.join(root, 'tools/model-a-hand-ear/review.py'), '--raw', temp];
  if (shots) args.push('--output', path.join(result, 'review'));
  execFileSync(process.env.PYTHON || 'python3', args, { stdio: 'inherit' });
  assert.deepEqual(failures, [], 'Page errors or unexpected network access');
  console.log('PASS: offline viewer, source well, both motion controls and no page errors');
} finally {
  await browser.close();
  fs.rmSync(temp, { recursive: true, force: true });
}
