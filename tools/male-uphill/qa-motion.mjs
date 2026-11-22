// Sample the actual bundled uphill viewer, including mixed/reversed motion,
// terrain shoulders, selected skinned sole vertices and repeat evaluation.
// These are finite proxies, not a proof of foot lock or artistic quality.
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
  const page = await browser.newPage(), errors = [];
  page.on('pageerror', e => errors.push(e.message)); page.on('console', m => { if (m.type() === 'error') errors.push(m.text()); });
  await page.setOfflineMode(true); await page.goto(pathToFileURL(path.join(folder, 'index.html')).href, {waitUntil: 'load', timeout: 60000});
  await page.waitForFunction('window.uphillDemo?.state.ready === true', {timeout: 60000});
  const results = await page.evaluate(() => {
    const d = uphillDemo; d.setManual(true);
    const c = d.controller, surface = d.terrain, mesh = d.model.getObjectByName('NewBody');
    const V = d.camera.position.constructor, Q = d.camera.quaternion.constructor, v = new V();
    const names = ['Rig_Hips', 'Rig_Chest', 'Rig_Thigh_L', 'Rig_Shin_L', 'Rig_Foot_L', 'Rig_Thigh_R', 'Rig_Shin_R', 'Rig_Foot_R', 'Rig_Hand_L', 'Rig_Hand_R'];
    const bones = names.map(n => d.model.getObjectByName(n));
    const pose = () => bones.map(b => ({p: b.getWorldPosition(new V()).toArray(), q: b.getWorldQuaternion(new Q()).toArray()}));
    const dist = (a, b) => Math.hypot(...a.map((x, i) => x - b[i]));
    const qangle = (a, b) => 2 * Math.acos(Math.min(1, Math.abs(a.reduce((s, x, i) => s + x * b[i], 0)) / (Math.hypot(...a) * Math.hypot(...b))));
    function change(a, b) {
      let position = 0, angle = 0;
      for (let i = 0; i < a.length; i++) { position = Math.max(position, dist(a[i].p, b[i].p)); angle = Math.max(angle, qangle(a[i].q, b[i].q)); }
      return {position, angle};
    }
    const snapshot = () => JSON.stringify([c.clock.phase, c.clock.weight, c.clock.velocity, c.clock.distance, d.actor.position.toArray(), pose()]);
    const p = mesh.geometry.getAttribute('position'), sole = [];
    for (let i = 0; i < p.count; i++) if (p.getY(i) < .16 && Math.abs(p.getX(i)) > .035 && Math.abs(p.getX(i)) < .25) sole.push(i);
    function actualLowest() {
      d.model.updateWorldMatrix(true, true); mesh.updateMatrixWorld(true); mesh.skeleton.update();
      const min = {L: Infinity, R: Infinity};
      for (const id of sole) {
        mesh.getVertexPosition(id, v); mesh.localToWorld(v);
        const side = p.getX(id) > 0 ? 'L' : 'R'; min[side] = Math.min(min[side], v.y - surface.height(v.x, v.z));
      }
      return min;
    }
    const grid = [];
    for (const grade of [0, 5, 10, 15, 17.5, 20]) {
      surface.setAngle(grade);
      const row = {grade, count: 0, min: Infinity, rawMin: Infinity, maxLift: 0, maxMiss: 0, maxError: 0, maxShift: 0,
        parity: 0, repeatChanged: false, contact: [], altitudeError: 0};
      for (const z of [-1.65, -1.1, -.6, 1.4, 4.9, 5.4, 5.9]) for (const weight of [0, .25, .5, .75, 1]) for (let i = 0; i < 48; i++) {
        c.reset('walk', (i + .37) / 48, z); c.clock.weight = weight; c.step(0);
        const s = c.stats; row.count++; row.min = Math.min(row.min, s.correctedGap); row.rawMin = Math.min(row.rawMin, s.rawGap);
        row.maxLift = Math.max(row.maxLift, s.lift); row.maxMiss = Math.max(row.maxMiss, s.maxMiss); row.maxError = Math.max(row.maxError, s.maxError);
        row.maxShift = Math.max(row.maxShift, s.maxReachShift); row.altitudeError = Math.max(row.altitudeError, Math.abs(d.actor.position.y - surface.height(0, z)));
        for (const side of ['L', 'R']) if (s.raw[side].flat < .02) row.contact.push(s.fitted[side].gap + s.lift);
        if (i === 0) {
          const actual = actualLowest();
          for (const side of ['L', 'R']) row.parity = Math.max(row.parity, Math.abs(actual[side] - (s.fitted[side].gap + s.lift)));
          const before = snapshot(); for (let n = 0; n < 3; n++) c.step(0); row.repeatChanged ||= before !== snapshot();
        }
      }
      row.contact.sort((a, b) => a - b); row.contactCount = row.contact.length;
      row.contact95 = row.contact[Math.floor(row.contact.length * .95)]; row.contactMax = row.contact.at(-1); delete row.contact;
      grid.push(row);
    }
    const routes = [];
    for (const grade of [0, 10, 15, 20]) for (const mode of ['walk', 'run']) for (const phase of [0, .13, .37, .72]) {
      surface.setAngle(grade); c.reset(mode, phase, -2.7); let prev = pose(), prevZ = d.actor.position.z;
      const row = {grade, mode, phase, steps: 0, min: Infinity, maxJoint: 0, maxMiss: 0, maxShift: 0, maxGap: 0, altitudeError: 0, backwards: false};
      while (d.actor.position.z < 6.6) {
        c.step(.01); const now = pose(), s = c.stats;
        row.min = Math.min(row.min, s.correctedGap); row.maxJoint = Math.max(row.maxJoint, change(prev, now).position);
        row.maxMiss = Math.max(row.maxMiss, s.maxMiss); row.maxShift = Math.max(row.maxShift, s.maxReachShift);
        row.altitudeError = Math.max(row.altitudeError, Math.abs(d.actor.position.y - surface.height(0, d.actor.position.z)));
        for (const side of ['L', 'R']) if (s.raw[side].flat < .02) row.maxGap = Math.max(row.maxGap, s.fitted[side].gap + s.lift);
        row.backwards ||= d.actor.position.z < prevZ; prevZ = d.actor.position.z; prev = now; row.steps++;
        if (row.steps > 1000) throw Error('Route did not finish');
      }
      routes.push(row);
    }
    const trajectories = {cases: 0, switches: 0, reversals: 0, unchanged: true, min: Infinity,
      maxPosition: 0, maxAngle: 0, maxLiftStep: 0, maxDropStep: 0, maxMiss: 0, maxShift: 0};
    for (const grade of [0, 10, 15, 20]) for (const initial of ['walk', 'run']) for (const z of [-1.55, -.7, 1.4, 4.9, 5.5]) for (let k = 0; k < 8; k++) {
      surface.setAngle(grade); c.reset(initial, (k + .37) / 8, z); const target = initial === 'walk' ? 'run' : 'walk';
      let before = snapshot(); c.setTarget(target); trajectories.unchanged &&= before === snapshot(); trajectories.switches++;
      let prev = pose(), lastLift = c.stats.lift, lastDrop = c.stats.pelvisDrop;
      for (let j = 0; j < 70; j++) {
        if (j === 12 || j === 24) { before = snapshot(); c.setTarget(j === 12 ? initial : target); trajectories.unchanged &&= before === snapshot(); trajectories.reversals++; }
        c.step(.01); const now = pose(), delta = change(prev, now), s = c.stats;
        trajectories.maxPosition = Math.max(trajectories.maxPosition, delta.position); trajectories.maxAngle = Math.max(trajectories.maxAngle, delta.angle);
        trajectories.min = Math.min(trajectories.min, s.correctedGap); trajectories.maxMiss = Math.max(trajectories.maxMiss, s.maxMiss);
        trajectories.maxShift = Math.max(trajectories.maxShift, s.maxReachShift);
        trajectories.maxLiftStep = Math.max(trajectories.maxLiftStep, Math.abs(s.lift - lastLift));
        trajectories.maxDropStep = Math.max(trajectories.maxDropStep, Math.abs(s.pelvisDrop - lastDrop));
        lastLift = s.lift; lastDrop = s.pelvisDrop; prev = now;
      }
      trajectories.cases++;
    }
    // At fixed phase, move across both shoulders in 1 cm increments. This
    // separately exercises IK activation/deactivation around the flat land.
    const boundary = {cases: 0, maxAngle: 0, activationAngle: 0, min: Infinity, maxMiss: 0};
    for (const mode of ['walk', 'run']) for (const shoulder of ['start', 'end']) for (let k = 0; k < 64; k++) {
      surface.setAngle(20); const z = shoulder === 'start' ? -2.1 : 4.8;
      c.reset(mode, (k + .37) / 64, z); let prev = pose(), active = c.stats.active;
      for (let i = 1; i <= 140; i++) {
        d.actor.position.z = z + i * .01; c.step(0); const now = pose(), angle = change(prev, now).angle, s = c.stats;
        boundary.maxAngle = Math.max(boundary.maxAngle, angle); boundary.min = Math.min(boundary.min, s.correctedGap);
        boundary.maxMiss = Math.max(boundary.maxMiss, s.maxMiss);
        if (active !== s.active) boundary.activationAngle = Math.max(boundary.activationAngle, angle);
        active = s.active; prev = now;
      }
      boundary.cases++;
    }
    // High-frequency sampling catches short knee/foot snaps hidden by 10 ms
    // samples. Compare against the flat source with the same reversal pattern.
    const highFrequency = [];
    for (const grade of [0, 20]) for (const mode of ['walk', 'run']) for (const scenario of ['steady', 'reverse']) {
      surface.setAngle(grade); const row = {grade, mode, scenario, maxAngle: 0, steps: 0};
      for (let k = 0; k < 8; k++) {
        c.reset(mode, (k + .37) / 8, 1.4); const other = mode === 'walk' ? 'run' : 'walk';
        if (scenario === 'reverse') c.setTarget(other); let prev = pose();
        for (let i = 1; i <= 700; i++) {
          if (scenario === 'reverse' && i === 121) c.setTarget(mode);
          if (scenario === 'reverse' && i === 241) c.setTarget(other);
          c.step(.001); const now = pose(); row.maxAngle = Math.max(row.maxAngle, change(prev, now).angle); row.steps++; prev = now;
        }
      }
      highFrequency.push(row);
    }
    return {soleVertices: sole.length, grid, routes, trajectories, boundary, highFrequency};
  });
  assert.deepEqual(errors, [], errors.join('\n')); assert.equal(results.soleVertices, 2246);
  for (const r of results.grid) {
    assert.equal(r.count, 1680); assert.ok(r.min >= .0009 && r.rawMin < 0 && r.maxLift < .015, JSON.stringify(r));
    assert.ok(r.maxMiss < .0001 && r.maxError < .003 && r.maxShift < .18 && r.parity < .00001 && r.altitudeError < 1e-10 && !r.repeatChanged, JSON.stringify(r));
    assert.ok(r.contactCount > 1000 && r.contact95 < .025 && r.contactMax < .04, `near-ground sample gap: ${JSON.stringify(r)}`);
    console.log(`grade ${r.grade}°: ${r.count} poses, raw/protected min ${(r.rawMin * 1000).toFixed(2)}/${(r.min * 1000).toFixed(2)} mm; near-ground p95/max ${(r.contact95 * 1000).toFixed(2)}/${(r.contactMax * 1000).toFixed(2)} mm; max target shortening ${(r.maxShift * 1000).toFixed(1)} mm.`);
  }
  assert.equal(results.routes.length, 32);
  for (const r of results.routes) assert.ok(r.min >= .0009 && r.maxMiss < .0001 && r.maxShift < .18 && r.maxJoint < .16 && r.maxGap < .04 && r.altitudeError < 1e-10 && !r.backwards, JSON.stringify(r));
  console.log(`PASS ${results.routes.length} complete uphill walk/run routes at four starting phases; maximum near-ground gap ${(Math.max(...results.routes.map(r => r.maxGap)) * 1000).toFixed(2)} mm.`);
  const t = results.trajectories;
  assert.equal(t.cases, 320); assert.equal(t.switches, 320); assert.equal(t.reversals, 640); assert.ok(t.unchanged);
  assert.ok(t.min >= .0009 && t.maxPosition < .15 && t.maxAngle < .27 && t.maxLiftStep < .004 && t.maxDropStep < .006 && t.maxMiss < .0001, JSON.stringify(t));
  console.log(`PASS ${t.cases} 10 ms transition trajectories, ${t.switches} switches and ${t.reversals} reversals without an instantaneous pose/clock reset; max joint ${(t.maxPosition * 1000).toFixed(1)} mm, angle ${(t.maxAngle * 180 / Math.PI).toFixed(2)}°, lift change ${(t.maxLiftStep * 1000).toFixed(2)} mm.`);
  const b = results.boundary;
  assert.equal(b.cases, 256); assert.ok(b.min >= .0009 && b.maxMiss < .0001 && b.maxAngle < .05 && b.activationAngle < .003, JSON.stringify(b));
  console.log(`PASS ${b.cases} fixed-phase crossings of ramp shoulders: max joint rotation ${(b.maxAngle * 180 / Math.PI).toFixed(3)}° per 1 cm; activation ${(b.activationAngle * 180 / Math.PI).toFixed(6)}°.`);
  for (const r of results.highFrequency) {
    assert.equal(r.steps, 5600); assert.ok(r.maxAngle < .035, JSON.stringify(r));
    console.log(`${r.grade}° ${r.mode} ${r.scenario}: max sampled joint rotation ${(r.maxAngle * 180 / Math.PI).toFixed(3)}° per 1 ms.`);
  }
  console.log('PASS independent Three.js sole-skinning parity, terrain following and repeated samples without accumulated corrections.');
  console.log('NOTE: near-ground means raw flat-animation sole <20 mm, not a certified planted-contact event; horizontal sliding is not constrained.');
} finally { await browser.close(); }
