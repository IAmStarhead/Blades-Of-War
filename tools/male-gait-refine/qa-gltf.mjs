// Scoped structural, track, endpoint, foot and posture checks. These do not
// certify anatomy, every pose, transitions, collision freedom or engine import.
import assert from 'node:assert/strict';
import {createHash} from 'node:crypto';
import {createRequire} from 'node:module';
import {fileURLToPath} from 'node:url';
import fs from 'node:fs';
import path from 'node:path';
import {Quaternion, Vector3} from '../male-library-motion/node_modules/three/build/three.module.js';
import {NodeIO} from '../male-library-motion/node_modules/@gltf-transform/core/dist/index.js';
import {makeEvaluator} from '../male-motion-fit/pose.mjs';
const repo = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..'), out = path.resolve(process.argv[2] || path.join(repo, 'work/male-gait-refine'));
const require = createRequire(path.join(repo, 'tools/character-showcase/package.json')), validator = require('gltf-validator'), io = new NodeIO();
const hash = b => createHash('sha256').update(b).digest('hex'), data = name => fs.readFileSync(path.join(out, name));
const oldBytes = data('previous_posture_C.glb'), bytes = data('male_gait_C_refined.glb'), meta = JSON.parse(data('build-info.json'));
assert.equal(hash(oldBytes), 'c72ec5c2386362d4f4c30dc0e541ffa3c6664f9ca4c27d49d8cd428ce87c3847');
assert.equal(hash(oldBytes), hash(fs.readFileSync(path.join(repo, 'work/male-posture-fit/male_posture_C_trial.glb'))));
assert.equal(hash(bytes), meta.skin.outputSha256);
const validation = await validator.validateBytes(new Uint8Array(bytes), {uri: 'male_gait_C_refined.glb', maxIssues: 10000});
if (validation.issues.numErrors || validation.issues.numWarnings) console.error(JSON.stringify(validation.issues, null, 2));
assert.equal(validation.issues.numErrors, 0); assert.equal(validation.issues.numWarnings, 0);
const before = (await io.readBinary(oldBytes)).getRoot(), after = (await io.readBinary(bytes)).getRoot();
const raw = a => { assert.ok(a); const arr = a.getArray(); return Buffer.from(arr.buffer, arr.byteOffset, arr.byteLength); };
const same = (a, b, label) => assert.equal(hash(raw(a)), hash(raw(b)), label);
const node = (root, name) => { const a = root.listNodes().filter(n => n.getName() === name); assert.equal(a.length, 1); return a[0]; };
assert.equal(after.listNodes().length, before.listNodes().length); assert.equal(after.listSkins().length, 1);
const s0 = before.listSkins()[0], s1 = after.listSkins()[0];
assert.equal(s1.listJoints().length, 52); assert.deepEqual(s1.listJoints().map(n => n.getName()), s0.listJoints().map(n => n.getName()));
same(s0.getInverseBindMatrices(), s1.getInverseBindMatrices(), 'inverse binds');
let changedHip = 0, changedShoulder = 0, maxSumError = 0;
for (const a of before.listNodes()) {
  const b = node(after, a.getName());
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
      const pos = p.getAttribute('POSITION').getArray(), j0 = p.getAttribute('JOINTS_0').getArray(), j1 = q.getAttribute('JOINTS_0').getArray();
      const w0 = p.getAttribute('WEIGHTS_0').getArray(), w1 = q.getAttribute('WEIGHTS_0').getArray();
      for (let n = 0; n < pos.length / 3; n++) {
        const diff = [0, 1, 2, 3].some(k => j0[n * 4 + k] !== j1[n * 4 + k] || w0[n * 4 + k] !== w1[n * 4 + k]);
        if (diff) {
          const x = Math.abs(pos[n * 3]), y = pos[n * 3 + 1];
          if (y > .64 && y < 1.04 && x < .20) changedHip++;
          else { assert.ok(y > 1.28 && y < 1.47 && x > .115 && x < .23, 'unexpected weight location'); changedShoulder++; }
        }
        let sum = 0; for (let k = 0; k < 4; k++) { assert.ok(w1[n * 4 + k] >= 0 && j1[n * 4 + k] < 52); sum += w1[n * 4 + k]; }
        maxSumError = Math.max(maxSumError, Math.abs(sum - 1));
      }
    }
  });
}
assert.equal(changedHip, 660); assert.equal(changedShoulder, 476); assert.ok(maxSumError < 1e-5);
assert.deepEqual(before.listTextures().map(t => hash(t.getImage())), after.listTextures().map(t => hash(t.getImage())));
assert.deepEqual(after.listAnimations().map(a => a.getName()), ['Walk_C_Refined', 'Run_C_Refined']);
console.log(`PASS: glTF Validator ${validation.issues.numErrors} errors/${validation.issues.numWarnings} warnings; unchanged mesh geometry, textures, 52-joint hierarchy and bind matrices; normalized weights changed at ${changedShoulder} shoulder and ${changedHip} hip/thigh vertices.`);
console.log('PASS: comparison GLB is byte-identical to the previous posture trial.');
const changedTracks = new Set(['Rig_Spine', 'Rig_Chest', 'Rig_Neck', ...['L', 'R'].flatMap(s => [`Rig_Shoulder_${s}`, `Rig_UpperArm_${s}`, `Rig_Shin_${s}`, `Rig_Foot_${s}`])]);
const P = o => o.getWorldPosition(new Vector3()), Q = o => o.getWorldQuaternion(new Quaternion()).normalize();
for (const [oldName, newName] of [['Walk_C_Posture', 'Walk_C_Refined'], ['Run_C_Posture', 'Run_C_Refined']]) {
  const anim = after.listAnimations().find(a => a.getName() === newName), oldAnim = before.listAnimations().find(a => a.getName() === oldName);
  assert.equal(anim.listChannels().length, oldAnim.listChannels().length);
  const a = makeEvaluator(before, 'NewBody', oldName), b = makeEvaluator(after, 'NewBody', newName); assert.ok(Math.abs(a.duration - b.duration) < 1e-7);
  for (const ch of anim.listChannels()) {
    const s = ch.getSampler(), times = s.getInput().getArray(), values = s.getOutput().getArray(), size = values.length / times.length;
    const old = oldAnim.listChannels().find(c => c.getTargetNode().getName() === ch.getTargetNode().getName() && c.getTargetPath() === ch.getTargetPath());
    assert.ok(old); same(s.getInput(), old.getSampler().getInput(), 'key times');
    if (ch.getTargetPath() !== 'rotation' || !changedTracks.has(ch.getTargetNode().getName())) same(s.getOutput(), old.getSampler().getOutput(), `${newName} untouched channel`);
    assert.equal(s.getInterpolation(), 'LINEAR'); assert.equal(times[0], 0); assert.ok(Math.abs(times.at(-1) - b.duration) < 2e-6);
    for (let i = 1; i < times.length; i++) assert.ok(times[i] > times[i - 1]);
    for (let j = 0; j < size; j++) assert.equal(values[j], values[values.length - size + j], `${newName} loop endpoint`);
    assert.ok(Array.from(values).every(Number.isFinite));
    if (ch.getTargetPath() === 'rotation') for (let i = 0; i < values.length; i += 4) {
      assert.ok(Math.abs(Math.hypot(...values.slice(i, i + 4)) - 1) < 2e-5);
      if (i) assert.ok(new Quaternion().fromArray(values, i - 4).dot(new Quaternion().fromArray(values, i)) >= 0, `${newName} quaternion sign jump`);
    }
  }
  let lowMin = Infinity, lowMax = -Infinity, maxProfileDiff = 0, maxAnkle = 0;
  for (let i = 0; i < 4096; i++) {
    const t = b.duration * (i + .31) / 4096, x = Math.min(...a.lows(t)), y = Math.min(...b.lows(t));
    lowMin = Math.min(lowMin, y); lowMax = Math.max(lowMax, y); maxProfileDiff = Math.max(maxProfileDiff, Math.abs(x - y));
    for (const side of ['L', 'R']) maxAnkle = Math.max(maxAnkle, P(a.bones.get(`Rig_Foot_${side}`)).distanceTo(P(b.bones.get(`Rig_Foot_${side}`))));
  }
  assert.ok(lowMin > -.0015, `${newName}: sampled below floor`); assert.ok(maxProfileDiff < .001, `${newName}: sole profile changed too much`);
  assert.ok(maxAnkle < .00001, `${newName}: ankle path changed too much`);
  if (newName.startsWith('Run')) assert.ok(lowMax > .1 && lowMin < .005, 'run flight and near-ground phases');
  else assert.ok(lowMax < .008, 'walking remains near floor');
  const keys = anim.listChannels().find(c => c.getTargetNode().getName() === 'Rig_Hips' && c.getTargetPath() === 'rotation').getSampler().getInput().getArray();
  const yaw = meta.pose.footWorldYawOutwardDegrees[newName]; let maxFootAngleError = 0;
  for (const t of keys) {
    a.pose(t); b.pose(t);
    for (const side of ['L', 'R']) {
      const expected = new Quaternion().setFromAxisAngle(new Vector3(0, 1, 0), (side === 'L' ? 1 : -1) * yaw[side] * Math.PI / 180).multiply(Q(a.bones.get(`Rig_Foot_${side}`)));
      maxFootAngleError = Math.max(maxFootAngleError, expected.angleTo(Q(b.bones.get(`Rig_Foot_${side}`))));
    }
  }
  assert.ok(maxFootAngleError * 180 / Math.PI < .001, 'world foot yaw or roll at rotation keys');
  const lean = ev => {
    const center = P(ev.bones.get('Rig_Thigh_L')).add(P(ev.bones.get('Rig_Thigh_R'))).multiplyScalar(.5), d = P(ev.bones.get('Rig_Neck')).sub(center);
    return Math.atan2(d.z, d.y) * 180 / Math.PI;
  };
  const previousLean = [], revisedLean = [];
  for (let i = 0; i < 8; i++) { a.pose(a.duration * i / 8); b.pose(b.duration * i / 8); previousLean.push(lean(a)); revisedLean.push(lean(b)); }
  console.log(`PASS ${newName}: identical untouched tracks and exact loop endpoints; 4096 off-key lowest soles ${(lowMin * 1000).toFixed(3)}..${(lowMax * 1000).toFixed(3)} mm, max profile change ${(maxProfileDiff * 1000).toFixed(3)} mm, max ankle displacement ${(maxAnkle * 1000).toFixed(4)} mm; yaw/roll error at keys ${(maxFootAngleError * 180 / Math.PI).toFixed(6)}°.`);
  console.log(`NOTE ${newName}: eight-phase hip-to-neck lean before ${Math.min(...previousLean).toFixed(1)}..${Math.max(...previousLean).toFixed(1)}°, after ${Math.min(...revisedLean).toFixed(1)}..${Math.max(...revisedLean).toFixed(1)}°; approximate landmark diagnostic.`);
  function stanceYaw(ev) {
    const samples = [[], []];
    for (let i = 0; i < 1024; i++) {
      const feet = ev.footDetails(ev.duration * (i + .37) / 1024);
      for (const [j, side] of ['L', 'R'].entries()) {
        const d = P(ev.bones.get('Rig_Toes_' + side)).sub(P(ev.bones.get('Rig_Foot_' + side)));
        if (feet[j].point[1] <= .005 && d.z > .08) samples[j].push(Math.atan2((side === 'L' ? 1 : -1) * d.x, d.z) * 180 / Math.PI);
      }
    }
    return samples;
  }
  const y0 = stanceYaw(a), y1 = stanceYaw(b), fmt = samples => samples.map((v, i) => {
    v.sort((x, y) => x - y); assert.ok(v.length > 100); const below = v.filter(x => x < -3).length;
    return `${i ? 'R' : 'L'} n=${v.length} p05/50/95=${[.05, .5, .95].map(q => v[Math.floor(q * (v.length - 1))].toFixed(1)).join('/')}° inward<-3°=${below}`;
  }).join('; ');
  console.log(`NOTE ${newName} selected near-floor foot-to-toe yaw: before ${fmt(y0)}; after ${fmt(y1)}. Excludes highly tilted/backward feet; not a clinical angle.`);
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
  console.log(`NOTE ${newName}: near-floor lowest-vertex horizontal residual p95 ${errors[Math.floor(.95 * errors.length)].toFixed(2)} m/s; includes roll/touchdown and is not a planted-foot slip measure.`);
}
console.log('NOTE: these sampled checks do not establish no sliding, transitions, whole-body collision freedom or physical-device/engine compatibility.');
