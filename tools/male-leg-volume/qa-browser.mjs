// Offline/optional HTTP browser checks. Touch is emulated, not a physical phone.
import assert from 'node:assert/strict';
import {createHash} from 'node:crypto';
import {createRequire} from 'node:module';
import {fileURLToPath, pathToFileURL} from 'node:url';
import fs from 'node:fs';
import path from 'node:path';
const repo = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const folder = path.resolve(process.argv[2] || path.join(repo, 'work/male-leg-volume'));
const target = process.argv[3] || pathToFileURL(path.join(folder, 'index.html')).href;
const isFile = target.startsWith('file:'), origin = isFile ? '' : new URL(target).origin;
const hash = bytes => createHash('sha256').update(bytes).digest('hex');
const modelHash = hash(fs.readFileSync(path.join(folder, 'male_leg_volume_trial.glb')));
const html = fs.readFileSync(path.join(folder, 'index.html'), 'utf8'), embedded = html.match(/window\.EMBEDDED_MODEL="([^"]+)"/);
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
    page.on('response', r => { if (/\/(?:uphill_(?:walk|run|transition|feet)|leg_comparison)\.mp4(?:\?.*)?$/.test(r.url())) videoResponses.push({url: r.url(), status: r.status()}); });
    await page.setRequestInterception(true);
    page.on('request', r => /^(file|data|blob):/i.test(r.url()) || (!isFile && new URL(r.url()).origin === origin)
      ? r.continue() : (errors.push('external request ' + r.url()), r.abort()));
    await page.setOfflineMode(isFile); return page;
  }
  for (const [width, height, mobile] of [[1440, 1000, false], [800, 600, false], [320, 760, true], [390, 844, true], [768, 1024, false]]) {
    const page = await openPage(); await page.setViewport({width, height, deviceScaleFactor: 1, isMobile: mobile, hasTouch: mobile});
    await page.goto(target, {waitUntil: 'load', timeout: 60000});
    await page.waitForFunction('window.uphillDemo?.state.ready === true', {timeout: 60000});
    const measured = await page.evaluate(() => {
      const d = uphillDemo; d.setManual(true); d.setAngle(20); d.setPlaying(false);
      const mesh = d.model.getObjectByName('NewBody'), idx = mesh.geometry.attributes.skinIndex, wt = mesh.geometry.attributes.skinWeight;
      const groups = {footL: [], footR: []};
      for (let i = 0; i < idx.count; i++) for (const side of ['L', 'R']) {
        let influence = 0;
        for (let k = 0; k < 4; k++) if (new RegExp(`^Rig_(Foot|Toes)_${side}$`).test(mesh.skeleton.bones[idx.getComponent(i, k)]?.name || '')) influence += wt.getComponent(i, k);
        if (influence > .5) groups['foot' + side].push(i);
      }
      const V = d.camera.position.constructor, v = new V();
      const out = {innerWidth, documentWidth: document.documentElement.scrollWidth, status: document.querySelector('#status').dataset.state,
        clips: d.gltf.animations.map(a => a.name), sizes: Object.fromEntries(Object.entries(groups).map(([k, ids]) => [k, ids.length])),
        body: 0, overview: 0, close: {}, buttons: []};
      for (const button of document.querySelectorAll('.primary-controls button,.compare-controls button,.grade button')) out.buttons.push({height: button.getBoundingClientRect().height, disabled: button.disabled});
      d.chooseFocus('body');
      for (const view of ['front', 'front45', 'side', 'back', 'rear45']) {
        d.chooseView(view);
        for (const z of [-1.6, 1.4, 5.7]) for (const weight of [0, .5, 1]) for (let i = 0; i < 8; i++) {
          d.controller.reset('walk', (i + .37) / 8, z); d.clock.weight = weight; d.step(0); d.camera.updateMatrixWorld(true);
          for (const name of ['Rig_Head', 'Rig_Hand_L', 'Rig_Hand_R', 'Rig_Foot_L', 'Rig_Foot_R']) {
            const point = d.rig.getObjectByName(name).getWorldPosition(v).project(d.camera);
            out.body = Math.max(out.body, Math.abs(point.x), Math.abs(point.y));
          }
        }
      }
      for (const focus of ['feet', 'footL', 'footR']) {
        d.chooseFocus(focus);
        const all = focus === 'feet' ? [...groups.footL, ...groups.footR] : groups[focus], selected = all.filter((_, i) => i % 4 === 0);
        let max = 0;
        for (const view of ['front', 'back', 'side', 'front45', 'rear45']) {
          d.chooseView(view);
          for (const z of [-1.1, 1.4, 5.4]) for (const weight of [0, .5, 1]) for (let i = 0; i < 4; i++) {
            d.controller.reset('walk', (i + .37) / 4, z); d.clock.weight = weight; d.step(0); d.camera.updateMatrixWorld(true); mesh.updateMatrixWorld(true); mesh.skeleton.update();
            for (const id of selected) { mesh.getVertexPosition(id, v); mesh.localToWorld(v); v.project(d.camera); max = Math.max(max, Math.abs(v.x), Math.abs(v.y)); }
          }
        }
        out.close[focus] = max;
      }
      d.chooseFocus('body'); d.chooseView('overview');
      for (const z of [-2.7, -1.5, 1.4, 5, 6.6]) for (const phase of [.1, .35, .6, .85]) {
        d.controller.reset('walk', phase, z); d.step(0); d.camera.updateMatrixWorld(true);
        for (const name of ['Rig_Head', 'Rig_Foot_L', 'Rig_Foot_R']) {
          const point = d.rig.getObjectByName(name).getWorldPosition(v).project(d.camera);
          out.overview = Math.max(out.overview, Math.abs(point.x), Math.abs(point.y));
        }
      }
      const geo = d.ground.geometry.getAttribute('position'); out.geometryError = 0; out.meshGapMin = Infinity; out.meshGapMax = -Infinity;
      for (let i = 0; i < geo.count; i++) out.geometryError = Math.max(out.geometryError, Math.abs(geo.getY(i) + .001 - d.terrain.height(geo.getX(i), geo.getZ(i))));
      for (let i = 0; i < geo.count - 2; i += 2) for (const f of [.25, .5, .75]) {
        const z = geo.getZ(i) * (1 - f) + geo.getZ(i + 2) * f, y = geo.getY(i) * (1 - f) + geo.getY(i + 2) * f;
        const gap = d.terrain.height(0, z) - y; out.meshGapMin = Math.min(out.meshGapMin, gap); out.meshGapMax = Math.max(out.meshGapMax, gap);
      }
      return out;
    });
    assert.equal(measured.status, 'ready'); assert.deepEqual(measured.clips, ['Walk_Game_Trial', 'Run_Game_Trial']);
    assert.ok(measured.documentWidth <= measured.innerWidth + 1, `horizontal overflow ${width}`);
    assert.ok(measured.buttons.every(b => !b.disabled && b.height >= (mobile ? 44 : 40)), `small or disabled controls ${width}`);
    assert.ok(measured.body < .98 && measured.overview < .99 && Object.values(measured.sizes).every(n => n > 1000) && Object.values(measured.close).every(n => n < .98),
      `sampled framing ${width}: ${JSON.stringify(measured)}`);
    assert.ok(measured.geometryError < 1e-6 && measured.meshGapMin > .0008 && measured.meshGapMax < .0012,
      `surface mesh mismatch: ${JSON.stringify(measured)}`);
    console.log(`PASS ${isFile ? 'offline' : 'HTTP'} ${width}×${height}${mobile ? ' emulated touch' : ''}: no overflow, enabled controls, sampled body/overview/foot framing.`);
    await page.close();
  }
  let page = await openPage(); await page.setViewport({width: 390, height: 844, deviceScaleFactor: 1, isMobile: true, hasTouch: true});
  await page.goto(target, {waitUntil: 'load', timeout: 60000}); await page.waitForFunction('window.uphillDemo?.state.ready === true', {timeout: 60000});
  await page.evaluate(() => { const d = uphillDemo; d.setManual(true); d.setAngle(20); d.restart('walk', true); d.step(2); });
  const snap = () => page.evaluate(() => {
    const d = uphillDemo, bones = []; d.rig.traverse(b => { if (b.isBone) bones.push([b.position.toArray(), b.quaternion.toArray()]); });
    return {phase: d.clock.phase, weight: d.clock.weight, velocity: d.clock.velocity, distance: d.clock.distance, actor: d.actor.position.toArray(), bones};
  });
  let before = await snap(); await page.click('[data-motion="run"]'); let after = await snap();
  assert.deepEqual(after, before, 'click reset position, phase, weight, velocity or pose');
  assert.equal(await page.evaluate(() => uphillDemo.state.target), 'run');
  await page.evaluate(() => uphillDemo.step(.15)); before = await snap();
  assert.ok(before.weight > 0 && before.weight < 1 && before.velocity > 0);
  await page.click('[data-motion="walk"]'); after = await snap(); assert.deepEqual(after, before, 'reversal reset pose or clock');
  await page.evaluate(() => uphillDemo.step(.6)); assert.ok(await page.evaluate(() => uphillDemo.clock.weight < .05));
  await page.click('[data-action="play"]'); assert.equal(await page.evaluate(() => uphillDemo.state.playing), false);
  await page.click('[data-motion="run"]'); assert.equal(await page.evaluate(() => uphillDemo.state.playing), false);
  await page.click('[data-action="play"]'); assert.equal(await page.evaluate(() => uphillDemo.state.playing), true);
  const controls = await page.evaluate(async () => {
    const d = uphillDemo; d.setPlaying(false);
    document.querySelector('[data-view="overview"]').click(); const overview = d.state.view;
    document.querySelector('[data-focus="feet"]').click(); document.querySelector('[data-action="skeleton"]').click(); document.querySelector('[data-action="slow"]').click();
    const z = d.actor.position.z, slider = document.querySelector('#phase'); slider.value = '375'; slider.dispatchEvent(new Event('input', {bubbles: true}));
    const now = {overview, view: d.state.view, focus: d.state.focus, skeleton: d.helper.visible, slow: d.state.slow,
      playing: d.state.playing, phase: d.state.phase, display: document.querySelector('#phase-value').textContent, positionUnchanged: z === d.actor.position.z};
    const original = URL.createObjectURL; URL.createObjectURL = blob => { window.savedDownloadBlob = blob; return original(blob); };
    document.querySelector('[data-action="download"]').click();
    const digest = await crypto.subtle.digest('SHA-256', await window.savedDownloadBlob.arrayBuffer());
    now.sha256 = [...new Uint8Array(digest)].map(x => x.toString(16).padStart(2, '0')).join(''); return now;
  });
  assert.deepEqual(controls, {overview: 'overview', view: 'side', focus: 'feet', skeleton: true, slow: true, playing: false,
    phase: .375, display: '38%', positionUnchanged: true, sha256: modelHash});
  await page.click('[data-action="example"]');
  assert.deepEqual(await page.evaluate(() => [uphillDemo.state.example, uphillDemo.state.finished, uphillDemo.state.playing,
    uphillDemo.state.target, uphillDemo.state.focus, uphillDemo.state.progress, uphillDemo.controller.stats.active]), [true, true, false, 'run', 'knees', 1, false]);
  const sampledVertex = () => page.evaluate(() => {
    const d = uphillDemo, m = d.model.getObjectByName('NewBody'), morph = m.geometry.morphAttributes.position[0], V = d.camera.position.constructor;
    let best = 0; for (let i = 1; i < morph.count; i++) if (Math.abs(morph.getZ(i)) > Math.abs(morph.getZ(best))) best = i;
    d.model.updateWorldMatrix(true, true); m.updateMatrixWorld(true); m.skeleton.update();
    return m.localToWorld(m.getVertexPosition(best, new V())).toArray();
  });
  const fixedPose = await snap(), vAfter = await sampledVertex();
  await page.click('[data-correction="before"]');
  assert.deepEqual(await snap(), fixedPose, 'before/after toggle changed the screenshot pose');
  assert.equal(await page.$eval('[data-correction="before"]', b => b.getAttribute('aria-pressed')), 'true');
  const vBefore = await sampledVertex();
  assert.ok(Math.hypot(...vBefore.map((v, i) => v - vAfter[i])) > .01, 'comparison did not change a knee vertex');
  await page.click('[data-correction="after"]'); assert.deepEqual(await snap(), fixedPose);
  const again = await sampledVertex(); assert.ok(Math.hypot(...again.map((v, i) => v - vAfter[i])) < 1e-10);
  assert.equal(await page.$eval('[data-correction="after"]', b => b.getAttribute('aria-pressed')), 'true');
  await page.click('[data-grade="10"]');
  assert.deepEqual(await page.evaluate(() => [uphillDemo.state.angle, uphillDemo.actor.position.z, uphillDemo.state.finished, uphillDemo.state.playing]), [10, -2.7, false, true]);
  const route = await page.evaluate(() => {
    const d = uphillDemo; d.setSlow(false); d.restart('run', true); d.step(100);
    const end = {finished: d.state.finished, playing: d.state.playing, z: d.actor.position.z, altitude: d.actor.position.y, expected: d.terrain.height(0, 6.6), phase: d.clock.phase};
    d.step(1); end.still = d.actor.position.z; return end;
  });
  assert.ok(route.finished && !route.playing && Math.abs(route.z - 6.6) < 1e-6 && Math.abs(route.altitude - route.expected) < 1e-8 && route.still === route.z, JSON.stringify(route));
  await page.click('[data-action="play"]');
  assert.deepEqual(await page.evaluate(() => [uphillDemo.state.finished, uphillDemo.state.playing, uphillDemo.actor.position.z]), [false, true, -2.7]);
  console.log('PASS phone clicks: movement switches/reversals, screenshot pose and before/after without bone/clock reset, pause/seek, grade, camera, replay and exact GLB download.');
  const timing = await page.evaluate(async () => {
    const d = uphillDemo; d.setManual(false); d.setAngle(0); d.restart('walk', true);
    const frame = () => new Promise(resolve => requestAnimationFrame(t => resolve({t, distance: d.clock.distance})));
    const start = await frame(); await new Promise(resolve => setTimeout(resolve, 900)); const end = await frame();
    return {wall: (end.t - start.t) / 1000, distance: end.distance - start.distance};
  });
  const ratio = timing.distance / (1.44 * timing.wall);
  assert.ok(ratio > .8 && ratio < 1.2, `incorrect real-time playback: ${JSON.stringify(timing)}`);
  console.log(`PASS real-time playback: observed distance/wall-time ratio ${ratio.toFixed(3)}.`);
  const names = ['uphill_walk.mp4', 'uphill_run.mp4', 'uphill_transition.mp4', 'uphill_feet.mp4', 'leg_comparison.mp4'];
  const videos = await page.evaluate(async names => {
    const out = [];
    for (const name of names) {
      const video = document.createElement('video'); video.preload = 'auto'; video.muted = true;
      video.src = new URL(name, document.baseURI).href; document.body.append(video);
      const wait = event => new Promise((resolve, reject) => {
        const timer = setTimeout(() => reject(Error(`${name} timed out waiting for ${event}`)), 25000);
        video.addEventListener(event, () => { clearTimeout(timer); resolve(); }, {once: true});
        video.addEventListener('error', () => { clearTimeout(timer); reject(Error(`${name} video error`)); }, {once: true});
      });
      if (video.readyState < 1) await wait('loadedmetadata');
      const seeked = wait('seeked'); video.currentTime = video.duration - .6; await seeked;
      if (video.readyState < 2) await wait('loadeddata');
      const canvas = document.createElement('canvas'); canvas.width = 64; canvas.height = 36;
      const ctx = canvas.getContext('2d', {willReadFrequently: true}); ctx.drawImage(video, 0, 0, 64, 36);
      out.push({name, duration: video.duration, time: video.currentTime, ready: video.readyState, pixel: [...ctx.getImageData(2, 5, 1, 1).data]}); video.remove();
    }
    return out;
  }, names);
  for (const v of videos) {
    const expected = /_(walk|run)/.test(v.name) ? 7 : 6;
    assert.ok(Math.abs(v.duration - expected) < .1 && v.time > expected - 1 && v.ready >= 2, JSON.stringify(v));
    assert.ok(v.pixel.slice(0, 3).reduce((a, b) => a + b, 0) >= 60, `late video frame blank: ${JSON.stringify(v)}`);
  }
  if (!isFile) for (const name of names) {
    const responses = videoResponses.filter(r => r.url.includes('/' + name));
    assert.ok(responses.length && responses.every(r => [200, 206].includes(r.status)), JSON.stringify(responses));
  }
  await page.close(); console.log(`PASS five videos: ${isFile ? 'offline' : 'HTTP'} metadata and late seek/decode.`);
  page = await openPage(); await page.emulateMediaFeatures([{name: 'prefers-reduced-motion', value: 'reduce'}]);
  await page.goto(target, {waitUntil: 'load', timeout: 60000}); await page.waitForFunction('window.uphillDemo?.state.ready === true', {timeout: 60000});
  assert.equal(await page.evaluate(() => uphillDemo.state.playing), false); await page.click('[data-action="play"]');
  assert.equal(await page.evaluate(() => uphillDemo.state.playing), true); await page.close(); console.log('PASS reduced-motion preference starts paused and allows explicit play.');
  assert.deepEqual(errors, [], errors.join('\n'));
  const fallback = await browser.newPage(); await fallback.setOfflineMode(isFile);
  await fallback.evaluateOnNewDocument(() => {
    const get = HTMLCanvasElement.prototype.getContext;
    HTMLCanvasElement.prototype.getContext = function(type, ...args) { return /webgl/i.test(type) ? null : get.call(this, type, ...args); };
  });
  await fallback.goto(target, {waitUntil: 'load', timeout: 60000});
  await fallback.waitForFunction("document.querySelector('#status').dataset.state === 'error'", {timeout: 60000});
  assert.ok(await fallback.evaluate(() => !document.querySelector('#fallback').hidden && document.querySelectorAll('#fallback a[href$=".mp4"]').length === 5));
  await fallback.close(); console.log('PASS WebGL failure presents five video alternatives.');
} finally { await browser.close(); }
