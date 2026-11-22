// Export selected, actually skinned triangles from the delivered viewer for
// the existing FCL regional checks. This file is large; use scratch storage.
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import {createRequire} from 'node:module';
import {fileURLToPath, pathToFileURL} from 'node:url';
const repo = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const dest = path.resolve(process.argv[2] || '/dev/shm/bow-uphill-poses.json');
const folder = path.resolve(process.argv[3] || path.join(repo, 'work/male-uphill'));
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
  const samples = await page.evaluate(() => {
    const d = uphillDemo; d.setManual(true);
    const mesh = d.model.getObjectByName('NewBody'), p = mesh.geometry.getAttribute('position'), index = mesh.geometry.index;
    const predicates = {
      kneeL: ([x, y]) => x > .03 && x < .25 && y > .39 && y < .69, kneeR: ([x, y]) => x < -.03 && x > -.25 && y > .39 && y < .69,
      elbowL: ([x, y]) => x > .17 && x < .37 && y > 1.07 && y < 1.3, elbowR: ([x, y]) => x < -.17 && x > -.37 && y > 1.07 && y < 1.3,
      shoulderL: ([x, y]) => x > .08 && x < .38 && y > 1.25 && y < 1.51, shoulderR: ([x, y]) => x < -.08 && x > -.38 && y > 1.25 && y < 1.51,
      hip: ([x, y]) => Math.abs(x) < .29 && y > .72 && y < 1.11,
      handL: ([x, y]) => x > .24 && y < 1.04 && y > .74, handR: ([x, y]) => x < -.24 && y < 1.04 && y > .74,
      torso: ([x, y]) => Math.abs(x) < .23 && y > .8 && y < 1.48,
      footL: ([x, y]) => x > .035 && x < .25 && y < .2, footR: ([x, y]) => x < -.035 && x > -.25 && y < .2,
      neck: ([x, y]) => Math.abs(x) < .12 && y > 1.495 && y < 1.56,
    };
    const P = Array.from({length: p.count}, (_, i) => [p.getX(i), p.getY(i), p.getZ(i)]);
    const groups = Object.fromEntries(Object.keys(predicates).map(k => [k, []]));
    for (let i = 0; i < index.count; i += 3) {
      const tri = [index.getX(i), index.getX(i + 1), index.getX(i + 2)];
      for (const [key, test] of Object.entries(predicates)) if (tri.some(id => test(P[id]))) groups[key].push(...tri);
    }
    const selected = [...new Set(Object.values(groups).flat())].sort((a, b) => a - b), remap = new Map(selected.map((id, i) => [id, i]));
    for (const key of Object.keys(groups)) groups[key] = groups[key].map(id => remap.get(id));
    const base = selected.flatMap(i => P[i]), states = {}, poses = {}, V = d.camera.position.constructor, point = new V();
    let count = 0;
    function add(grade, z, weight, phase) {
      d.terrain.setAngle(grade); d.controller.reset('walk', phase, z); d.clock.weight = weight; d.controller.step(0);
      d.model.updateWorldMatrix(true, true); mesh.updateMatrixWorld(true); mesh.skeleton.update();
      const values = new Float32Array(selected.length * 3);
      for (let j = 0; j < selected.length; j++) {
        mesh.getVertexPosition(selected[j], point); mesh.localToWorld(point);
        // Remove the common actor translation before encoding float32. This
        // preserves pairwise intersections but avoids precision noise at z≈5 m.
        point.sub(d.actor.position); values.set([point.x, point.y, point.z], j * 3);
      }
      const bytes = new Uint8Array(values.buffer); let binary = '';
      for (let j = 0; j < bytes.length; j += 0x8000) binary += String.fromCharCode(...bytes.subarray(j, j + 0x8000));
      const name = `uphill-${count++}`; states[name] = btoa(binary); poses[name] = {grade, z, weight, phase};
    }
    for (const grade of [15, 20]) for (const weight of [0, .5, 1]) for (let f = 0; f < 16; f++)
      add(grade, 1.4, weight, (f + .37) / 16);
    for (const z of [-1.1, 5.4]) for (const weight of [0, .5, 1]) for (let f = 0; f < 8; f++)
      add(20, z, weight, (f + .37) / 8);
    return {count, base, groups, sourceVertexIds: selected, poses, states};
  });
  assert.deepEqual(errors, [], errors.join('\n')); assert.equal(samples.count, 144); assert.ok(samples.sourceVertexIds.length > 13000);
  fs.writeFileSync(dest, JSON.stringify(samples));
  console.log(`Exported ${samples.count} adapted poses, ${samples.sourceVertexIds.length} selected vertices to ${dest} (${fs.statSync(dest).size} bytes).`);
} finally { await browser.close(); }
