// Measure the actual Three.js skinned material ring in the bundled viewer,
// before/after the corrective morph, including mixed and IK-adapted poses.
// The ring is a rest-space mesh/plane intersection projected onto the local
// blended bone cross-section; it is a finite proxy, not anatomical volume.
import assert from 'node:assert/strict';
import {createRequire} from 'node:module';
import {fileURLToPath, pathToFileURL} from 'node:url';
import fs from 'node:fs';
import path from 'node:path';
const repo = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const folder = path.resolve(process.argv[2] || path.join(repo, 'work/male-leg-volume'));
const reportPath = process.argv[3] ? path.resolve(process.argv[3]) : null;
const require = createRequire(path.join(repo, 'tools/character-showcase/package.json'));
const puppeteer = require('puppeteer-core'), chromium = require('@sparticuz/chromium').default;
const browser = await puppeteer.launch({executablePath: process.env.CHROME_BIN || await chromium.executablePath(), headless: 'shell',
  args: [...chromium.args, '--allow-file-access-from-files', '--disable-dev-shm-usage'], protocolTimeout: 300000});
try {
  const page = await browser.newPage(), errors = [];
  page.on('pageerror', e => errors.push(e.message)); page.on('console', m => { if (m.type() === 'error') errors.push(m.text()); });
  await page.setOfflineMode(true); await page.goto(pathToFileURL(path.join(folder, 'index.html')).href, {waitUntil: 'load', timeout: 60000});
  await page.waitForFunction('window.uphillDemo?.state.ready === true', {timeout: 60000});
  const report = await page.evaluate(() => {
    const d = uphillDemo; d.setManual(true);
    const c = d.controller, mesh = d.model.getObjectByName('NewBody'), geometry = mesh.geometry;
    const p = geometry.getAttribute('position'), j = geometry.getAttribute('skinIndex'), w = geometry.getAttribute('skinWeight'), index = geometry.index;
    const V = d.camera.position.constructor, Q = d.camera.quaternion.constructor;
    const sides = ['L', 'R'], boneId = Object.fromEntries(mesh.skeleton.bones.map((b, i) => [b.name, i]));
    function influence(i, id) { let value = 0; for (let k = 0; k < 4; k++) if (j.getComponent(i, k) === id) value += w.getComponent(i, k); return value; }
    function makeRing(y, side) {
      const sign = side === 'L' ? 1 : -1, edges = new Map(), shin = boneId['Rig_Shin_' + side];
      for (let a = 0; a < index.count; a += 3) {
        const tri = [index.getX(a), index.getX(a + 1), index.getX(a + 2)];
        if (!tri.every(i => p.getX(i) * sign > .015 && p.getX(i) * sign < .25)) continue;
        for (let k = 0; k < 3; k++) {
          let i = tri[k], k2 = tri[(k + 1) % 3], yi = p.getY(i), yj = p.getY(k2);
          if ((yi - y) * (yj - y) >= 0) continue;
          let t = (y - yi) / (yj - yi); if (i > k2) { [i, k2] = [k2, i]; t = 1 - t; }
          const v = new V(p.getX(i), p.getY(i), p.getZ(i)).lerp(new V(p.getX(k2), p.getY(k2), p.getZ(k2)), t);
          edges.set(i + ',' + k2, {i, j: k2, t, rest: v, shin: influence(i, shin) * (1 - t) + influence(k2, shin) * t});
        }
      }
      const points = [...edges.values()]; if (points.length < 12) throw Error(`Missing ring ${side} ${y}`);
      const cx = points.reduce((a, x) => a + x.rest.x, 0) / points.length, cz = points.reduce((a, x) => a + x.rest.z, 0) / points.length;
      points.sort((a, b) => Math.atan2(a.rest.z - cz, a.rest.x - cx) - Math.atan2(b.rest.z - cz, b.rest.x - cx));
      const restZ = points.map(e => e.rest.z), blend = points.reduce((a, e) => a + e.shin, 0) / points.length;
      return {y, side, points, blend, restWidth: Math.max(...restZ) - Math.min(...restZ)};
    }
    const rings = Object.fromEntries(sides.map(side => [side, [.46, .50, .5332, .56, .60].map(y => makeRing(y, side))]));
    const temp = new V(), pa = new V(), pb = new V();
    function width(ring) {
      const qa = c.legs[ring.side][0].getWorldQuaternion(new Q()), qb = c.legs[ring.side][1].getWorldQuaternion(new Q());
      // Follow the locally blended orientation, not a fixed world axis. The
      // width is measured anterior-posterior, perpendicular to the bend axis.
      const axis = new V(0, 0, 1).applyQuaternion(qa).multiplyScalar(1 - ring.blend)
        .addScaledVector(new V(0, 0, 1).applyQuaternion(qb), ring.blend).normalize();
      let low = Infinity, high = -Infinity;
      for (const e of ring.points) {
        mesh.getVertexPosition(e.i, pa); mesh.localToWorld(pa);
        mesh.getVertexPosition(e.j, pb); mesh.localToWorld(pb);
        const coordinate = temp.copy(pa).lerp(pb, e.t).dot(axis); low = Math.min(low, coordinate); high = Math.max(high, coordinate);
      }
      return high - low;
    }
    function setup() { d.model.updateWorldMatrix(true, true); mesh.updateMatrixWorld(true); mesh.skeleton.update(); }
    function angle(side) {
      const q = c.legs[side][1].quaternion, norm = Math.hypot(q.x, q.y, q.z, q.w);
      return 2 * Math.acos(Math.min(1, Math.abs(q.w) / norm));
    }
    function expected(side) {
      const q = c.legs[side][1].quaternion, sign = q.w < 0 || (q.w === 0 && q.x < 0) ? -1 : 1;
      const a = 2 * Math.atan2(Math.max(0, q.x * sign), Math.abs(q.w)), low = 110 * Math.PI / 180, high = 130 * Math.PI / 180;
      let capped = a;
      if (a >= high) capped = (low + high) / 2;
      else if (a > low) { const u = (a - low) / (high - low); capped = low + (high - low) * (u - u ** 3 + .5 * u ** 4); }
      return .85 * (1 / Math.cos(capped / 2) - 1);
    }
    function meshValues() { return [...mesh.morphTargetInfluences]; }
    function oneRingPair(ring) {
      c.setVolumeEnabled(false); const before = width(ring);
      c.setVolumeEnabled(true); const after = width(ring);
      return {before, after, rest: ring.restWidth};
    }
    d.examplePose(); setup();
    const example = {phase: d.clock.phase, runPhase: d.clock.runPhase, active: c.stats.active, z: d.actor.position.z, angleDegrees: angle('L') * 180 / Math.PI};
    Object.assign(example, oneRingPair(rings.L[2]));
    const comparison = {count: 0, strongCount: 0, improved: 0, minBaseRatio: Infinity, minAfterRatio: Infinity,
      maxAfterRatio: 0, minRecovery: Infinity, maxRecovery: -Infinity, maxWeightError: 0, maxStrongAngle: 0, byGrade: {}};
    for (const grade of [0, 15, 20]) {
      d.terrain.setAngle(grade);
      const row = comparison.byGrade[grade] = {poses: 0, strong: 0, minBaseRatio: Infinity, minAfterRatio: Infinity, minRecovery: Infinity};
      for (const blend of [0, .25, .5, .75, 1]) for (let k = 0; k < 64; k++) {
        c.reset('walk', (k + .37) / 64, 1.4); c.clock.weight = blend; c.step(0); setup(); row.poses++;
        for (const side of sides) {
          const a = angle(side), weightIndex = mesh.morphTargetDictionary['KneeVolume_' + side];
          comparison.maxWeightError = Math.max(comparison.maxWeightError, Math.abs(meshValues()[weightIndex] - expected(side)));
          const pair = oneRingPair(rings[side][2]), baseRatio = pair.before / pair.rest, afterRatio = pair.after / pair.rest;
          comparison.count++; comparison.minBaseRatio = Math.min(comparison.minBaseRatio, baseRatio);
          comparison.minAfterRatio = Math.min(comparison.minAfterRatio, afterRatio); comparison.maxAfterRatio = Math.max(comparison.maxAfterRatio, afterRatio);
          row.minBaseRatio = Math.min(row.minBaseRatio, baseRatio); row.minAfterRatio = Math.min(row.minAfterRatio, afterRatio);
          if (a > 60 * Math.PI / 180 && baseRatio < .93) {
            const recovery = (pair.after - pair.before) / (pair.rest - pair.before);
            comparison.strongCount++; row.strong++; comparison.improved += Number(pair.after > pair.before);
            comparison.minRecovery = Math.min(comparison.minRecovery, recovery); comparison.maxRecovery = Math.max(comparison.maxRecovery, recovery);
            comparison.maxStrongAngle = Math.max(comparison.maxStrongAngle, a * 180 / Math.PI); row.minRecovery = Math.min(row.minRecovery, recovery);
          }
        }
      }
    }
    // Check nearby material rings in the matching screenshot pose too, to
    // avoid improving only the one reported slice while creating a waist.
    d.examplePose(); setup(); example.nearby = Object.fromEntries(rings.L.map(r => [r.y, oneRingPair(r)]));
    // The correction never changes the skeleton, position/phase or sole
    // vertices; repeated sampling at the same time must not accumulate it.
    d.terrain.setAngle(20); c.reset('run', .9020178539918424, 1.4); setup();
    const selectedSole = []; for (let i = 0; i < p.count; i++) if (p.getY(i) < .16 && Math.abs(p.getX(i)) > .035 && Math.abs(p.getX(i)) < .25 && i % 13 === 0) selectedSole.push(i);
    const state = () => JSON.stringify([c.clock.phase, c.clock.weight, c.clock.velocity, c.clock.distance, d.actor.position.toArray(),
      c.bones.map(b => [b.position.toArray(), b.quaternion.toArray()]), c.stats]);
    const oldState = state(); c.setVolumeEnabled(false); const soleA = selectedSole.map(i => mesh.getVertexPosition(i, new V()).toArray());
    c.setVolumeEnabled(true); const soleB = selectedSole.map(i => mesh.getVertexPosition(i, new V()).toArray()), sameState = state() === oldState;
    let soleDifference = 0; for (let i = 0; i < soleA.length; i++) soleDifference = Math.max(soleDifference, Math.hypot(...soleA[i].map((v, k) => v - soleB[i][k])));
    const ring = rings.L[2], firstWidth = width(ring), firstWeights = meshValues();
    for (let n = 0; n < 4; n++) c.step(0);
    setup(); const repeatWidth = width(ring), repeatWeights = meshValues();
    const repeat = {sameState, soleSamples: selectedSole.length, soleDifference, firstWidth, repeatWidth, firstWeights, repeatWeights};
    // Measure changes in the *correction displacement*, not the normal bone
    // motion, at 10 ms during forward and reversed transitions on each grade.
    const changedVertices = [];
    const morph = geometry.morphAttributes.position;
    for (let i = 0; i < p.count; i++) if ((morph[0].getZ(i) || morph[1].getZ(i)) && i % 4 === 0) changedVertices.push(i);
    function correctionVectors() {
      setup(); c.setVolumeEnabled(false); const a = changedVertices.map(i => mesh.localToWorld(mesh.getVertexPosition(i, new V())));
      c.setVolumeEnabled(true); return changedVertices.map((i, k) => mesh.localToWorld(mesh.getVertexPosition(i, new V())).sub(a[k]));
    }
    const continuity = {trajectories: 0, frames: 0, maxCorrectionStep: 0, maxWeightStep: 0, testedVertices: changedVertices.length};
    for (const grade of [0, 15, 20]) for (const mode of ['walk', 'run']) for (let k = 0; k < 8; k++) {
      d.terrain.setAngle(grade); c.reset(mode, (k + .37) / 8, 1.4); const other = mode === 'walk' ? 'run' : 'walk'; c.setTarget(other);
      let last = correctionVectors(), lastW = meshValues();
      for (let frame = 1; frame <= 70; frame++) {
        if (frame === 13) c.setTarget(mode); if (frame === 25) c.setTarget(other);
        c.step(.01); const now = correctionVectors(), nowW = meshValues();
        for (let i = 0; i < now.length; i++) continuity.maxCorrectionStep = Math.max(continuity.maxCorrectionStep, now[i].distanceTo(last[i]));
        for (let i = 0; i < nowW.length; i++) continuity.maxWeightStep = Math.max(continuity.maxWeightStep, Math.abs(nowW[i] - lastW[i]));
        last = now; lastW = nowW; continuity.frames++;
      }
      continuity.trajectories++;
    }
    return {method: 'Projected anterior-posterior width of corresponding material rings; not a true instantaneous volumetric cross-section.', example, comparison, repeat, continuity};
  });
  assert.deepEqual(errors, [], errors.join('\n'));
  const e = report.example, c = report.comparison, r = report.repeat, t = report.continuity;
  assert.ok(Math.abs(e.z - 6.6) < 1e-8 && !e.active && Math.abs(e.runPhase - .8082678539918424) < 1e-9);
  assert.ok(e.before > .079 && e.before < .085 && e.after > .112 && e.after < .123 && e.after - e.before > .03, JSON.stringify(e));
  assert.equal(c.count, 1920); assert.ok(c.strongCount > 300 && c.improved === c.strongCount && c.minRecovery > .6 && c.maxRecovery < 1.25 && c.maxWeightError < 1e-10, JSON.stringify(c));
  assert.ok(r.sameState && r.soleSamples > 100 && r.soleDifference < 1e-9 && Math.abs(r.repeatWidth - r.firstWidth) < 1e-10 &&
    r.firstWeights.every((v, i) => Math.abs(v - r.repeatWeights[i]) < 1e-12), JSON.stringify(r));
  assert.equal(t.trajectories, 48); assert.equal(t.frames, 3360); assert.ok(t.testedVertices > 100 && t.maxCorrectionStep < .012 && t.maxWeightStep < .15, JSON.stringify(t));
  console.log(`PASS screenshot-equivalent plateau pose: knee rotation ${e.angleDegrees.toFixed(2)}°, projected material ring rest/before/after ${(e.rest * 1000).toFixed(2)}/${(e.before * 1000).toFixed(2)}/${(e.after * 1000).toFixed(2)} mm.`);
  for (const [grade, row] of Object.entries(c.byGrade)) console.log(`PASS grade ${grade}°: ${row.poses} poses; ${row.strong} strongly bent knees improved, minimum recovered fraction ${(row.minRecovery * 100).toFixed(1)}%; min width ratio before/after ${(row.minBaseRatio * 100).toFixed(1)}%/${(row.minAfterRatio * 100).toFixed(1)}%.`);
  console.log(`PASS ${c.count} left/right ring comparisons, ${c.strongCount} strong bends; dynamic post-IK weight error ${c.maxWeightError.toExponential(2)}.`);
  console.log(`PASS ${r.soleSamples} sampled sole vertices unchanged by toggle, skeleton/state unchanged, repeated pose stable.`);
  console.log(`PASS ${t.trajectories} transitions/reversals, ${t.frames} intervals at 10 ms: max correction-vector change ${(t.maxCorrectionStep * 1000).toFixed(2)} mm; max morph-weight change ${t.maxWeightStep.toFixed(4)}.`);
  console.log('NOTE: material-ring projection and finite samples do not prove visual quality, watertightness, collision freedom or behavior for untested motions.');
  if (reportPath) fs.writeFileSync(reportPath, JSON.stringify(report, null, 2) + '\n');
} finally { await browser.close(); }
