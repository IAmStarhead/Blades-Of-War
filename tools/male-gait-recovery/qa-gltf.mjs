// Scoped checks of this trial's exact GLB and previous C. Not a certificate of
// appearance, continuous contact, all-time collision freedom or engine import.
import assert from 'node:assert/strict';
import {createHash} from 'node:crypto';
import {createRequire} from 'node:module';
import {fileURLToPath} from 'node:url';
import fs from 'node:fs';
import path from 'node:path';
import {Quaternion, Vector3} from '../male-library-motion/node_modules/three/build/three.module.js';
import {NodeIO} from '../male-library-motion/node_modules/@gltf-transform/core/dist/index.js';
import {makeEvaluator} from '../male-motion-fit/pose.mjs';

const repo = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const out = path.resolve(process.argv[2] || path.join(repo, 'work/male-gait-recovery'));
const require = createRequire(path.join(repo, 'tools/character-showcase/package.json'));
const validator = require('gltf-validator'), io = new NodeIO();
const data = name => fs.readFileSync(path.join(out, name));
const hash = bytes => createHash('sha256').update(bytes).digest('hex');
const oldBytes = data('previous_C.glb'), newBytes = data('male_gait_alternative.glb'), info = JSON.parse(data('build-info.json'));
assert.equal(hash(oldBytes), 'c0685047069bf2a25e7cdc2c23580543b7e349281ad27d64dc240d63b9446013');
assert.equal(hash(oldBytes), hash(fs.readFileSync(path.join(repo, 'work/male-gait-refine/male_gait_C_refined.glb'))));
assert.equal(hash(newBytes), info.modelSha256);
for (const [name, bytes] of [['previous_C.glb', oldBytes], ['male_gait_alternative.glb', newBytes]]) {
  const result = await validator.validateBytes(new Uint8Array(bytes), {uri: name, maxIssues: 10000});
  if (result.issues.numErrors || result.issues.numWarnings) console.error(JSON.stringify(result.issues, null, 2));
  assert.equal(result.issues.numErrors, 0); assert.equal(result.issues.numWarnings, 0);
  console.log(`PASS: ${name}: glTF Validator 0 errors / 0 warnings`);
}
const old = (await io.readBinary(oldBytes)).getRoot(), next = (await io.readBinary(newBytes)).getRoot();
const raw = a => { assert.ok(a); const v = a.getArray(); return Buffer.from(v.buffer, v.byteOffset, v.byteLength); };
const same = (a, b, label) => assert.equal(hash(raw(a)), hash(raw(b)), label);
const node = (root, name) => { const found = root.listNodes().filter(n => n.getName() === name); assert.equal(found.length, 1); return found[0]; };
assert.equal(next.listNodes().length, old.listNodes().length); assert.equal(next.listSkins().length, 1);
const s0 = old.listSkins()[0], s1 = next.listSkins()[0];
assert.equal(s1.listJoints().length, 52);
assert.deepEqual(s1.listJoints().map(n => n.getName()), s0.listJoints().map(n => n.getName()));
same(s0.getInverseBindMatrices(), s1.getInverseBindMatrices(), 'inverse bind matrices');
let changedVertices = 0, changedHip = 0, changedChest = 0, maxWeightError = 0;
for (const a of old.listNodes()) {
  const b = node(next, a.getName());
  assert.equal(b.getParentNode()?.getName(), a.getParentNode()?.getName());
  assert.deepEqual(b.getTranslation(), a.getTranslation()); assert.deepEqual(b.getRotation(), a.getRotation()); assert.deepEqual(b.getScale(), a.getScale());
  assert.equal(Boolean(a.getSkin()), Boolean(b.getSkin()));
  if (!a.getMesh()) { assert.ok(!b.getMesh()); continue; }
  const pa = a.getMesh().listPrimitives(), pb = b.getMesh().listPrimitives(); assert.equal(pa.length, pb.length);
  pa.forEach((p, i) => {
    const q = pb[i]; assert.deepEqual(p.listSemantics().sort(), q.listSemantics().sort());
    for (const sem of p.listSemantics()) if (!(a.getName() === 'NewBody' && ['JOINTS_0', 'WEIGHTS_0'].includes(sem))) same(p.getAttribute(sem), q.getAttribute(sem), `${a.getName()} ${sem}`);
    if (p.getIndices()) same(p.getIndices(), q.getIndices(), `${a.getName()} indices`);
    assert.equal(p.listTargets().length, q.listTargets().length);
    if (a.getName() === 'NewBody') {
      const pos = p.getAttribute('POSITION').getArray(), j0 = p.getAttribute('JOINTS_0').getArray(), j1 = q.getAttribute('JOINTS_0').getArray();
      const w0 = p.getAttribute('WEIGHTS_0').getArray(), w1 = q.getAttribute('WEIGHTS_0').getArray();
      for (let n = 0; n < pos.length / 3; n++) {
        const changed = [0, 1, 2, 3].some(k => j0[4 * n + k] !== j1[4 * n + k] || Math.abs(w0[4 * n + k] - w1[4 * n + k]) > 1e-7);
        if (changed) {
          changedVertices++;
          const x = Math.abs(pos[3 * n]), y = pos[3 * n + 1];
          if (y > .64 && y < 1.05 && x < .20) changedHip++;
          else { assert.ok(y > 1.28 && y < 1.47 && x < .225, 'unexpected weight location'); changedChest++; }
        }
        let sum = 0; for (let k = 0; k < 4; k++) { assert.ok(w1[4 * n + k] >= 0 && j1[4 * n + k] < 52); sum += w1[4 * n + k]; }
        maxWeightError = Math.max(maxWeightError, Math.abs(sum - 1));
      }
    }
  });
}
assert.equal(changedVertices, 1013); assert.equal(changedHip, 660); assert.equal(changedChest, 353); assert.ok(maxWeightError < 1e-5);
assert.deepEqual(old.listTextures().map(t => hash(t.getImage())), next.listTextures().map(t => hash(t.getImage())));
assert.deepEqual(next.listAnimations().map(a => a.getName()), ['Walk_100STYLE_Trial', 'Jog_100STYLE_CArms_Trial']);
console.log(`PASS: unchanged geometry, textures, rest hierarchy and inverse binds; ${changedHip} hip and ${changedChest} upper-body weight records changed, normalized within ${maxWeightError.toExponential(2)}.`);

const P = o => o.getWorldPosition(new Vector3());
const quantile = (a, q) => { const values = [...a].sort((x, y) => x - y); return values[Math.floor((values.length - 1) * q)]; };
for (const [root, name, speed, isNew] of [
  [old, 'Walk_C_Refined', 1.73, false], [old, 'Run_C_Refined', 3.52, false],
  [next, 'Walk_100STYLE_Trial', info.viewerGroundSpeedMps.selected.walk, true],
  [next, 'Jog_100STYLE_CArms_Trial', info.viewerGroundSpeedMps.selected.run, true],
]) {
  const anim = root.listAnimations().find(a => a.getName() === name), ev = makeEvaluator(root, 'NewBody', name);
  for (const ch of anim.listChannels()) {
    const s = ch.getSampler(), times = s.getInput().getArray(), values = s.getOutput().getArray(), size = values.length / times.length;
    assert.equal(s.getInterpolation(), 'LINEAR'); assert.equal(times[0], 0); assert.ok(Math.abs(times.at(-1) - ev.duration) < 2e-6);
    for (let i = 1; i < times.length; i++) assert.ok(times[i] > times[i - 1]);
    assert.ok(Array.from(values).every(Number.isFinite));
    for (let k = 0; k < size; k++) assert.equal(values[k], values[values.length - size + k], `${name} loop endpoint`);
    if (ch.getTargetPath() === 'rotation') for (let i = 0; i < values.length; i += 4) {
      assert.ok(Math.abs(Math.hypot(...values.slice(i, i + 4)) - 1) < 2e-5);
      if (i) assert.ok(new Quaternion().fromArray(values, i - 4).dot(new Quaternion().fromArray(values, i)) >= 0, `${name}: quaternion sign discontinuity`);
    }
  }
  if (isNew) {
    const channel = anim.listChannels().find(c => c.getTargetNode().getName() === 'Rig_Root' && c.getTargetPath() === 'translation');
    const sampler = channel.getSampler(), values = sampler.getOutput().getArray(), count = sampler.getInput().getArray().length - 1;
    const step = ev.duration / count, wrap = i => ((i % count) + count) % count;
    let maxAcceleration = 0;
    for (let i = 0; i < count; i++) {
      const acceleration = Math.abs(values[3 * wrap(i + 1) + 1] - 2 * values[3 * i + 1] + values[3 * wrap(i - 1) + 1]) / (step * step);
      maxAcceleration = Math.max(maxAcceleration, acceleration);
    }
    const limit = name.startsWith('Walk') ? 30 : 120;
    assert.ok(maxAcceleration < limit, `${name} root-Y sampled acceleration`);
    console.log(`PASS ${name}: sampled root-Y max finite-difference acceleration ${maxAcceleration.toFixed(1)} m/s² at ${step.toFixed(6)} s.`);
  }
  let lowMin = Infinity, lowMax = -Infinity;
  for (let i = 0; i < 4096; i++) {
    const low = Math.min(...ev.lows(ev.duration * (i + .31) / 4096)); lowMin = Math.min(lowMin, low); lowMax = Math.max(lowMax, low);
  }
  const slip = [], dt = ev.duration / 480 / 6;
  for (let i = 2; i < 478; i++) {
    const t = ev.duration * i / 480, feet = ev.footDetails(t);
    for (const f of feet) {
      if (f.point[1] > .005) continue;
      const a = ev.vertex(t - dt, f.index), b = ev.vertex(t + dt, f.index);
      slip.push(Math.hypot((b[0] - a[0]) / (2 * dt), (b[2] - a[2]) / (2 * dt) + speed));
    }
  }
  const kneeMin = {L: Infinity, R: Infinity}, kneeMaxSpeed = {L: 0, R: 0}, last = {};
  for (let i = 0; i <= 1200; i++) {
    const t = ev.duration * i / 1200; ev.pose(t);
    for (const side of ['L', 'R']) {
      const H = P(ev.bones.get('Rig_Thigh_' + side)), K = P(ev.bones.get('Rig_Shin_' + side)), A = P(ev.bones.get('Rig_Foot_' + side));
      const bend = (Math.PI - H.sub(K).angleTo(A.sub(K))) * 180 / Math.PI;
      kneeMin[side] = Math.min(kneeMin[side], bend);
      if (last[side] !== undefined) kneeMaxSpeed[side] = Math.max(kneeMaxSpeed[side], Math.abs(bend - last[side]) * 1200 / ev.duration);
      last[side] = bend;
    }
  }
  function positions(t) { ev.pose(t); return Object.fromEntries(['Rig_Hips', 'Rig_Chest', 'Rig_Hand_L', 'Rig_Hand_R'].map(n => [n, P(ev.bones.get(n))])); }
  const step = 1 / 240, a = positions(ev.duration - step), b = positions(0), c = positions(step), seam = {};
  for (const n of Object.keys(a)) seam[n] = b[n].clone().sub(a[n]).divideScalar(step).distanceTo(c[n].clone().sub(b[n]).divideScalar(step));
  assert.ok(lowMin > -.0015, `${name} below floor in sampled poses`);
  if (isNew) {
    assert.ok(kneeMin.L > 5 && kneeMin.R > 5, `${name} nearly straight knee`);
    assert.ok(kneeMaxSpeed.L < 1000 && kneeMaxSpeed.R < 1000, `${name} sudden knee bend`);
    for (const value of Object.values(seam)) assert.ok(value < 1.0, `${name} sampled seam jump`);
  }
  console.log(`PASS ${name}: exact key endpoints, normalized finite rotations, duration ${ev.duration.toFixed(5)} s, 4096 off-key lowest-soles ${(lowMin * 1000).toFixed(3)}..${(lowMax * 1000).toFixed(3)} mm.`);
  console.log(`NOTE ${name}: residual p95 ${quantile(slip, .95).toFixed(2)} m/s at ${speed.toFixed(3)} m/s grid (lowest vertex <5mm; includes roll and touchdown, not actual stance lock).`);
  console.log(`NOTE ${name}: sampled knee minimum L/R ${kneeMin.L.toFixed(2)}/${kneeMin.R.toFixed(2)}°, max bend speed ${kneeMaxSpeed.L.toFixed(0)}/${kneeMaxSpeed.R.toFixed(0)}°/s; seam Δvelocity hips/chest/hands ${Object.values(seam).map(x => x.toFixed(3)).join('/')} m/s at 1/240 s.`);
}
console.log('NOTE: samples do not establish no skating, all-time/whole-body collision freedom, transition quality or engine compatibility.');
