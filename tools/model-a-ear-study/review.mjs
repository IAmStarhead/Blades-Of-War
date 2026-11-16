// Actual offline screenshots of the untouched eye-study and the new GLB.
// The models use identical camera, pose and lights; review.py only crops/labels.
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
const result = path.resolve(process.argv[2] || path.join(root, 'work/character-model-search/selected-a/ear-study'));
const inputs = [
  ['before', path.join(root, 'work/character-model-search/selected-a/eye-study/female_A_eyes_refined_and_well.zip')],
  ['after', path.join(result, 'female_A_ears_refined_and_well.zip')],
];
const temp = fs.mkdtempSync(path.join(os.tmpdir(), 'bow-ear-review-'));
const errors = [];
const frame = page => page.evaluate(() => new Promise(resolve => requestAnimationFrame(() => requestAnimationFrame(resolve))));
const core = fs.readFileSync(path.join(root, 'tools/model-a-motion/node_modules/three/build/three.core.js'), 'utf8');
const cameraViews = [
  ['front', [0, 1.56, .60], [0, 1.56, .02]],
  ['front-close', [0, 1.55, .43], [0, 1.55, .025]],
  ['left-ear', [.265, 1.545, .02], [.077, 1.545, .02]],
  ['right-ear', [-.265, 1.545, .02], [-.077, 1.545, .02]],
  ['angle', [.16, 1.555, .33], [0, 1.555, .025]],
  ['back', [0, 1.55, -.60], [0, 1.55, .02]],
];
let browser;
try {
  // Do not disable browser web security or allow file-to-file fetches.
  const args = chromium.args.filter(arg => !['--disable-web-security', '--allow-running-insecure-content',
    '--allow-file-access-from-files'].includes(arg));
  browser = await puppeteer.launch({ executablePath: process.env.CHROME_BIN || await chromium.executablePath(),
    headless: 'shell', args, defaultViewport: { width: 1000, height: 900, deviceScaleFactor: 1 } });
  let baselineLights;
  for (const [name, zip] of inputs) {
    const html = execFileSync('unzip', ['-p', zip, 'BladesOfWar_Showcase.html'], { maxBuffer: 20_000_000 });
    const file = path.join(temp, `${name}.html`);
    fs.writeFileSync(file, html);
    const page = await browser.newPage();
    page.on('pageerror', error => errors.push(`${name}: ${error}`));
    page.on('console', message => { if (message.type() === 'error') errors.push(`${name}: ${message.text()}`); });
    await page.setRequestInterception(true);
    page.on('request', request => {
      if (/^(file|data|blob):/.test(request.url())) request.continue();
      else { errors.push(`${name}: unexpected network request ${request.url()}`); request.abort(); }
    });
    await page.setOfflineMode(true);
    await page.goto(pathToFileURL(file).href, { waitUntil: 'load', timeout: 120_000 });
    await page.waitForFunction('window.ready === true', { timeout: 120_000 });
    if (name === 'after') {
      assert.deepEqual(await page.evaluate(() => [preview.state.mode, preview.state.view]), ['female', 'face']);
      for (const [view, sign] of [['left-ear', 1], ['right-ear', -1]]) {
        await page.evaluate(view => document.querySelector(`[data-view="${view}"]`).click(), view);
        const info = await page.evaluate(() => [preview.state.view, preview.controls.target.x, preview.camera.position.x]);
        assert.equal(info[0], view); assert.ok(Math.abs(info[1] - sign * .077) < .005);
        assert.ok(sign * info[2] > sign * info[1]);
      }
      await page.evaluate(() => {
        preview.setMode('female'); preview.renderer.setPixelRatio(.35);
        const toggle = document.querySelector('#auto-blink'); if (toggle.checked) toggle.click();
        let weight = preview.state.blinkWeight; window.blinkSamples = [];
        Object.defineProperty(preview.state, 'blinkWeight', { configurable: true, get: () => weight,
          set: value => { weight = value; window.blinkSamples.push(value); } });
      });
      await page.click('#fists');
      await page.waitForFunction('preview.state.fistWeight === 1', { timeout: 20_000 });
      await page.click('#blink-once');
      await page.waitForFunction('window.blinkSamples.some(v => v > .2) && preview.state.blinkWeight === 0', { timeout: 20_000 });
      assert.deepEqual(await page.evaluate(() => [...preview.bodyMesh.morphTargetInfluences]), [1, 0, 0, 0]);
      await page.$eval('#fist-range', el => { el.value = '25'; el.dispatchEvent(new Event('input', { bubbles: true })); });
      await frame(page);
      assert.deepEqual(await page.evaluate(() => [...preview.bodyMesh.morphTargetInfluences]), [.25, 1, 0, 0]);
      await page.$eval('#fist-range', el => { el.value = '0'; el.dispatchEvent(new Event('input', { bubbles: true })); });
      await frame(page);
      assert.deepEqual(await page.evaluate(() => [...preview.bodyMesh.morphTargetInfluences]), [0, 0, 0, 0]);
      await page.evaluate(() => preview.renderer.setPixelRatio(1));
      // Real clip playback in the browser, using a local blob of Three's core.
      // This needs no network and no relaxation of browser security settings.
      const clips = await page.evaluate(async code => {
        const blob = URL.createObjectURL(new Blob([code], { type: 'text/javascript' }));
        try {
          const { AnimationMixer, LoopOnce } = await import(blob);
          preview.state.animateMotion = false; preview.setBlinkWeight(0); preview.setFistWeight(0);
          const mixer = new AnimationMixer(preview.female);
          const get = name => preview.clips.find(clip => clip.name === name);
          const blink = mixer.clipAction(get('Blink_Once')), close = mixer.clipAction(get('Fists_Close'));
          for (const action of [blink, close]) { action.setLoop(LoopOnce, 1); action.clampWhenFinished = true; action.play(); }
          mixer.update(.14);
          const mid = [...preview.bodyMesh.morphTargetInfluences, ...preview.faceMesh.morphTargetInfluences, ...preview.lineMesh.morphTargetInfluences];
          mixer.update(.25);
          const closed = [...preview.bodyMesh.morphTargetInfluences, ...preview.faceMesh.morphTargetInfluences, ...preview.lineMesh.morphTargetInfluences];
          blink.stop(); close.stop();
          const open = mixer.clipAction(get('Fists_Open')); open.setLoop(LoopOnce, 1); open.clampWhenFinished = true; open.play();
          mixer.update(.175); const opening = [...preview.bodyMesh.morphTargetInfluences];
          mixer.update(.2); const opened = [...preview.bodyMesh.morphTargetInfluences];
          mixer.stopAllAction(); preview.setBlinkWeight(0); preview.setFistWeight(0);
          return { mid, closed, opening, opened, names: preview.clips.map(clip => clip.name) };
        } finally { URL.revokeObjectURL(blob); }
      }, core);
      const near = (a, b) => assert.ok(Math.abs(a - b) < 1e-5, `${a} != ${b}`);
      assert.deepEqual(clips.names, ['Blink_Once', 'Fists_Close', 'Fists_Open']);
      assert.ok(clips.mid[0] > .1 && clips.mid[0] < .9);
      clips.mid.slice(4).forEach(value => near(value, 1));
      assert.deepEqual(clips.closed, [1, 0, 0, 0, 0, 0, 0]);
      clips.opening.forEach((value, i) => near(value, [.5, 0, 1, 0][i]));
      assert.deepEqual(clips.opened, [0, 0, 0, 0]);
      console.log('PASS: offline ear buttons, fist toggle/slider, blink and concurrent GLB clips');
    }
    await page.evaluate(() => {
      preview.setMode('female'); preview.state.animateMotion = false; preview.state.animateWell = false;
      preview.state.autoBlink = false; preview.setFistWeight(0); preview.setBlinkWeight(0);
      document.querySelector('header').style.display = 'none'; document.querySelector('aside').style.display = 'none';
      document.querySelector('.hint').style.display = 'none'; document.body.style.height = '100vh';
      document.querySelector('.workspace').style.height = '100vh'; document.querySelector('.stage').style.height = '100vh';
      window.dispatchEvent(new Event('resize')); preview.controls.enableDamping = false;
    });
    const lights = await page.evaluate(() => preview.female.parent.children.filter(o => o.isLight).map(o => ({
      type: o.type, intensity: o.intensity, position: o.position.toArray(), color: o.color.getHex(),
      ground: o.groundColor?.getHex() ?? null, castShadow: o.castShadow,
    })));
    if (name === 'before') baselineLights = lights; else assert.deepEqual(lights, baselineLights, 'Lighting changed');
    for (const [view, position, target] of cameraViews) {
      await page.evaluate(({ position, target }) => {
        preview.controls.target.set(...target); preview.camera.position.set(...position); preview.controls.update();
      }, { position, target });
      await frame(page);
      await page.screenshot({ path: path.join(temp, `${name}-${view}.png`) });
    }
    // Pixel-identical hand render is a useful independent check on the morph.
    await page.evaluate(() => {
      preview.controls.target.set(.215, .765, .05); preview.camera.position.set(.215, .765, -.26);
      preview.controls.update(); preview.setFistWeight(1);
    });
    await frame(page); await page.screenshot({ path: path.join(temp, `${name}-hand.png`) });
    await page.close();
  }
  assert.deepEqual(errors, [], 'Unexpected browser errors or network requests');
  execFileSync(process.env.PYTHON || 'python3', [path.join(root, 'tools/model-a-ear-study/review.py'),
    '--raw', temp, '--output', path.join(result, 'review')], { stdio: 'inherit' });
  console.log('PASS: same-camera, same-light captures from the actual two offline GLBs');
} finally {
  if (browser) await browser.close();
  fs.rmSync(temp, { recursive: true, force: true });
}
