// Offline browser/control tests and a separate small BVH channel evaluator to
// check displayed joint markers against the source frames. Not a physical-device
// or project-character deformation test.
import assert from 'node:assert/strict';
import {createHash} from 'node:crypto';
import {createRequire} from 'node:module';
import {fileURLToPath, pathToFileURL} from 'node:url';
import fs from 'node:fs';
import path from 'node:path';
import {Quaternion, Vector3} from '../male-library-motion/node_modules/three/build/three.module.js';

const dir = path.dirname(fileURLToPath(import.meta.url));
const repo = path.resolve(dir, '../..');
const output = path.resolve(process.argv[2] || path.join(repo, 'work/male-motion-candidates'));
const require = createRequire(path.join(repo, 'tools/character-showcase/package.json'));
const puppeteer = require('puppeteer-core'), chromium = require('@sparticuz/chromium').default;
const digest = x => createHash('sha256').update(x).digest('hex');
const files = JSON.parse(fs.readFileSync(path.join(dir, 'candidates.json'), 'utf8'));
const errors = [];

// Independent from BVHLoader: read channels in their declared order and
// explicitly propagate local rotations/offsets through the hierarchy.
function parseBvh(text) {
  const lines = text.split(/\r?\n/).map(x => x.trim()).filter(Boolean);
  let cursor = 0, channels = 0;
  assert.equal(lines[cursor++], 'HIERARCHY');
  function node() {
    const tokens = lines[cursor++].split(/\s+/);
    const isEnd = tokens[0] === 'End';
    assert.ok(isEnd || tokens[0] === 'ROOT' || tokens[0] === 'JOINT');
    const out = {name: isEnd ? 'ENDSITE' : tokens[1], children: []};
    assert.equal(lines[cursor++], '{');
    const offset = lines[cursor++].split(/\s+/);
    assert.equal(offset[0], 'OFFSET');
    out.offset = offset.slice(1).map(Number);
    out.channels = [];
    if (!isEnd) {
      const row = lines[cursor++].split(/\s+/);
      assert.equal(row[0], 'CHANNELS');
      assert.equal(Number(row[1]), row.length - 2);
      out.channels = row.slice(2);
      channels += out.channels.length;
    }
    while (lines[cursor] !== '}') out.children.push(node());
    cursor++;
    return out;
  }
  const root = node();
  assert.equal(lines[cursor++], 'MOTION');
  const count = Number(lines[cursor++].split(':')[1]);
  const dt = Number(lines[cursor++].split(':')[1]);
  const frames = [];
  for (let i = 0; i < count; i++) {
    const row = lines[cursor++].split(/\s+/).map(Number);
    assert.equal(row.length, channels);
    assert.ok(row.every(Number.isFinite));
    frames.push(row);
  }
  return {root, frames, dt};
}
function sampleBvh(parsed, frame) {
  const positions = new Map(), data = parsed.frames[frame];
  let index = 0, originalRoot;
  const axes = {X: new Vector3(1, 0, 0), Y: new Vector3(0, 1, 0), Z: new Vector3(0, 0, 1)};
  function visit(node, parentPosition, parentRotation, parentName, isRoot = false) {
    const translation = new Vector3(...node.offset), localRotation = new Quaternion();
    for (const channel of node.channels) {
      const value = data[index++], axis = channel[0], component = axis.toLowerCase();
      if (channel.endsWith('position')) translation[component] += value;
      else if (channel.endsWith('rotation')) localRotation.multiply(new Quaternion().setFromAxisAngle(axes[axis], value * Math.PI / 180));
      else throw new Error(`Unknown channel ${channel}`);
    }
    const worldPosition = translation.applyQuaternion(parentRotation).add(parentPosition);
    const worldRotation = parentRotation.clone().multiply(localRotation);
    if (isRoot) {
      originalRoot = worldPosition.clone();
      worldPosition.x = worldPosition.z = 0;
    }
    positions.set(node.name === 'ENDSITE' ? `${parentName}/ENDSITE` : node.name, worldPosition.clone());
    for (const child of node.children) visit(child, worldPosition, worldRotation, node.name);
  }
  visit(parsed.root, new Vector3(), new Quaternion(), '', true);
  assert.equal(index, data.length);
  return {positions, originalRoot};
}
const browser = await puppeteer.launch({
  executablePath: process.env.CHROME_BIN || await chromium.executablePath(), headless: 'shell',
  args: [...chromium.args, '--disable-dev-shm-usage', '--autoplay-policy=no-user-gesture-required'], protocolTimeout: 180000,
});
async function open(viewport) {
  const page = await browser.newPage();
  await page.setViewport(viewport);
  page.on('pageerror', e => errors.push('page: ' + e.message));
  page.on('console', m => { if (m.type() === 'error') errors.push('console: ' + m.text()); });
  await page.setRequestInterception(true);
  page.on('request', r => {
    if (/^(file|data|blob):/i.test(r.url())) r.continue();
    else { errors.push('external request: ' + r.url()); r.abort(); }
  });
  await page.setOfflineMode(true);
  await page.goto(pathToFileURL(path.join(output, 'index.html')).href, {waitUntil: 'load', timeout: 60000});
  await page.waitForFunction('window.motionReview?.state.ready === true', {timeout: 60000});
  return page;
}
async function stageImage(page, index) {
  await page.$eval(`[data-stage="${index}"]`, e => e.scrollIntoView({block: 'center'}));
  await page.evaluate(() => new Promise(resolve => requestAnimationFrame(() => requestAnimationFrame(() => { motionReview.renderNow(); resolve(); }))));
  return await (await page.$(`[data-stage="${index}"]`)).screenshot({type: 'png'});
}
try {
  const desktop = await open({width: 1440, height: 1000, deviceScaleFactor: 1});
  assert.equal(await desktop.$eval('#status', e => e.dataset.state), 'ready');
  assert.equal(await desktop.evaluate(() => document.querySelectorAll('#comparison > canvas').length), 1);
  const embedded = await desktop.evaluate(() => motionReview.data.sources);
  for (const c of Object.values(files).flat()) {
    const original = fs.readFileSync(path.join(dir, 'sources', `${c.id}.bvh`));
    assert.equal(digest(original), c.sha256);
    assert.equal(digest(Buffer.from(embedded[c.id])), c.sha256, `embedded bytes for ${c.id}`);
  }
  console.log('PASS: all six embedded BVHs match their pinned source SHA-256 values');

  await desktop.evaluate(() => { motionReview.setPlaying(false); motionReview.setPhase(0); });
  const samples = await desktop.evaluate(() => {
    const d = motionReview, result = [];
    for (const candidates of Object.values(d.data.candidates)) for (const candidate of candidates) {
      const actor = d.actors[candidate.id], cfg = candidate.profile;
      const track = actor.clip.tracks.find(t => t.name === 'Hips.position');
      const frames = [...new Set(Array.from({length: 9}, (_, k) => Math.round(cfg.startFrame + (cfg.endFrame - cfg.startFrame) * k / 8)))];
      for (const frame of frames) {
        actor.elapsed = track.times[frame] - cfg.start;
        actor.exactEnd = frame === cfg.endFrame;
        actor.update(); actor.scene.updateMatrixWorld(true);
        const v = actor.camera.position.clone();
        const markers = Object.fromEntries([...actor.markers].map(([name, mesh]) => [name, mesh.getWorldPosition(v).toArray()]));
        const floorOffset = [actor.texture.offset.x, actor.texture.offset.y];
        actor.update(); // A repeated paused sample must not jump the ground.
        result.push({id: candidate.id, frame, cfg, markers, floorOffset, repeatedFloorOffset: [actor.texture.offset.x, actor.texture.offset.y]});
      }
    }
    return result;
  });
  let comparisons = 0, maxDistance = 0, maxGridDifference = 0;
  const parsed = Object.fromEntries(Object.values(files).flat().map(c => [c.id, parseBvh(fs.readFileSync(path.join(dir, 'sources', c.id + '.bvh'), 'utf8'))]));
  for (const {id, frame, cfg, markers, floorOffset, repeatedFloorOffset} of samples) {
    assert.deepEqual(repeatedFloorOffset, floorOffset, `${id} paused grid must remain stable`);
    const native = sampleBvh(parsed[id], frame), first = sampleBvh(parsed[id], cfg.startFrame);
    const neutral = id.startsWith('neutral_');
    const labels = neutral ? {shoulder: 'Shoulder', elbow: 'Elbow', wrist: 'Wrist', thigh: 'Hip', knee: 'Knee', ankle: 'Ankle', handEnd: 'Wrist/ENDSITE', toeEnd: 'Toe/ENDSITE'}
      : {shoulder: 'Arm', elbow: 'ForeArm', wrist: 'Hand', thigh: 'UpLeg', knee: 'Leg', ankle: 'Foot', handEnd: 'Hand/ENDSITE', toeEnd: 'ToeBase/ENDSITE'};
    for (const [key, got] of Object.entries(markers)) {
      const [kind, i] = key.split('_'), bone = `${i === '0' ? 'Left' : 'Right'}${labels[kind]}`;
      const raw = native.positions.get(bone);
      assert.ok(raw, `${id}: missing independent marker ${bone}`);
      const expected = raw.clone().multiplyScalar(.01).add(new Vector3(0, .045 - cfg.floorCm * .01, 0)).applyAxisAngle(new Vector3(0, 1, 0), -cfg.heading);
      const diff = expected.distanceTo(new Vector3(...got));
      maxDistance = Math.max(maxDistance, diff); comparisons++;
      assert.ok(diff < 3e-5, `${id} frame ${frame} ${bone}: ${diff}m`);
    }
    const delta = native.originalRoot.clone().sub(first.originalRoot).multiplyScalar(.01).applyAxisAngle(new Vector3(0, 1, 0), -cfg.heading);
    const expectedGrid = [(delta.x / .25) % 1, (-delta.z / .25) % 1];
    for (let k = 0; k < 2; k++) {
      const diff = Math.abs(expectedGrid[k] - floorOffset[k]);
      // Repeated texture offsets differing by an integer are identical.
      const wrapped = Math.min(diff, Math.abs(diff - 1));
      maxGridDifference = Math.max(maxGridDifference, wrapped);
      assert.ok(wrapped < .0001, `${id} frame ${frame} grid ${k}: ${wrapped}`);
    }
  }
  console.log(`PASS: ${comparisons} independently parsed source joint markers, maximum ${(maxDistance * 1000).toFixed(4)} mm; grid offset error ${maxGridDifference.toFixed(7)} tiles (9 phases per clip including end)`);

  // Verify each viewport really changes with pose and each selection acts only
  // in the review UI, retaining independent choices between the two categories.
  await desktop.evaluate(() => { motionReview.setMode('walk'); motionReview.setPhase(.10); });
  const early = [];
  for (let i = 0; i < 3; i++) early.push(digest(await stageImage(desktop, i)));
  await desktop.evaluate(() => motionReview.setPhase(.60));
  for (let i = 0; i < 3; i++) assert.notEqual(digest(await stageImage(desktop, i)), early[i], `walk ${i} image should change`);
  await desktop.click('[data-pick="1"]');
  assert.match(await desktop.$eval('#choice', e => e.textContent), /Ходьба B/);
  await desktop.click('[data-mode="run"]');
  assert.equal(await desktop.$eval('[data-slot="2"] .card-title', e => e.textContent), 'Энергичный бег');
  await desktop.click('[data-pick="2"]');
  assert.equal(await desktop.$eval('#choice', e => e.textContent), 'Ходьба B · Бег C');
  await desktop.evaluate(() => motionReview.setPhase(.15));
  const earlyRun = [];
  for (let i = 0; i < 3; i++) earlyRun.push(digest(await stageImage(desktop, i)));
  await desktop.evaluate(() => motionReview.setPhase(.65));
  for (let i = 0; i < 3; i++) assert.notEqual(digest(await stageImage(desktop, i)), earlyRun[i], `run ${i} image should change`);
  await desktop.click('[data-mode="walk"]');
  assert.equal(await desktop.$eval('[data-pick="1"]', e => e.getAttribute('aria-pressed')), 'true');
  assert.equal(await desktop.$eval('#choice', e => e.textContent), 'Ходьба B · Бег C');
  for (const view of ['side', 'threequarter', 'front', 'back', 'top']) {
    await desktop.click(`[data-view="${view}"]`);
    assert.equal(await desktop.evaluate(() => motionReview.state.view), view);
  }
  await desktop.select('#speed', '0.5');
  assert.equal(await desktop.evaluate(() => motionReview.state.speed), .5);
  await desktop.$eval('#phase', e => { e.value = '1000'; e.dispatchEvent(new Event('input', {bubbles: true})); });
  assert.equal(await desktop.$eval('#phase-value', e => e.textContent), '100%');
  assert.equal(await desktop.evaluate(() => motionReview.state.playing), false);
  assert.ok(await desktop.evaluate(() => motionReview.data.candidates.walk.every(c => motionReview.actors[c.id].exactEnd)));
  await desktop.click('#play');
  assert.equal(await desktop.evaluate(() => motionReview.state.playing), true);
  await desktop.waitForFunction('motionReview.actors[motionReview.data.candidates.walk[0].id].elapsed > motionReview.data.candidates.walk[0].profile.duration', {timeout: 10000});
  await desktop.click('#play');
  await desktop.click('[data-view="side"]');
  const stage = await desktop.$('[data-stage="0"]');
  await stage.evaluate(e => e.scrollIntoView({block: 'center'}));
  const rect = await stage.boundingBox(), before = await desktop.evaluate(() => motionReview.state.angle);
  await desktop.mouse.move(rect.x + rect.width * .60, rect.y + rect.height * .45);
  await desktop.mouse.down();
  await desktop.mouse.move(rect.x + rect.width * .40, rect.y + rect.height * .45, {steps: 6});
  await desktop.mouse.up();
  assert.ok(Math.abs((await desktop.evaluate(() => motionReview.state.angle)) - before) > .1);
  assert.equal(await desktop.evaluate(() => motionReview.state.view), 'custom');
  console.log('PASS: all six visible stages change, choices persist, mode/view/speed/play/phase/100%-endpoint and mouse rotation controls');

  // Video files load in the same offline package and expose the expected six
  // seconds. Seeking at different times must change the decoded frame.
  for (const mode of ['walk', 'run']) {
    const info = await desktop.evaluate(async mode => {
      const video = document.querySelector(`#videos video[src="${mode}_comparison.mp4"]`);
      video.preload = 'metadata'; video.load();
      await new Promise((resolve, reject) => { video.onloadedmetadata = resolve; video.onerror = () => reject(new Error('video metadata')); });
      const canvas = document.createElement('canvas'); canvas.width = video.videoWidth; canvas.height = video.videoHeight;
      const context = canvas.getContext('2d');
      const imageAt = t => new Promise((resolve, reject) => {
        video.onseeked = () => { context.drawImage(video, 0, 0); resolve(canvas.toDataURL()); };
        video.onerror = () => reject(new Error('video seek')); video.currentTime = t;
      });
      const a = await imageAt(.2), b = await imageAt(.7);
      return {width: video.videoWidth, height: video.videoHeight, duration: video.duration, different: a !== b};
    }, mode);
    assert.deepEqual(info, {width: 1280, height: 640, duration: 6, different: true});
  }
  console.log('PASS: both offline H.264 MP4s load, seek and show changing frames (1280×640, six seconds)');
  await desktop.close();

  for (const viewport of [
    {width: 320, height: 700, deviceScaleFactor: 1, isMobile: true, hasTouch: true},
    {width: 390, height: 844, deviceScaleFactor: 2, isMobile: true, hasTouch: true},
    {width: 768, height: 1024, deviceScaleFactor: 1, isMobile: true, hasTouch: true},
  ]) {
    const mobile = await open(viewport);
    const dims = await mobile.evaluate(() => ({client: document.documentElement.clientWidth, scroll: document.documentElement.scrollWidth, stages: [...document.querySelectorAll('[data-stage]')].map(e => ({w: e.offsetWidth, h: e.offsetHeight}))}));
    assert.ok(dims.scroll <= dims.client + 1, JSON.stringify(dims));
    assert.ok(dims.stages.every(r => r.w > 200 && r.h >= 370), JSON.stringify(dims));
    await mobile.evaluate(() => { motionReview.setMode('run'); motionReview.setPhase(.18); });
    const a = digest(await stageImage(mobile, 1));
    await mobile.evaluate(() => motionReview.setPhase(.60));
    const b = digest(await stageImage(mobile, 1));
    assert.notEqual(a, b, 'second card must render after scrolling while paused');
    if (viewport.width === 390) await mobile.screenshot({path: '/tmp/bow-animation-research/mobile-second.png'});
    await mobile.click('[data-pick="1"]');
    assert.match(await mobile.$eval('#choice', e => e.textContent), /Бег B/);
    const st = await mobile.$('[data-stage="1"]');
    await st.evaluate(e => e.scrollIntoView({block: 'center'}));
    const r = await st.boundingBox(), previous = await mobile.evaluate(() => motionReview.state.angle);
    const session = await mobile.target().createCDPSession(), x = r.x + r.width * .6, y = r.y + r.height * .45;
    await session.send('Input.dispatchTouchEvent', {type: 'touchStart', touchPoints: [{x, y, id: 1}]});
    await session.send('Input.dispatchTouchEvent', {type: 'touchMove', touchPoints: [{x: x - 65, y, id: 1}]});
    await session.send('Input.dispatchTouchEvent', {type: 'touchEnd', touchPoints: []});
    assert.ok(Math.abs((await mobile.evaluate(() => motionReview.state.angle)) - previous) > .1, `touch rotation ${viewport.width}`);
    if (viewport.width === 390) {
      const scrollBefore = await mobile.evaluate(() => scrollY);
      await session.send('Input.dispatchTouchEvent', {type: 'touchStart', touchPoints: [{x, y: y + 60, id: 1}]});
      for (let k = 1; k <= 8; k++) await session.send('Input.dispatchTouchEvent', {type: 'touchMove', touchPoints: [{x, y: y + 60 - k * 20, id: 1}]});
      await session.send('Input.dispatchTouchEvent', {type: 'touchEnd', touchPoints: []});
      await new Promise(resolve => setTimeout(resolve, 250));
      assert.ok((await mobile.evaluate(() => scrollY)) > scrollBefore + 40, 'vertical swipe on stage must still scroll the page');
      console.log('PASS: vertical swipe on the mobile stage scrolls the page');
    }
    if (viewport.width === 768) {
      await mobile.$eval('#comparison', e => e.scrollIntoView({block: 'start'}));
      await mobile.evaluate(() => new Promise(resolve => requestAnimationFrame(() => requestAnimationFrame(resolve))));
      const largest = await mobile.evaluate(() => {
        const d = motionReview; let max = 0;
        d.setPlaying(false);
        for (const mode of ['walk', 'run']) {
          d.setMode(mode);
          for (const view of ['side', 'threequarter', 'front', 'back', 'top']) {
            d.setView(view); d.renderNow();
            for (const c of d.data.candidates[mode]) for (let f = 0; f < 12; f++) {
              const a = d.actors[c.id], camera = a.camera;
              a.elapsed = (f + .25) / 12 * c.profile.duration; a.exactEnd = false; a.update(); a.scene.updateMatrixWorld(true);
              const p = camera.position.clone();
              a.figure.traverse(o => {
                if (!o.isMesh) return;
                o.geometry.computeBoundingBox(); const b = o.geometry.boundingBox;
                for (const x of [b.min.x, b.max.x]) for (const y of [b.min.y, b.max.y]) for (const z of [b.min.z, b.max.z]) {
                  p.set(x, y, z).applyMatrix4(o.matrixWorld).project(camera);
                  max = Math.max(max, Math.abs(p.x), Math.abs(p.y));
                }
              });
            }
          }
        }
        return max;
      });
      assert.ok(largest < .99, `tablet figure bounds exceed stage: ${largest}`);
      console.log(`PASS: projected mannequin bounds inside tablet stages for 12 phases × five preset views; max NDC ${largest.toFixed(3)}`);
    }
    await mobile.close();
    console.log(`PASS: ${viewport.width}×${viewport.height} emulation, no horizontal overflow, scrolled stage, choice and touch rotation`);
  }
  assert.deepEqual(errors, [], errors.join('\n'));
  console.log('PASS: no external requests or browser errors; emulation is not a physical Android test');
} finally {
  await browser.close();
}

// If WebGL is unavailable, the app must expose its ordinary MP4 fallback.
const fallbackBrowser = await puppeteer.launch({
  executablePath: process.env.CHROME_BIN || await chromium.executablePath(), headless: 'shell',
  args: [...chromium.args, '--disable-dev-shm-usage', '--disable-webgl', '--disable-webgl2'], protocolTimeout: 180000,
});
try {
  const page = await fallbackBrowser.newPage();
  await page.setOfflineMode(true);
  await page.goto(pathToFileURL(path.join(output, 'index.html')).href, {waitUntil: 'load'});
  await page.waitForFunction('window.motionReview', {timeout: 60000});
  const fallback = await page.evaluate(async () => {
    const video = document.querySelector('#videos video');
    video.preload = 'metadata'; video.load();
    await new Promise((resolve, reject) => { video.onloadedmetadata = resolve; video.onerror = reject; });
    return {ready: motionReview.state.ready, status: document.querySelector('#status').dataset.state, open: document.querySelector('#videos').open, duration: video.duration};
  });
  assert.deepEqual(fallback, {ready: false, status: 'error', open: true, duration: 6});
  console.log('PASS: with WebGL disabled, the error opens a working offline video fallback');
} finally {
  await fallbackBrowser.close();
}

// Guard the actual previous deliveries: this research must not alter them.
for (const [file, expected] of [
  ['work/male-static-rebuild/male_static_rebuild.glb', '4ff3f49882d1544a856d1d9061a696e13224803fd58250782e456a3bca5982c2'],
  ['work/male-body-contour/male_body_contour.glb', 'db361ec8c18620802acb8dfa02b534a33e9e249134668ea8258c29c8a0a7fba5'],
  ['work/male-rig-rebuild/male_rig_rebuild.glb', '8c92f19a522d287ea8bd3fb2a683b27cc7bdc36b0adc4f3aa7ca7de86d11755c'],
  ['work/male-rig-rebuild/male_cut_placeholders.glb', 'fb5b29137bcdad4abc45b28a99e0e353b490bc21c183eb36c6e0e1670c751947'],
]) assert.equal(digest(fs.readFileSync(path.join(repo, file))), expected, `${file} changed`);
console.log('PASS: approved static body, previous animated body, rig and cut GLBs remain byte-identical');
