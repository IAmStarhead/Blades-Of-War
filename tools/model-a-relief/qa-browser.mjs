// Test the delivered viewer offline. --shots also records actual same-camera
// before/after renders; no illustration or post-processing changes the models.
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
const result = path.resolve(positional[0] || path.join(root, 'work/character-model-search/selected-a/relief-study'));
const oldZip = path.join(root, 'work/character-model-search/selected-a/refined-v2/female_A_v2_and_detailed_well.zip');
const newZip = path.join(result, 'female_A_skin_relief_and_well.zip');
const temporary = fs.mkdtempSync(path.join(os.tmpdir(), 'bow-a-relief-review-'));
const unzip = (zip, entry) => execFileSync('unzip', ['-p', zip, entry], { maxBuffer: 20_000_000 });
const beforeHtml = unzip(oldZip, 'BladesOfWar_Showcase.html');
const afterHtml = unzip(newZip, 'BladesOfWar_Showcase.html');
const model = fs.readFileSync(path.join(result, 'female_A_skin_relief.glb'));
const uri = Buffer.from(`data:model/gltf-binary;base64,${model.toString('base64')}`);
assert.ok(afterHtml.includes(uri), 'The delivered HTML does not contain the delivered GLB');
for (const [name, html] of [['before', beforeHtml], ['after', afterHtml]]) {
  fs.writeFileSync(path.join(temporary, `${name}.html`), html);
}

const browser = await puppeteer.launch({
  executablePath: process.env.CHROME_BIN || await chromium.executablePath(),
  headless: 'shell',
  args: [...chromium.args, '--allow-file-access-from-files'],
  defaultViewport: { width: 1280, height: 900, deviceScaleFactor: 1 },
});
const frame = page => page.evaluate(() => new Promise(resolve => requestAnimationFrame(() => requestAnimationFrame(resolve))));
const failures = [];
async function open(name, viewport = null) {
  const page = await browser.newPage();
  if (viewport) await page.setViewport(viewport);
  page.setDefaultTimeout(60_000);
  page.on('pageerror', error => failures.push(`${name}: ${error}`));
  page.on('console', message => { if (message.type() === 'error') failures.push(`${name}: ${message.text()}`); });
  await page.setRequestInterception(true);
  page.on('request', request => {
    if (/^(file|data|blob):/.test(request.url())) request.continue();
    else { failures.push(`${name}: unexpected network request ${request.url()}`); request.abort(); }
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
  for (const [mode, visible] of Object.entries({ female: [true, false], well: [false, true], pair: [true, true] })) {
    await page.evaluate(mode => document.querySelector(`[data-mode="${mode}"]`).click(), mode);
    const disabled = await page.$eval('#soft-light', input => input.disabled);
    assert.equal(disabled, mode !== 'female', `${viewportName}: light toggle enabled in ${mode}`);
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
  assert.equal(await page.$eval('#soft-light', input => input.disabled), false);
  const sizes = await page.evaluate(() => ({
    client: document.documentElement.clientWidth, scroll: document.documentElement.scrollWidth,
    canvas: [document.querySelector('canvas').clientWidth, document.querySelector('canvas').clientHeight],
    aspect: preview.camera.aspect,
    desktopHint: getComputedStyle(document.querySelector('.hint')).display,
    touchHint: getComputedStyle(document.querySelector('.touch-hint')).display,
  }));
  assert.equal(sizes.client, sizes.scroll, `${viewportName} has horizontal overflow`);
  assert.ok(sizes.canvas[0] > 0 && sizes.canvas[1] > 0);
  assert.ok(Math.abs(sizes.aspect - sizes.canvas[0] / sizes.canvas[1]) < 0.001);
  if (sizes.client <= 720) {
    assert.equal(sizes.desktopHint, 'none', `${viewportName}: mouse hint covers the model`);
    assert.notEqual(sizes.touchHint, 'none', `${viewportName}: touch instructions missing`);
  } else {
    assert.notEqual(sizes.desktopHint, 'none'); assert.equal(sizes.touchHint, 'none');
  }
  // Ensure the new option is actually usable when the mobile layout scrolls.
  const selected = await page.$eval('#soft-light', input => input.checked);
  await page.click('#soft-light');
  assert.equal(await page.$eval('#soft-light', input => input.checked), !selected);
  await page.click('#soft-light');
  console.log(`PASS ${viewportName}: 3 modes × 4 views framed; face shortcut and responsive light toggle`);
}

async function exerciseTouch(page) {
  await page.evaluate(() => preview.setMode('female'));
  await frame(page);
  const box = await (await page.$('canvas')).boundingBox();
  const x = box.x + box.width * .5, y = box.y + box.height * .5;
  const initial = await page.evaluate(() => preview.camera.position.toArray());
  const finger = await page.touchscreen.touchStart(x, y);
  await finger.move(x + 60, y + 25);
  await finger.end();
  await frame(page);
  const rotated = await page.evaluate(() => preview.camera.position.toArray());
  assert.ok(rotated.some((value, i) => Math.abs(value - initial[i]) > .01), 'Touch drag did not orbit');
  const distance = await page.evaluate(() => preview.camera.position.distanceTo(preview.controls.target));
  const left = await page.touchscreen.touchStart(x - 25, y);
  const right = await page.touchscreen.touchStart(x + 25, y);
  await left.move(x - 60, y);
  await right.move(x + 60, y);
  await left.end(); await right.end();
  await frame(page);
  const zoomed = await page.evaluate(() => preview.camera.position.distanceTo(preview.controls.target));
  assert.ok(Math.abs(zoomed - distance) > .01, 'Two-finger pinch did not zoom');
  console.log('PASS mobile touch: one-finger orbit and two-finger zoom');
}

async function inspectLighting(page) {
  return page.evaluate(() => {
    const lights = preview.female.parent.children.filter(object => object.isLight).map(object => ({
      type: object.type, intensity: object.intensity, position: object.position.toArray(),
      color: object.color.getHex(), groundColor: object.groundColor?.getHex() ?? null,
      castShadow: object.castShadow,
      shadowSize: object.shadow ? object.shadow.mapSize.toArray() : null,
      shadowBias: object.shadow?.bias ?? null,
      shadowNormalBias: object.shadow?.normalBias ?? null,
    }));
    const meshes = [];
    preview.female.traverse(object => {
      if (object.isMesh) meshes.push({ name: object.name, castShadow: object.castShadow,
        receiveShadow: object.receiveShadow, roughness: object.material.roughness });
    });
    return { lights, meshes, shadowMapEnabled: preview.renderer.shadowMap.enabled };
  });
}

async function checkLighting(after, before) {
  await before.evaluate(() => preview.setMode('female'));
  const original = await inspectLighting(before);
  assert.equal(original.lights.length, 4);
  assert.deepEqual(original.lights.map(light => light.type), ['HemisphereLight', 'DirectionalLight', 'DirectionalLight', 'DirectionalLight']);
  assert.deepEqual(original.meshes.map(mesh => mesh.name).sort(),
    ['basemesh_female_body', 'basemesh_female_eyes', 'upper_eyelid_line'].sort());
  assert.ok(original.shadowMapEnabled && original.meshes.every(mesh => mesh.castShadow && !mesh.receiveShadow));
  assert.deepEqual(original.lights[1].shadowSize, [1024, 1024]);
  assert.equal(original.lights.filter(light => light.castShadow).length, 1);
  // Paired view has the original lights even though the preference is checked.
  assert.equal(await after.$eval('#soft-light', input => input.disabled && input.checked), true);
  assert.deepEqual(await inspectLighting(after), original, 'Paired view changed the original lights or materials');
  await after.evaluate(() => preview.setMode('female'));
  const gentle = await inspectLighting(after);
  const expected = structuredClone(original);
  expected.lights[0].intensity = .88;
  expected.lights[1].intensity = 1.75;
  expected.lights[1].position = [-3.1, 3.8, 4.2];
  expected.lights[2].intensity = .62;
  expected.lights[3].intensity = .32;
  assert.deepEqual(gentle, expected, 'Soft light changed more than the intended settings');
  assert.equal(await after.$eval('#soft-light', input => input.disabled), false);
  await after.click('#soft-light');
  assert.deepEqual(await inspectLighting(after), original, 'Turning the soft light off did not restore baseline');
  assert.equal(await after.evaluate(() => preview.state.softLight), false);
  await after.evaluate(() => preview.setMode('well'));
  assert.deepEqual(await inspectLighting(after), original, 'Well-only mode changed the baseline lights');
  assert.equal(await after.$eval('#soft-light', input => input.disabled && !input.checked), true);
  await after.evaluate(() => preview.setMode('female'));
  assert.deepEqual(await inspectLighting(after), original, 'Off preference was not preserved across modes');
  await after.click('#soft-light');
  await after.evaluate(() => preview.setMode('pair'));
  assert.deepEqual(await inspectLighting(after), original, 'Pair changed after turning soft light on');
  await after.evaluate(() => preview.setMode('female'));
  assert.deepEqual(await inspectLighting(after), expected, 'On preference was not preserved across modes');
  console.log('PASS: soft-light toggle and persistence; original well/pair lighting, same lights, materials and shadow setup');
}

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
    [1200, 1000]);
}

async function saveWell(page, name) {
  for (const [mode, view, suffix] of [
    ['well', 'front', 'well-front'], ['well', 'angle', 'well-angle'],
    ['pair', 'front', 'pair-without-female-front'], ['pair', 'angle', 'pair-without-female-angle'],
  ]) {
    await page.evaluate(({ mode, view }) => {
      preview.setMode(mode); preview.setView(view);
      if (mode === 'pair') preview.female.visible = false;
    }, { mode, view });
    await frame(page);
    await page.screenshot({ path: path.join(temporary, `${name}-${suffix}.png`) });
  }
  if (name === 'after' && shots) {
    for (const [view, suffix] of [['front', 'scene-front'], ['angle', 'scene-angle']]) {
      await page.evaluate(view => { preview.setMode('pair'); preview.setView(view); }, view);
      await frame(page);
      await page.screenshot({ path: path.join(temporary, `${name}-${suffix}.png`) });
    }
  }
}

const photoViews = [
  ['face', [0, 1.56, .75], [0, 1.56, .02]],
  ['torso-front', [0, 1.19, 1.20], [0, 1.19, .03]],
  ['torso-angle', [.65, 1.19, 1.07], [0, 1.19, .03]],
  ['figure-front', [0, .85, 3.75], [0, .85, 0]],
  ['figure-angle', [1.875, .85, 3.247595], [0, .85, 0]],
  ['figure-back', [0, .85, -3.75], [0, .85, 0]],
];
async function saveFigure(page, name, softLight) {
  await page.evaluate(() => preview.setMode('female'));
  if (softLight !== null) {
    // The sidebar is visually hidden for the capture, so switch exactly as a user would.
    await page.evaluate(want => {
      const toggle = document.querySelector('#soft-light');
      if (toggle.checked !== want) toggle.click();
    }, softLight);
    assert.equal(await page.$eval('#soft-light', input => input.checked), softLight);
  }
  for (const [view, position, target] of photoViews) {
    await page.evaluate(({ position, target }) => {
      preview.setMode('female');
      preview.controls.target.set(...target);
      preview.camera.position.set(...position);
      preview.controls.update();
    }, { position, target });
    await frame(page);
    const camera = await page.evaluate(() => ({ position: preview.camera.position.toArray(), target: preview.controls.target.toArray() }));
    assert.ok(camera.position.every((value, i) => Math.abs(value - position[i]) < 1e-8));
    assert.ok(camera.target.every((value, i) => Math.abs(value - target[i]) < 1e-8));
    await page.screenshot({ path: path.join(temporary, `${name}-${view}.png`) });
  }
}

try {
  const after = await open('after');
  const before = await open('before');
  assert.equal(await after.$('[data-mode="male"]'), null);
  assert.match(await after.$eval('#status', element => element.textContent), /колодец/i);
  await checkLighting(after, before);
  await exercise(after, 'desktop');

  // Real pointer input, not only programmatic camera changes.
  await after.evaluate(() => preview.setMode('female'));
  await frame(after);
  const initial = await after.evaluate(() => ({ position: preview.camera.position.toArray(), target: preview.controls.target.toArray() }));
  const canvas = await (await after.$('canvas')).boundingBox();
  const x = canvas.x + canvas.width * .5, y = canvas.y + canvas.height * .5;
  await after.mouse.move(x, y); await after.mouse.down();
  await after.mouse.move(x + 90, y + 25, { steps: 8 }); await after.mouse.up();
  await frame(after);
  const rotated = await after.evaluate(() => preview.camera.position.toArray());
  assert.ok(rotated.some((value, i) => Math.abs(value - initial.position[i]) > .01), 'Drag did not orbit');
  await after.mouse.wheel({ deltaY: 100 }); await frame(after);
  const zoomed = await after.evaluate(() => preview.camera.position.distanceTo(preview.controls.target));
  assert.ok(Math.abs(zoomed - Math.hypot(...rotated.map((value, i) => value - initial.target[i]))) > .01, 'Wheel did not zoom');
  const beforePan = await after.evaluate(() => preview.controls.target.toArray());
  await after.mouse.down({ button: 'right' });
  await after.mouse.move(x + 55, y + 35, { steps: 6 }); await after.mouse.up({ button: 'right' });
  await frame(after);
  const afterPan = await after.evaluate(() => preview.controls.target.toArray());
  assert.ok(afterPan.some((value, i) => Math.abs(value - beforePan[i]) > .001), 'Right drag did not pan');
  await after.click('#spin');
  assert.equal(await after.evaluate(() => preview.controls.autoRotate && preview.state.spin), true);
  await after.click('#spin');
  assert.equal(await after.evaluate(() => preview.controls.autoRotate || preview.state.spin), false);
  console.log('PASS desktop: pointer orbit/zoom/pan and auto-rotation');

  for (const [width, height] of [[390, 844], [320, 568]]) {
    await after.setViewport({ width, height, deviceScaleFactor: 1 });
    await frame(after);
    await exercise(after, `mobile ${width}×${height}`);
  }
  await after.close(); await before.close();
  const touch = await open('after', { width: 390, height: 844, deviceScaleFactor: 1, isMobile: true, hasTouch: true });
  await exerciseTouch(touch);
  await touch.close();

  // Fresh pages avoid residual mouse damping; both use the delivered HTML.
  const cameraBefore = await open('before');
  const cameraAfter = await open('after');
  await cleanStage(cameraBefore); await cleanStage(cameraAfter);
  await saveWell(cameraBefore, 'before'); await saveWell(cameraAfter, 'after');
  if (shots) {
    await saveFigure(cameraBefore, 'before', null);
    await saveFigure(cameraAfter, 'after', true);
    await saveFigure(cameraAfter, 'texture', false);
  }
  const args = [path.join(root, 'tools/model-a-relief/review.py'), '--raw', temporary];
  if (shots) args.push('--output', path.join(result, 'review'));
  execFileSync(process.env.PYTHON || 'python3', args, { stdio: 'inherit' });
  await cameraBefore.close(); await cameraAfter.close();
  assert.deepEqual(failures, [], 'Browser console errors or external network requests');
  console.log('PASS: fully offline viewer, original well and no page errors');
} finally {
  await browser.close();
  fs.rmSync(temporary, { recursive: true, force: true });
}
