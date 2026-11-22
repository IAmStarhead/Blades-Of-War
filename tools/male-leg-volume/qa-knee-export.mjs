// Export paired before/after knee subsets for dense sampled FCL comparison.
// Large scratch output belongs outside the repository, e.g. /dev/shm.
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import {createRequire} from 'node:module';
import {fileURLToPath, pathToFileURL} from 'node:url';
const repo = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const dest = path.resolve(process.argv[2] || '/dev/shm/bow-leg-volume-knee-poses.json');
const folder = path.resolve(process.argv[3] || path.join(repo, 'work/male-leg-volume'));
if (dest === repo || dest.startsWith(repo + path.sep)) throw Error('Write the large scratch export outside the repository');
const require = createRequire(path.join(repo, 'tools/character-showcase/package.json'));
const puppeteer = require('puppeteer-core'), chromium = require('@sparticuz/chromium').default;
const browser = await puppeteer.launch({executablePath: process.env.CHROME_BIN || await chromium.executablePath(), headless: 'shell',
  args: [...chromium.args, '--allow-file-access-from-files', '--disable-dev-shm-usage'], protocolTimeout: 300000});
try {
  const page = await browser.newPage(), errors = [];
  page.on('pageerror', e => errors.push(e.message)); page.on('console', m => { if (m.type() === 'error') errors.push(m.text()); });
  await page.setOfflineMode(true); await page.goto(pathToFileURL(path.join(folder, 'index.html')).href, {waitUntil: 'load', timeout: 60000});
  await page.waitForFunction('window.uphillDemo?.state.ready === true', {timeout: 60000});
  const out = await page.evaluate(() => {
    const d = uphillDemo; d.setManual(true);
    const c = d.controller, mesh = d.model.getObjectByName('NewBody'), p = mesh.geometry.getAttribute('position'), idx = mesh.geometry.index;
    const basePositions = Array.from({length: p.count}, (_, i) => [p.getX(i), p.getY(i), p.getZ(i)]);
    const groups = {kneeL: [], kneeR: []};
    for (let k = 0; k < idx.count; k += 3) {
      const tri = [idx.getX(k), idx.getX(k + 1), idx.getX(k + 2)];
      for (const [key, sign] of [['kneeL', 1], ['kneeR', -1]])
        if (tri.some(i => basePositions[i][0] * sign > .015 && basePositions[i][0] * sign < .25 && basePositions[i][1] > .29 && basePositions[i][1] < .76)) groups[key].push(...tri);
    }
    const selected = [...new Set(Object.values(groups).flat())].sort((a, b) => a - b), remap = new Map(selected.map((id, i) => [id, i]));
    for (const key of Object.keys(groups)) groups[key] = groups[key].map(i => remap.get(i));
    const base = selected.flatMap(i => basePositions[i]), states = [], V = d.camera.position.constructor, point = new V();
    function sample() {
      d.model.updateWorldMatrix(true, true); mesh.updateMatrixWorld(true); mesh.skeleton.update();
      const values = new Float32Array(selected.length * 3);
      for (let j = 0; j < selected.length; j++) {
        mesh.getVertexPosition(selected[j], point); mesh.localToWorld(point); point.sub(d.actor.position);
        values.set([point.x, point.y, point.z], j * 3);
      }
      const bytes = new Uint8Array(values.buffer); let binary = '';
      for (let j = 0; j < bytes.length; j += 0x8000) binary += String.fromCharCode(...bytes.subarray(j, j + 0x8000));
      return btoa(binary);
    }
    function pair(metadata) {
      c.setVolumeEnabled(false); const before = sample(); c.setVolumeEnabled(true); const after = sample();
      states.push({metadata, before, after});
    }
    for (const grade of [0, 15, 20]) for (const blend of [0, .5, 1]) for (let i = 0; i < 64; i++) {
      const phase = (i + .37) / 64; d.terrain.setAngle(grade); c.reset('walk', phase, 1.4); c.clock.weight = blend; c.step(0);
      pair({grade, blend, phase, ik: c.stats.active});
    }
    d.examplePose(); pair({example: true, grade: 15, phase: d.clock.phase, ik: c.stats.active});
    return {count: states.length, base, groups, sourceVertexIds: selected, states};
  });
  assert.deepEqual(errors, [], errors.join('\n')); assert.equal(out.count, 577); assert.ok(out.sourceVertexIds.length > 300);
  fs.writeFileSync(dest, JSON.stringify(out));
  console.log(`Exported ${out.count} paired poses, ${out.sourceVertexIds.length} selected knee vertices to ${dest} (${fs.statSync(dest).size} bytes).`);
} finally { await browser.close(); }
