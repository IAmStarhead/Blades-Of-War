// Fixed-camera browser captures of the preceding fist trial and brow trial.
// The comparisons are made from actual offline renders, not retouched images.
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
const result = path.resolve(process.argv[2] || path.join(root, 'work/character-model-search/selected-a/brow-study'));
const inputs = [
  ['before', path.join(root, 'work/character-model-search/selected-a/fist-refinement-trial/female_A_fist_trial_and_well.zip')],
  ['after', path.join(result, 'female_A_brows_lower_and_well.zip')],
];
const temp = fs.mkdtempSync(path.join(os.tmpdir(), 'bow-brow-review-'));
const errors = [];
const frame = page => page.evaluate(() => new Promise(resolve => requestAnimationFrame(() => requestAnimationFrame(resolve))));
let browser;
try {
  const args = chromium.args.filter(arg => !['--disable-web-security', '--allow-running-insecure-content',
    '--allow-file-access-from-files'].includes(arg));
  browser = await puppeteer.launch({ executablePath: process.env.CHROME_BIN || await chromium.executablePath(),
    headless: 'shell', args, defaultViewport: { width: 1000, height: 900, deviceScaleFactor: 1 } });
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
      await page.evaluate(() => {
        preview.setMode('female');
        // Keep the short 0.31 s blink observable on software WebGL; restore
        // full resolution before taking any comparison screenshots.
        preview.renderer.setPixelRatio(.35);
        const toggle = document.querySelector('#auto-blink');
        if (toggle.checked) toggle.click();
        let blink = preview.state.blinkWeight;
        window.blinkSamples = [];
        Object.defineProperty(preview.state, 'blinkWeight', { configurable: true, get: () => blink,
          set: value => { blink = value; window.blinkSamples.push(value); } });
      });
      await page.click('#fists');
      await page.waitForFunction('preview.state.fistWeight === 1', { timeout: 20_000 });
      await frame(page);
      await page.click('#blink-once');
      try {
        await page.waitForFunction('window.blinkSamples.some(v => v > .2) && preview.state.blinkWeight === 0',
          { timeout: 20_000 });
      } catch (error) {
        console.error('Blink sample range:', await page.evaluate(() => [Math.min(...window.blinkSamples), Math.max(...window.blinkSamples)]));
        throw error;
      }
      assert.deepEqual(await page.evaluate(() => [...preview.bodyMesh.morphTargetInfluences]), [1, 0, 0, 0]);
      await page.$eval('#fist-range', el => { el.value = '25'; el.dispatchEvent(new Event('input', { bubbles: true })); });
      await frame(page);
      assert.deepEqual(await page.evaluate(() => [...preview.bodyMesh.morphTargetInfluences]), [.25, 1, 0, 0]);
      await page.$eval('#fist-range', el => { el.value = '0'; el.dispatchEvent(new Event('input', { bubbles: true })); });
      await frame(page);
      assert.deepEqual(await page.evaluate(() => [...preview.bodyMesh.morphTargetInfluences]), [0, 0, 0, 0]);
      await page.evaluate(() => preview.renderer.setPixelRatio(1));
      console.log('PASS: fists checkbox, 25% slider, neutral reset and independent blink button');
    }
    const check = await page.evaluate(() => {
      preview.setMode('female');
      preview.state.animateMotion = false; preview.state.animateWell = false;
      preview.setFistWeight(.75); preview.setBlinkWeight(.5);
      return { body: [...preview.bodyMesh.morphTargetInfluences], face: [...preview.faceMesh.morphTargetInfluences],
        line: [...preview.lineMesh.morphTargetInfluences], clips: preview.clips.map(clip => clip.name) };
    });
    assert.deepEqual(check, { body: [.75, 0, 0, 1], face: [.5], line: [.5, 1],
      clips: ['Blink_Once', 'Fists_Close', 'Fists_Open'] });
    await page.evaluate(() => {
      document.querySelector('header').style.display = 'none';
      document.querySelector('aside').style.display = 'none';
      document.querySelector('.hint').style.display = 'none';
      document.body.style.height = '100vh';
      document.querySelector('.workspace').style.height = '100vh';
      document.querySelector('.stage').style.height = '100vh';
      window.dispatchEvent(new Event('resize'));
      preview.controls.enableDamping = false;
      preview.setFistWeight(0); preview.setBlinkWeight(0);
    });
    for (const [view, position, target] of [
      ['front', [0, 1.56, .60], [0, 1.56, .02]],
      ['angle', [.25, 1.58, .54], [0, 1.56, .02]],
    ]) {
      await page.evaluate(({ position, target }) => {
        preview.controls.target.set(...target); preview.camera.position.set(...position); preview.controls.update();
      }, { position, target });
      await frame(page);
      await page.screenshot({ path: path.join(temp, `${name}-${view}.png`) });
    }
    // The brows are off-screen here: unchanged hand/leg pixels verify the
    // latest grip is shown identically, not replaced by an earlier version.
    await page.evaluate(() => {
      preview.controls.target.set(.215, .765, .05); preview.camera.position.set(.215, .765, -.26);
      preview.controls.update(); preview.setFistWeight(1);
    });
    await frame(page);
    await page.screenshot({ path: path.join(temp, `${name}-hand.png`) });
    await page.close();
  }
  assert.deepEqual(errors, [], 'Unexpected requests or browser errors');
  execFileSync(process.env.PYTHON || 'python3', [path.join(root, 'tools/model-a-brow-study/review.py'),
    '--raw', temp, '--output', path.join(result, 'review')], { stdio: 'inherit' });
  console.log('PASS: both offline viewers load with normal browser security; independent blink and intermediate fist weights remain correct');
} finally {
  if (browser) await browser.close();
  fs.rmSync(temp, { recursive: true, force: true });
}
