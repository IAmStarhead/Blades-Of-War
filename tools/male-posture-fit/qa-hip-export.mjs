// Sample only the central hip surface from the published offline viewer.
// Output is temporary scratch data for qa-hip.py, not a deliverable.
import {createRequire} from 'node:module';
import {fileURLToPath, pathToFileURL} from 'node:url';
import fs from 'node:fs';
import path from 'node:path';
const repo = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const out = path.resolve(process.argv[2] || path.join(repo, 'work/male-posture-fit'));
const dest = path.resolve(process.argv[3] || '/tmp/bow-posture-hip-samples.json');
const count = Number(process.argv[4] || 128);
if (!Number.isInteger(count) || count < 4 || count > 512) throw Error('Invalid sample count');
const require = createRequire(path.join(repo, 'tools/character-showcase/package.json'));
const puppeteer = require('puppeteer-core'), chromium = require('@sparticuz/chromium').default, errors = [];
const browser = await puppeteer.launch({executablePath: process.env.CHROME_BIN || await chromium.executablePath(), headless: 'shell',
  args: [...chromium.args, '--allow-file-access-from-files', '--disable-dev-shm-usage'], protocolTimeout: 180000});
try {
  const page = await browser.newPage();
  page.on('pageerror', e => errors.push(e.message)); page.on('console', m => { if (m.type() === 'error') errors.push(m.text()); });
  await page.setRequestInterception(true);
  page.on('request', r => /^(file|data|blob):/i.test(r.url()) ? r.continue() : (errors.push('external request: ' + r.url()), r.abort()));
  await page.setOfflineMode(true); await page.goto(pathToFileURL(path.join(out, 'index.html')).href, {timeout: 60000});
  await page.waitForFunction('window.motionFit?.state.ready === true', {timeout: 60000});
  const data = await page.evaluate(n => {
    const d = window.motionFit; d.setVersion('selected'); d.setMotion('stand');
    const mesh = d.model.getObjectByName('NewBody'), geometry = mesh.geometry, position = geometry.attributes.position, index = geometry.index, positions = [];
    for (let i = 0; i < position.count; i++) positions.push([position.getX(i), position.getY(i), position.getZ(i)]);
    let faces = [];
    for (let i = 0; i < index.count; i += 3) {
      const ids = [index.getX(i), index.getX(i + 1), index.getX(i + 2)];
      if (ids.some(id => Math.abs(positions[id][0]) < .29 && positions[id][1] > .72 && positions[id][1] < 1.11)) faces.push(...ids);
    }
    const selected = [...new Set(faces)].sort((a, b) => a - b), remap = new Map(selected.map((id, i) => [id, i]));
    faces = faces.map(id => remap.get(id));
    const states = {}, v = mesh.position.clone();
    for (const mode of ['walk', 'run']) {
      d.setMotion(mode);
      for (let i = 0; i < n; i++) {
        d.setPhase((i + .37) / n); d.scene.updateMatrixWorld(true); mesh.skeleton.update();
        const arr = new Float32Array(selected.length * 3);
        selected.forEach((id, k) => { mesh.getVertexPosition(id, v); arr.set([v.x, v.y, v.z], k * 3); });
        const bytes = new Uint8Array(arr.buffer); let raw = '';
        for (let k = 0; k < bytes.length; k += 8192) raw += String.fromCharCode(...bytes.subarray(k, k + 8192));
        states[`${mode}-${i}`] = btoa(raw);
      }
    }
    return {count: n, base: selected.flatMap(i => positions[i]), faces, states};
  }, count);
  if (errors.length) throw Error(errors.join('; '));
  fs.writeFileSync(dest, JSON.stringify(data));
  console.log(`Exported ${count} phases per gait, ${data.base.length / 3} selected vertices and ${data.faces.length / 3} hip-region triangles`);
} finally { await browser.close(); }
