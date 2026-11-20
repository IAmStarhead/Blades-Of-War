// Offline 3D, controls, download, repeat-sample and emulated-touch checks.
// The mobile emulation is not a physical Android/iOS or game-engine test.
import assert from 'node:assert/strict';
import {createHash} from 'node:crypto';
import {createRequire} from 'node:module';
import {fileURLToPath, pathToFileURL} from 'node:url';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
const repo = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const output = path.resolve(process.argv[2] || path.join(repo, 'work/male-motion-fit'));
const require = createRequire(path.join(repo, 'tools/character-showcase/package.json'));
const puppeteer = require('puppeteer-core'), chromium = require('@sparticuz/chromium').default;
const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'bow-motion-fit-download-')), errors = [];
const hash = bytes => createHash('sha256').update(bytes).digest('hex');
const browser = await puppeteer.launch({executablePath: process.env.CHROME_BIN || await chromium.executablePath(), headless: 'shell',
  args: [...chromium.args, '--allow-file-access-from-files', '--disable-dev-shm-usage'], protocolTimeout: 180000});
async function open(viewport, trackErrors = true) {
  const page = await browser.newPage(); await page.setViewport(viewport);
  if (trackErrors) {
    page.on('pageerror', e => errors.push('page: ' + e.message));
    page.on('console', m => { if (m.type() === 'error') errors.push('console: ' + m.text()); });
  }
  await page.setRequestInterception(true);
  page.on('request', r => /^(file|data|blob):/i.test(r.url()) ? r.continue() : (errors.push('external request: ' + r.url()), r.abort()));
  await page.setOfflineMode(true);
  return page;
}
async function load(page) {
  await page.goto(pathToFileURL(path.join(output, 'index.html')).href, {waitUntil: 'load', timeout: 60000});
  await page.waitForFunction('window.motionFit?.state.ready === true', {timeout: 60000});
}
async function canvasHash(page) {
  await page.evaluate(() => motionFit.renderNow());
  return hash(await (await page.$('#stage canvas')).screenshot({type: 'png'}));
}
async function snapshot(page) {
  return page.evaluate(() => {
    const d = motionFit, v = d.camera.position.clone(); d.model.updateMatrixWorld(true);
    return {state: {...d.state}, camera: d.camera.position.toArray(), target: d.orbit.target.toArray(),
      foot: d.rig.getObjectByName('Rig_Foot_L').getWorldPosition(v).toArray(), grid: d.floorTexture.offset.toArray()};
  });
}
try {
  const desktop = await open({width: 1440, height: 1000, deviceScaleFactor: 1}); await load(desktop);
  assert.equal(await desktop.$eval('#status', e => e.dataset.state), 'ready');
  assert.deepEqual(await desktop.evaluate(() => motionFit.gltf.animations.map(a => a.name)), ['Walk_NewBody', 'Run_NewBody', 'Walk_C', 'Run_C']);
  assert.equal(await desktop.evaluate(() => { let n = 0; motionFit.model.traverse(o => { if (o.isSkinnedMesh && o.frustumCulled) n++; }); return n; }), 0);
  await desktop.evaluate(() => { motionFit.setVersion('selected'); motionFit.setMotion('walk'); motionFit.setPhase(.17); });
  const first = await canvasHash(desktop), a = await snapshot(desktop);
  await desktop.evaluate(() => { motionFit.samplePose(); motionFit.samplePose(); }); const repeated = await snapshot(desktop);
  assert.deepEqual(repeated.grid, a.grid, 'grid must not jump on repeated paused samples');
  for (let k = 0; k < 3; k++) assert.ok(Math.abs(repeated.foot[k] - a.foot[k]) < 1e-9, 'pose must remain stable on pause');
  await desktop.evaluate(() => motionFit.setPhase(.64)); assert.notEqual(await canvasHash(desktop), first, 'walk changes its visible pose');
  const beforeCompare = await snapshot(desktop); await desktop.click('[data-version="previous"]'); const previous = await snapshot(desktop);
  assert.equal(previous.state.version, 'previous'); assert.equal(previous.state.phase, beforeCompare.state.phase);
  assert.deepEqual(previous.camera, beforeCompare.camera, 'comparison retains camera');
  assert.ok(Math.hypot(...previous.foot.map((v, i) => v - beforeCompare.foot[i])) > .01, 'previous clip is actually different');
  assert.equal(await desktop.$eval('[data-action="ground"]', e => e.disabled), true);
  assert.equal(previous.grid[1], 0, 'previous grid is static');
  await desktop.click('[data-version="selected"]');
  await desktop.evaluate(() => { motionFit.sampleSeconds(.2); }); const grid1 = await snapshot(desktop);
  await desktop.evaluate(() => { motionFit.sampleSeconds(.3); }); const grid2 = await snapshot(desktop);
  const delta = ((grid2.grid[1] - grid1.grid[1]) % 1 + 1) % 1, expected = ((-.1 * 1.73 / .25) % 1 + 1) % 1;
  assert.ok(Math.abs(delta - expected) < 1e-8, 'grid travels backward at stated approximate speed');
  await desktop.click('[data-action="ground"]'); assert.equal((await snapshot(desktop)).grid[1], 0);
  await desktop.click('[data-action="ground"]');
  await desktop.click('[data-motion="run"]'); await desktop.evaluate(() => motionFit.setPhase(.27));
  assert.equal((await snapshot(desktop)).state.motion, 'run'); const runA = await canvasHash(desktop);
  await desktop.evaluate(() => motionFit.setPhase(.72)); assert.notEqual(await canvasHash(desktop), runA, 'run changes visible pose');
  await desktop.click('[data-view="front"]'); await desktop.click('[data-focus="knees"]');
  const focused = await snapshot(desktop); assert.equal(focused.state.focus, 'knees');
  await desktop.evaluate(() => motionFit.setPhase(.16));
  const moved = await snapshot(desktop); assert.ok(Math.hypot(...moved.target.map((v, i) => v - focused.target[i])) > .001, 'focus follows knees');
  const expectedKnees = await desktop.evaluate(() => {
    const d = motionFit, a = d.rig.getObjectByName('Rig_Shin_L').getWorldPosition(d.camera.position.clone());
    const b = d.rig.getObjectByName('Rig_Shin_R').getWorldPosition(d.camera.position.clone());
    return a.add(b).multiplyScalar(.5).add({x: 0, y: .02, z: 0}).toArray();
  });
  assert.ok(Math.hypot(...moved.target.map((v, i) => v - expectedKnees[i])) < 1e-6, 'camera target is the sampled knee midpoint');
  await desktop.click('[data-focus="feet"]'); await desktop.click('[data-action="skeleton"]');
  assert.equal(await desktop.evaluate(() => motionFit.helper.visible), true); await desktop.click('[data-action="skeleton"]');
  await desktop.click('[data-motion="stand"]'); assert.equal(await desktop.$eval('#phase', e => e.disabled), true);
  assert.equal(await desktop.$eval('[data-action="ground"]', e => e.disabled), true);
  await desktop.click('[data-motion="walk"]');
  await desktop.$eval('#phase', e => { e.value = '500'; e.dispatchEvent(new Event('input', {bubbles: true})); });
  assert.equal((await snapshot(desktop)).state.playing, false); assert.equal((await snapshot(desktop)).state.phase, .5);
  await desktop.click('[data-action="slow"]'); assert.equal((await snapshot(desktop)).state.slow, true);
  await desktop.click('[data-action="play"]');
  await desktop.waitForFunction('window.motionFit.state.phase !== .5', {timeout: 10000});
  await desktop.click('[data-action="play"]');
  await desktop.evaluate(() => { motionFit.chooseFocus('body'); motionFit.chooseView('front'); motionFit.setPhase(.19); });
  const beforeMouse = await snapshot(desktop), box = await (await desktop.$('canvas')).boundingBox();
  await desktop.mouse.move(box.x + box.width * .65, box.y + box.height * .45); await desktop.mouse.down();
  await desktop.mouse.move(box.x + box.width * .5, box.y + box.height * .42, {steps: 8}); await desktop.mouse.up();
  assert.ok(Math.hypot(...(await snapshot(desktop)).camera.map((v, i) => v - beforeMouse.camera[i])) > .1, 'mouse rotates camera');
  const distance = await desktop.evaluate(() => motionFit.camera.position.distanceTo(motionFit.orbit.target));
  await desktop.mouse.wheel({deltaY: -200});
  await desktop.waitForFunction(d => Math.abs(motionFit.camera.position.distanceTo(motionFit.orbit.target) - d) > .01, {}, distance);
  // Floor is one-sided; it cannot hide the model from below.
  assert.equal(await desktop.evaluate(() => motionFit.floor.material.side), 0);
  const client = await desktop.target().createCDPSession(); await client.send('Browser.setDownloadBehavior', {behavior: 'allow', downloadPath: tmp, eventsEnabled: true});
  const done = new Promise((resolve, reject) => {
    const timer = setTimeout(() => reject(Error('download timeout')), 20000); let started;
    const begin = e => { started = e; }, progress = e => {
      if (e.state === 'completed') { clearTimeout(timer); client.off('Browser.downloadWillBegin', begin); client.off('Browser.downloadProgress', progress); resolve(started); }
      else if (e.state === 'canceled') { clearTimeout(timer); reject(Error('download canceled')); }
    };
    client.on('Browser.downloadWillBegin', begin); client.on('Browser.downloadProgress', progress);
  });
  await desktop.click('[data-action="download"]'); const downloaded = await done;
  assert.equal(downloaded.suggestedFilename, 'male_motion_C_trial.glb');
  assert.equal(hash(fs.readFileSync(path.join(tmp, downloaded.suggestedFilename))), hash(fs.readFileSync(path.join(output, downloaded.suggestedFilename))));
  for (const mode of ['walk', 'run']) {
    const info = await desktop.evaluate(async mode => {
      const video = document.createElement('video'); video.preload = 'metadata'; video.src = `${mode}_C.mp4`; document.body.append(video);
      await new Promise((resolve, reject) => { const timer = setTimeout(() => reject(Error('video metadata timeout')), 15000);
        video.onloadedmetadata = () => { clearTimeout(timer); resolve(); }; video.onerror = () => { clearTimeout(timer); reject(Error('video metadata error')); }; video.load(); });
      const canvas = document.createElement('canvas'); canvas.width = video.videoWidth; canvas.height = video.videoHeight;
      const context = canvas.getContext('2d');
      const frame = t => new Promise((resolve, reject) => { const timer = setTimeout(() => reject(Error('video seek timeout')), 15000);
        video.onseeked = () => { clearTimeout(timer); context.drawImage(video, 0, 0); resolve(canvas.toDataURL()); };
        video.onerror = () => { clearTimeout(timer); reject(Error('video seek error')); }; video.currentTime = t; });
      const a = await frame(.2), b = await frame(.7), result = {width: video.videoWidth, height: video.videoHeight, duration: video.duration, different: a !== b};
      video.remove(); return result;
    }, mode);
    assert.deepEqual(info, {width: 1280, height: 720, duration: 6, different: true}, `${mode} video`);
  }
  await desktop.close();
  console.log('PASS: offline desktop, C/previous switching at the same phase, pause/seek, floor, focus, skeleton, camera, byte-exact GLB download and video seek');
  for (const viewport of [{width: 320, height: 700, deviceScaleFactor: 1, isMobile: true, hasTouch: true},
    {width: 390, height: 844, deviceScaleFactor: 2, isMobile: true, hasTouch: true},
    {width: 768, height: 1024, deviceScaleFactor: 1, isMobile: true, hasTouch: true}]) {
    const mobile = await open(viewport); await load(mobile);
    const dim = await mobile.evaluate(() => ({client: document.documentElement.clientWidth, scroll: document.documentElement.scrollWidth, stage: document.querySelector('#stage').getBoundingClientRect().toJSON()}));
    assert.ok(dim.scroll <= dim.client + 1, JSON.stringify(dim)); assert.ok(dim.stage.width > 250 && dim.stage.height > 400, JSON.stringify(dim));
    await mobile.click('[data-motion="run"]'); await mobile.evaluate(() => motionFit.setPhase(.24));
    await mobile.click('[data-version="previous"]'); assert.equal((await snapshot(mobile)).state.version, 'previous');
    await mobile.click('[data-version="selected"]'); await mobile.click('[data-view="side"]'); await mobile.click('[data-focus="feet"]');
    await mobile.$eval('canvas', e => e.scrollIntoView({block: 'center'}));
    const bounds = await (await mobile.$('canvas')).boundingBox(), before = (await snapshot(mobile)).camera;
    const touch = await mobile.target().createCDPSession(), x = bounds.x + bounds.width * .55, y = bounds.y + bounds.height * .46;
    await touch.send('Input.dispatchTouchEvent', {type: 'touchStart', touchPoints: [{x, y, id: 1}]});
    await touch.send('Input.dispatchTouchEvent', {type: 'touchMove', touchPoints: [{x: x - 60, y: y + 15, id: 1}]});
    await touch.send('Input.dispatchTouchEvent', {type: 'touchEnd', touchPoints: []});
    assert.ok(Math.hypot(...(await snapshot(mobile)).camera.map((v, i) => v - before[i])) > .01, 'touch rotates');
    const dist = await mobile.evaluate(() => motionFit.camera.position.distanceTo(motionFit.orbit.target));
    await touch.send('Input.dispatchTouchEvent', {type: 'touchStart', touchPoints: [{x: x - 25, y, id: 1}, {x: x + 25, y, id: 2}]});
    await touch.send('Input.dispatchTouchEvent', {type: 'touchMove', touchPoints: [{x: x - 50, y, id: 1}, {x: x + 50, y, id: 2}]});
    await touch.send('Input.dispatchTouchEvent', {type: 'touchEnd', touchPoints: []});
    assert.ok(Math.abs(await mobile.evaluate(() => motionFit.camera.position.distanceTo(motionFit.orbit.target)) - dist) > .01, 'pinch zooms');
    await mobile.close(); console.log(`PASS: ${viewport.width}x${viewport.height} emulation, controls, no overflow, touch rotation and pinch`);
  }
  const fallback = await open({width: 390, height: 844, deviceScaleFactor: 1}, false);
  await fallback.evaluateOnNewDocument(() => {
    const get = HTMLCanvasElement.prototype.getContext;
    HTMLCanvasElement.prototype.getContext = function (type, ...args) { return /webgl/i.test(type) ? null : get.call(this, type, ...args); };
  });
  await fallback.goto(pathToFileURL(path.join(output, 'index.html')).href, {waitUntil: 'load', timeout: 60000});
  await fallback.waitForFunction("document.querySelector('#status').dataset.state === 'error'", {timeout: 30000});
  assert.equal(await fallback.$eval('#fallback', e => e.hidden), false);
  for (const file of ['walk_C.mp4', 'run_C.mp4']) {
    assert.ok(fs.statSync(path.join(output, file)).size > 10000, file);
    assert.ok(await fallback.$(`a[href="${file}"]`), 'fallback link ' + file);
  }
  await fallback.close(); assert.deepEqual(errors, [], errors.join('\n'));
  console.log('PASS: WebGL-failure video links, no external requests or unexpected browser errors. Emulation is not a physical-device test.');
} finally { await browser.close(); fs.rmSync(tmp, {recursive: true, force: true}); }
