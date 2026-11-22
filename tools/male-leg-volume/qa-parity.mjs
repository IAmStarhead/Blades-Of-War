// Compare the actual previous uphill viewer against this trial, not just the
// authored GLB. Verify adapted bones/clock/terrain, selected soles while the
// correction is on, and selected body points with the correction switched off.
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
  const pages = [await browser.newPage(), await browser.newPage()], errors = [];
  for (const page of pages) {
    page.on('pageerror', e => errors.push(e.message)); page.on('console', m => { if (m.type() === 'error') errors.push(m.text()); });
    await page.setOfflineMode(true);
  }
  await pages[0].goto(pathToFileURL(path.join(repo, 'work/male-uphill/index.html')).href, {waitUntil: 'load', timeout: 60000});
  await pages[1].goto(pathToFileURL(path.join(folder, 'index.html')).href, {waitUntil: 'load', timeout: 60000});
  for (const page of pages) await page.waitForFunction('window.uphillDemo?.state.ready === true', {timeout: 60000});
  async function sample(page) {
    return page.evaluate(() => {
      const d = uphillDemo; d.setManual(true);
      const c = d.controller, mesh = d.model.getObjectByName('NewBody'), p = mesh.geometry.getAttribute('position'), V = d.camera.position.constructor;
      const body = [], sole = []; for (let i = 0; i < p.count; i++) {
        if (i % 37 === 0) body.push(i);
        if (p.getY(i) < .16 && Math.abs(p.getX(i)) > .035 && Math.abs(p.getX(i)) < .25 && i % 31 === 0) sole.push(i);
      }
      const v = new V(), values = ids => ids.flatMap(i => mesh.localToWorld(mesh.getVertexPosition(i, v)).sub(d.actor.position).toArray());
      function snapshot(includeVertices) {
        d.model.updateWorldMatrix(true, true); mesh.updateMatrixWorld(true); mesh.skeleton.update();
        const bones = []; d.rig.traverse(b => { if (b.isBone) bones.push({name: b.name, p: b.position.toArray(), q: b.quaternion.toArray(), s: b.scale.toArray()}); });
        if (c.setVolumeEnabled) c.setVolumeEnabled(true);
        const feet = includeVertices ? values(sole) : [];
        if (c.setVolumeEnabled) c.setVolumeEnabled(false);
        const bodyPoints = includeVertices ? values(body) : [];
        if (c.setVolumeEnabled) c.setVolumeEnabled(true);
        return {bones, actor: d.actor.position.toArray(), phase: c.clock.phase, weight: c.clock.weight, velocity: c.clock.velocity,
          distance: c.clock.distance, stats: [c.stats.rawGap, c.stats.fittedGap, c.stats.correctedGap, c.stats.pelvisDrop,
            c.stats.lift, c.stats.maxMiss, c.stats.maxError, c.stats.maxReachShift], active: c.stats.active, feet, bodyPoints};
      }
      const staticPoses = [], transitions = [];
      for (const grade of [0, 15, 20]) for (const z of [-1.1, 1.4, 5.4]) for (const weight of [0, .5, 1]) for (let i = 0; i < 24; i++) {
        d.terrain.setAngle(grade); c.reset('walk', (i + .37) / 24, z); c.clock.weight = weight; c.step(0); staticPoses.push(snapshot(true));
      }
      for (const grade of [0, 20]) for (const mode of ['walk', 'run']) for (const phase of [.1, .6]) {
        d.terrain.setAngle(grade); c.reset(mode, phase, -1.1); const other = mode === 'walk' ? 'run' : 'walk'; c.setTarget(other);
        for (let i = 0; i < 70; i++) {
          if (i === 12) c.setTarget(mode); if (i === 24) c.setTarget(other);
          c.step(.01); transitions.push(snapshot(i % 10 === 0));
        }
      }
      return {bodyCount: body.length, soleCount: sole.length, staticPoses, transitions};
    });
  }
  const [before, after] = [await sample(pages[0]), await sample(pages[1])]; assert.deepEqual(errors, [], errors.join('\n'));
  assert.equal(before.bodyCount, after.bodyCount); assert.equal(before.soleCount, after.soleCount);
  assert.equal(before.staticPoses.length, 648); assert.equal(before.transitions.length, 560);
  const out = {position: 0, quaternion: 0, scale: 0, actor: 0, clock: 0, stats: 0, body: 0, sole: 0};
  const diff = (a, b) => { assert.equal(a.length, b.length); return Math.max(0, ...a.map((v, i) => Math.abs(v - b[i]))); };
  for (const group of ['staticPoses', 'transitions']) for (let k = 0; k < before[group].length; k++) {
    const a = before[group][k], b = after[group][k]; assert.equal(a.active, b.active); assert.equal(a.bones.length, b.bones.length);
    out.actor = Math.max(out.actor, diff(a.actor, b.actor)); out.stats = Math.max(out.stats, diff(a.stats, b.stats));
    for (const key of ['phase', 'weight', 'velocity', 'distance']) out.clock = Math.max(out.clock, Math.abs(a[key] - b[key]));
    out.body = Math.max(out.body, diff(a.bodyPoints, b.bodyPoints)); out.sole = Math.max(out.sole, diff(a.feet, b.feet));
    for (let i = 0; i < a.bones.length; i++) {
      const x = a.bones[i], y = b.bones[i]; assert.equal(x.name, y.name);
      out.position = Math.max(out.position, diff(x.p, y.p)); out.scale = Math.max(out.scale, diff(x.s, y.s));
      const same = diff(x.q, y.q), flipped = diff(x.q, y.q.map(v => -v)); out.quaternion = Math.max(out.quaternion, Math.min(same, flipped));
    }
  }
  assert.ok(Object.values(out).every(x => x < 1e-6), JSON.stringify(out));
  console.log(`PASS ${before.staticPoses.length} flat/slope/blended poses and ${before.transitions.length} transition/reversal states match the previous uphill viewer in all bones, clock, actor and IK/sole statistics.`);
  console.log(`PASS selected ${before.soleCount} sole vertices with correction ON and ${before.bodyCount} body vertices with correction OFF; maximum differences: ${JSON.stringify(out)}`);
  console.log('NOTE: finite selected states and vertices; this is not a visual approval or foot-lock guarantee.');
} finally { await browser.close(); }
