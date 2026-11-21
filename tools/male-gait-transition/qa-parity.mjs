// Check the CPU FCL export against the actual bundled Three.js viewer's skin.
import assert from 'node:assert/strict';
import {createRequire} from 'node:module';
import {fileURLToPath, pathToFileURL} from 'node:url';
import fs from 'node:fs';
import path from 'node:path';
const repo = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const samples = JSON.parse(fs.readFileSync(process.argv[2] || '/dev/shm/bow-transition-blends.json', 'utf8'));
const folder = path.resolve(process.argv[3] || path.join(repo, 'work/male-gait-transition'));
const require = createRequire(path.join(repo, 'tools/character-showcase/package.json'));
const puppeteer = require('puppeteer-core'), chromium = require('@sparticuz/chromium').default;
const browser = await puppeteer.launch({executablePath: process.env.CHROME_BIN || await chromium.executablePath(), headless: 'shell',
  args: [...chromium.args, '--allow-file-access-from-files', '--disable-dev-shm-usage'], protocolTimeout: 180000});
try {
  const page = await browser.newPage(), errors = [];
  page.on('pageerror', e => errors.push(e.message)); page.on('console', m => { if (m.type() === 'error') errors.push(m.text()); });
  await page.setOfflineMode(true); await page.goto(pathToFileURL(path.join(folder, 'index.html')).href, {waitUntil: 'load', timeout: 60000});
  await page.waitForFunction('window.transitionDemo?.state.ready === true', {timeout: 60000});
  const chosen = Object.keys(samples.poses).filter((_, i) => i % 8 === 0);
  const subset = samples.sourceVertexIds.map((id, index) => ({id, index})).filter((_, i) => i % 13 === 0);
  const input = chosen.map(name => ({name, ...samples.poses[name]}));
  const actual = await page.evaluate(({input, subset}) => {
    const d = transitionDemo, mesh = d.model.getObjectByName('NewBody'), V = d.camera.position.constructor, point = new V(), out = {};
    d.setManual(true); d.reset('walk', 0);
    for (const {name, phase, weight} of input) {
      d.clock.phase = phase; d.clock.weight = weight; d.locomotion.apply();
      d.model.updateWorldMatrix(true, true); mesh.skeleton.update(); const values = [];
      for (const {id} of subset) {
        mesh.getVertexPosition(id, point); mesh.localToWorld(point);
        values.push(point.x, point.y - d.locomotion.floor.lift, point.z);
      }
      out[name] = values;
    }
    return out;
  }, {input, subset});
  let maximum = 0;
  for (const name of chosen) {
    const buf = Buffer.from(samples.states[name], 'base64'), original = new Float32Array(buf.buffer, buf.byteOffset, buf.byteLength / 4);
    for (let i = 0; i < subset.length; i++) for (let k = 0; k < 3; k++)
      maximum = Math.max(maximum, Math.abs(original[subset[i].index * 3 + k] - actual[name][3 * i + k]));
  }
  assert.ok(maximum < 3e-6, `CPU/Three skinned vertex difference ${maximum} m`); assert.deepEqual(errors, []);
  console.log(`PASS CPU/actual Three skin parity: ${chosen.length} mixed poses × ${subset.length} sampled vertices; maximum coordinate difference ${(maximum * 1000).toFixed(5)} mm (guard lift subtracted).`);
} finally { await browser.close(); }
