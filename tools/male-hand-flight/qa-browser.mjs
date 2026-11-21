// Offline and optional HTTP review checks. Emulated touch is not a physical
// device, whole-mesh/all-time clipping proof, or motion-quality test.
import assert from 'node:assert/strict';
import {createHash} from 'node:crypto';
import {createRequire} from 'node:module';
import {fileURLToPath, pathToFileURL} from 'node:url';
import fs from 'node:fs';
import path from 'node:path';
const repo = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const folder = path.resolve(process.argv[2] || path.join(repo, 'work/male-hand-flight'));
const target = process.argv[3] || pathToFileURL(path.join(folder, 'index.html')).href;
const isFile = target.startsWith('file:'), origin = isFile ? '' : new URL(target).origin;
const hash = b => createHash('sha256').update(b).digest('hex');
const modelHash = hash(fs.readFileSync(path.join(folder, 'male_hands_airfoot_trial.glb')));
const oldHash = hash(fs.readFileSync(path.join(folder, 'previous_feet_arms.glb')));
const html = fs.readFileSync(path.join(folder, 'index.html'), 'utf8');
const embedded = html.match(/window\.EMBEDDED_MODELS=\{selected:"([^"]+)",previous:"([^"]+)"\}/);
assert.ok(embedded, 'Missing embedded model data');
assert.equal(hash(Buffer.from(embedded[1], 'base64')), modelHash); assert.equal(hash(Buffer.from(embedded[2], 'base64')), oldHash);
const require = createRequire(path.join(repo, 'tools/character-showcase/package.json'));
const puppeteer = require('puppeteer-core'), chromium = require('@sparticuz/chromium').default;
const browser = await puppeteer.launch({executablePath: process.env.CHROME_BIN || await chromium.executablePath(), headless: 'shell',
  args: [...chromium.args, '--allow-file-access-from-files', '--disable-dev-shm-usage'], protocolTimeout: 180000});
try {
  const errors = [], videoResponses = [];
  async function openPage() {
    const page = await browser.newPage();
    page.on('pageerror', e => errors.push(e.message));
    page.on('console', m => { if (m.type() === 'error') errors.push(m.text()); });
    page.on('response', r => { if (/\/(walk|run|hands|feet)_preview\.mp4(?:\?.*)?$/.test(r.url())) videoResponses.push({url: r.url(), status: r.status()}); });
    await page.setRequestInterception(true);
    page.on('request', r => /^(file|data|blob):/i.test(r.url()) || (!isFile && new URL(r.url()).origin === origin)
      ? r.continue() : (errors.push('external request ' + r.url()), r.abort()));
    await page.setOfflineMode(isFile);
    return page;
  }
  let page;
  for (const [width, height, mobile] of [[1440, 1000, false], [320, 760, true], [390, 844, true], [768, 1024, false]]) {
    page = await openPage();
    await page.setViewport({width, height, deviceScaleFactor: 1, isMobile: mobile, hasTouch: mobile});
    await page.goto(target, {waitUntil: 'load', timeout: 60000});
    await page.waitForFunction('window.motionFit?.state.ready === true', {timeout: 60000});
    const measured = await page.evaluate(() => {
      const d = motionFit, V = d.camera.position.constructor, position = d.models.selected.model.getObjectByName('NewBody').geometry.attributes.position;
      const ids = []; for (let i = 0; i < position.count; i++) if (position.getY(i) < .16 && Math.abs(position.getX(i)) > .035 && Math.abs(position.getX(i)) < .25) ids.push(i);
      const out = {innerWidth, documentWidth: document.documentElement.scrollWidth, status: document.querySelector('#status').dataset.state,
        clips: Object.fromEntries(Object.entries(d.models).map(([k, v]) => [k, v.gltf.animations.map(a => a.name)])), maxBody: 0, maxFeet: 0, vertices: ids.length};
      for (const version of ['previous', 'selected']) for (const motion of ['walk', 'run']) {
        d.setVersion(version); d.setMotion(motion); d.setPlaying(false); d.chooseFocus('body');
        for (const view of ['front', 'front45', 'side']) {
          d.chooseView(view);
          for (let i = 0; i < 16; i++) {
            d.setPhase((i + .37) / 16); d.model.updateMatrixWorld(true); d.camera.updateMatrixWorld(true);
            for (const name of ['Rig_Head', 'Rig_Hand_L', 'Rig_Hand_R', 'Rig_Foot_L', 'Rig_Foot_R']) {
              const p = d.rig.getObjectByName(name).getWorldPosition(new V()).project(d.camera);
              out.maxBody = Math.max(out.maxBody, Math.abs(p.x), Math.abs(p.y));
            }
          }
        }
        d.chooseFocus('feet'); const mesh = d.model.getObjectByName('NewBody'), v = new V();
        for (const view of ['high', 'highFront']) {
          d.chooseView(view);
          for (let i = 0; i < 16; i++) {
            d.setPhase((i + .37) / 16); d.model.updateMatrixWorld(true); d.camera.updateMatrixWorld(true); mesh.skeleton.update();
            for (const id of ids) {
              mesh.getVertexPosition(id, v); mesh.localToWorld(v); v.project(d.camera);
              out.maxFeet = Math.max(out.maxFeet, Math.abs(v.x), Math.abs(v.y));
            }
          }
        }
      }
      // Check close-up presets against weighted hand/foot vertices, not only
      // joint origins; the target stays fixed on before/after toggles.
      const mesh = d.models.selected.model.getObjectByName('NewBody'), idx = mesh.geometry.attributes.skinIndex, wt = mesh.geometry.attributes.skinWeight;
      const expressions = {handL: /^Rig_(Hand|Finger\d+_\d+)_L$/, handR: /^Rig_(Hand|Finger\d+_\d+)_R$/,
        footL: /^Rig_(Foot|Toes)_L$/, footR: /^Rig_(Foot|Toes)_R$/};
      const groups = Object.fromEntries(Object.keys(expressions).map(k => [k, []]));
      for (let i = 0; i < idx.count; i++) for (const [key, pattern] of Object.entries(expressions)) {
        let influence = 0; for (let k = 0; k < 4; k++) if (pattern.test(mesh.skeleton.bones[idx.getComponent(i, k)]?.name || '')) influence += wt.getComponent(i, k);
        if (influence > .5) groups[key].push(i);
      }
      out.closeMax = {}; out.closeSizes = Object.fromEntries(Object.entries(groups).map(([k, v]) => [k, v.length])); out.cameraDifference = 0;
      for (const focus of ['hands', 'handL', 'handR', 'footL', 'footR']) {
        const selected = focus === 'hands' ? [...groups.handL, ...groups.handR] : groups[focus];
        let maximum = 0;
        for (const version of ['previous', 'selected']) for (const mode of ['walk', 'run']) for (const view of ['front', 'back', 'side', 'front45', 'rear45', 'high', 'highFront']) {
          d.setMotion(mode); d.setPlaying(false); d.setVersion(version); d.chooseFocus(focus); d.chooseView(view);
          const body = d.model.getObjectByName('NewBody'), v = new V();
          for (let i = 0; i < 16; i++) {
            d.setPhase((i + .37) / 16); d.model.updateMatrixWorld(true); d.camera.updateMatrixWorld(true); body.skeleton.update();
            for (const id of selected) { body.getVertexPosition(id, v); body.localToWorld(v); v.project(d.camera); maximum = Math.max(maximum, Math.abs(v.x), Math.abs(v.y)); }
          }
        }
        out.closeMax[focus] = maximum;
        d.setMotion(focus.startsWith('hand') ? 'walk' : 'run'); d.setPhase(.69); d.chooseView('back');
        d.setVersion('previous'); d.chooseFocus(focus);
        const p = d.camera.position.clone(), t = d.orbit.target.clone(); d.setVersion('selected');
        out.cameraDifference = Math.max(out.cameraDifference, p.distanceTo(d.camera.position), t.distanceTo(d.orbit.target));
      }
      return out;
    });
    assert.equal(measured.status, 'ready'); assert.deepEqual(measured.clips, {selected: ['Walk_Game_Trial', 'Run_Game_Trial'], previous: ['Walk_Game_Trial', 'Run_Game_Trial']});
    assert.ok(measured.documentWidth <= measured.innerWidth + 1, `horizontal overflow ${width}`);
    assert.ok(measured.maxBody < .98 && measured.maxFeet < .98 && measured.vertices > 2000, `sample framing ${width}: ${JSON.stringify(measured)}`);
    assert.ok(Object.values(measured.closeSizes).every(n => n > 1000) && Object.values(measured.closeMax).every(n => n < .96) && measured.cameraDifference < 1e-9, `close-up framing or comparison camera ${width}: ${JSON.stringify(measured)}`);
    console.log(`PASS ${isFile ? 'offline' : 'HTTP'} ${width}×${height}${mobile ? ' emulated touch' : ''}: controls, sampled body/foot and individual hand/foot framing; same comparison camera.`);
    await page.close();
  }
  // Verify the quick buttons visible on a phone, including comparison at a
  // paused phase. The click is on the actual mobile controls, not a JS alias.
  page = await openPage();
  await page.setViewport({width: 390, height: 844, deviceScaleFactor: 1, isMobile: true, hasTouch: true});
  await page.goto(target, {waitUntil: 'load', timeout: 60000});
  await page.waitForFunction('window.motionFit?.state.ready === true', {timeout: 60000});
  await page.evaluate(() => { motionFit.setMotion('walk'); motionFit.setPhase(.31); });
  await page.click('[data-quick-version="previous"]');
  assert.equal(await page.evaluate(() => motionFit.state.version), 'previous');
  assert.equal(await page.evaluate(() => motionFit.state.phase), .31);
  await page.click('[data-quick-version="selected"]');
  assert.equal(await page.evaluate(() => motionFit.state.version), 'selected');
  await page.click('[data-quick-motion="run"]');
  assert.equal(await page.evaluate(() => motionFit.state.motion), 'run');
  await page.click('.quick-controls [data-action="play"]');
  assert.equal(await page.evaluate(() => motionFit.state.playing), false);
  await page.click('[data-quick-focus="hands"]');
  assert.equal(await page.evaluate(() => motionFit.state.focus), 'hands');
  await page.click('[data-quick-focus="feet"]');
  assert.equal(await page.evaluate(() => motionFit.state.focus), 'feet');
  await page.click('[data-quick-focus="body"]');
  assert.equal(await page.evaluate(() => motionFit.state.focus), 'body');
  console.log('PASS emulated phone quick controls: walk/run, play/pause, same-phase before/after and focus.');

  await page.close(); page = await openPage();
  await page.setViewport({width: 1440, height: 1000, deviceScaleFactor: 1});
  await page.goto(target, {waitUntil: 'load', timeout: 60000});
  await page.waitForFunction('window.motionFit?.state.ready === true', {timeout: 60000});
  const compare = await page.evaluate(() => {
    const d = motionFit, v = d.camera.position.clone(), q = d.camera.quaternion.clone();
    function sample() {
      d.model.updateMatrixWorld(true);
      const point = name => d.rig.getObjectByName(name).getWorldPosition(v).toArray();
      const quat = name => d.rig.getObjectByName(name).getWorldQuaternion(q).toArray();
      return {phase: d.state.phase, camera: d.camera.position.toArray(), target: d.orbit.target.toArray(), grid: d.floorTexture.offset.toArray(),
        chest: point('Rig_Chest'), arm: point('Rig_Forearm_L'), wrist: quat('Rig_Hand_L'), finger: quat('Rig_Finger3_2_L'), foot: quat('Rig_Foot_R')};
    }
    const result = {};
    for (const mode of ['walk', 'run']) {
      d.setMotion(mode); d.chooseFocus('body'); d.chooseView('front'); d.setPhase(mode === 'run' ? .22 : .31);
      d.setVersion('previous'); const before = sample(); d.setVersion('selected'); const after = sample();
      result[mode] = {before, after};
    }
    return result;
  });
  const distance = (a, b) => Math.hypot(...a.map((x, i) => x - b[i]));
  const qangle = (a, b) => 2 * Math.acos(Math.min(1, Math.abs(a.reduce((s, x, i) => s + x * b[i], 0))));
  for (const mode of ['walk', 'run']) {
    const {before: a, after: b} = compare[mode];
    assert.equal(a.phase, b.phase); assert.deepEqual(a.camera, b.camera); assert.deepEqual(a.target, b.target); assert.deepEqual(a.grid, b.grid);
    assert.ok(distance(a.chest, b.chest) < 1e-6 && distance(a.arm, b.arm) < 1e-6 && qangle(a.wrist, b.wrist) < .001, `unchanged upper body ${mode}`);
    if (mode === 'run') {
      assert.ok(qangle(a.foot, b.foot) > .1 && qangle(a.finger, b.finger) < .001, 'running foot/finger comparison');
    } else {
      assert.ok(qangle(a.foot, b.foot) < .001 && qangle(a.finger, b.finger) > .05, 'walking foot/finger comparison');
    }
  }
  const controls = await page.evaluate(async () => {
    const d = motionFit;
    document.querySelector('[data-motion="run"]').click(); document.querySelector('[data-view="highFront"]').click();
    document.querySelector('[data-focus="feet"]').click(); document.querySelector('[data-action="skeleton"]').click();
    document.querySelector('[data-action="ground"]').click();
    const slider = document.querySelector('#phase'); slider.value = '375'; slider.dispatchEvent(new Event('input', {bubbles: true}));
    const now = {motion: d.state.motion, view: d.state.view, focus: d.state.focus, skeleton: d.helper.visible,
      movingGround: d.state.movingGround, playing: d.state.playing, phase: d.state.phase};
    const original = URL.createObjectURL; URL.createObjectURL = blob => { window.savedDownloadBlob = blob; return original(blob); };
    document.querySelector('[data-action="download"]').click();
    const digest = await crypto.subtle.digest('SHA-256', await window.savedDownloadBlob.arrayBuffer());
    now.sha256 = [...new Uint8Array(digest)].map(x => x.toString(16).padStart(2, '0')).join(''); return now;
  });
  assert.deepEqual(controls, {motion: 'run', view: 'highFront', focus: 'feet', skeleton: true, movingGround: false, playing: false, phase: .375, sha256: modelHash});
  console.log('PASS synchronized before/after, unchanged arms/wrists, controls/seek and exact GLB download.');
  const clock = await page.evaluate(async () => {
    const d = motionFit; d.setMotion('run'); d.setPlaying(true);
    const frame = () => new Promise(resolve => requestAnimationFrame(t => resolve({t, elapsed: d.state.elapsed})));
    const start = await frame(); await new Promise(resolve => setTimeout(resolve, 950)); const end = await frame();
    return {wall: (end.t - start.t) / 1000, animation: end.elapsed - start.elapsed};
  });
  assert.ok(clock.animation / clock.wall > .8 && clock.animation / clock.wall < 1.2, `incorrect playback clock ${JSON.stringify(clock)}`);
  console.log(`PASS 1× playback follows wall time: ${clock.animation.toFixed(3)} s / ${clock.wall.toFixed(3)} s.`);
  const videoResult = await page.evaluate(async names => {
    const results = [];
    for (const name of names) {
      const video = document.createElement('video'); video.preload = 'auto'; video.muted = true;
      video.src = new URL(name, document.baseURI).href; document.body.append(video);
      const wait = event => new Promise((resolve, reject) => {
        const timer = setTimeout(() => reject(Error(`${name} timed out waiting for ${event}`)), 25000);
        video.addEventListener(event, () => { clearTimeout(timer); resolve(); }, {once: true});
        video.addEventListener('error', () => { clearTimeout(timer); reject(Error(`${name} video error`)); }, {once: true});
      });
      if (video.readyState < 1) await wait('loadedmetadata');
      const seeked = wait('seeked'); video.currentTime = 5.2; await seeked;
      if (video.readyState < 2) await wait('loadeddata');
      const canvas = document.createElement('canvas'); canvas.width = 64; canvas.height = 36;
      const ctx = canvas.getContext('2d', {willReadFrequently: true}); ctx.drawImage(video, 0, 0, 64, 36);
      const pixel = [...ctx.getImageData(2, 5, 1, 1).data];
      results.push({name, duration: video.duration, time: video.currentTime, ready: video.readyState, pixel}); video.remove();
    }
    return results;
  }, ['walk_preview.mp4', 'run_preview.mp4', 'hands_preview.mp4', 'feet_preview.mp4']);
  for (const v of videoResult) {
    assert.ok(Math.abs(v.duration - 6) < .1 && v.time > 5 && v.ready >= 2, JSON.stringify(v));
    assert.ok(v.pixel.slice(0, 3).reduce((a, b) => a + b, 0) >= 60, `late video frame blank: ${JSON.stringify(v)}`);
  }
  if (!isFile) for (const kind of ['walk', 'run', 'hands', 'feet']) {
    const responses = videoResponses.filter(r => r.url.includes(`/${kind}_preview.mp4`));
    assert.ok(responses.length && responses.every(r => [200, 206].includes(r.status)), JSON.stringify(responses));
  }
  console.log(`PASS all four videos: ${isFile ? 'offline' : 'HTTP'} metadata and late frame seek/decode.`);
  assert.deepEqual(errors, [], errors.join('\n'));
  const fallback = await browser.newPage(); await fallback.setOfflineMode(isFile);
  await fallback.evaluateOnNewDocument(() => {
    const get = HTMLCanvasElement.prototype.getContext;
    HTMLCanvasElement.prototype.getContext = function(type, ...args) { return /webgl/i.test(type) ? null : get.call(this, type, ...args); };
  });
  await fallback.goto(target, {waitUntil: 'load', timeout: 60000});
  await fallback.waitForFunction("document.querySelector('#status').dataset.state === 'error'", {timeout: 60000});
  assert.ok(await fallback.evaluate(() => !document.querySelector('#fallback').hidden && document.querySelectorAll('#fallback a[href$=".mp4"]').length === 4));
  await fallback.close(); console.log('PASS WebGL failure shows four video alternatives.');
} finally { await browser.close(); }
