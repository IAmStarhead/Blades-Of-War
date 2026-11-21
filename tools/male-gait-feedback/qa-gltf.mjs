// Structural and sampled geometric checks, not a certificate of motion quality,
// continuous floor contact, every collision, transitions or engine compatibility.
import assert from 'node:assert/strict';
import {createHash} from 'node:crypto';
import {createRequire} from 'node:module';
import {fileURLToPath} from 'node:url';
import fs from 'node:fs';
import path from 'node:path';
import {Matrix4, Quaternion, Vector3} from '../male-library-motion/node_modules/three/build/three.module.js';
import {NodeIO} from '../male-library-motion/node_modules/@gltf-transform/core/dist/index.js';
import {makeEvaluator} from '../male-motion-fit/pose.mjs';

const repo = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const folder = path.resolve(process.argv[2] || path.join(repo, 'work/male-gait-feedback'));
const require = createRequire(path.join(repo, 'tools/character-showcase/package.json')), validator = require('gltf-validator'), io = new NodeIO();
const hash = b => createHash('sha256').update(b).digest('hex'), data = f => fs.readFileSync(path.join(folder, f));
const oldBytes = data('previous_C.glb'), newBytes = data('male_C_head_feet_trial.glb'), info = JSON.parse(data('build-info.json'));
assert.equal(hash(oldBytes), 'c0685047069bf2a25e7cdc2c23580543b7e349281ad27d64dc240d63b9446013');
assert.equal(hash(oldBytes), hash(fs.readFileSync(path.join(repo, 'work/male-gait-refine/male_gait_C_refined.glb'))));
assert.equal(hash(newBytes), info.modelSha256); assert.equal(hash(newBytes), info.pose.outputSha256);
for (const [name, bytes] of [['previous_C.glb', oldBytes], ['male_C_head_feet_trial.glb', newBytes]]) {
  const result = await validator.validateBytes(new Uint8Array(bytes), {uri: name, maxIssues: 10000});
  if (result.issues.numErrors || result.issues.numWarnings) console.error(JSON.stringify(result.issues, null, 2));
  assert.equal(result.issues.numErrors, 0); assert.equal(result.issues.numWarnings, 0);
  console.log(`PASS: ${name}: glTF Validator 0 errors / 0 warnings`);
}
const old = (await io.readBinary(oldBytes)).getRoot(), next = (await io.readBinary(newBytes)).getRoot();
const raw = a => { assert.ok(a); const v = a.getArray(); return Buffer.from(v.buffer, v.byteOffset, v.byteLength); };
const same = (a, b, what) => assert.equal(hash(raw(a)), hash(raw(b)), what);
const node = (root, name) => { const a = root.listNodes().filter(n => n.getName() === name); assert.equal(a.length, 1); return a[0]; };
assert.equal(next.listNodes().length, old.listNodes().length); assert.equal(next.listSkins().length, 1);
const s0 = old.listSkins()[0], s1 = next.listSkins()[0];
assert.equal(s1.listJoints().length, 52); assert.deepEqual(s1.listJoints().map(n => n.getName()), s0.listJoints().map(n => n.getName()));
same(s0.getInverseBindMatrices(), s1.getInverseBindMatrices(), 'inverse bind matrices');
for (const a of old.listNodes()) {
  const b = node(next, a.getName());
  assert.equal(b.getParentNode()?.getName(), a.getParentNode()?.getName());
  assert.deepEqual(b.getTranslation(), a.getTranslation()); assert.deepEqual(b.getRotation(), a.getRotation()); assert.deepEqual(b.getScale(), a.getScale());
  assert.equal(Boolean(a.getSkin()), Boolean(b.getSkin()));
  if (!a.getMesh()) { assert.ok(!b.getMesh()); continue; }
  const pa = a.getMesh().listPrimitives(), pb = b.getMesh().listPrimitives(); assert.equal(pa.length, pb.length);
  pa.forEach((p, i) => {
    const q = pb[i]; assert.deepEqual(p.listSemantics().sort(), q.listSemantics().sort());
    for (const sem of p.listSemantics()) same(p.getAttribute(sem), q.getAttribute(sem), `${a.getName()} ${sem}`);
    if (p.getIndices()) same(p.getIndices(), q.getIndices(), `${a.getName()} indices`);
    assert.equal(p.listTargets().length, q.listTargets().length);
  });
}
assert.deepEqual(old.listTextures().map(t => hash(t.getImage())), next.listTextures().map(t => hash(t.getImage())));
assert.deepEqual(next.listAnimations().map(a => a.getName()), ['Walk_C_HeadFeet_Trial', 'Run_C_HeadFeet_Trial']);
console.log('PASS: positions, normals, joint indices, skin weights, textures, rest hierarchy and inverse binds match C.');

const P = o => o.getWorldPosition(new Vector3()), Q = o => o.getWorldQuaternion(new Quaternion()).normalize();
const quant = (v, q) => { const a = [...v].sort((x, y) => x - y); assert.ok(a.length); return a[Math.floor(q * (a.length - 1))]; };
const allowed = new Set(['Rig_Neck', 'Rig_Head', 'Rig_Foot_L', 'Rig_Foot_R']);
const names = s1.listJoints().map(n => n.getName()), ibm = s1.getInverseBindMatrices().getArray();
const inverse = names.map((_, i) => new Matrix4().fromArray(ibm, i * 16)), matrices = names.map(() => new Matrix4());
const primitive = node(next, 'NewBody').getMesh().listPrimitives()[0], pos = primitive.getAttribute('POSITION').getArray();
const joints = primitive.getAttribute('JOINTS_0').getArray(), weights = primitive.getAttribute('WEIGHTS_0').getArray(), groups = {};
for (const side of ['L', 'R']) {
  const sign = side === 'L' ? 1 : -1; groups['heel' + side] = []; groups['tip' + side] = [];
  for (let i = 0; i < pos.length / 3; i++) {
    const x = sign * pos[3 * i], y = pos[3 * i + 1], z = pos[3 * i + 2];
    if (x > .03 && x < .28 && y < .12 && z < -.075) groups['heel' + side].push(i);
    if (x > .03 && x < .28 && y < .12 && z > .15) groups['tip' + side].push(i);
  }
}
function centroid(ids) {
  const v = new Vector3();
  for (const i of ids) {
    const x = pos[3 * i], y = pos[3 * i + 1], z = pos[3 * i + 2];
    for (let j = 0; j < 4; j++) {
      const w = weights[4 * i + j]; if (!w) continue; const e = matrices[joints[4 * i + j]].elements;
      v.x += w * (e[0] * x + e[4] * y + e[8] * z + e[12]);
      v.y += w * (e[1] * x + e[5] * y + e[9] * z + e[13]);
      v.z += w * (e[2] * x + e[6] * y + e[10] * z + e[14]);
    }
  }
  return v.divideScalar(ids.length);
}
function directionalSamples(ev) {
  const r = {headPitch: [], headRoll: [], yawL: [], yawR: []}, D = 180 / Math.PI;
  for (let i = 0; i < 512; i++) {
    ev.pose(ev.duration * (i + .37) / 512);
    for (let k = 0; k < names.length; k++) matrices[k].copy(ev.bones.get(names[k]).matrixWorld).multiply(inverse[k]);
    const headQ = new Quaternion().setFromRotationMatrix(matrices[names.indexOf('Rig_Head')]);
    const f = new Vector3(0, 0, 1).applyQuaternion(headQ), up = new Vector3(0, 1, 0).applyQuaternion(headQ);
    r.headPitch.push(Math.atan2(f.y, Math.hypot(f.x, f.z)) * D); r.headRoll.push(Math.atan2(up.x, up.y) * D);
    for (const side of ['L', 'R']) {
      const d = centroid(groups['tip' + side]).sub(centroid(groups['heel' + side]));
      if (d.z > .10 && Math.abs(d.y) < .13) r['yaw' + side].push((side === 'L' ? 1 : -1) * Math.atan2(d.x, d.z) * D);
    }
  }
  return r;
}
function residual(ev, speed) {
  const values = [], dt = ev.duration / 480 / 6;
  for (let i = 2; i < 478; i++) {
    const t = ev.duration * i / 480, feet = ev.footDetails(t);
    for (const foot of feet) {
      if (foot.point[1] > .005) continue;
      const a = ev.vertex(t - dt, foot.index), b = ev.vertex(t + dt, foot.index);
      values.push(Math.hypot((b[0] - a[0]) / (2 * dt), (b[2] - a[2]) / (2 * dt) + speed));
    }
  }
  return quant(values, .95);
}
function footAngularP95(ev) {
  const steps = 1200, dt = ev.duration / steps, last = {}, rates = {L: [], R: []};
  for (let i = 0; i <= steps; i++) {
    ev.pose(i * dt);
    for (const side of ['L', 'R']) {
      const q = Q(ev.bones.get('Rig_Foot_' + side));
      if (last[side]) rates[side].push(q.angleTo(last[side]) * 180 / Math.PI / dt);
      last[side] = q;
    }
  }
  return ['L', 'R'].map(side => quant(rates[side], .95));
}
for (const [priorName, name, speed] of [['Walk_C_Refined', 'Walk_C_HeadFeet_Trial', 1.73], ['Run_C_Refined', 'Run_C_HeadFeet_Trial', 3.52]]) {
  const prior = old.listAnimations().find(a => a.getName() === priorName), anim = next.listAnimations().find(a => a.getName() === name);
  const a = makeEvaluator(old, 'NewBody', priorName), b = makeEvaluator(next, 'NewBody', name);
  assert.equal(anim.listChannels().length, prior.listChannels().length); assert.ok(Math.abs(a.duration - b.duration) < 1e-7);
  const changed = new Set();
  for (const ch of anim.listChannels()) {
    const n = ch.getTargetNode().getName(), s = ch.getSampler(), priorCh = prior.listChannels().find(c => c.getTargetNode().getName() === n && c.getTargetPath() === ch.getTargetPath());
    assert.ok(priorCh); same(s.getInput(), priorCh.getSampler().getInput(), 'key times');
    if (ch.getTargetPath() !== 'rotation' || !allowed.has(n)) same(s.getOutput(), priorCh.getSampler().getOutput(), `${name} untouched ${n}`);
    else { assert.notEqual(hash(raw(s.getOutput())), hash(raw(priorCh.getSampler().getOutput())), `${name} missing change ${n}`); changed.add(n); }
    const times = s.getInput().getArray(), values = s.getOutput().getArray(), size = values.length / times.length;
    assert.equal(s.getInterpolation(), 'LINEAR'); assert.equal(times[0], 0); assert.ok(Math.abs(times.at(-1) - b.duration) < 2e-6);
    for (let i = 1; i < times.length; i++) assert.ok(times[i] > times[i - 1]);
    for (let j = 0; j < size; j++) assert.equal(values[j], values[values.length - size + j], `${name} loop endpoint`);
    assert.ok(Array.from(values).every(Number.isFinite));
    if (ch.getTargetPath() === 'rotation') for (let i = 0; i < values.length; i += 4) {
      assert.ok(Math.abs(Math.hypot(...values.slice(i, i + 4)) - 1) < 2e-5);
      if (i) assert.ok(new Quaternion().fromArray(values, i - 4).dot(new Quaternion().fromArray(values, i)) >= 0, `${name} quaternion sign discontinuity`);
    }
  }
  assert.deepEqual([...changed].sort(), [...allowed].sort());
  let lowMin = Infinity, lowMax = -Infinity, maxProfile = 0, maxAnkle = 0, maxArm = 0, maxHeadOrigin = 0, nearGroundTurn = 0;
  for (let i = 0; i < 4096; i++) {
    const t = b.duration * (i + .31) / 4096, feetA = a.footDetails(t), feetB = b.footDetails(t);
    const lowA = Math.min(...feetA.map(f => f.point[1])), lowB = Math.min(...feetB.map(f => f.point[1]));
    lowMin = Math.min(lowMin, lowB); lowMax = Math.max(lowMax, lowB); maxProfile = Math.max(maxProfile, Math.abs(lowA - lowB));
    for (const [j, side] of ['L', 'R'].entries()) {
      const n = 'Rig_Foot_' + side;
      maxAnkle = Math.max(maxAnkle, P(a.bones.get(n)).distanceTo(P(b.bones.get(n))));
      if (feetA[j].point[1] < .005) nearGroundTurn = Math.max(nearGroundTurn, Q(a.bones.get(n)).angleTo(Q(b.bones.get(n))) * 180 / Math.PI);
    }
    if (i % 8 === 0) {
      for (const n of ['Rig_Chest', 'Rig_Shoulder_L', 'Rig_Shoulder_R', 'Rig_Hand_L', 'Rig_Hand_R']) maxArm = Math.max(maxArm, P(a.bones.get(n)).distanceTo(P(b.bones.get(n))));
      maxHeadOrigin = Math.max(maxHeadOrigin, P(a.bones.get('Rig_Head')).distanceTo(P(b.bones.get('Rig_Head'))));
    }
  }
  assert.ok(lowMin > -.0015); assert.ok(maxProfile < .001); assert.ok(maxAnkle < .00001); assert.ok(maxArm < .00001);
  assert.ok(maxHeadOrigin < .004); assert.ok(nearGroundTurn < .5, `unexpected yaw near floor: ${nearGroundTurn}`);
  if (name.startsWith('Run')) assert.ok(lowMax > .1, 'C run flight remains'); else assert.ok(lowMax < .008, 'C walk remains close to floor');
  const da = directionalSamples(a), db = directionalSamples(b), pitchA = quant(da.headPitch, .5), pitchB = quant(db.headPitch, .5);
  assert.ok(pitchB - pitchA > (name.startsWith('Walk') ? 4 : 7));
  for (const side of ['L', 'R']) assert.ok(quant(db['yaw' + side], .95) <= quant(da['yaw' + side], .95) + .3, 'selected outward-yaw p95 regressed');
  const slipA = residual(a, speed), slipB = residual(b, speed); assert.ok(slipB <= slipA + .03, 'near-floor diagnostic increased unexpectedly');
  console.log(`PASS ${name}: only four rotation tracks changed; same duration ${b.duration.toFixed(5)} s, exact loop endpoints, max shoulder/hand displacement ${(maxArm * 1000).toFixed(5)} mm and ankle ${(maxAnkle * 1000).toFixed(5)} mm.`);
  console.log(`PASS ${name}: 4096 sampled low soles ${(lowMin * 1000).toFixed(3)}..${(lowMax * 1000).toFixed(3)} mm; max change ${(maxProfile * 1000).toFixed(3)} mm; max added foot turn when below 5 mm ${nearGroundTurn.toFixed(3)}°.`);
  console.log(`NOTE ${name}: sampled head-pitch median ${pitchA.toFixed(1)}→${pitchB.toFixed(1)}°, head-roll median ${quant(da.headRoll, .5).toFixed(1)}→${quant(db.headRoll, .5).toFixed(1)}°; skinned heel-to-tip outward-yaw p95 L/R ${quant(da.yawL, .95).toFixed(1)}/${quant(da.yawR, .95).toFixed(1)}→${quant(db.yawL, .95).toFixed(1)}/${quant(db.yawR, .95).toFixed(1)}° for forward, moderately level feet.`);
  console.log(`NOTE ${name}: near-floor lowest-vertex residual p95 ${slipA.toFixed(2)}→${slipB.toFixed(2)} m/s. Includes foot roll, touchdown and vertex changes; it is not a planted-foot slip measurement.`);
  const angularA = footAngularP95(a), angularB = footAngularP95(b);
  console.log(`NOTE ${name}: sampled world foot angular-speed p95 L/R ${angularA.map(x => x.toFixed(1)).join('/')}→${angularB.map(x => x.toFixed(1)).join('/')}°/s; higher values may need visual review.`);
}
console.log('NOTE: samples do not establish visual acceptance, no skating, all-time/whole-body collision freedom, transition quality or game-engine compatibility.');
