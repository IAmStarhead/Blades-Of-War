// Capture the previous and trial models with identical WebGL cameras and light.
// Only the explicitly labelled palm views isolate a hand for examination.
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
const result = path.resolve(process.argv[2] || path.join(root, 'work/character-model-search/selected-a/fist-refinement-trial'));
const output = path.join(result, 'review');
const temp = fs.mkdtempSync(path.join(os.tmpdir(), 'bow-a-fist-review-'));
const unzip = file => execFileSync('unzip', ['-p', file, 'BladesOfWar_Showcase.html'], { maxBuffer: 20_000_000 });
const models = [
  ['before', path.join(root, 'work/character-model-search/selected-a/hand-ear-study/female_A_hands_ears_and_well.zip')],
  ['after', path.join(result, 'female_A_fist_trial_and_well.zip')],
];
const handIndices = JSON.parse(execFileSync(process.env.PYTHON || 'python3',
  [path.join(root, 'tools/model-a-hand-ear/review-indices.py')], { maxBuffer: 2_000_000 }).toString());
const browser = await puppeteer.launch({
  executablePath: process.env.CHROME_BIN || await chromium.executablePath(),
  headless: 'shell', args: [...chromium.args, '--allow-file-access-from-files'],
  defaultViewport: { width: 700, height: 700, deviceScaleFactor: 1 },
});
const failures = [];
const frame = page => page.evaluate(() => new Promise(resolve => requestAnimationFrame(() => requestAnimationFrame(resolve))));
try {
  for (const [name, zip] of models) {
    const file = path.join(temp, `${name}.html`);
    fs.writeFileSync(file, unzip(zip));
    const page = await browser.newPage();
    page.on('pageerror', error => failures.push(`${name}: ${error}`));
    page.on('console', message => { if (message.type() === 'error') failures.push(`${name}: ${message.text()}`); });
    await page.setRequestInterception(true);
    page.on('request', request => /^(file|data|blob):/.test(request.url()) ? request.continue() : request.abort());
    await page.setOfflineMode(true);
    await page.goto(pathToFileURL(file).href, { waitUntil: 'load', timeout: 120_000 });
    await page.waitForFunction('window.ready === true', { timeout: 120_000 });
    await page.evaluate(() => {
      document.querySelector('header').style.display = 'none';
      document.querySelector('aside').style.display = 'none';
      document.querySelector('.hint').style.display = 'none';
      document.body.style.height = '100vh';
      document.querySelector('.workspace').style.height = '100vh';
      document.querySelector('.stage').style.height = '100vh';
      window.dispatchEvent(new Event('resize'));
      preview.setMode('female'); preview.controls.enableDamping = false;
      preview.state.animateMotion = false; preview.setBlinkWeight(0); preview.setFistWeight(1);
    });
    for (const [side, sign] of [['left', 1], ['right', -1]]) {
      await page.evaluate(sign => {
        preview.controls.target.set(sign * .215, .765, .05);
        preview.camera.position.set(sign * .215, .765, -.26);
        preview.controls.update();
      }, sign);
      for (const [pose, weight] of [['open', 0], ['75', .75], ['fist', 1]]) {
        await page.evaluate(weight => preview.setFistWeight(weight), weight); await frame(page);
        await page.screenshot({ path: path.join(temp, `${name}-${side}-side-${pose}.png`) });
      }
    }
    // Save the hand-only indices just for these comparison captures; the GLB
    // itself and all non-isolated captures remain the full model.
    await page.evaluate(() => {
      window.reviewOriginalGeometry = preview.bodyMesh.geometry;
      preview.faceMesh.visible = false; preview.lineMesh.visible = false;
      preview.female.getObjectByName('basemesh_female_eyes').visible = false;
    });
    for (const [side, sign, key] of [['left', 1, 'L'], ['right', -1, 'R']]) {
      await page.evaluate(indices => {
        preview.bodyMesh.geometry = window.reviewOriginalGeometry.clone();
        preview.bodyMesh.geometry.setIndex(indices);
      }, handIndices[key]);
      await page.evaluate(sign => {
        preview.controls.target.set(sign * .21, .765, .05);
        preview.camera.position.set(sign * -.06, .75, -.18);
        preview.controls.update();
      }, sign);
      const stages = name === 'after' ? [0, .25, .5, .75, 1] : [1];
      for (const weight of stages) {
        await page.evaluate(weight => preview.setFistWeight(weight), weight); await frame(page);
        await page.screenshot({ path: path.join(temp, `${name}-${side}-palm-${Math.round(weight * 100)}.png`) });
      }
      await page.evaluate(() => { preview.bodyMesh.geometry.dispose(); preview.bodyMesh.geometry = window.reviewOriginalGeometry; });
    }
    await page.close();
  }
  if (failures.length) throw new Error(failures.join('\n'));
  execFileSync(process.env.PYTHON || 'python3', [path.join(root, 'tools/model-a-fist-trial/review.py'),
    '--raw', temp, '--output', output], { stdio: 'inherit' });
} finally {
  await browser.close();
  fs.rmSync(temp, { recursive: true, force: true });
}
