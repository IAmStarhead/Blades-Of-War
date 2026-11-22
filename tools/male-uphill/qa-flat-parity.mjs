// Verify the actual new viewer reproduces the previously delivered phase
// controller when the surface is flat, including intermediate blend weights.
import assert from 'node:assert/strict';
import path from 'node:path';
import {createRequire} from 'node:module';
import {fileURLToPath, pathToFileURL} from 'node:url';
const repo = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const folder = path.resolve(process.argv[2] || path.join(repo, 'work/male-uphill'));
const require = createRequire(path.join(repo, 'tools/character-showcase/package.json'));
const puppeteer = require('puppeteer-core'), chromium = require('@sparticuz/chromium').default;
const browser = await puppeteer.launch({executablePath: process.env.CHROME_BIN || await chromium.executablePath(), headless: 'shell',
  args: [...chromium.args, '--allow-file-access-from-files', '--disable-dev-shm-usage'], protocolTimeout: 300000});
try {
  const pages = [await browser.newPage(), await browser.newPage()], errors = [];
  for (const page of pages) {
    page.on('pageerror', e => errors.push(e.message)); page.on('console', m => { if (m.type() === 'error') errors.push(m.text()); });
    await page.setOfflineMode(true);
  }
  await pages[0].goto(pathToFileURL(path.join(repo, 'work/male-gait-transition/index.html')).href, {waitUntil: 'load', timeout: 60000});
  await pages[1].goto(pathToFileURL(path.join(folder, 'index.html')).href, {waitUntil: 'load', timeout: 60000});
  await pages[0].waitForFunction('window.transitionDemo?.state.ready === true', {timeout: 60000});
  await pages[1].waitForFunction('window.uphillDemo?.state.ready === true', {timeout: 60000});
  const before = await pages[0].evaluate(() => {
    const d = transitionDemo; d.setManual(true); d.reset('walk', 0);
    const result = [];
    for (const weight of [0, .25, .5, .75, 1]) for (let i = 0; i < 64; i++) {
      d.clock.phase = (i + .37) / 64; d.clock.weight = weight; d.locomotion.apply();
      const bones = []; d.rig.traverse(b => { if (b.isBone) bones.push({name: b.name, p: b.position.toArray(), q: b.quaternion.toArray(), s: b.scale.toArray()}); });
      result.push({bones, lift: d.locomotion.floor.lift});
    }
    return result;
  });
  const after = await pages[1].evaluate(() => {
    const d = uphillDemo; d.setManual(true); d.terrain.setAngle(0);
    const result = [];
    for (const weight of [0, .25, .5, .75, 1]) for (let i = 0; i < 64; i++) {
      d.controller.reset('walk', (i + .37) / 64, -2.7); d.clock.weight = weight; d.controller.step(0);
      const bones = []; d.rig.traverse(b => { if (b.isBone) bones.push({name: b.name, p: b.position.toArray(), q: b.quaternion.toArray(), s: b.scale.toArray()}); });
      result.push({bones, lift: d.controller.stats.lift});
    }
    return result;
  });
  const dist = (a, b, sign = 1) => Math.hypot(...a.map((v, i) => v - sign * b[i]));
  let position = 0, quaternion = 0, scale = 0, lift = 0;
  assert.equal(before.length, after.length);
  for (let i = 0; i < before.length; i++) {
    lift = Math.max(lift, Math.abs(before[i].lift - after[i].lift)); assert.equal(before[i].bones.length, after[i].bones.length);
    for (let j = 0; j < before[i].bones.length; j++) {
      const a = before[i].bones[j], b = after[i].bones[j]; assert.equal(a.name, b.name);
      position = Math.max(position, dist(a.p, b.p)); scale = Math.max(scale, dist(a.s, b.s));
      quaternion = Math.max(quaternion, Math.min(dist(a.q, b.q), dist(a.q, b.q, -1)));
    }
  }
  assert.ok(position < 1e-6 && quaternion < 1e-6 && scale < 1e-6 && lift < 1e-6, JSON.stringify({position, quaternion, scale, lift}));
  assert.deepEqual(errors, [], errors.join('\n'));
  console.log(`PASS ${before.length} flat mixed poses match the previously approved viewer: max local position ${position.toExponential(2)} m, quaternion ${quaternion.toExponential(2)}, lift difference ${lift.toExponential(2)} m.`);
} finally { await browser.close(); }
