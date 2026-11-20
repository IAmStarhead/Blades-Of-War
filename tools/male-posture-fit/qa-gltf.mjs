// Scoped structure, identity, loop, skin and dense sole checks. This does not
// certify anatomy, all poses, game-engine import, or whole-mesh intersections.
import assert from 'node:assert/strict';
import {createHash} from 'node:crypto';
import {createRequire} from 'node:module';
import {fileURLToPath} from 'node:url';
import fs from 'node:fs';
import path from 'node:path';
import {Quaternion, Vector3} from '../male-library-motion/node_modules/three/build/three.module.js';
import {NodeIO} from '../male-library-motion/node_modules/@gltf-transform/core/dist/index.js';
import {makeEvaluator} from '../male-motion-fit/pose.mjs';
const repo = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..'), out = path.resolve(process.argv[2] || path.join(repo, 'work/male-posture-fit'));
const require = createRequire(path.join(repo, 'tools/character-showcase/package.json')), validator = require('gltf-validator'), io = new NodeIO();
const hash = b => createHash('sha256').update(b).digest('hex'), data = name => fs.readFileSync(path.join(out, name));
const oldBytes = data('previous_C_trial.glb'), bytes = data('male_posture_C_trial.glb'), meta = JSON.parse(data('build-info.json'));
assert.equal(hash(oldBytes), 'b52a204a294ff7bf11e60b3da1be385eb406bdcd732e90d1e8240760f772270e');
assert.equal(hash(oldBytes), hash(fs.readFileSync(path.join(repo, 'work/male-motion-fit/male_motion_C_trial.glb'))));
assert.equal(hash(bytes), meta.skin.outputSha256);
const validation = await validator.validateBytes(new Uint8Array(bytes), {uri: 'male_posture_C_trial.glb', maxIssues: 10000});
if (validation.issues.numErrors || validation.issues.numWarnings) console.error(JSON.stringify(validation.issues, null, 2));
assert.equal(validation.issues.numErrors, 0); assert.equal(validation.issues.numWarnings, 0);
const before = (await io.readBinary(oldBytes)).getRoot(), after = (await io.readBinary(bytes)).getRoot();
const raw = a => { assert.ok(a); const arr = a.getArray(); return Buffer.from(arr.buffer, arr.byteOffset, arr.byteLength); };
const same = (a, b, label) => assert.equal(hash(raw(a)), hash(raw(b)), label);
const byName = (root, name) => { const a = root.listNodes().filter(n => n.getName() === name); assert.equal(a.length, 1); return a[0]; };
assert.equal(after.listNodes().length, before.listNodes().length); assert.equal(after.listSkins().length, 1);
const s0 = before.listSkins()[0], s1 = after.listSkins()[0];
assert.equal(s1.listJoints().length, 52); assert.deepEqual(s1.listJoints().map(n => n.getName()), s0.listJoints().map(n => n.getName()));
same(s0.getInverseBindMatrices(), s1.getInverseBindMatrices(), 'inverse binds');
let changed = 0, maxSumError = 0;
for (const a of before.listNodes()) {
  const b = byName(after, a.getName());
  assert.equal(b.getParentNode()?.getName(), a.getParentNode()?.getName(), a.getName() + ' parent');
  assert.deepEqual(b.getTranslation(), a.getTranslation(), a.getName() + ' translation');
  assert.deepEqual(b.getRotation(), a.getRotation(), a.getName() + ' rotation');
  assert.deepEqual(b.getScale(), a.getScale(), a.getName() + ' scale');
  assert.equal(Boolean(a.getSkin()), Boolean(b.getSkin()));
  if (!a.getMesh()) { assert.ok(!b.getMesh()); continue; }
  const ap = a.getMesh().listPrimitives(), bp = b.getMesh().listPrimitives(); assert.equal(bp.length, ap.length);
  ap.forEach((p, i) => {
    const q = bp[i]; assert.deepEqual(p.listSemantics().sort(), q.listSemantics().sort());
    for (const sem of p.listSemantics()) if (!(a.getName() === 'NewBody' && ['JOINTS_0', 'WEIGHTS_0'].includes(sem))) same(p.getAttribute(sem), q.getAttribute(sem), `${a.getName()} ${sem}`);
    if (p.getIndices()) same(p.getIndices(), q.getIndices(), `${a.getName()} indices`);
    assert.equal(p.listTargets().length, q.listTargets().length);
    if (a.getName() === 'NewBody') {
      const ppos = p.getAttribute('POSITION').getArray(), j0 = p.getAttribute('JOINTS_0').getArray(), j1 = q.getAttribute('JOINTS_0').getArray();
      const w0 = p.getAttribute('WEIGHTS_0').getArray(), w1 = q.getAttribute('WEIGHTS_0').getArray();
      for (let n = 0; n < ppos.length / 3; n++) {
        const diff = [0, 1, 2, 3].some(k => j0[n * 4 + k] !== j1[n * 4 + k] || w0[n * 4 + k] !== w1[n * 4 + k]);
        if (diff) { changed++; assert.ok(Math.abs(ppos[n * 3]) < .056 && ppos[n * 3 + 1] > .79 && ppos[n * 3 + 1] < 1.02, 'unexpected weight location'); }
        let sum = 0; for (let k = 0; k < 4; k++) { assert.ok(w1[n * 4 + k] >= 0 && j1[n * 4 + k] < 52); sum += w1[n * 4 + k]; }
        maxSumError = Math.max(maxSumError, Math.abs(sum - 1));
      }
    }
  });
}
assert.equal(changed, 200); assert.ok(maxSumError < 1e-5);
assert.deepEqual(before.listTextures().map(t => hash(t.getImage())), after.listTextures().map(t => hash(t.getImage())));
assert.deepEqual(after.listAnimations().map(a => a.getName()), ['Walk_C_Posture', 'Run_C_Posture']);
console.log(`PASS: glTF Validator ${validation.issues.numErrors} errors/${validation.issues.numWarnings} warnings; original positions, normals, UVs, topology, textures, 52-joint hierarchy and inverse binds unchanged. Exactly ${changed} central hip vertices have changed, normalized weights.`);
console.log('PASS: previous model is byte-identical to the delivered C trial; its four clips and skin remain in a separate file.');
const P = o => o.getWorldPosition(new Vector3()), Q = o => o.getWorldQuaternion(new Quaternion()).normalize();
for (const [oldName, newName] of [['Walk_C', 'Walk_C_Posture'], ['Run_C', 'Run_C_Posture']]) {
  const anim = after.listAnimations().find(a => a.getName() === newName), oldAnim = before.listAnimations().find(a => a.getName() === oldName);
  assert.equal(anim.listChannels().length, oldAnim.listChannels().length);
  const a = makeEvaluator(before, 'NewBody', oldName), b = makeEvaluator(after, 'NewBody', newName); assert.ok(Math.abs(a.duration - b.duration) < 1e-7);
  for (const ch of anim.listChannels()) {
    const s = ch.getSampler(), times = s.getInput().getArray(), values = s.getOutput().getArray(), size = values.length / times.length;
    assert.equal(s.getInterpolation(), 'LINEAR'); assert.equal(times[0], 0); assert.ok(Math.abs(times.at(-1) - b.duration) < 2e-6);
    for (let i = 1; i < times.length; i++) assert.ok(times[i] > times[i - 1]);
    for (let j = 0; j < size; j++) assert.equal(values[j], values[values.length - size + j], `${newName} loop endpoint`);
    assert.ok(Array.from(values).every(Number.isFinite));
    if (ch.getTargetPath() === 'rotation') for (let i = 0; i < values.length; i += 4) assert.ok(Math.abs(Math.hypot(...values.slice(i, i + 4)) - 1) < 2e-5);
  }
  let lowMin = Infinity, lowMax = -Infinity, maxProfileDiff = 0;
  for (let i = 0; i < 4096; i++) {
    const t = b.duration * (i + .31) / 4096, x = Math.min(...a.lows(t)), y = Math.min(...b.lows(t));
    lowMin = Math.min(lowMin, y); lowMax = Math.max(lowMax, y); maxProfileDiff = Math.max(maxProfileDiff, Math.abs(x - y));
  }
  assert.ok(lowMin > -.0015, `${newName}: sampled below floor`);
  assert.ok(maxProfileDiff < .002, `${newName}: sole profile difference ${(maxProfileDiff * 1000).toFixed(3)} mm`);
  if (newName.startsWith('Run')) assert.ok(lowMax > .1 && lowMin < .005, 'run flight and near-ground phases');
  else assert.ok(lowMax < .008, 'walking remains near floor');
  const times = anim.listChannels().find(c => c.getTargetNode().getName() === 'Rig_Hips' && c.getTargetPath() === 'rotation').getSampler().getInput().getArray();
  let maxAngle = 0;
  for (const t of times) {
    a.pose(t); b.pose(t);
    for (const name of ['Rig_Neck', 'Rig_Shoulder_L', 'Rig_Shoulder_R', 'Rig_Thigh_L', 'Rig_Thigh_R']) maxAngle = Math.max(maxAngle, Q(a.bones.get(name)).angleTo(Q(b.bones.get(name))));
  }
  assert.ok(maxAngle * 180 / Math.PI < .001, 'world limb orientation changed at keys');
  const lean = ev => {
    const center = P(ev.bones.get('Rig_Thigh_L')).add(P(ev.bones.get('Rig_Thigh_R'))).multiplyScalar(.5), d = P(ev.bones.get('Rig_Neck')).sub(center);
    return Math.atan2(d.z, d.y) * 180 / Math.PI;
  };
  const previousLean = [], revisedLean = [];
  for (let i = 0; i < 8; i++) { a.pose(a.duration * i / 8); b.pose(b.duration * i / 8); previousLean.push(lean(a)); revisedLean.push(lean(b)); }
  console.log(`PASS ${newName}: exact loop endpoints; 4096 off-key sole lows ${(lowMin * 1000).toFixed(3)}..${(lowMax * 1000).toFixed(3)} mm; max deviation from previous sole profile ${(maxProfileDiff * 1000).toFixed(3)} mm; preserved neck/shoulder/thigh world rotations at keys within ${(maxAngle * 180 / Math.PI).toFixed(6)}°.`);
  console.log(`NOTE ${newName}: 8-phase hip-to-neck lean before ${Math.min(...previousLean).toFixed(1)}..${Math.max(...previousLean).toFixed(1)}°, after ${Math.min(...revisedLean).toFixed(1)}..${Math.max(...revisedLean).toFixed(1)}°; landmark-based diagnostic, not a clinical posture measurement.`);
  // Diagnostic only: rolling and touchdown/liftoff are included in this
  // lowest-vertex residual, so this is not a planted-foot slip guarantee.
  const speed = meta.viewerGroundSpeedMps[newName.startsWith('Walk') ? 'walk' : 'run'], errors = [], dt = b.duration / 480 / 6;
  for (let i = 2; i < 478; i++) {
    const t = b.duration * i / 480, feet = b.footDetails(t);
    for (const foot of feet) {
      if (foot.point[1] > .005) continue;
      const p = b.vertex(t - dt, foot.index), q = b.vertex(t + dt, foot.index);
      errors.push(Math.hypot((q[0] - p[0]) / (2 * dt), (q[2] - p[2]) / (2 * dt) + speed));
    }
  }
  errors.sort((x, y) => x - y);
  console.log(`NOTE ${newName}: ${errors.length} near-floor lowest-vertex samples, horizontal velocity p95 ${errors[Math.floor(.95 * errors.length)].toFixed(2)} m/s relative to the approximate ground; no planted-foot lock.`);
}
console.log('NOTE: sole checks do not establish no sliding, transitions, whole-body collision freedom or physical-device/engine compatibility.');
