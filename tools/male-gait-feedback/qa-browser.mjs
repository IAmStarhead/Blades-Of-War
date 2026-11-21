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
const output = path.resolve(process.argv[2] || path.join(repo, 'work/male-gait-feedback'));
const require = createRequire(path.join(repo, 'tools/character-showcase/package.json'));
const puppeteer = require('puppeteer-core'), chromium = require('@sparticuz/chromium').default;
const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'bow-c-feedback-download-')), errors = [];
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
      foot: d.rig.getObjectByName('Rig_Foot_L').getWorldPosition(v).toArray(),
      neck: d.rig.getObjectByName('Rig_Neck').getWorldPosition(v).toArray(),
      head: d.rig.getObjectByName('Rig_Head').getWorldQuaternion(d.camera.quaternion.clone()).toArray(), grid: d.floorTexture.offset.toArray()};
  });
}
async function checkFootFraming(page) {
  const worst = await page.evaluate(() => {
    const d = motionFit, p = d.models.selected.model.getObjectByName('NewBody').geometry.attributes.position, ids = [], v = d.camera.position.clone();
    for (let i = 0; i < p.count; i++) if (p.getY(i) < .2 && Math.abs(p.getX(i)) > .035 && Math.abs(p.getX(i)) < .25) ids.push(i);
    const worst = {x: 0, y: 0};
    for (const version of ['selected', 'previous']) for (const motion of ['walk', 'run']) {
      d.setVersion(version); d.setMotion(motion); d.chooseFocus('feet');
      const m = d.model.getObjectByName('NewBody');
      for (const view of ['front', 'side', 'back', 'rear45', 'high']) {
        d.chooseView(view);
        for (let i = 0; i < 32; i++) {
          d.setPhase((i + .37) / 32); d.model.updateMatrixWorld(true); d.camera.updateMatrixWorld(true); m.skeleton.update();
          for (const id of ids) {
            m.getVertexPosition(id, v); m.localToWorld(v); v.project(d.camera);
            if (Math.abs(v.x) > worst.x) { worst.x = Math.abs(v.x); worst.whereX = [version, motion, view, i]; }
            if (Math.abs(v.y) > worst.y) { worst.y = Math.abs(v.y); worst.whereY = [version, motion, view, i]; }
          }
        }
      }
    }
    return {...worst, vertices: ids.length, aspect: d.camera.aspect};
  });
  assert.ok(worst.vertices > 2000 && worst.x < .96 && worst.y < .96, `foot preset clips sampled foot vertices: ${JSON.stringify(worst)}`);
  return worst;
}
async function checkBodyFraming(page) {
  const worst = await page.evaluate(() => {
    const d = motionFit, v = d.camera.position.clone(), worst = {x: 0, y: 0};
    for (const version of ['selected', 'previous']) for (const motion of ['walk', 'run']) {
      d.setVersion(version); d.setMotion(motion); d.chooseFocus('body');
      const m = d.model.getObjectByName('NewBody');
      for (const view of ['front', 'side', 'back', 'rear45']) {
        d.chooseView(view);
        for (let i = 0; i < 32; i++) {
          d.setPhase((i + .37) / 32); d.model.updateMatrixWorld(true); d.camera.updateMatrixWorld(true); m.skeleton.update();
          for (let id = 0; id < m.geometry.attributes.position.count; id++) {
            m.getVertexPosition(id, v); m.localToWorld(v); v.project(d.camera);
            if (Math.abs(v.x) > worst.x) { worst.x = Math.abs(v.x); worst.whereX = [version, motion, view, i, id]; }
            if (Math.abs(v.y) > worst.y) { worst.y = Math.abs(v.y); worst.whereY = [version, motion, view, i, id]; }
          }
        }
      }
    }
    return worst;
  });
  assert.ok(worst.x < .96 && worst.y < .96, `body preset clips sampled mesh vertices: ${JSON.stringify(worst)}`);
  return worst;
}
try {
  const desktop = await open({width: 1440, height: 1000, deviceScaleFactor: 1}); await load(desktop);
  assert.equal(await desktop.$eval('#status', e => e.dataset.state), 'ready');
  assert.deepEqual(await desktop.evaluate(() => motionFit.models.selected.gltf.animations.map(a => a.name)), ['Walk_C_HeadFeet_Trial', 'Run_C_HeadFeet_Trial']);
  assert.deepEqual(await desktop.evaluate(() => motionFit.models.previous.gltf.animations.map(a => a.name)), ['Walk_C_Refined', 'Run_C_Refined']);
  const rates = [];
  for (const motion of ['walk', 'run']) for (const version of ['selected', 'previous']) {
    const rate = await desktop.evaluate(async ({motion, version}) => {
      const d = motionFit; d.setVersion(version); d.setMotion(motion); d.setPhase(.13); d.setPlaying(true);
      // Sample on rendered frames and deliberately block for longer than the old
      // 100 ms clamp. Slow rendering may skip frames but must not slow time.
      const frame = () => new Promise(resolve => requestAnimationFrame(now => resolve({now, elapsed: d.state.elapsed})));
      const start = await frame(), until = performance.now() + 250;
      while (performance.now() < until) {} // deliberate slow-frame regression test
      const end = await frame(); d.setPlaying(false);
      return {real: (end.now - start.now) / 1000, animation: end.elapsed - start.elapsed, duration: d.models[version].action.getClip().duration};
    }, {motion, version});
    assert.ok(rate.real > .20 && Math.abs(rate.animation - rate.real) < .005, `${motion}/${version} playback rate: ${JSON.stringify(rate)}`);
    assert.ok(Math.abs(rate.duration - (motion === 'walk' ? 1 : .766666)) < .00001, 'C clip duration');
    rates.push(`${motion}/${version} ${(rate.animation / rate.real).toFixed(2)}x`);
  }
  console.log(`PASS: wall-clock playback despite induced slow frames at native C durations: ${rates.join(', ')}.`);
  await desktop.click('[data-action="slow"]');
  const half = await desktop.evaluate(async () => {
    const d = motionFit; d.setMotion('run'); d.setPhase(.13); d.setPlaying(true);
    const frame = () => new Promise(resolve => requestAnimationFrame(now => resolve({now, elapsed: d.state.elapsed})));
    const a = await frame(), until = performance.now() + 250; while (performance.now() < until) {}
    const b = await frame(); d.setPlaying(false);
    return {real: (b.now - a.now) / 1000, animation: b.elapsed - a.elapsed};
  });
  assert.ok(half.real > .20 && Math.abs(half.animation - .5 * half.real) < .005, `half-speed playback: ${JSON.stringify(half)}`);
  await desktop.click('[data-action="slow"]');
  const hidden = await desktop.evaluate(async () => {
    const d = motionFit; d.setMotion('walk'); d.setPhase(.3); d.setPlaying(true);
    const frame = () => new Promise(resolve => requestAnimationFrame(now => resolve({now, elapsed: d.state.elapsed})));
    await frame();
    Object.defineProperty(document, 'hidden', {value: true, configurable: true}); document.dispatchEvent(new Event('visibilitychange'));
    const a = await frame(), b = await frame();
    delete document.hidden; document.dispatchEvent(new Event('visibilitychange'));
    const c = await frame(), e = await frame(); d.setPlaying(false);
    return {hiddenAdvance: b.elapsed - a.elapsed, resumeAdvance: c.elapsed - b.elapsed,
      visible: (e.now - c.now) / 1000, visibleAdvance: e.elapsed - c.elapsed};
  });
  assert.ok(Math.abs(hidden.hiddenAdvance) < 1e-9 && Math.abs(hidden.resumeAdvance) < 1e-9, `hidden or resume jumped: ${JSON.stringify(hidden)}`);
  assert.ok(Math.abs(hidden.visibleAdvance - hidden.visible) < .005, `resume cadence: ${JSON.stringify(hidden)}`);
  console.log('PASS: optional half-speed and pause-without-jump when hidden.');
  assert.equal(await desktop.evaluate(() => { let n = 0; for (const m of Object.values(motionFit.models)) m.model.traverse(o => { if (o.isSkinnedMesh && o.frustumCulled) n++; }); return n; }), 0);
  const standDifference = await desktop.evaluate(() => {
    const d = motionFit; d.setMotion('stand'); const samples = [];
    for (const version of ['previous', 'selected']) {
      d.setVersion(version); d.scene.updateMatrixWorld(true);
      const m = d.model.getObjectByName('NewBody'), v = d.camera.position.clone(), vertices = [];
      m.skeleton.update();
      for (let i = 0; i < m.geometry.attributes.position.count; i++) { m.getVertexPosition(i, v); vertices.push(v.x, v.y, v.z); }
      samples.push(vertices);
    }
    let maximum = 0;
    for (let i = 0; i < samples[0].length; i += 3) maximum = Math.max(maximum, Math.hypot(...[0, 1, 2].map(k => samples[0][i + k] - samples[1][i + k])));
    return maximum;
  });
  assert.ok(standDifference < .00001, `rest shape differs by ${standDifference} m`);
  await desktop.evaluate(() => { motionFit.setVersion('selected'); motionFit.setMotion('walk'); motionFit.setPhase(.17); });
  const first = await canvasHash(desktop), a = await snapshot(desktop);
  await desktop.evaluate(() => { motionFit.samplePose(); motionFit.samplePose(); }); const repeated = await snapshot(desktop);
  assert.deepEqual(repeated.grid, a.grid, 'grid must not jump on repeated paused samples');
  for (let k = 0; k < 3; k++) assert.ok(Math.abs(repeated.foot[k] - a.foot[k]) < 1e-9, 'pose must remain stable on pause');
  await desktop.evaluate(() => motionFit.setPhase(.64)); assert.notEqual(await canvasHash(desktop), first, 'walk changes its visible pose');
  const beforeCompare = await snapshot(desktop); await desktop.click('[data-version="previous"]'); const previous = await snapshot(desktop);
  assert.equal(previous.state.version, 'previous'); assert.equal(previous.state.phase, beforeCompare.state.phase);
  assert.deepEqual(previous.camera, beforeCompare.camera, 'comparison retains camera');
  assert.ok(Math.hypot(...previous.neck.map((v, i) => v - beforeCompare.neck[i])) < 1e-6, 'C torso remains in place');
  const headDot = Math.abs(previous.head.reduce((sum, v, i) => sum + v * beforeCompare.head[i], 0));
  assert.ok(2 * Math.acos(Math.min(1, headDot)) > .05, 'head orientation actually changes');
  assert.equal(await desktop.$eval('[data-action="ground"]', e => e.disabled), false);
  assert.deepEqual(previous.grid, beforeCompare.grid, 'comparison retains the same ground position');
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
  await desktop.click('[data-focus="shoulders"]'); assert.equal((await snapshot(desktop)).state.focus, 'shoulders');
  await desktop.click('[data-view="high"]');
  assert.ok(await desktop.evaluate(() => motionFit.camera.position.y - motionFit.orbit.target.y > .5), 'high view elevates the camera');
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
  assert.equal(downloaded.suggestedFilename, 'male_C_head_feet_trial.glb');
  assert.equal(hash(fs.readFileSync(path.join(tmp, downloaded.suggestedFilename))), hash(fs.readFileSync(path.join(output, downloaded.suggestedFilename))));
  const desktopFeet = await checkFootFraming(desktop), desktopBody = await checkBodyFraming(desktop);
  await desktop.evaluate(() => { motionFit.chooseView('side'); motionFit.chooseFocus('body'); });
  const bodyDistanceBefore = await desktop.evaluate(() => motionFit.camera.position.distanceTo(motionFit.orbit.target));
  await desktop.setViewport({width: 768, height: 1024, deviceScaleFactor: 1});
  await desktop.waitForFunction('motionFit.camera.aspect < .65', {timeout: 10000});
  const bodyDistanceAfter = await desktop.evaluate(() => motionFit.camera.position.distanceTo(motionFit.orbit.target));
  assert.ok(bodyDistanceAfter > bodyDistanceBefore + .5, 'tablet resize expands the full-body focus without a new preset click');
  const resizedBody = await checkBodyFraming(desktop);
  await desktop.setViewport({width: 1440, height: 1000, deviceScaleFactor: 1});
  await desktop.waitForFunction('motionFit.camera.aspect > 1.3', {timeout: 10000});
  await desktop.evaluate(() => { motionFit.setVersion('selected'); motionFit.setMotion('run'); motionFit.chooseView('side'); motionFit.chooseFocus('feet'); motionFit.setPhase(.7); });
  const distanceBeforeResize = await desktop.evaluate(() => motionFit.camera.position.distanceTo(motionFit.orbit.target));
  await desktop.setViewport({width: 320, height: 700, deviceScaleFactor: 1});
  await desktop.waitForFunction('motionFit.camera.aspect < .8', {timeout: 10000});
  const distanceAfterResize = await desktop.evaluate(() => motionFit.camera.position.distanceTo(motionFit.orbit.target));
  assert.ok(distanceAfterResize > distanceBeforeResize + .5, 'narrow resize expands the foot focus without a new preset click');
  const resizedFeet = await checkFootFraming(desktop);
  await desktop.close();
  console.log(`PASS: offline desktop, before/after switching at the same phase and ground position, pause/seek, floor, focus, skeleton, camera and byte-exact GLB download; body framing ${desktopBody.x.toFixed(2)}/${desktopBody.y.toFixed(2)}, after tablet resize ${resizedBody.x.toFixed(2)}/${resizedBody.y.toFixed(2)}, foot framing ${desktopFeet.x.toFixed(2)}/${desktopFeet.y.toFixed(2)}, after narrow resize ${resizedFeet.x.toFixed(2)}/${resizedFeet.y.toFixed(2)}`);
  // Follow the video links to the MP4 directly. A fresh browser avoids the
  // retained headless WebGL context from interfering with video presentation.
  const mediaBrowser = await puppeteer.launch({executablePath: process.env.CHROME_BIN || await chromium.executablePath(), headless: 'shell',
    args: [...chromium.args, '--allow-file-access-from-files', '--disable-dev-shm-usage'], protocolTimeout: 180000});
  try {
  for (const mode of ['walk', 'run', 'feet']) {
    const media = await mediaBrowser.newPage();
    try {
      await media.setViewport({width: 1280, height: 800, deviceScaleFactor: 1});
      media.on('pageerror', e => errors.push('video page: ' + e.message));
      await media.setRequestInterception(true);
      media.on('request', r => /^(file|data|blob):/i.test(r.url()) ? r.continue() : (errors.push('external request: ' + r.url()), r.abort()));
      await media.setOfflineMode(true);
      await media.goto(pathToFileURL(path.join(output, `${mode}_before_after.mp4`)).href, {waitUntil: 'load', timeout: 30000});
      await media.waitForSelector('video', {timeout: 15000});
      const info = await media.evaluate(async mode => {
        const video = document.querySelector('video'); video.muted = true;
        if (video.readyState < 1) await new Promise((resolve, reject) => {
          const timer = setTimeout(() => reject(Error('video metadata timeout')), 15000);
          video.onloadedmetadata = () => { clearTimeout(timer); resolve(); }; video.onerror = () => { clearTimeout(timer); reject(Error('video metadata error')); };
        });
        await video.play(); await new Promise(resolve => setTimeout(resolve, 250)); video.pause();
        const canvas = document.createElement('canvas'); canvas.width = video.videoWidth; canvas.height = video.videoHeight;
        const context = canvas.getContext('2d', {willReadFrequently: true});
        const frame = async t => {
          await new Promise((resolve, reject) => { const timer = setTimeout(() => reject(Error('video seek timeout')), 15000);
            video.onseeked = () => { clearTimeout(timer); resolve(); };
            video.onerror = () => { clearTimeout(timer); reject(Error('video seek error')); }; video.currentTime = t; });
          await new Promise(resolve => requestAnimationFrame(() => requestAnimationFrame(resolve)));
          if (video.readyState < 2 || Math.abs(video.currentTime - t) > .04) throw Error('Video did not seek to the requested time');
          context.drawImage(video, 0, 0);
          for (const [x, y, minimum] of [[0, 0, 35], [36, 108, 60], [660, 108, 60]]) {
            const [r, g, b] = context.getImageData(x, y, 1, 1).data;
            if (r + g + b < minimum) throw Error(`${mode}: black video/pane at ${t}s: ${r},${g},${b}`);
          }
          return canvas.toDataURL();
        };
        const a = await frame(.2), b = await frame(.7), c = await frame(4.2), e = await frame(5.7);
        return {width: video.videoWidth, height: video.videoHeight, duration: video.duration, earlyDifferent: a !== b, lateDifferent: c !== e};
      }, mode);
      assert.deepEqual(info, {width: 1280, height: 720, duration: 6, earlyDifferent: true, lateDifferent: true}, `${mode} video`);
    } finally { await media.close(); }
  }
  } finally { await mediaBrowser.close(); }
  console.log('PASS: each offline MP4 plays and seeks to distinct nonblack frames near the beginning and end.');
  for (const viewport of [{width: 320, height: 700, deviceScaleFactor: 1, isMobile: true, hasTouch: true},
    {width: 390, height: 844, deviceScaleFactor: 2, isMobile: true, hasTouch: true},
    {width: 768, height: 1024, deviceScaleFactor: 1, isMobile: true, hasTouch: true}]) {
    const mobile = await open(viewport); await load(mobile);
    const dim = await mobile.evaluate(() => ({client: document.documentElement.clientWidth, scroll: document.documentElement.scrollWidth, stage: document.querySelector('#stage').getBoundingClientRect().toJSON()}));
    if (viewport.width <= 700) {
      await mobile.click('[data-quick-motion="run"]'); assert.equal((await snapshot(mobile)).state.motion, 'run');
      await mobile.click('[data-quick-version="previous"]'); assert.equal((await snapshot(mobile)).state.version, 'previous');
      assert.equal(await mobile.$eval('[data-version="previous"]', e => e.getAttribute('aria-pressed')), 'true');
      await mobile.click('[data-quick-version="selected"]');
      assert.equal(await mobile.$eval('[data-version="selected"]', e => e.getAttribute('aria-pressed')), 'true');
    }
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
    const feet = await checkFootFraming(mobile), body = await checkBodyFraming(mobile);
    await mobile.close(); console.log(`PASS: ${viewport.width}x${viewport.height} emulation, controls, no overflow, touch rotation/pinch; body framing ${body.x.toFixed(2)}/${body.y.toFixed(2)}, foot framing ${feet.x.toFixed(2)}/${feet.y.toFixed(2)}`);
  }
  const fallback = await open({width: 390, height: 844, deviceScaleFactor: 1}, false);
  await fallback.evaluateOnNewDocument(() => {
    const get = HTMLCanvasElement.prototype.getContext;
    HTMLCanvasElement.prototype.getContext = function (type, ...args) { return /webgl/i.test(type) ? null : get.call(this, type, ...args); };
  });
  await fallback.goto(pathToFileURL(path.join(output, 'index.html')).href, {waitUntil: 'load', timeout: 60000});
  await fallback.waitForFunction("document.querySelector('#status').dataset.state === 'error'", {timeout: 30000});
  assert.equal(await fallback.$eval('#fallback', e => e.hidden), false);
  for (const file of ['walk_before_after.mp4', 'run_before_after.mp4', 'feet_before_after.mp4']) {
    assert.ok(fs.statSync(path.join(output, file)).size > 10000, file);
    assert.ok(await fallback.$(`a[href="${file}"]`), 'fallback link ' + file);
  }
  await fallback.close(); assert.deepEqual(errors, [], errors.join('\n'));
  console.log('PASS: WebGL-failure video links, no external requests or unexpected browser errors. Emulation is not a physical-device test.');
} finally { await browser.close(); fs.rmSync(tmp, {recursive: true, force: true}); }
