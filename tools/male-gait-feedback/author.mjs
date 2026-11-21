// A conservative follow-up to the rejected 100STYLE/C mix. Start from the
// last delivered C and change only neck, head and foot rotation tracks.
import assert from 'node:assert/strict';
import {createHash} from 'node:crypto';
import {fileURLToPath} from 'node:url';
import fs from 'node:fs';
import path from 'node:path';
import {NodeIO} from '../male-library-motion/node_modules/@gltf-transform/core/dist/index.js';
import {Matrix4, Quaternion, Vector3} from '../male-library-motion/node_modules/three/build/three.module.js';
import {makeEvaluator} from '../male-motion-fit/pose.mjs';

if (process.argv.length !== 4) throw Error('Usage: node author.mjs output.glb report.json');
const repo = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const input = path.join(repo, 'work/male-gait-refine/male_gait_C_refined.glb');
const permitted = path.join(repo, 'work/male-gait-feedback');
const [output, reportPath] = process.argv.slice(2).map(p => path.resolve(p));
assert.notEqual(output, reportPath);
for (const dest of [output, reportPath]) {
  if (dest === input || dest === repo || (dest.startsWith(repo + path.sep) && !dest.startsWith(permitted + path.sep)))
    throw Error('Refusing to overwrite a source or unrelated project work');
}
const sha = bytes => createHash('sha256').update(bytes).digest('hex');
const sourceBytes = fs.readFileSync(input), sourceHash = 'c0685047069bf2a25e7cdc2c23580543b7e349281ad27d64dc240d63b9446013';
assert.equal(sha(sourceBytes), sourceHash, 'Previous C model changed');
const io = new NodeIO(), doc = await io.readBinary(sourceBytes), root = doc.getRoot();
assert.deepEqual(root.listAnimations().map(a => a.getName()), ['Walk_C_Refined', 'Run_C_Refined']);
const skin = root.listSkins()[0], names = skin.listJoints().map(n => n.getName());
const ibm = skin.getInverseBindMatrices().getArray(), inverse = names.map((_, i) => new Matrix4().fromArray(ibm, i * 16));
const matrices = names.map(() => new Matrix4());
const body = root.listNodes().find(n => n.getName() === 'NewBody').getMesh().listPrimitives()[0];
const pos = body.getAttribute('POSITION').getArray(), joints = body.getAttribute('JOINTS_0').getArray(), weights = body.getAttribute('WEIGHTS_0').getArray();
const groups = {};
for (const side of ['L', 'R']) {
  const sign = side === 'L' ? 1 : -1;
  groups['heel' + side] = []; groups['tip' + side] = [];
  for (let i = 0; i < pos.length / 3; i++) {
    const x = sign * pos[3 * i], y = pos[3 * i + 1], z = pos[3 * i + 2];
    if (x > .03 && x < .28 && y < .12 && z < -.075) groups['heel' + side].push(i);
    if (x > .03 && x < .28 && y < .12 && z > .15) groups['tip' + side].push(i);
  }
  assert.ok(groups['heel' + side].length > 0 && groups['tip' + side].length > 0, 'Missing foot landmarks');
}
function centroid(ids) {
  const r = new Vector3();
  for (const i of ids) {
    const x = pos[3 * i], y = pos[3 * i + 1], z = pos[3 * i + 2];
    for (let k = 0; k < 4; k++) {
      const weight = weights[4 * i + k]; if (!weight) continue;
      const e = matrices[joints[4 * i + k]].elements;
      r.x += weight * (e[0] * x + e[4] * y + e[8] * z + e[12]);
      r.y += weight * (e[1] * x + e[5] * y + e[9] * z + e[13]);
      r.z += weight * (e[2] * x + e[6] * y + e[10] * z + e[14]);
    }
  }
  return r.divideScalar(ids.length);
}
const P = o => o.getWorldPosition(new Vector3()), Q = o => o.getWorldQuaternion(new Quaternion()).normalize();
const X = new Vector3(1, 0, 0), Y = new Vector3(0, 1, 0), Z = new Vector3(0, 0, 1), rad = Math.PI / 180, degrees = 180 / Math.PI;
const clamp = (v, a, b) => Math.min(b, Math.max(a, v)), wrap = x => ((x + 540) % 360) - 180;
const smooth = (a, b, x) => { const t = clamp((x - a) / (b - a), 0, 1); return t * t * (3 - 2 * t); };
const specs = [
  {old: 'Walk_C_Refined', name: 'Walk_C_HeadFeet_Trial', headPitch: -5, neckPitch: -1, headRoll: 2.5, low: .008, high: .035},
  {old: 'Run_C_Refined', name: 'Run_C_HeadFeet_Trial', headPitch: -8, neckPitch: -2, headRoll: 1.5, low: .015, high: .080},
];
const order = ['Rig_Neck', 'Rig_Head', 'Rig_Foot_L', 'Rig_Foot_R'];
const report = {inputSha256: sourceHash, changedTracks: order, footStrength: .8, maxRawFootYawDegrees: 14,
  method: 'Same C clips, timing, torso, arms, leg paths, root and shared skin. Head and neck are rotated in world axes; skinned heel-to-tip direction guides a bounded, smoothed foot-yaw correction, faded out near the ground. No contact lock or changes to foot pitch.', clips: {}};
for (const spec of specs) {
  const animation = root.listAnimations().find(a => a.getName() === spec.old), ev = makeEvaluator(root, 'NewBody', spec.old);
  const channels = new Map(animation.listChannels().filter(c => c.getTargetPath() === 'rotation').map(c => [c.getTargetNode().getName(), c]));
  const times = channels.get('Rig_Hips').getSampler().getInput().getArray(), N = times.length - 1;
  for (const name of order) {
    const s = channels.get(name)?.getSampler(); assert.ok(s, `Missing track ${name}`);
    assert.equal(s.getInterpolation(), 'LINEAR');
    assert.deepEqual(Array.from(s.getInput().getArray()), Array.from(times), `Incompatible key times: ${name}`);
  }
  let correction = {L: new Float64Array(N), R: new Float64Array(N)};
  for (let i = 0; i < N; i++) {
    const lows = ev.footDetails(times[i]);
    for (let k = 0; k < names.length; k++) matrices[k].copy(ev.bones.get(names[k]).matrixWorld).multiply(inverse[k]);
    const hip = P(ev.bones.get('Rig_Thigh_L')).sub(P(ev.bones.get('Rig_Thigh_R'))), hipYaw = Math.atan2(-hip.z, hip.x) * degrees;
    for (const [k, side] of ['L', 'R'].entries()) {
      const sign = side === 'L' ? 1 : -1;
      const d = centroid(groups['tip' + side]).sub(centroid(groups['heel' + side]));
      const yaw = Math.atan2(d.x, d.z) * degrees, desired = .3 * hipYaw + sign * 6;
      // Horizontal heel-to-tip yaw is ill-defined if the foot is near vertical
      // or faces backwards. Do not force that part of the gait to point ahead.
      const trust = smooth(.25, .72, d.z / d.length()) * smooth(spec.low, spec.high, lows[k].point[1]);
      correction[side][i] = .8 * clamp(wrap(desired - yaw), -14, 14) * trust;
    }
  }
  // Low-pass across the seam as well as inside the clip; the fixed loop phase
  // is kept and the correction dies away before a foot comes close to ground.
  for (let pass = 0; pass < 3; pass++) for (const side of ['L', 'R']) {
    const a = correction[side];
    correction[side] = Float64Array.from(a, (v, i) => .25 * a[(i + N - 1) % N] + .5 * v + .25 * a[(i + 1) % N]);
  }
  const arrays = new Map(order.map(n => [n, new Float32Array(times.length * 4)]));
  let maxAnkleMove = 0, maxHeadMove = 0;
  for (let i = 0; i < N; i++) {
    ev.pose(times[i]);
    const old = new Map(order.map(n => [n, Q(ev.bones.get(n))])), headPos = P(ev.bones.get('Rig_Head'));
    const ankles = Object.fromEntries(['L', 'R'].map(s => [s, P(ev.bones.get('Rig_Foot_' + s))]));
    function setWorld(name, desired) {
      const bone = ev.bones.get(name); bone.quaternion.copy(Q(bone.parent).invert().multiply(desired)).normalize(); ev.updateMatrices();
    }
    setWorld('Rig_Neck', new Quaternion().setFromAxisAngle(X, spec.neckPitch * rad).multiply(old.get('Rig_Neck')));
    setWorld('Rig_Head', new Quaternion().setFromAxisAngle(Z, spec.headRoll * rad)
      .multiply(new Quaternion().setFromAxisAngle(X, spec.headPitch * rad)).multiply(old.get('Rig_Head')));
    for (const side of ['L', 'R']) {
      setWorld('Rig_Foot_' + side, new Quaternion().setFromAxisAngle(Y, correction[side][i] * rad).multiply(old.get('Rig_Foot_' + side)));
      maxAnkleMove = Math.max(maxAnkleMove, P(ev.bones.get('Rig_Foot_' + side)).distanceTo(ankles[side]));
    }
    maxHeadMove = Math.max(maxHeadMove, headPos.distanceTo(P(ev.bones.get('Rig_Head'))));
    for (const name of order) {
      const a = arrays.get(name), q = ev.bones.get(name).quaternion.clone().normalize();
      if (i && new Quaternion().fromArray(a, 4 * (i - 1)).dot(q) < 0) q.set(-q.x, -q.y, -q.z, -q.w);
      q.toArray(a, 4 * i);
    }
  }
  assert.ok(maxAnkleMove < 1e-6 && maxHeadMove < .004);
  for (const [name, a] of arrays) {
    a.set(a.slice(0, 4), 4 * N); channels.get(name).getSampler().getOutput().setArray(a);
  }
  animation.setName(spec.name);
  report.clips[spec.name] = {previous: spec.old, keys: times.length, durationSeconds: ev.duration,
    headPitchDegrees: spec.headPitch, neckPitchDegrees: spec.neckPitch, headRollDegrees: spec.headRoll,
    swingFadeHeightsMeters: [spec.low, spec.high], maxHeadOriginDisplacementMm: maxHeadMove * 1000,
    maxAnkleDisplacementMm: maxAnkleMove * 1000,
    footYawCorrectionDegrees: Object.fromEntries(['L', 'R'].map(s => [s, [Math.min(...correction[s]), Math.max(...correction[s])]]))};
}
await io.write(output, doc);
report.outputSha256 = sha(fs.readFileSync(output));
fs.writeFileSync(reportPath, JSON.stringify(report, null, 2) + '\n');
console.log('Authored C follow-up:', report.clips);
