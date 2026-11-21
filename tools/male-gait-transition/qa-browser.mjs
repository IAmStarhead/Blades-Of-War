// Offline and optional HTTP tests. Touch is emulated, not a physical phone.
import assert from 'node:assert/strict';
import {createHash} from 'node:crypto';
import {createRequire} from 'node:module';
import {fileURLToPath, pathToFileURL} from 'node:url';
import fs from 'node:fs';
import path from 'node:path';
const repo = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const folder = path.resolve(process.argv[2] || path.join(repo, 'work/male-gait-transition'));
const target = process.argv[3] || pathToFileURL(path.join(folder, 'index.html')).href;
const isFile = target.startsWith('file:'), origin = isFile ? '' : new URL(target).origin;
const hash = b => createHash('sha256').update(b).digest('hex');
const modelHash = hash(fs.readFileSync(path.join(folder, 'male_hands_airfoot_trial.glb')));
const html = fs.readFileSync(path.join(folder, 'index.html'), 'utf8');
const embedded = html.match(/window\.EMBEDDED_MODEL="([^"]+)"/);
assert.ok(embedded, 'Missing embedded model'); assert.equal(hash(Buffer.from(embedded[1], 'base64')), modelHash);
const require = createRequire(path.join(repo, 'tools/character-showcase/package.json'));
const puppeteer = require('puppeteer-core'), chromium = require('@sparticuz/chromium').default;
const browser = await puppeteer.launch({executablePath: process.env.CHROME_BIN || await chromium.executablePath(), headless: 'shell',
  args: [...chromium.args, '--allow-file-access-from-files', '--disable-dev-shm-usage'], protocolTimeout: 300000});
try {
  const errors = [], videoResponses = [];
  async function openPage() {
    const page = await browser.newPage();
    page.on('pageerror', e => errors.push(e.message)); page.on('console', m => { if (m.type() === 'error') errors.push(m.text()); });
    page.on('response', r => { if (/\/transition_(preview|feet)\.mp4(?:\?.*)?$/.test(r.url())) videoResponses.push({url: r.url(), status: r.status()}); });
    await page.setRequestInterception(true);
    page.on('request', r => /^(file|data|blob):/i.test(r.url()) || (!isFile && new URL(r.url()).origin === origin)
      ? r.continue() : (errors.push('external request ' + r.url()), r.abort()));
    await page.setOfflineMode(isFile); return page;
  }
  for (const [width, height, mobile] of [[1440, 1000, false], [320, 760, true], [390, 844, true], [768, 1024, false]]) {
    const page = await openPage(); await page.setViewport({width, height, deviceScaleFactor: 1, isMobile: mobile, hasTouch: mobile});
    await page.goto(target, {waitUntil: 'load', timeout: 60000});
    await page.waitForFunction('window.transitionDemo?.state.ready === true', {timeout: 60000});
    const measured = await page.evaluate(() => {
      const d = transitionDemo; d.setManual(true); d.reset('walk', 0);
      const mesh = d.model.getObjectByName('NewBody'), idx = mesh.geometry.attributes.skinIndex, wt = mesh.geometry.attributes.skinWeight;
      const expressions = {handL: /^Rig_(Hand|Finger\d+_\d+)_L$/, handR: /^Rig_(Hand|Finger\d+_\d+)_R$/,
        footL: /^Rig_(Foot|Toes)_L$/, footR: /^Rig_(Foot|Toes)_R$/};
      const groups = Object.fromEntries(Object.keys(expressions).map(k => [k, []]));
      for (let i = 0; i < idx.count; i++) for (const [key, pattern] of Object.entries(expressions)) {
        let influence = 0; for (let k = 0; k < 4; k++) if (pattern.test(mesh.skeleton.bones[idx.getComponent(i, k)]?.name || '')) influence += wt.getComponent(i, k);
        if (influence > .5) groups[key].push(i);
      }
      const V = d.camera.position.constructor, v = new V();
      const out = {innerWidth, documentWidth: document.documentElement.scrollWidth, status: document.querySelector('#status').dataset.state,
        clips: d.gltf.animations.map(a => a.name), sizes: Object.fromEntries(Object.entries(groups).map(([k, v]) => [k, v.length])), body: 0, close: {}, buttons: []};
      for (const b of document.querySelectorAll('.primary-controls button')) out.buttons.push({height: b.getBoundingClientRect().height, disabled: b.disabled});
      d.chooseFocus('body');
      for (const view of ['front', 'front45', 'side', 'back', 'rear45']) {
        d.chooseView(view);
        for (const weight of [0, .5, 1]) for (let i = 0; i < 16; i++) {
          d.clock.phase = (i + .37) / 16; d.clock.weight = weight; d.step(0); d.camera.updateMatrixWorld(true);
          for (const name of ['Rig_Head', 'Rig_Hand_L', 'Rig_Hand_R', 'Rig_Foot_L', 'Rig_Foot_R']) {
            const point = d.rig.getObjectByName(name).getWorldPosition(v).project(d.camera);
            out.body = Math.max(out.body, Math.abs(point.x), Math.abs(point.y));
          }
        }
      }
      for (const focus of ['hands', 'feet', 'footL', 'footR']) {
        d.chooseFocus(focus); const selected = focus === 'hands' ? [...groups.handL, ...groups.handR] : focus === 'feet' ? [...groups.footL, ...groups.footR] : groups[focus];
        let max = 0;
        for (const view of ['front', 'back', 'side', 'front45', 'rear45', 'high', 'highFront']) {
          d.chooseView(view);
          for (const weight of [0, .5, 1]) for (let i = 0; i < 8; i++) {
            d.clock.phase = (i + .37) / 8; d.clock.weight = weight; d.step(0); d.camera.updateMatrixWorld(true); mesh.skeleton.update();
            for (const id of selected) { mesh.getVertexPosition(id, v); mesh.localToWorld(v); v.project(d.camera); max = Math.max(max, Math.abs(v.x), Math.abs(v.y)); }
          }
        }
        out.close[focus] = max;
      }
      return out;
    });
    assert.equal(measured.status, 'ready'); assert.deepEqual(measured.clips, ['Walk_Game_Trial', 'Run_Game_Trial']);
    assert.ok(measured.documentWidth <= measured.innerWidth + 1, `horizontal overflow ${width}`);
    assert.ok(measured.buttons.every(b => !b.disabled && b.height >= 40), `primary buttons ${width}`);
    assert.ok(measured.body < .98 && Object.values(measured.sizes).every(n => n > 1000) && Object.values(measured.close).every(n => n < .98),
      `sampled framing ${width}: ${JSON.stringify(measured)}`);
    console.log(`PASS ${isFile ? 'offline' : 'HTTP'} ${width}×${height}${mobile ? ' emulated touch' : ''}: no overflow, enabled controls, sampled body/hand/foot framing.`);
    await page.close();
  }
  // Exercise real clickable phone controls with deterministic manual steps.
  let page = await openPage(); await page.setViewport({width: 390, height: 844, deviceScaleFactor: 1, isMobile: true, hasTouch: true});
  await page.goto(target, {waitUntil: 'load', timeout: 60000}); await page.waitForFunction('window.transitionDemo?.state.ready === true', {timeout: 60000});
  await page.evaluate(() => { const d = transitionDemo; d.setManual(true); d.reset('walk', .31); d.setPlaying(true); });
  let before = await page.evaluate(() => {
    const d = transitionDemo; return {phase: d.clock.phase, weight: d.clock.weight, velocity: d.clock.velocity, root: d.rig.position.toArray(), grid: d.floorTexture.offset.y};
  });
  await page.click('[data-motion="run"]');
  let after = await page.evaluate(() => {
    const d = transitionDemo; return {phase: d.clock.phase, weight: d.clock.weight, velocity: d.clock.velocity, root: d.rig.position.toArray(), grid: d.floorTexture.offset.y};
  });
  assert.deepEqual(after, before, 'click reset phase or pose');
  assert.deepEqual(await page.evaluate(() => [transitionDemo.state.target, transitionDemo.state.auto]), ['run', false]);
  await page.evaluate(() => transitionDemo.step(.15));
  before = await page.evaluate(() => {
    const d = transitionDemo; return {phase: d.clock.phase, weight: d.clock.weight, velocity: d.clock.velocity, root: d.rig.position.toArray(), grid: d.floorTexture.offset.y};
  });
  assert.ok(before.weight > 0 && before.weight < 1 && before.velocity > 0);
  await page.click('[data-motion="walk"]');
  after = await page.evaluate(() => {
    const d = transitionDemo; return {phase: d.clock.phase, weight: d.clock.weight, velocity: d.clock.velocity, root: d.rig.position.toArray(), grid: d.floorTexture.offset.y};
  });
  assert.deepEqual(after, before, 'reversal reset phase, pose, or velocity');
  await page.evaluate(() => transitionDemo.step(.6));
  assert.ok(await page.evaluate(() => transitionDemo.clock.weight < .05));
  await page.click('[data-action="play"]'); assert.equal(await page.evaluate(() => transitionDemo.state.playing), false);
  await page.click('[data-motion="run"]');
  assert.equal(await page.evaluate(() => transitionDemo.state.playing), false, 'paused mode selection should wait for play');
  await page.click('[data-action="play"]'); assert.equal(await page.evaluate(() => transitionDemo.state.playing), true);
  const controls = await page.evaluate(async () => {
    const d = transitionDemo; d.setPlaying(false);
    document.querySelector('[data-view="highFront"]').click(); document.querySelector('[data-focus="feet"]').click();
    document.querySelector('[data-action="skeleton"]').click(); document.querySelector('[data-action="slow"]').click();
    const slider = document.querySelector('#phase'); slider.value = '375'; slider.dispatchEvent(new Event('input', {bubbles: true}));
    const now = {view: d.state.view, focus: d.state.focus, skeleton: d.helper.visible, slow: d.state.slow, playing: d.state.playing, auto: d.state.auto,
      phase: d.state.phase, display: document.querySelector('#phase-value').textContent};
    const original = URL.createObjectURL; URL.createObjectURL = blob => { window.savedDownloadBlob = blob; return original(blob); };
    document.querySelector('[data-action="download"]').click();
    const digest = await crypto.subtle.digest('SHA-256', await window.savedDownloadBlob.arrayBuffer());
    now.sha256 = [...new Uint8Array(digest)].map(x => x.toString(16).padStart(2, '0')).join('');
    return now;
  });
  assert.deepEqual(controls, {view: 'highFront', focus: 'feet', skeleton: true, slow: true, playing: false, auto: false, phase: .375, display: '38%', sha256: modelHash});
  const automation = await page.evaluate(() => {
    const d = transitionDemo; d.setSlow(false); d.reset('walk', 0); d.setAuto(true);
    const targets = [d.state.target]; d.step(1.9); targets.push(d.state.target); d.step(.2); targets.push(d.state.target);
    d.step(3.4); targets.push(d.state.target); d.step(3); targets.push(d.state.target);
    const schedule = {targets, autoTime: d.state.autoTime, playing: d.state.playing};
    d.setAuto(false); d.reset('walk', .11); d.step(.1);
    document.querySelector('[data-action="ground"]').click(); const stopped = d.floorTexture.offset.y;
    d.step(.2); const frozen = d.floorTexture.offset.y;
    document.querySelector('[data-action="ground"]').click(); const restarted = d.floorTexture.offset.y;
    d.step(.1); const moved = d.floorTexture.offset.y;
    return {schedule, stopped, frozen, restarted, moved};
  });
  assert.deepEqual(automation.schedule.targets, ['walk', 'walk', 'run', 'walk', 'walk']);
  assert.ok(automation.schedule.autoTime < 1e-8 && automation.schedule.playing);
  assert.equal(automation.stopped, automation.frozen); assert.equal(automation.stopped, automation.restarted); assert.notEqual(automation.moved, automation.restarted);
  console.log('PASS phone clicks: phase/velocity preserved on switch and reversal, pause/seek, auto schedule, grid continuity, views, slow, skeleton and exact GLB download.');
  // The real RAF clock must not slow down at low rendering frame rates.
  const clock = await page.evaluate(async () => {
    const d = transitionDemo; d.setManual(false); d.reset('walk', .2); d.setPlaying(true);
    const frame = () => new Promise(resolve => requestAnimationFrame(t => resolve({t, distance: d.clock.distance})));
    const start = await frame(); await new Promise(resolve => setTimeout(resolve, 900)); const end = await frame();
    return {wall: (end.t - start.t) / 1000, distance: end.distance - start.distance};
  });
  const ratio = clock.distance / (1.44 * clock.wall);
  assert.ok(ratio > .8 && ratio < 1.2, `incorrect real-time playback ${JSON.stringify(clock)}`);
  console.log(`PASS real-time 1× playback, observed distance/wall-time ratio ${ratio.toFixed(3)}.`);
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
      const seeked = wait('seeked'); video.currentTime = 7.8; await seeked;
      if (video.readyState < 2) await wait('loadeddata');
      const canvas = document.createElement('canvas'); canvas.width = 64; canvas.height = 36;
      const ctx = canvas.getContext('2d', {willReadFrequently: true}); ctx.drawImage(video, 0, 0, 64, 36);
      results.push({name, duration: video.duration, time: video.currentTime, ready: video.readyState, pixel: [...ctx.getImageData(2, 5, 1, 1).data]}); video.remove();
    }
    return results;
  }, ['transition_preview.mp4', 'transition_feet.mp4']);
  for (const v of videoResult) {
    assert.ok(Math.abs(v.duration - 8.5) < .1 && v.time > 7.5 && v.ready >= 2, JSON.stringify(v));
    assert.ok(v.pixel.slice(0, 3).reduce((a, b) => a + b, 0) >= 60, `late video frame blank: ${JSON.stringify(v)}`);
  }
  if (!isFile) for (const name of ['transition_preview.mp4', 'transition_feet.mp4']) {
    const responses = videoResponses.filter(r => r.url.includes('/' + name));
    assert.ok(responses.length && responses.every(r => [200, 206].includes(r.status)), JSON.stringify(responses));
  }
  await page.close();
  console.log(`PASS both videos: ${isFile ? 'offline' : 'HTTP'} metadata and late seek/decode.`);
  page = await openPage(); await page.emulateMediaFeatures([{name: 'prefers-reduced-motion', value: 'reduce'}]);
  await page.goto(target, {waitUntil: 'load', timeout: 60000}); await page.waitForFunction('window.transitionDemo?.state.ready === true', {timeout: 60000});
  assert.deepEqual(await page.evaluate(() => [transitionDemo.state.playing, transitionDemo.state.auto]), [false, false]);
  await page.click('[data-action="auto"]'); assert.deepEqual(await page.evaluate(() => [transitionDemo.state.playing, transitionDemo.state.auto]), [true, true]);
  await page.close(); console.log('PASS reduced-motion preference starts paused and the user can explicitly start auto-play.');
  assert.deepEqual(errors, [], errors.join('\n'));
  const fallback = await browser.newPage(); await fallback.setOfflineMode(isFile);
  await fallback.evaluateOnNewDocument(() => {
    const get = HTMLCanvasElement.prototype.getContext;
    HTMLCanvasElement.prototype.getContext = function(type, ...args) { return /webgl/i.test(type) ? null : get.call(this, type, ...args); };
  });
  await fallback.goto(target, {waitUntil: 'load', timeout: 60000});
  await fallback.waitForFunction("document.querySelector('#status').dataset.state === 'error'", {timeout: 60000});
  assert.ok(await fallback.evaluate(() => !document.querySelector('#fallback').hidden && document.querySelectorAll('#fallback a[href$=".mp4"]').length === 2));
  await fallback.close(); console.log('PASS WebGL failure shows both video alternatives.');
} finally { await browser.close(); }
