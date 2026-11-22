// Verify the added GLB weight tracks actually play in Three.js without the
// post-IK corrector. This covers the two individual clips, not mixed poses.
import assert from 'node:assert/strict';
import path from 'node:path';
import {createRequire} from 'node:module';
import {fileURLToPath, pathToFileURL} from 'node:url';
const repo = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const folder = path.resolve(process.argv[2] || path.join(repo, 'work/male-leg-volume'));
const require = createRequire(path.join(repo, 'tools/character-showcase/package.json'));
const puppeteer = require('puppeteer-core'), chromium = require('@sparticuz/chromium').default;
const browser = await puppeteer.launch({executablePath: process.env.CHROME_BIN || await chromium.executablePath(), headless: 'shell',
  args: [...chromium.args, '--allow-file-access-from-files', '--disable-dev-shm-usage'], protocolTimeout: 300000});
try {
  const page = await browser.newPage(), errors = [];
  page.on('pageerror', e => errors.push(e.message)); page.on('console', m => { if (m.type() === 'error') errors.push(m.text()); });
  await page.setOfflineMode(true); await page.goto(pathToFileURL(path.join(folder, 'index.html')).href, {waitUntil: 'load', timeout: 60000});
  await page.waitForFunction('window.uphillDemo?.state.ready === true', {timeout: 60000});
  const result = await page.evaluate(() => {
    const d = uphillDemo; d.setManual(true);
    const mix = d.controller.mixed, mesh = d.model.getObjectByName('NewBody'), out = {};
    function expected(q) {
      const sign = q.w < 0 || (q.w === 0 && q.x < 0) ? -1 : 1;
      const angle = 2 * Math.atan2(Math.max(0, q.x * sign), Math.abs(q.w)), low = 110 * Math.PI / 180, high = 130 * Math.PI / 180;
      let x = angle; if (angle >= high) x = (low + high) / 2;
      else if (angle > low) { const u = (angle - low) / (high - low); x = low + (high - low) * (u - u ** 3 + .5 * u ** 4); }
      return .85 * (1 / Math.cos(x / 2) - 1);
    }
    for (const mode of ['walk', 'run']) {
      let maxError = 0, maxWeight = 0, count = 0;
      for (let k = 0; k < 1024; k++) {
        // Bypass the UphillController wrapper entirely; only GLB animation
        // mixer keys drive the morphs here.
        mix.reset(mode, (k + .31) / 1024);
        for (const side of ['L', 'R']) {
          const actual = mesh.morphTargetInfluences[mesh.morphTargetDictionary['KneeVolume_' + side]];
          const desired = expected(d.model.getObjectByName('Rig_Shin_' + side).quaternion);
          maxError = Math.max(maxError, Math.abs(actual - desired)); maxWeight = Math.max(maxWeight, actual); count++;
        }
      }
      out[mode] = {count, maxError, maxWeight};
    }
    return out;
  });
  assert.deepEqual(errors, [], errors.join('\n'));
  for (const [name, v] of Object.entries(result)) {
    assert.equal(v.count, 2048); assert.ok(v.maxError < .002 && v.maxWeight > .1, JSON.stringify({name, ...v}));
    console.log(`PASS pure ${name} glTF clip: ${v.count} knee weights through Three.js mixer, maximum deviation from pose driver ${v.maxError.toFixed(6)}.`);
  }
  console.log('NOTE: mixed clips or runtime IK require the post-pose driver; no claim for other renderers or arbitrary actions.');
} finally { await browser.close(); }
