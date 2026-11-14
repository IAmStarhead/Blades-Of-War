// Open both offline showcases, exercise their modes, and optionally capture
// comparable screenshots. Only the temporary copies expose the camera.
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
const positional = process.argv.slice(2).filter(arg => arg !== '--shots');
const sourceZip = positional[0] && path.resolve(positional[0]);
const result = path.resolve(positional[1] || path.join(root, 'work/character-model-search/selected-a'));
const shots = process.argv.includes('--shots');
if (!sourceZip) throw new Error('Usage: node qa-browser.mjs ORIGINAL_ZIP [RESULT_DIR] [--shots]');
const outputZip = path.join(result, 'female_A_with_lashes_showcase.zip');
const temporary = fs.mkdtempSync(path.join(os.tmpdir(), 'bow-model-a-review-'));
const options = { maxBuffer: 100_000_000 };
const needle = 'window.preview={male:xp.scene,malePrevious:Sp.scene,female:Cp.scene,femalePrevious:wp.scene,well:Tp.group},window.ready=!0;';
const hook = 'window.captureReview={camera:yp,controls:bp,render:Mp};';
const targets = [
  ['eyes', [0, 1.564, .36], [0, 1.564, .1], [480, 250, 1120, 440]],
  ['face', [0, 1.56, .75], [0, 1.56, .02], [490, 90, 1110, 740]],
  ['angle', [.32, 1.57, .60], [0, 1.56, .02], [470, 70, 1070, 740]],
  ['figure', [0, .86, 3.8], [0, .86, 0], [550, 25, 1050, 735]],
];
const cases = [['before', sourceZip], ['after', outputZip]];
const browser = await puppeteer.launch({
  executablePath: process.env.CHROME_BIN || await chromium.executablePath(),
  headless: 'shell',
  args: [...chromium.args, '--allow-file-access-from-files'],
  defaultViewport: { width: 1600, height: 1200, deviceScaleFactor: 1 },
});
let failed = false;
try {
  for (const [name, zip] of cases) {
    let html = execFileSync('unzip', ['-p', zip, 'BladesOfWar_Showcase.html'], options).toString('utf8');
    if (html.split(needle).length !== 2) throw new Error('Unexpected source viewer layout');
    html = html.replace(needle, hook + needle);
    const tmpHtml = path.join(temporary, `${name}.html`);
    fs.writeFileSync(tmpHtml, html);
    const page = await browser.newPage();
    const errors = [], network = [];
    page.on('pageerror', error => errors.push(String(error)));
    page.on('request', request => {
      if (!/^(file|data|blob):/.test(request.url())) network.push(request.url());
    });
    await page.goto(pathToFileURL(tmpHtml).href, { waitUntil: 'load', timeout: 120_000 });
    await page.waitForFunction('window.ready === true', { timeout: 120_000 });
    const meshes = await page.evaluate(() => {
      const names = [];
      window.preview.female.traverse(object => { if (object.isMesh) names.push(object.name); });
      return names;
    });
    if (meshes.includes('upper_lashes_cat_eye') !== (name === 'after')) throw new Error(`${name}: wrong lash node`);
    if (!meshes.includes('basemesh_female_body') || !meshes.includes('basemesh_female_eyes')) throw new Error('Original nodes missing');
    const modes = {
      female: [true, false, false, false, false],
      'female-old': [false, false, true, false, false],
      male: [false, true, false, false, false],
      'male-old': [false, false, false, true, false],
      pair: [true, true, false, false, false],
      well: [false, false, false, false, true],
    };
    for (const [mode, expected] of Object.entries(modes)) {
      const actual = await page.evaluate(value => {
        document.querySelector(`[data-mode="${value}"]`).click();
        const p = window.preview;
        return [p.female.visible, p.male.visible, p.femalePrevious.visible, p.malePrevious.visible, p.well.visible];
      }, mode);
      if (JSON.stringify(actual) !== JSON.stringify(expected)) throw new Error(`${name}: unexpected ${mode} visibility: ${actual}`);
      for (const view of ['front', 'three', 'side', 'back', 'head', 'hands', 'full']) {
        await page.evaluate(value => document.querySelector(`[data-view="${value}"]`).click(), view);
      }
    }
    await page.evaluate(() => {
      document.querySelector('[data-mode="male"]').click();
      document.querySelector('[data-hand="fist"]').click();
      document.querySelector('[data-hand="open"]').click();
      document.querySelector('[data-mode="female"]').click();
    });
    if (shots) {
      const directory = path.join(result, 'review');
      fs.mkdirSync(directory, { recursive: true });
      for (const [view, xyz, target, crop] of targets) {
        // Before/after face and eyes share exactly the same camera and lighting.
        if (name === 'before' && !['eyes', 'face'].includes(view)) continue;
        await page.evaluate(({ xyz, target }) => {
          document.querySelector('[data-mode="female"]').click();
          document.querySelector('[data-view="front"]').click();
          const { camera, controls, render } = window.captureReview;
          controls.target.set(...target);
          camera.position.set(...xyz);
          controls.update();
          render();
        }, { xyz, target });
        const canvas = await page.$('canvas');
        const box = await canvas.boundingBox();
        const [left, top, right, bottom] = crop;
        if (right > box.width || bottom > box.height) throw new Error(`Screenshot crop exceeds canvas: ${box.width}x${box.height}`);
        await page.screenshot({
          path: path.join(directory, `${view}-${name}.png`),
          clip: { x: box.x + left, y: box.y + top, width: right - left, height: bottom - top },
        });
      }
    }
    if (errors.length || network.length) {
      failed = true;
      console.error(name, { errors, network });
    } else {
      console.log(`PASS ${name}: offline load, six modes including well, seven views, male-hand controls, expected lash node`);
    }
    await page.close();
  }
} finally {
  await browser.close();
  fs.rmSync(temporary, { recursive: true, force: true });
}
if (failed) process.exitCode = 1;
