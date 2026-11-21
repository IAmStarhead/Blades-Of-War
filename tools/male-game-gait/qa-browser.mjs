// Offline browser smoke tests for this standalone review, including emulated
// mobile sizes, elapsed-time playback, download bytes, and late video seeks.
// Emulation is not a physical-device or visual-quality test.
import assert from 'node:assert/strict';
import {createHash} from 'node:crypto';
import {createRequire} from 'node:module';
import {fileURLToPath, pathToFileURL} from 'node:url';
import fs from 'node:fs';
import path from 'node:path';

const repo = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const folder = path.resolve(process.argv[2] || path.join(repo, 'work/male-game-gait'));
const hash = b => createHash('sha256').update(b).digest('hex');
const modelHash = hash(fs.readFileSync(path.join(folder, 'male_game_gait_trial.glb')));
const require = createRequire(path.join(repo, 'tools/character-showcase/package.json'));
const puppeteer = require('puppeteer-core'), chromium = require('@sparticuz/chromium').default;
const browser = await puppeteer.launch({executablePath: process.env.CHROME_BIN || await chromium.executablePath(), headless: 'shell',
  args: [...chromium.args, '--allow-file-access-from-files', '--disable-dev-shm-usage'], protocolTimeout: 180000});
// Optional second argument tests the same page over a local preview server.
const target = process.argv[3] || pathToFileURL(path.join(folder, 'index.html')).href;
const isFile = target.startsWith('file:'), origin = isFile ? '' : new URL(target).origin;
try {
  const errors = [], videoResponses = [], page = await browser.newPage();
  page.on('pageerror', error => errors.push(error.message));
  page.on('console', message => { if (message.type() === 'error') errors.push(message.text()); });
  page.on('response', response => { if (/\/(walk|run|feet)_preview\.mp4(?:\?.*)?$/.test(response.url())) videoResponses.push({url: response.url(), status: response.status()}); });
  await page.setRequestInterception(true);
  page.on('request', request => /^(file|data|blob):/i.test(request.url()) || (!isFile && new URL(request.url()).origin === origin)
    ? request.continue() : (errors.push(`external request ${request.url()}`), request.abort()));
  await page.setOfflineMode(isFile);
  for (const [width, height, mobile] of [[1440, 1000, false], [320, 760, true], [390, 844, true], [768, 1024, false]]) {
    await page.setViewport({width, height, deviceScaleFactor: 1, isMobile: mobile, hasTouch: mobile});
    await page.goto(target, {waitUntil: 'load', timeout: 60000});
    await page.waitForFunction('window.motionFit?.state.ready === true', {timeout: 60000});
    const measured = await page.evaluate(() => {
      const d = window.motionFit;
      const data = {innerWidth, documentWidth: document.documentElement.scrollWidth,
        status: document.querySelector('#status').dataset.state,
        clips: d.gltf.animations.map(a => a.name), maxBody: 0, maxFeet: 0};
      const V = d.camera.position.constructor;
      function maxProjected(names) {
        d.model.updateMatrixWorld(true); d.camera.updateMatrixWorld(true);
        return Math.max(...names.map(name => {
          const bone = d.rig.getObjectByName(name); if (!bone) throw Error(`Missing ${name}`);
          const p = bone.getWorldPosition(new V()).project(d.camera);
          return Math.max(Math.abs(p.x), Math.abs(p.y));
        }));
      }
      for (const motion of ['walk', 'run']) for (const view of ['front', 'side', 'front45']) {
        d.setMotion(motion); d.setPlaying(false); d.chooseFocus('body'); d.chooseView(view);
        for (let i = 0; i < 24; i++) {
          d.setPhase(i / 24);
          data.maxBody = Math.max(data.maxBody, maxProjected(['Rig_Head', 'Rig_Hand_L', 'Rig_Hand_R', 'Rig_Foot_L', 'Rig_Foot_R']));
        }
        d.chooseFocus('feet'); d.chooseView('high');
        for (let i = 0; i < 24; i++) {
          d.setPhase(i / 24);
          data.maxFeet = Math.max(data.maxFeet, maxProjected(['Rig_Foot_L', 'Rig_Foot_R', 'Rig_Toes_L', 'Rig_Toes_R']));
        }
      }
      return data;
    });
    assert.equal(measured.status, 'ready');
    assert.deepEqual(measured.clips, ['Walk_Game_Trial', 'Run_Game_Trial']);
    assert.ok(measured.documentWidth <= measured.innerWidth + 1, `horizontal overflow at ${width}`);
    assert.ok(measured.maxBody < 1, `body joint clipped at ${width}: ${measured.maxBody}`);
    assert.ok(measured.maxFeet < 1, `foot joint clipped at ${width}: ${measured.maxFeet}`);
    console.log(`PASS ${isFile ? 'offline' : 'HTTP'} ${width}×${height}${mobile ? ' emulated touch' : ''}: no horizontal overflow; sampled body/foot joints fit presets.`);
  }
  await page.setViewport({width: 1440, height: 1000, deviceScaleFactor: 1});
  await page.goto(target, {waitUntil: 'load', timeout: 60000});
  await page.waitForFunction('window.motionFit?.state.ready === true', {timeout: 60000});
  const controls = await page.evaluate(async () => {
    const d = window.motionFit;
    document.querySelector('[data-motion="run"]').click();
    document.querySelector('[data-view="side"]').click();
    document.querySelector('[data-focus="feet"]').click();
    document.querySelector('[data-action="skeleton"]').click();
    document.querySelector('[data-action="ground"]').click();
    const slider = document.querySelector('#phase'); slider.value = '375'; slider.dispatchEvent(new Event('input', {bubbles: true}));
    const now = {motion: d.state.motion, view: d.state.view, focus: d.state.focus, skeleton: d.helper.visible,
      movingGround: d.state.movingGround, playing: d.state.playing, phase: d.state.phase};
    // Intercept the generated Blob to compare the embedded download bytes.
    const original = URL.createObjectURL;
    URL.createObjectURL = blob => { window.savedDownloadBlob = blob; return original(blob); };
    document.querySelector('[data-action="download"]').click();
    const digest = await crypto.subtle.digest('SHA-256', await window.savedDownloadBlob.arrayBuffer());
    now.sha256 = [...new Uint8Array(digest)].map(x => x.toString(16).padStart(2, '0')).join('');
    return now;
  });
  assert.deepEqual(controls, {motion: 'run', view: 'side', focus: 'feet', skeleton: true, movingGround: false, playing: false, phase: .375, sha256: modelHash});
  console.log('PASS motion/view/focus, skeleton, ground toggle, seek and exact embedded GLB download bytes.');

  const clock = await page.evaluate(async () => {
    const d = window.motionFit; d.setMotion('run'); d.setPlaying(true);
    // Compare at rendered RAF boundaries: on a slow software renderer the
    // timeout may fire before the next frame incorporates its elapsed time.
    const frame = () => new Promise(resolve => requestAnimationFrame(t => resolve({t, elapsed: d.state.elapsed})));
    const start = await frame();
    await new Promise(resolve => setTimeout(resolve, 950));
    const end = await frame();
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
      results.push({name, duration: video.duration, time: video.currentTime, ready: video.readyState, pixel});
      video.remove();
    }
    return results;
  }, ['walk_preview.mp4', 'run_preview.mp4', 'feet_preview.mp4']);
  for (const value of videoResult) {
    assert.ok(Math.abs(value.duration - 6) < .1 && value.time > 5 && value.ready >= 2, JSON.stringify(value));
    assert.ok(value.pixel.slice(0, 3).reduce((a, b) => a + b, 0) >= 60, `late video frame blank: ${JSON.stringify(value)}`);
  }
  if (!isFile) for (const kind of ['walk', 'run', 'feet']) {
    const responses = videoResponses.filter(r => r.url.includes(`/${kind}_preview.mp4`));
    assert.ok(responses.length && responses.every(r => [200, 206].includes(r.status)), `Unexpected video HTTP responses: ${JSON.stringify(responses)}`);
  }
  console.log(`PASS all three videos: ${isFile ? 'offline' : 'HTTP'} metadata and late frame seek/decode.`);
  assert.deepEqual(errors, [], errors.join('\n'));

  const fallback = await browser.newPage();
  await fallback.setOfflineMode(isFile);
  await fallback.evaluateOnNewDocument(() => {
    const get = HTMLCanvasElement.prototype.getContext;
    HTMLCanvasElement.prototype.getContext = function(type, ...args) {
      return /webgl/i.test(type) ? null : get.call(this, type, ...args);
    };
  });
  await fallback.goto(target, {waitUntil: 'load', timeout: 60000});
  await fallback.waitForFunction("document.querySelector('#status').dataset.state === 'error'", {timeout: 60000});
  const visible = await fallback.evaluate(() => !document.querySelector('#fallback').hidden && document.querySelectorAll('#fallback a[href$=".mp4"]').length === 3);
  assert.ok(visible); await fallback.close();
  console.log('PASS WebGL failure shows three video alternatives.');
} finally { await browser.close(); }
